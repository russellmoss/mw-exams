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
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataFile = (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));

const env = readFileSync(join(ROOT, "study-app", ".env.local"), "utf8");
const DATABASE_URL = env.match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
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
function resolveVariety(wp, ft, col) {
  const e = wp.bank_match ? bankById[wp.bank_match] : null;
  if (e && (e.grape_varieties || []).length) return { v: e.grape_varieties, src: "bank" };
  if ((wp.grape_varieties || []).length) return { v: wp.grape_varieties, src: "profile" };
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

// ---------- build ----------
async function build() {
  const rows = await sql`
    SELECT question_id, paper, family, wines, wine_profiles
    FROM generated_questions WHERE wine_profiles IS NOT NULL`;
  let validated = 0;
  const failures = [];
  for (const r of rows) {
    const wines = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
    const wp = typeof r.wine_profiles === "string" ? JSON.parse(r.wine_profiles) : r.wine_profiles;
    const ground = [];
    const source = {};
    const problems = [];
    for (const w of wines) {
      const prof = wp[String(w.slot)] || {};
      const col = colour(w.fullText, r.paper);
      const { v, src } = resolveVariety(prof, w.fullText, col);
      const o = resolveOrigin(w.fullText);
      source[w.slot] = src;
      // §2b consistency: variety present, origin present, consistent with profile grapes if any
      if (!v.length) problems.push(`W${w.slot} no-variety`);
      if (!o.ok) problems.push(`W${w.slot} no-origin`);
      if (v.length && (prof.grape_varieties || []).length) {
        const profSet = new Set(prof.grape_varieties.map(norm));
        if (!v.some((x) => profSet.has(norm(x)))) problems.push(`W${w.slot} variety/profile mismatch`);
      }
      ground.push({
        slot: w.slot,
        varieties: v,
        is_blend: v.length > 1,
        region: o.region,
        country: o.country,
      });
    }
    const plausible = plausibleFor(ground);
    const ok = problems.length === 0;
    if (ok) validated++;
    else failures.push(`${r.question_id} (P${r.paper} ${r.family}): ${problems.join("; ")}`);
    await sql`
      INSERT INTO stem_answer_keys (question_id, ground_truth, plausible, source, validated, generated_at)
      VALUES (${r.question_id}, ${JSON.stringify(ground)}::jsonb, ${JSON.stringify(plausible)}::jsonb,
              ${JSON.stringify(source)}::jsonb, ${ok}, now())
      ON CONFLICT (question_id) DO UPDATE SET
        ground_truth = EXCLUDED.ground_truth, plausible = EXCLUDED.plausible,
        source = EXCLUDED.source, validated = EXCLUDED.validated, generated_at = now()`;
  }
  console.log(`\nstem_answer_keys built: ${validated}/${rows.length} validated:true (${Math.round((validated / rows.length) * 100)}%).`);
  if (failures.length) {
    console.log("validated:false (excluded from drills):");
    failures.forEach((f) => console.log("  " + f));
  }
}

await migrate();
await build();
console.log("done.");
