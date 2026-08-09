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
import {
  WHITE_GRAPE_INDICATORS,
  RED_GRAPE_INDICATORS,
  canonVariety,
  subsetScopedStem,
} from "./question-rules.mjs";

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

// True when the stem promises that EACH wine is made from a SINGLE grape variety (e.g. "each wine is
// made from a different single grape variety"). A wine keyed as a deliberate multi-variety blend then
// contradicts the stem outright — a hard validity fault, not a difficulty judgement. Returns false when
// the stem makes no such promise. Kept narrow ("single … variety" / "one … variety") so a stem that
// only says "different varieties" — which permits blends — is never caught.
function promisesSingleVarietyPerWine(stem) {
  const n = norm(stem);
  return /\bsingle (?:grape )?variet(?:y|ies)\b/.test(n) || /\bone (?:grape )?variet(?:y|ies)\b/.test(n);
}

// True when the stem promises the flight shares ONE grape variety across ALL wines — a "same variety"
// premise. It must catch two shapes that the narrower isSameVarietyFlight() below (used only for
// scope-header suppression) missed:
//   • the plain "same (single) (grape) variety"; and
//   • the comma-hedged "same single, or predominant, grape variety" — norm() collapses the
//     ", or predominant," so the interrupting words no longer defeat the match.
// The "or predominant" hedge only concedes that a wine MAY be a blend named by its dominant grape
// (EK-0040, matching question-validator's rule (3)); it still promises the SAME grape is predominant
// in EVERY wine. It does NOT license a flight of genuinely different varieties (Sémillon-dominant
// Sauternes beside a 100%-Chenin-Blanc Coteaux du Layon). Only the fixed filler vocabulary is allowed
// between "same" and "variet", so this never over-matches unrelated prose.
function promisesSameVariety(stem) {
  return /\bsame (?:(?:single|or|predominant|principal|dominant|main|grape) ){0,5}variet/.test(
    norm(stem)
  );
}

// ---------- Scope-header / tariff consistency (EK-0172, "R-SCOPE") ----------
// A sub-question's SCOPE HEADER must agree with the TARIFF form. Across the real exam (2011–2025,
// P1–P3) the IMW keeps two clean shapes and never mixes them:
//   • a SHARED-answer header ("With reference to all three wines: Identify the grape variety") pairs
//     with a SINGLE mark block (e.g. "15 marks") — one attribute the whole flight shares; and
//   • a PER-WINE header ("For each wine: Identify the grape variety") pairs with a MULTIPLIED tariff
//     (e.g. "3 × 5 marks") — a separate call per wine.
// A "with reference to all N wines" header over a MULTIPLIED per-wine tariff (or a "for each wine"
// header over a SINGLE mark block) is structurally invalid. A generated stem shipped the first of
// these — a "With reference to all three wines" header over a "3 × 5 marks" grape-variety ask on a
// flight whose wines are each a DIFFERENT variety. Prompt guidance alone (EK-0064) did not stop it, so
// it is gated here on the same DERIVED key that gates both the generation retry loop and the serve
// path (a fault sets validated=false → dropped), matching the country-diversity / single-variety rules.

// A SHARED-scope header: "with reference to all three wines", "with reference to both wines",
// "with reference to the wines". Deliberately NOT "with reference to each wine" / "for each wine"
// (per-wine), and NOT "with reference to each of the wines" (per-wine) — those name a per-wine ask.
const SHARED_SCOPE_HEADER =
  /with reference to\s+(?:all\s+|both\s+)?(?:the\s+)?(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)?\s*wines\b/gi;

// A PER-WINE scope header, matched ONLY where it LEADS a clause (sentence / colon boundary, or after
// "then"), so a "for each wine" that sits INSIDE an ask ("identify the grape variety for each wine")
// is not mistaken for a header.
const PER_WINE_HEADER = /(?:^|[.;:]\s*|\bthen\s+)for each (?:of the )?wines?\b/gi;

// Tariff forms. A MULTIPLIED tariff ("3 × 5 marks", "6 x 7 marks", "2 * 8 mark") vs a SINGLE mark
// block ("15 marks"). × / x / * are all seen as the multiplier glyph in real and generated stems.
const MULTIPLIED_TARIFF = /\b\d+\s*[×x*]\s*\d+\s*marks?\b/i;
const SINGLE_TARIFF = /\b\d+\s*marks?\b/i;

// True when the stem says the flight shares ONE variety (a same-variety flight) — the single case a
// shared-scope "identify the grape variety" header is legitimately paired with a single mark block.
function isSameVarietyFlight(stem) {
  return promisesSameVariety(stem || "");
}

