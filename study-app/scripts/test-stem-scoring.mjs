// test-stem-scoring.mjs — framework-free tests for stem-scoring.ts.
// Run: node study-app/scripts/test-stem-scoring.mjs   (Node 24 strips TS types on import)
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { scorePredictions } from "../src/lib/stem-scoring.ts";

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; } else { fail++; console.log("  FAIL:", name); } };

// 1. exact variety + specific region -> HIT, 100%
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Pinot Noir"], region: "Côte de Nuits, Burgundy", country: "France" }], plausible: [] };
  const r = scorePredictions([{ variety: "Pinot Noir", region: "Côte de Nuits" }], key);
  ok("exact specific region = HIT/100%", r.grades[0].grade === "HIT" && r.percent === 100);
}
// 2. major region (Burgundy) for a Côte de Nuits wine -> HIT (rubric: variety + major region)
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Pinot Noir"], region: "Côte de Nuits, Burgundy", country: "France" }], plausible: [] };
  const r = scorePredictions([{ variety: "Pinot Noir", region: "Burgundy" }], key);
  ok("major region = HIT", r.grades[0].grade === "HIT");
}
// 3. country only -> NEAR
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Pinot Noir"], region: "Côte de Nuits, Burgundy", country: "France" }], plausible: [] };
  const r = scorePredictions([{ variety: "Pinot Noir", country: "France" }], key);
  ok("country only = NEAR", r.grades[0].grade === "NEAR" && r.grades[0].points === 6);
}
// 4. right grape, wrong place -> VARIETY
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Pinot Noir"], region: "Burgundy", country: "France" }], plausible: [] };
  const r = scorePredictions([{ variety: "Pinot Noir", region: "Rioja", country: "Spain" }], key);
  ok("variety only = VARIETY", r.grades[0].grade === "VARIETY" && r.grades[0].points === 3);
}
// 5. synonym Shiraz->Syrah -> HIT
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Syrah"], region: "Barossa Valley", country: "Australia" }], plausible: [] };
  const r = scorePredictions([{ variety: "Shiraz", region: "Barossa Valley" }], key);
  ok("Shiraz=Syrah synonym = HIT", r.grades[0].grade === "HIT");
}
// 6. blend: naming any component = variety match
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Cabernet Sauvignon", "Carmenere", "Cabernet Franc"], region: "Maipo Valley", country: "Chile", is_blend: true }], plausible: [] };
  const r = scorePredictions([{ variety: "Carmenère", region: "Maipo Valley" }], key);
  ok("blend component = HIT", r.grades[0].grade === "HIT");
}
// 7. plausible/confusable -> PLAUSIBLE_OK
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Sauvignon Blanc"], region: "Marlborough", country: "New Zealand" }], plausible: [{ variety: "Sauvignon Blanc", region: "Sancerre", country: "France" }] };
  const r = scorePredictions([{ variety: "Sauvignon Blanc", region: "Sancerre" }], key);
  ok("confusable = PLAUSIBLE_OK", r.grades[0].grade === "PLAUSIBLE_OK" && r.grades[0].points === 4);
}
// 8. total miss -> MISS, 0 points, no penalty
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Pinot Noir"], region: "Burgundy", country: "France" }], plausible: [] };
  const r = scorePredictions([{ variety: "Nebbiolo", region: "Piedmont" }], key);
  ok("miss = MISS/0", r.grades[0].grade === "MISS" && r.percent === 0);
}
// 9. one bucket can't be double-claimed
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Pinot Noir"], region: "Burgundy", country: "France" }], plausible: [] };
  const r = scorePredictions([{ variety: "Pinot Noir", region: "Burgundy" }, { variety: "Pinot Noir", region: "Burgundy" }], key);
  ok("no double-claim", r.summary.hits === 1 && r.percent === 100);
}
// 10. calibration side-channel
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany" }], plausible: [] };
  const r = scorePredictions([{ variety: "Riesling", region: "Mosel", tier: "STRONG" }], key);
  ok("calibration records STRONG+correct", r.calibration[0].tier === "STRONG" && r.calibration[0].correct === true);
}

