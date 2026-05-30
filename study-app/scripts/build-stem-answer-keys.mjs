// build-stem-answer-keys.mjs — Stem Sniper Phase-0 build.
//
// 1. Runs idempotent migrations:
//      - user_attempts: + mode TEXT DEFAULT 'full', + drill_payload JSONB   (for drill persistence)
//      - CREATE TABLE stem_answer_keys                                        (the answer-key store)
// 2. For every generated_questions row, derives the answer key:
//      - ground_truth: per-wine {variety(ies), region, country} via the proven source-priority
//        resolver (bank_match -> wine_profiles.grape_varieties -> proprietary override ->
//        colour-aware appellation map -> variety lexicon). Origin is parsed from fullText (NV-safe).
//      - plausible: confusable buckets = the SAME variety from OTHER classic regions
//        (variety->regions index built from appellation_varieties + the wine bank), tagged PLAUSIBLE.
// 3. §2b qualification: a key is validated:true only if EVERY wine resolves a variety + region
//    and (where wine_profiles has grapes) the variety is consistent. Failures are written
//    validated:false and excluded from the drill pool.
// 4. Upserts into stem_answer_keys and prints a summary.
//
// Run from anywhere:  node study-app/scripts/build-stem-answer-keys.mjs
// Reads three committed data files: data/variety_lexicon.json, data/appellation_varieties.json,
// data/stem_proprietary_blends.json, plus data/mock_wine_bank.json. DB creds from study-app/.env.local.

import { readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataFile = (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));

// Prefer the env var (CI / the auto-feedback Action) and fall back to study-app/.env.local (local).
const DATABASE_URL =
  process.env.DATABASE_URL ||
  readFileSync(join(ROOT, "study-app", ".env.local"), "utf8").match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
const sql = neon(DATABASE_URL);

// ---------- normalization ----------
const norm = (s) =>
  (s || "").toString().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const pad = (s) => " " + norm(s) + " ";

// ---------- data ----------
const lex = dataFile("variety_lexicon.json");
const appVar = dataFile("appellation_varieties.json");
const prop = dataFile("stem_proprietary_blends.json");
const bank = dataFile("mock_wine_bank.json");
const bankById = {};
for (const e of bank) if (e.id) bankById[e.id] = e;

const lexList = [];
for (const v of lex.varieties) lexList.push([pad(v), v]);
for (const [t, c] of Object.entries(lex.synonyms)) lexList.push([pad(t), c]);
lexList.sort((a, b) => b[0].length - a[0].length);

// ---------- P3 style/method ----------
const styleLex = dataFile("stem_style_lexicon.json").styles;
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
// Derive the P3 style/method from a wine's fullText (most-specific first), falling back to the
// profile's broad style_category. Returns { style, style_category, style_tokens }.
function deriveStyle(fullText, profileStyleCategory) {
  const nf = pad(fullText);
  for (const s of styleLex) {
    if (s.tokens.some((t) => nf.includes(" " + norm(t) + " ") || norm(fullText).includes(norm(t)))) {
      // include the label itself so predicting the canonical style name scores a full match
      return { style: s.label, style_category: s.category, style_tokens: [...new Set([norm(s.label), ...s.tokens.map(norm)])] };
    }
  }
  const fb = STYLE_CAT_FALLBACK[profileStyleCategory] || "Special";
  return { style: fb, style_category: fb, style_tokens: [norm(fb)] };
}

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