// The first tariff appearing in `seg`: { multiplied: boolean }, or null when the segment has none.
// Whichever tariff starts EARLIEST governs the header's own sub-question (a later multiplied tariff
// belonging to a following sub-question does not count — segments are bounded at the next header).
function firstTariff(seg) {
  const m = seg.match(MULTIPLIED_TARIFF);
  const s = seg.match(SINGLE_TARIFF);
  const mi = m ? m.index : Infinity;
  const si = s ? s.index : Infinity;
  if (mi === Infinity && si === Infinity) return null;
  return { multiplied: mi <= si };
}

// Structural faults where a scope header disagrees with its tariff. Pure (stem string in, messages
// out). Exported so the offline backfill and any live validator run the SAME rule.
export function scopeHeaderProblems(stem) {
  const out = [];
  if (!stem) return out;
  const sameVariety = isSameVarietyFlight(stem);
  const mk = (kind) => (m) => ({ i: m.index, end: m.index + m[0].length, text: m[0].trim(), kind });
  const headers = [
    ...[...stem.matchAll(SHARED_SCOPE_HEADER)].map(mk("shared")),
    ...[...stem.matchAll(PER_WINE_HEADER)].map(mk("perwine")),
  ].sort((a, b) => a.i - b.i);
  // A header governs the text up to the NEXT header (so its tariff is not read from a later section).
  const nextStart = (h) => {
    const nx = headers.find((x) => x.i > h.i);
    return nx ? nx.i : stem.length;
  };
  let flaggedShared = false;
  let flaggedPerWine = false;
  for (const h of headers) {
    const t = firstTariff(stem.slice(h.end, nextStart(h)));
    if (!t) continue;
    if (h.kind === "shared" && t.multiplied && !sameVariety && !flaggedShared) {
      out.push(
        `scope-header mismatch (the shared-scope header "${h.text}" governs a multiplied per-wine ` +
          `tariff; a "with reference to all wines" header must pair with a single mark block, or the ` +
          `header must read "for each wine")`
      );
      flaggedShared = true;
    } else if (h.kind === "perwine" && !t.multiplied && !flaggedPerWine) {
      out.push(
        `scope-header mismatch (a "for each wine" per-wine header governs a single mark block; a ` +
          `per-wine ask must pair with a multiplied tariff)`
      );
      flaggedPerWine = true;
    }
  }
  return out;
}

// ---------- Named Variety Family Membership (EK-0173, "R12") ----------
// A stem that declares a NAMED variety family ("Bordeaux varieties") makes a factual promise to the
// candidate: EVERY wine is made from a member of that family. A wine keyed OUTSIDE the family — e.g. a
// Touriga Franca (a Portuguese indigenous grape, a natural Touriga Nacional × Marufo cross with no
// genetic or regulatory tie to the six Bordeaux-permitted varieties) under a "Bordeaux varieties"
// stem — breaks that contract. It is a factual error in wine selection, not a difficulty judgement, so
// it is a HARD fault (validated=false → dropped from serve paths), the same treatment as the
// country-diversity / single-variety / scope-header rules above. The existing name-label and
// variety/profile checks never caught this: they verify a wine's key is internally consistent, not
// that it belongs to the varietal family the stem names.
//
// Members are CANONICAL variety names. resolveVariety maps synonyms to their canonical form before
// keying (Côt→Malbec, Touriga Francesa→Touriga Franca via variety_lexicon), so membership is a
// canonical-name set compared accent/case-insensitively via norm(). A BLEND passes when ANY component
// is in the family (a real Bordeaux blend may carry a splash of an outside grape); it fails only when
// NO component is.
const VARIETY_FAMILIES = {
  // The six varieties permitted in Bordeaux AOC. Malbec's canonical synonym Côt and Carménère's
  // accented spelling both normalise into this set. Extend with further families (Rhône, Burgundy, …)
  // only WITH a curated member list — an un-listed family stays unenforced rather than risk a false
  // flag on a premise this module can't yet verify.
  bordeaux: {
    label: "Bordeaux",
    members: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Malbec", "Petit Verdot", "Carmenere"],
  },
};

// The variety family a stem declares ("Bordeaux varieties"), or null. Only families present in
// VARIETY_FAMILIES above are returned (and therefore enforced). norm() strips the accent so "Rhône"
// would match "rhone" if/when a Rhône list is added.
function namedVarietyFamily(stem) {
  const m = norm(stem).match(/\b(bordeaux|rhone|burgundy|champagne) variet(?:y|ies)\b/);
  return m ? VARIETY_FAMILIES[m[1]] || null : null;
}