// --- Fuzzy / typo tolerance ---
// F1. misspelled variety (missing letter) still matches
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Sauvignon Blanc"], region: "Sancerre, Loire", country: "France" }], plausible: [] };
  const r = scorePredictions([{ variety: "savignon blanc", region: "Loire" }], key);
  ok("typo 'savignon blanc' = HIT", r.grades[0].grade === "HIT");
}
// F2. misspelled variety + transposed -> still matches grape
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany" }], plausible: [] };
  const r = scorePredictions([{ variety: "Reisling", region: "Mosel" }], key);
  ok("typo 'Reisling' = HIT", r.grades[0].grade === "HIT");
}
// F3. misspelled region still matches
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Nebbiolo"], region: "Barolo, Piedmont", country: "Italy" }], plausible: [] };
  const r = scorePredictions([{ variety: "Nebbiolo", region: "Piedmonte" }], key);
  ok("typo region 'Piedmonte' = HIT", r.grades[0].grade === "HIT");
}
// F4. CONSERVATIVE: distinct close names must NOT collapse (Douro vs Duero)
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Tempranillo"], region: "Ribera del Duero", country: "Spain" }], plausible: [] };
  const r = scorePredictions([{ variety: "Tempranillo", region: "Douro" }], key);
  ok("Douro != Duero (no false region match)", r.grades[0].grade === "VARIETY");
}
// F5. CONSERVATIVE: different short grapes must NOT collapse (Merlot vs Malbec)
{
  const key = { ground_truth: [{ slot: 1, varieties: ["Merlot"], region: "Pomerol", country: "France" }], plausible: [] };
  const r = scorePredictions([{ variety: "Malbec", region: "Pomerol" }], key);
  ok("Malbec != Merlot (no false variety match)", r.grades[0].grade === "MISS");
}

// --- Paper 3 style-mode ---
const sherry = { slot: 1, varieties: ["Palomino"], region: "Jerez", country: "Spain", style: "Amontillado", style_category: "Sherry", style_tokens: ["amontillado"] };
// 11. style + region -> HIT
{
  const r = scorePredictions([{ style: "Amontillado", region: "Jerez", tier: "STRONG" }], { ground_truth: [sherry], plausible: [] });
  ok("P3 style+region = HIT", r.grades[0].grade === "HIT" && r.percent === 100);
}
// 12. style nailed, region off -> PLAUSIBLE_OK
{
  const r = scorePredictions([{ style: "Amontillado", region: "Douro" }], { ground_truth: [sherry], plausible: [] });
  ok("P3 style nailed / region off = PLAUSIBLE_OK", r.grades[0].grade === "PLAUSIBLE_OK");
}
// 13. category + region -> NEAR
{
  const r = scorePredictions([{ style: "Sherry", region: "Jerez" }], { ground_truth: [sherry], plausible: [] });
  ok("P3 category + region = NEAR", r.grades[0].grade === "NEAR");
}
// 14. variety bonus on top of HIT
{
  const r = scorePredictions([{ style: "Amontillado", region: "Jerez", variety: "Palomino" }], { ground_truth: [sherry], plausible: [] });
  ok("P3 HIT + variety bonus", r.grades[0].grade === "HIT" && r.grades[0].points === 11);
}
// 15. wrong style, right region -> weak (VARIETY)
{
  const r = scorePredictions([{ style: "Tawny Port", region: "Jerez" }], { ground_truth: [sherry], plausible: [] });
  ok("P3 wrong style / right region = VARIETY", r.grades[0].grade === "VARIETY");
}

// 16. real key from DB: predict the actual buckets -> should be ~100%
try {
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const env = readFileSync(join(ROOT, "study-app", ".env.local"), "utf8");
  const url = env.match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  const row = (await sql`SELECT ground_truth, plausible FROM stem_answer_keys WHERE question_id = ${"gen_p1_F3_1780111391449"}`)[0];
  if (row) {
    const gt = typeof row.ground_truth === "string" ? JSON.parse(row.ground_truth) : row.ground_truth;
    const pl = typeof row.plausible === "string" ? JSON.parse(row.plausible) : row.plausible;
    const preds = gt.map((g) => ({ variety: g.varieties[0], region: g.region, tier: "STRONG" }));
    const r = scorePredictions(preds, { ground_truth: gt, plausible: pl });
    ok("real key (gen_p1_F3) all-correct = 100%", r.percent === 100);
    console.log(`  real key: ${r.summary.hits}/${gt.length} HIT, ${r.percent}% (${r.points}/${r.maxPoints})`);
  } else {
    console.log("  (skipped real-key test: row not found)");
  }
  // 17. real P3 key: predict style + region -> should be ~100%
  const p3 = (await sql`
    SELECT k.ground_truth, k.plausible FROM stem_answer_keys k JOIN generated_questions q ON q.question_id = k.question_id
    WHERE q.paper = 3 AND k.validated = true LIMIT 1`)[0];
  if (p3) {
    const gt = typeof p3.ground_truth === "string" ? JSON.parse(p3.ground_truth) : p3.ground_truth;
    const pl = typeof p3.plausible === "string" ? JSON.parse(p3.plausible) : p3.plausible;
    const preds = gt.map((g) => ({ style: g.style, region: g.region, tier: "STRONG" }));
    const r = scorePredictions(preds, { ground_truth: gt, plausible: pl });
    ok("real P3 key (style+region) = 100%", r.percent === 100);
    console.log(`  real P3 key: ${r.summary.hits}/${gt.length} HIT, ${r.percent}% — styles: ${gt.map((g) => g.style).join(", ")}`);
  }
} catch (e) {
  console.log("  (skipped real-key test:", e.message, ")");
}

console.log(`\nstem-scoring tests: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