// ---------- resolvers ----------
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
// Grape names explicitly written on the label (most reliable variety signal). Scans the lexicon
// (varieties + synonyms) for tokens present in the wine text and returns canonical varieties.
function explicitVarietiesFromText(ft) {
  const nf = pad(ft);
  const found = new Set();
  for (const [t, c] of lexList) if (nf.includes(t)) found.add(c);
  return [...found];
}
// True when the label explicitly names grape(s) and NONE of them appear in `candidate` — i.e. the
// candidate variety (from a fuzzy bank match or profile) contradicts the labelled grape. A
// producer+region bank match can wrongly attach e.g. that producer's Malbec to their Chardonnay;
// the explicit label must win, so we reject the conflicting source and resolve from the text.
function conflictsWithLabel(candidateVarieties, explicit) {
  if (!explicit.length || !candidateVarieties?.length) return false;
  const cand = new Set(candidateVarieties.map(norm));
  return !explicit.some((v) => cand.has(norm(v)));
}
function resolveVariety(wp, ft, col) {
  const explicit = explicitVarietiesFromText(ft);
  const e = wp.bank_match ? bankById[wp.bank_match] : null;
  if (e && (e.grape_varieties || []).length && !conflictsWithLabel(e.grape_varieties, explicit))
    return { v: e.grape_varieties, src: "bank" };
  if ((wp.grape_varieties || []).length && !conflictsWithLabel(wp.grape_varieties, explicit))
    return { v: wp.grape_varieties, src: "profile" };
  const nf = pad(ft);
  for (const [m, entry] of propList) if (norm(ft).includes(m)) return { v: entry.varieties, src: "proprietary" };
  for (const [t, entry] of appList) {
    if (nf.includes(t)) {
      const v = appResolve(entry, col);
      if (v && v.length) return { v, src: "appellation" };
    }
  }
  for (const [t, c] of lexList) if (nf.includes(t)) return { v: [c], src: "lexicon" };
  return { v: [], src: "none" };
}
// The proprietary entry whose `match` is a substring of the wine text, if any. Used to attach
// curated cross-variety confusables (e.g. the "California Chardonnay" trap for ABC Hildegard)
// regardless of which source resolved the variety.
function proprietaryMatch(ft) {
  for (const [m, entry] of propList) if (norm(ft).includes(m)) return entry;
  return null;
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
// Stems of the "same variety, N different countries" form (P2 Q1-style) promise a specific number
// of DISTINCT countries. If the keyed origins don't deliver that many distinct countries (e.g. two
// USA wines under a "four different countries" stem), the stem contradicts its own answer key and
// the region prediction is unanswerable as framed — so the key must fail §2b validation.
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

// ---------- migrations ----------
async function migrate() {
  await sql`ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'full'`;
  await sql`ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS drill_payload JSONB`;
  await sql`
    CREATE TABLE IF NOT EXISTS stem_answer_keys (
      question_id  TEXT PRIMARY KEY REFERENCES generated_questions(question_id),
      ground_truth JSONB NOT NULL,
      plausible    JSONB NOT NULL,
      source       JSONB NOT NULL,
      validated    BOOLEAN NOT NULL DEFAULT false,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  console.log("migrations applied (user_attempts.mode/drill_payload, stem_answer_keys).");
}

// ---------- build (one row) ----------
// Derive the answer key for a single generated_questions row. Pure (no DB writes) so it can be
// reused by the remediation loop to validate a freshly generated question before committing it.
// Returns { ground, plausible, source, ok, problems }.
export function buildKeyForRow(r) {
    const wines = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
    const wp = typeof r.wine_profiles === "string" ? JSON.parse(r.wine_profiles) : r.wine_profiles;
    const ground = [];
    const source = {};
    const problems = [];
    const curatedConfusables = [];
    for (const w of wines) {
      const prof = wp[String(w.slot)] || {};
      const col = colour(w.fullText, r.paper);
      const { v, src } = resolveVariety(prof, w.fullText, col);
      const o = resolveOrigin(w.fullText);
      source[w.slot] = src;
      // Curated cross-variety confusables for proprietary/icon wines (e.g. the "California
      // Chardonnay" trap for ABC Hildegard, which is a Pinot Gris-led blend, not Chardonnay).
      const pm = proprietaryMatch(w.fullText);
      if (pm && Array.isArray(pm.confusables)) {
        for (const c of pm.confusables) {
          if (!c || !c.variety || !c.region) continue;
          curatedConfusables.push({ variety: c.variety, region: c.region, country: c.country || null, tier: "PLAUSIBLE" });
        }
      }
      // §2b consistency: variety present, origin present, consistent with profile grapes if any.
      // BUT if the profile grapes themselves conflict with the explicit grape on the label, the
      // profile is the unreliable source (a fuzzy producer/region bank mis-match — see
      // resolveVariety's guard), so we trust the label and skip the mismatch penalty.
      const explicit = explicitVarietiesFromText(w.fullText);
      if (!v.length) problems.push(`W${w.slot} no-variety`);
      if (!o.ok) problems.push(`W${w.slot} no-origin`);
      if (v.length && (prof.grape_varieties || []).length && !conflictsWithLabel(prof.grape_varieties, explicit)) {
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
      // Paper 3: the discriminator is style/method, not variety. Attach it so the scorer can
      // grade on style + region (variety becomes optional bonus).
      if (r.paper === 3) {
        const st = deriveStyle(w.fullText, prof.style_category);
        bucket.style = st.style;
        bucket.style_category = st.style_category;
        bucket.style_tokens = st.style_tokens;
      }
      ground.push(bucket);
    }
    // Origin Diversity Check: a "N different countries" stem must be backed by N distinct keyed
    // countries. Fewer distinct countries (a duplicate country, e.g. two USA wines) is an internal
    // contradiction between the stem and the answer key, so the key fails validation.
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
    // Prepend curated confusables (deduped by variety|region), so deliberate traps are always present.
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

// ---------- upsert one key ----------
export async function upsertKey(questionId, { ground, plausible, source, ok }) {
  await sql`
    INSERT INTO stem_answer_keys (question_id, ground_truth, plausible, source, validated, generated_at)
    VALUES (${questionId}, ${JSON.stringify(ground)}::jsonb, ${JSON.stringify(plausible)}::jsonb,
            ${JSON.stringify(source)}::jsonb, ${ok}, now())
    ON CONFLICT (question_id) DO UPDATE SET
      ground_truth = EXCLUDED.ground_truth, plausible = EXCLUDED.plausible,
      source = EXCLUDED.source, validated = EXCLUDED.validated, generated_at = now()`;
}

// ---------- build (all live rows) ----------
export async function build() {
  // Skip archived rows (Phase D: a quarantined question replaced by a regenerated one is marked
  // metadata.archived=true so it leaves the live pool and is never re-validated here).
  const rows = await sql`
    SELECT question_id, paper, family, question_text, wines, wine_profiles
    FROM generated_questions
    WHERE wine_profiles IS NOT NULL
      AND (metadata->>'archived') IS DISTINCT FROM 'true'`;
  let validated = 0;
  const failures = [];
  for (const r of rows) {
    const key = buildKeyForRow(r);
    if (key.ok) validated++;
    else failures.push(`${r.question_id} (P${r.paper} ${r.family}): ${key.problems.join("; ")}`);
    await upsertKey(r.question_id, key);
  }
  console.log(`\nstem_answer_keys built: ${validated}/${rows.length} validated:true (${Math.round((validated / rows.length) * 100)}%).`);
  if (failures.length) {
    console.log("validated:false (excluded from drills):");
    failures.forEach((f) => console.log("  " + f));
  }
}

// Auto-run migrations + full build only when executed directly (not when imported as a lib,
// and not under `node -e` where argv[1] is undefined).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await migrate();
  await build();
  console.log("done.");
}
