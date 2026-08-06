// stem-answer-key.mjs — SHARED stem answer-key derivation (single source of truth).
//
// Pure derivation, NO fs / NO DB. The lexicon/bank data is INJECTED so both callers run ONE copy
// of this logic and can never drift:
//   - offline backfill: scripts/build-stem-answer-keys.mjs (loads repo-root data/, run in CI)
//   - live path:        src/lib/stem-answer-key.ts          (loads study-app/public/data/)
//
// Kept as plain .mjs (not .ts) so the CI-invoked offline script can `node`-import it directly; the
// TS route imports it too (tsconfig allowJs + bundler resolution). The answer key is a DERIVED
// artifact read off the wine_profiles the engine already produces — not a parallel source of truth.

// Grape colour classification for the colour-conflict veto below. question-rules.mjs is the app's
// single source of truth for grape-name detection and is itself pure (no fs / no DB), so importing
// it keeps this module's contract intact.
import { WHITE_GRAPE_INDICATORS, RED_GRAPE_INDICATORS } from "./question-rules.mjs";

// ---------- normalization (pure, data-free) ----------
export const norm = (s) =>
  (s || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const pad = (s) => " " + norm(s) + " ";

// ---------- resolvers that need no injected data ----------
function colour(ft, paper) {
  if (paper === 1) return "white";
  if (paper === 2) return "red";
  const n = pad(ft);
  if (/ (rosso|rouge|tinto|tinta|noir|rot) /.test(n)) return "red";
  if (/ (blanc|bianco|blanco|weiss) /.test(n)) return "white";
  if (/ (rose|rosado|rosato) /.test(n)) return "rose";
  return "unknown";
}

function appResolve(entry, col) {
  if (entry.varieties && entry.varieties.length) return entry.varieties;
  if (entry.byColor) return col && entry.byColor[col] ? entry.byColor[col] : null;
  return null;
}

// True when the label explicitly names grape(s) and NONE of them appear in `candidate` — i.e. the
// candidate variety (from a fuzzy bank match or profile) contradicts the labelled grape.
function conflictsWithLabel(candidateVarieties, explicit) {
  if (!explicit.length || !candidateVarieties?.length) return false;
  const cand = new Set(candidateVarieties.map(norm));
  return !explicit.some((v) => cand.has(norm(v)));
}

// True when EVERY candidate grape is positively the wrong colour for the wine — all-red grapes on a
// white wine or all-white on a red. Enrichment writes wrong grapes surprisingly often (a "Saumur
// Blanc" profiled as Cabernet Franc, a Lagrein Riserva as Pinot Grigio, a red Rioja Reserva as
// Viura) and nothing checked; every such profile keyed a wine as a grape of the wrong colour, and
// the corpus audit then read correct model answers as "never names the variety". Unknown colours
// (either side) never veto — a co-ferment with one white grape in a red, or a grape the indicator
// regexes don't know, must pass through.
export function conflictsWithColour(candidateVarieties, col) {
  if ((col !== "white" && col !== "red") || !candidateVarieties?.length) return false;
  const colours = candidateVarieties.map((v) => {
    const n = norm(v);
    if (WHITE_GRAPE_INDICATORS.test(n)) return "white";
    if (RED_GRAPE_INDICATORS.test(n)) return "red";
    return "unknown";
  });
  if (colours.some((c) => c === "unknown" || c === col)) return false;
  return true; // every grape resolved, and every one is the opposite colour
}

function resolveOrigin(ft) {
  const s = ft.replace(/\([^)]*\)\s*$/, "").trim(); // drop trailing (ABV%)
  const segs = s.split(".").map((x) => x.trim()).filter(Boolean);
  const last = segs[segs.length - 1] || "";
  const parts = last.split(",").map((x) => x.trim()).filter(Boolean);
  const country = parts[parts.length - 1] || "";
  const region = parts.slice(0, -1).join(", ") || country;
  const ok = parts.length >= 1 && /[a-z]/i.test(country) && last.length > 1;
  return { region, country, ok };
}

// ---------- Origin Diversity Check ----------
const COUNTRY_NUMWORD = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
// The count of distinct countries a stem promises, or null if it makes no such promise.
function promisedCountryCount(stem) {
  const m = norm(stem).match(
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b\s+(?:different\s+)?countries\b/
  );
  if (!m) return null;
  return /^\d+$/.test(m[1]) ? Number(m[1]) : COUNTRY_NUMWORD[m[1]] || null;
}

const STYLE_CAT_FALLBACK = {
  sparkling: "Sparkling",
  fortified: "Fortified",
  still_sweet: "Sweet",
  still_off_dry: "Off-dry",
  oxidative: "Oxidative",
  rose: "Rosé",
  orange: "Orange",
  still_dry: "Dry (still)",
};