// Hard faults where a wine's keyed variety is outside the family the stem declares. Pure (stem +
// keyed ground in, messages out). Exported so the offline backfill, the live builder and the tests
// run the SAME rule.
export function varietyFamilyProblems(stem, ground) {
  const family = namedVarietyFamily(stem || "");
  if (!family) return [];
  const members = new Set(family.members.map(norm));
  const out = [];
  for (const g of ground || []) {
    const vars = g.varieties || [];
    if (!vars.length) continue; // a no-variety wine is already flagged by the resolver
    if (!vars.some((v) => members.has(norm(v)))) {
      out.push(
        `variety-family membership violation (W${g.slot} is keyed ${vars.join("/")}, not a ` +
          `${family.label} variety, but the stem declares "${family.label} varieties")`
      );
    }
  }
  return out;
}

// ---------- Same-Variety Flight Consistency (EK-0040 "R2") ----------
// A stem promising the flight is made from "the same single, or predominant, grape variety" claims
// that ONE grape is (at least) the predominant variety of EVERY wine. It is contradicted when the
// wines' PREDOMINANT (first-listed) grapes are not all the same variety — a Sauternes (Sémillon-
// dominant Sémillon/Sauvignon Blanc blend) beside a Coteaux du Layon (100% Chenin Blanc) share no
// predominant grape and break that promise. This is the stem-contradicts-wines fault Question Review
// flagged on gen_p3_F1_1785859729985, which slipped through because the "or predominant" phrasing was
// treated purely as a per-wine blend hedge, so the cross-flight same-variety check never ran.
//
// Comparison is canonicalised (Shiraz=Syrah, "grenache blend"→Grenache, …) so a Châteauneuf beside a
// McLaren Vale Grenache — the exact comparison the hedge is meant to ALLOW — still reads as one grape.
// Skipped when the stem is SUBSET-scoped (per-pair / "wines 1-3 … wine 4 is a blend" claims are not
// flight-wide). Pure (stem + keyed ground in, messages out) so the offline backfill, the live builder
// and the tests run the SAME rule.
export function sameVarietyProblems(stem, ground) {
  if (!promisesSameVariety(stem || "")) return [];
  const g = ground || [];
  if (subsetScopedStem(stem || "", g.length)) return [];
  const keyed = g.filter((w) => (w.varieties || []).length);
  if (keyed.length < 2) return [];
  const base = canonVariety(keyed[0].varieties[0]);
  const offender = keyed.find((w) => canonVariety(w.varieties[0]) !== base);
  if (!offender) return [];
  return [
    `same-variety stem contradiction (the stem states the wines are from the same single, or ` +
      `predominant, grape variety, but W${offender.slot}'s predominant grape "${offender.varieties[0]}" ` +
      `differs from W${keyed[0].slot}'s "${keyed[0].varieties[0]}")`,
  ];
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
 *
 * `isBanker` is INJECTED rather than imported because it lives in question-validator.ts and this module
 * is .mjs, loaded by offline scripts as well as the Next bundle. It gates the generator-declared role:
 * see the reconciliation in buildKeyForRow.
 *
 * @param {{ variety_lexicon: any, appellation_varieties: any, stem_proprietary_blends: any,
 *           stem_style_lexicon: any, mock_wine_bank: any,
 *           isBanker?: (w: any) => boolean }} data
 */
export function createAnswerKeyBuilder(data) {
  const isBankerFn = typeof data.isBanker === "function" ? data.isBanker : null;
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
    // A producer flagship whose NAME does not disclose its grape (Mulderbosch "Faithful Hound" is a
    // red Bordeaux blend; the producer also make a white "Sauvignon Blanc" under another label) can be
    // resolved to the producer's other-colour wine by a name-level lookup, then keyed against the paper
    // without objection because the mis-keyed grape happens to be the paper's colour. When such a
    // flagship is named on the label AND its known varieties are the WRONG colour for a TRUSTED paper,
    // the wine itself does not belong on this paper — no candidate is trustworthy. Veto everything so
    // the wine keys as no-variety and the question is flagged/invalidated rather than silently mis-keyed.
    if (colTrusted) {
      const flagship = propList.find(([m]) => norm(ft).includes(m));
      if (flagship && conflictsWithColour(flagship[1].varieties, col)) return { v: [], src: "colour-conflict" };
    }
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
    // Per-wine ROLE, from the generator's own declaration (migration 065). NULL means "not declared"
    // and must NOT become an empty set: an empty set says every wine is an anchor, and consumers ENFORCE
    // that, whereas undeclared leaves the role to be derived and only flagged. Kept a Set of slots.
    const declaredCurveballs =
      Array.isArray(r.curveball_slots) ? new Set(r.curveball_slots.map(Number)) : null;
    const ground = [];
    // Annotated because this module is .mjs and TypeScript infers its exports for the .ts callers.
    // A bare `{}` infers as the empty type, so `key.source[slot]` in a TS consumer is TS7053
    // ("expression of type '1' can't be used to index type '{}'"). Keyed by wine slot.
    /** @type {Record<number, string>} */
    const source = {};
    const problems = [];
    const curatedConfusables = [];
    // Slots keyed as DELIBERATE multi-variety blends (proprietary/icon blends with is_blend). Used to
    // gate a "single grape variety" stem below. Deliberate blends only — a co-ferment resolved via an
    // appellation stays a soft matter (EK-0040 R5) and is intentionally not collected here.
    const deliberateBlendSlots = [];
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
      if (pm && pm.is_blend) deliberateBlendSlots.push(w.slot);
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
      // Only stamped when the generator actually declared the flight's roles. role_source records the
      // provenance so a consumer can tell an intended role from an inferred one, and so telemetry can
      // separate the two: 'generator' is a record of what the question was built to do, 'derived'
      // (stamped by the backfill) is the reviewer-calibrated isBanker table's inference about the wine.
      // ROLE RECONCILIATION — stamp a role only where the generator's declaration and the
      // reviewer-calibrated isBanker table AGREE.
      //
      // A stamped role is ENFORCED: validateAnswerKeyClaims Rule 1 will rewrite a debrief that
      // contradicts it. The generator knows the flight's intent, but measured on the first
      // generator-declared flight it under-called — a Felton Road Central Otago Chardonnay declared an
      // anchor beside a Raveneau Chablis, when Central Otago is a Pinot Noir region and the engine's
      // own composition telemetry logged it as non-benchmark in the same run. Enforcing that would
      // rewrite a debrief that correctly called it a curveball, inverting the rule.
      //
      // So disagreement leaves the role OFF, which keeps Rule 1 a review flag for that wine — the
      // pre-existing safe state. Fail-safe in the same direction when no classifier is injected.
      if (declaredCurveballs && isBankerFn) {
        const declared = declaredCurveballs.has(w.slot) ? "curveball" : "banker";
        let derived;
        try {
          derived = isBankerFn({ ...bucket, fullText: w.fullText }) ? "banker" : "curveball";
        } catch {
          derived = null; // a classifier failure must not block keying the rest of the flight
        }
        if (derived && derived === declared) {
          bucket.role = declared;
          bucket.role_source = "generator";
        } else if (derived) {
          // Not a `problems` entry: that would set validated=false and drop the question from drills
          // over a role disagreement, which is far too harsh. Visible in logs instead.
          console.warn(
            `[stem-key] W${w.slot} role not keyed — generator declared "${declared}", classifier reads ` +
              `"${derived}". Left unkeyed so the claim rule flags rather than rewrites.`
          );
        }
      }
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
    // Single-variety stem vs blend key: if the stem promises each wine is a single grape variety but a
    // wine is keyed as a deliberate multi-variety blend, the stem and key contradict. This is a hard
    // fault (validated=false → dropped from serve paths), the same treatment as country-diversity above.
    if (deliberateBlendSlots.length && promisesSingleVarietyPerWine(r.question_text || "")) {
      for (const slot of deliberateBlendSlots) {
        problems.push(
          `single-variety stem contradiction (W${slot} is a multi-variety blend, but the stem ` +
            `states each wine is a single grape variety)`
        );
      }
    }
    // Scope-header / tariff consistency (EK-0172, R-SCOPE): a shared-scope header over a multiplied
    // per-wine tariff (or a per-wine header over a single mark block) is structurally invalid. Hard
    // fault, same treatment as the checks above (validated=false → dropped from serve paths).
    for (const p of scopeHeaderProblems(r.question_text || "")) problems.push(p);
    // Named variety-family membership (EK-0173, R12): a "Bordeaux varieties" stem promises every wine
    // is a Bordeaux variety; a wine keyed outside the family (e.g. Touriga Franca) contradicts it.
    // Hard fault, same treatment as the checks above (validated=false → dropped from serve paths).
    for (const p of varietyFamilyProblems(r.question_text || "", ground)) problems.push(p);
    // Same-variety flight consistency (EK-0040, R2): a "same single, or predominant, grape variety"
    // stem promises one grape is predominant in every wine; wines with different predominant grapes
    // (Sémillon-dominant Sauternes vs 100%-Chenin Coteaux du Layon) contradict it. Hard fault, same
    // treatment as the checks above (validated=false → dropped from serve paths).
    for (const p of sameVarietyProblems(r.question_text || "", ground)) problems.push(p);
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