/**
 * Build a key derivation context from the injected lexicon/bank data, returning `buildKeyForRow`.
 * @param {{ variety_lexicon: any, appellation_varieties: any, stem_proprietary_blends: any,
 *           stem_style_lexicon: any, mock_wine_bank: any }} data
 */
export function createAnswerKeyBuilder(data) {
  const lex = data.variety_lexicon;
  const appVar = data.appellation_varieties;
  const prop = data.stem_proprietary_blends;
  const bank = data.mock_wine_bank;
  const styleLex = data.stem_style_lexicon.styles;

  const bankById = {};
  for (const e of bank) if (e.id) bankById[e.id] = e;

  const lexList = [];
  for (const v of lex.varieties) lexList.push([pad(v), v]);
  for (const [t, c] of Object.entries(lex.synonyms)) lexList.push([pad(t), c]);
  lexList.sort((a, b) => b[0].length - a[0].length);

  const appList = Object.entries(appVar)
    .map(([k, v]) => [" " + norm(k) + " ", v])
    .sort((a, b) => b[0].length - a[0].length);

  const propList = prop.entries.map((e) => [norm(e.match), e]).sort((a, b) => b[0].length - a[0].length);

  // variety -> set of "region|country" (for the plausible / confusable set)
  const varietyToRegions = {};
  const addVR = (variety, region, country) => {
    if (!variety || !region) return;
    const key = variety;
    (varietyToRegions[key] = varietyToRegions[key] || new Set()).add(`${region}|${country || ""}`);
  };
  for (const v of Object.values(appVar)) {
    const vars = v.varieties || (v.byColor ? Object.values(v.byColor).flat() : []);
    for (const variety of vars) addVR(variety, v.region, v.country);
  }
  for (const e of bank) for (const variety of e.grape_varieties || []) addVR(variety, e.region, e.country);

  // Derive the P3 style/method from a wine's fullText (most-specific first), falling back to the
  // profile's broad style_category. Returns { style, style_category, style_tokens }.
  function deriveStyle(fullText, profileStyleCategory) {
    const nf = pad(fullText);
    for (const s of styleLex) {
      if (s.tokens.some((t) => nf.includes(" " + norm(t) + " ") || norm(fullText).includes(norm(t)))) {
        return { style: s.label, style_category: s.category, style_tokens: [...new Set([norm(s.label), ...s.tokens.map(norm)])] };
      }
    }
    const fb = STYLE_CAT_FALLBACK[profileStyleCategory] || "Special";
    return { style: fb, style_category: fb, style_tokens: [norm(fb)] };
  }

  // Grape names explicitly written on the label (most reliable variety signal).
  function explicitVarietiesFromText(ft) {
    const nf = pad(ft);
    const found = new Set();
    for (const [t, c] of lexList) if (nf.includes(t)) found.add(c);
    return [...found];
  }

  function resolveVariety(wp, ft, col, colTrusted) {
    const explicit = explicitVarietiesFromText(ft);
    // Bank/profile candidates are vetoed when they contradict the LABEL (a fuzzy bank match to the
    // wrong wine) or the COLOUR (enrichment wrote a red grape for a white wine, or vice versa).
    // Bank/profile stay first because when consistent they carry richer blend data than the label —
    // a field blend labelled by its dominant grape keeps its full variety list.
    //
    // The colour veto fires only when the colour is TRUSTED — derived from the paper (P1 = white,
    // P2 = red), not guessed from label words. The label guess reads producer names as colour:
    // "Domaine du Mas Blanc" made a Banyuls "white", vetoed its correct Grenache Noir resolution,
    // and un-keyed the wine entirely.
    const wrongColour = (vars) => colTrusted && conflictsWithColour(vars, col);
    const usable = (vars) => (vars || []).length && !conflictsWithLabel(vars, explicit) && !wrongColour(vars);
    const e = wp.bank_match ? bankById[wp.bank_match] : null;
    if (e && usable(e.grape_varieties)) return { v: e.grape_varieties, src: "bank" };
    if (usable(wp.grape_varieties)) return { v: wp.grape_varieties, src: "profile" };
    // The label's own grape names outrank everything below: when a "Lagrein Riserva" profile said
    // Pinot Grigio, the old order fell through to the Alto Adige appellation default instead of
    // reading the grape printed on the label.
    if (explicit.length) return { v: explicit, src: "label" };
    const nf = pad(ft);
    for (const [m, entry] of propList) if (norm(ft).includes(m)) return { v: entry.varieties, src: "proprietary" };
    for (const [t, entry] of appList) {
      if (nf.includes(t)) {
        const v = appResolve(entry, col);
        // Colour-vetoed like bank/profile: a white "Hermitage Blanc" must not take the flat red
        // "hermitage" entry — it keeps scanning for a colour-consistent (or colour-neutral) match.
        if (v && v.length && !wrongColour(v)) return { v, src: "appellation" };
      }
    }
    for (const [t, c] of lexList) if (nf.includes(t)) return { v: [c], src: "lexicon" };
    return { v: [], src: "none" };
  }

  function proprietaryMatch(ft) {
    for (const [m, entry] of propList) if (norm(ft).includes(m)) return entry;
    return null;
  }

  // plausible buckets: same variety, OTHER classic regions
  function plausibleFor(groundTruth) {
    const seen = new Set(groundTruth.map((g) => `${norm(g.region)}|${g.varieties.map(norm).join("/")}`));
    const out = [];
    for (const g of groundTruth) {
      for (const variety of g.varieties) {
        const regions = varietyToRegions[variety];
        if (!regions) continue;
        for (const rc of regions) {
          const [region, country] = rc.split("|");
          if (norm(region) === norm(g.region)) continue; // that's the answer
          const key = `${norm(region)}|${norm(variety)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ variety, region, country: country || null, tier: "PLAUSIBLE" });
        }
      }
    }
    return out.slice(0, 24); // cap noise
  }

  // Derive the answer key for a single generated_questions row. Pure (no DB writes).
  // Returns { ground, plausible, source, ok, problems }.
  function buildKeyForRow(r) {
    const wines = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
    const wp = typeof r.wine_profiles === "string" ? JSON.parse(r.wine_profiles) : r.wine_profiles;
    const ground = [];
    // Annotated because this module is .mjs and TypeScript infers its exports for the .ts callers.
    // A bare `{}` infers as the empty type, so `key.source[slot]` in a TS consumer is TS7053
    // ("expression of type '1' can't be used to index type '{}'"). Keyed by wine slot.
    /** @type {Record<number, string>} */
    const source = {};
    const problems = [];
    const curatedConfusables = [];
    for (const w of wines) {
      const prof = wp[String(w.slot)] || {};
      const col = colour(w.fullText, r.paper);
      // Paper-derived colours are certain; a P3 colour is guessed from label words (which can be a
      // producer name — "Mas Blanc") and must never veto, only pick among byColor entries.
      const colTrusted = r.paper === 1 || r.paper === 2;
      const { v, src } = resolveVariety(prof, w.fullText, col, colTrusted);
      const o = resolveOrigin(w.fullText);
      source[w.slot] = src;
      const pm = proprietaryMatch(w.fullText);
      if (pm && Array.isArray(pm.confusables)) {
        for (const c of pm.confusables) {
          if (!c || !c.variety || !c.region) continue;
          curatedConfusables.push({ variety: c.variety, region: c.region, country: c.country || null, tier: "PLAUSIBLE" });
        }
      }
      const explicit = explicitVarietiesFromText(w.fullText);
      if (!v.length) problems.push(`W${w.slot} no-variety`);
      if (!o.ok) problems.push(`W${w.slot} no-origin`);
      // A profile that was VETOED (contradicts the label's grape or the wine's colour) is the thing
      // being corrected, not a second opinion — disagreeing with it must not invalidate the key.
      if (
        v.length &&
        (prof.grape_varieties || []).length &&
        !conflictsWithLabel(prof.grape_varieties, explicit) &&
        !(colTrusted && conflictsWithColour(prof.grape_varieties, col))
      ) {
        const profSet = new Set(prof.grape_varieties.map(norm));
        if (!v.some((x) => profSet.has(norm(x)))) problems.push(`W${w.slot} variety/profile mismatch`);
      }
      const bucket = {
        slot: w.slot,
        varieties: v,
        is_blend: v.length > 1,
        region: o.region,
        country: o.country,
      };
      if (r.paper === 3) {
        const st = deriveStyle(w.fullText, prof.style_category);
        bucket.style = st.style;
        bucket.style_category = st.style_category;
        bucket.style_tokens = st.style_tokens;
      }
      ground.push(bucket);
    }
    const promisedCountries = promisedCountryCount(r.question_text || "");
    if (promisedCountries) {
      const distinctCountries = new Set(ground.map((g) => norm(g.country)).filter(Boolean));
      if (distinctCountries.size < promisedCountries) {
        problems.push(
          `country-diversity mismatch (stem promises ${promisedCountries} different countries, ` +
            `keyed origins have only ${distinctCountries.size} distinct)`
        );
      }
    }
    const plausible = plausibleFor(ground);
    const seenPl = new Set(plausible.map((p) => `${norm(p.variety)}|${norm(p.region)}`));
    for (const c of curatedConfusables) {
      const k = `${norm(c.variety)}|${norm(c.region)}`;
      if (seenPl.has(k)) continue;
      seenPl.add(k);
      plausible.unshift(c);
    }
    const ok = problems.length === 0;
    return { ground, plausible, source, ok, problems };
  }

  return { buildKeyForRow };
}
