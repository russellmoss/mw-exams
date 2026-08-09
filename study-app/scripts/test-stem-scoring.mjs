// test-stem-scoring.mjs — framework-free tests for stem-scoring.ts.
// Run: node study-app/scripts/test-stem-scoring.mjs   (Node 24 strips TS types on import)
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { scorePredictions } from "../src/lib/stem-scoring.ts";
import { scopeHeaderProblems, varietyFamilyProblems, sameVarietyProblems } from "../src/lib/stem-answer-key.mjs";

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

// --- Scope-header / tariff consistency (EK-0172, R-SCOPE) ---
// S1. THE FLAGGED DEFECT: a "with reference to all three wines" header over a "3 × 5 marks" per-wine
// grape-variety ask, on a DIFFERENT-variety flight — must be flagged.
{
  const stem =
    "Wines 4 to 6 are from three different countries and are each made from a different single grape variety. " +
    "With reference to all three wines: a) Identify the grape variety for each wine. (3 x 5 marks) " +
    "Then for each wine: b) Identify the origin as closely as possible. (3 x 8 marks) " +
    "c) Comment on the style, quality, and commercial position of the wine. (3 x 12 marks)";
  const p = scopeHeaderProblems(stem);
  ok("S1 shared header + multiplied per-wine tariff = flagged", p.length === 1 && /shared-scope header/.test(p[0]));
}
// S2. VALID: a shared header paired with a SINGLE mark block (one attribute the whole flight shares).
{
  const stem =
    "Wines 1 to 3 are made from the same grape variety. With reference to all three wines: " +
    "Identify the grape variety. (15 marks)";
  ok("S2 shared header + single block = clean", scopeHeaderProblems(stem).length === 0);
}
// S3. VALID: the CORRECTED form of S1 — a per-wine header paired with a multiplied tariff.
{
  const stem =
    "Wines 4 to 6 are each made from a different single grape variety. " +
    "For each wine: a) Identify the grape variety. (3 x 5 marks) " +
    "b) Identify the origin as closely as possible. (3 x 8 marks)";
  ok("S3 per-wine header + multiplied tariff = clean", scopeHeaderProblems(stem).length === 0);
}
// S4. VALID SAME-VARIETY FLIGHT: a shared header may sit over a multiplied tariff when the flight
// explicitly shares ONE variety (the marks then multiply for a per-wine comparison, not identification).
{
  const stem =
    "Wines 1 to 3 are all made from the same single grape variety. " +
    "With reference to all three wines, comment on quality. (3 x 10 marks)";
  ok("S4 same-variety flight + multiplied = clean", scopeHeaderProblems(stem).length === 0);
}
// S5. INVERSE: a "for each wine" header over a single mark block — equally inconsistent.
{
  const stem = "For each wine: identify the grape variety and origin. (15 marks)";
  const p = scopeHeaderProblems(stem);
  ok("S5 per-wine header + single block = flagged", p.length === 1 && /per-wine header/.test(p[0]));
}
// S6. NO FALSE POSITIVE: an in-ask "for each wine" (not a leading header) must not be read as a header.
{
  const stem = "With reference to all three wines: identify the grape variety for each wine. (15 marks)";
  ok("S6 in-ask 'for each wine' not treated as header", scopeHeaderProblems(stem).length === 0);
}
// S7. NO FALSE POSITIVE: no scope header at all → nothing to check.
{
  const stem = "Wine 1 is a premium white. Identify the grape variety and origin. (25 marks)";
  ok("S7 no scope header = clean", scopeHeaderProblems(stem).length === 0);
}

// --- Named variety-family membership (EK-0173, R12) ---
const bordeauxStem =
  "Wines 1-4 are made from Bordeaux varieties. For each wine: a) Identify the origin and grape " +
  "variety(ies). (4 x 10 marks)";
// V1. THE FLAGGED DEFECT: Touriga Franca under a "Bordeaux varieties" stem must be flagged.
{
  const ground = [
    { slot: 1, varieties: ["Merlot", "Cabernet Franc"], region: "Lussac-Saint-Émilion", country: "France" },
    { slot: 2, varieties: ["Cabernet Sauvignon"], region: "Tuscany", country: "Italy" },
    { slot: 3, varieties: ["Cabernet Franc"], region: "Chinon, Loire", country: "France" },
    { slot: 4, varieties: ["Touriga Franca"], region: "Douro", country: "Portugal" },
  ];
  const p = varietyFamilyProblems(bordeauxStem, ground);
  ok("V1 Touriga Franca in Bordeaux flight = flagged (W4 only)", p.length === 1 && /W4/.test(p[0]) && /Touriga Franca/.test(p[0]));
}
// V2. VALID: an all-Bordeaux-variety flight is clean (Côt is Malbec's canonical synonym).
{
  const ground = [
    { slot: 1, varieties: ["Cabernet Sauvignon", "Merlot"], region: "Pauillac", country: "France" },
    { slot: 2, varieties: ["Malbec"], region: "Mendoza", country: "Argentina" },
    { slot: 3, varieties: ["Carménère"], region: "Maipo Valley", country: "Chile" },
    { slot: 4, varieties: ["Petit Verdot"], region: "Napa Valley", country: "USA" },
  ];
  ok("V2 all-Bordeaux flight = clean", varietyFamilyProblems(bordeauxStem, ground).length === 0);
}
// V3. VALID: Cabernet Franc grown in the Douro satisfies the premise (the correct Portugal curveball).
{
  const ground = [{ slot: 4, varieties: ["Cabernet Franc"], region: "Douro", country: "Portugal" }];
  ok("V3 Portuguese Cabernet Franc = clean", varietyFamilyProblems(bordeauxStem, ground).length === 0);
}
// V4. BLEND: passes when ANY component is Bordeaux, fails when NONE is.
{
  const okBlend = [{ slot: 1, varieties: ["Cabernet Sauvignon", "Syrah"], region: "Provence", country: "France" }];
  const badBlend = [{ slot: 1, varieties: ["Touriga Nacional", "Tempranillo"], region: "Douro", country: "Portugal" }];
  ok("V4a blend with one Bordeaux component = clean", varietyFamilyProblems(bordeauxStem, okBlend).length === 0);
  ok("V4b blend with no Bordeaux component = flagged", varietyFamilyProblems(bordeauxStem, badBlend).length === 1);
}
// V5. NO FALSE POSITIVE: a stem naming no variety family is never checked.
{
  const stem = "Wines 1-4 are premium reds. For each wine, identify the grape variety and origin. (4 x 15 marks)";
  const ground = [{ slot: 1, varieties: ["Touriga Franca"], region: "Douro", country: "Portugal" }];
  ok("V5 no named family = clean", varietyFamilyProblems(stem, ground).length === 0);
}
// V6. UNENFORCED FAMILY: a family with no curated member list stays unenforced (no false flag).
{
  const stem = "Wines 1-3 are made from Rhône varieties. For each wine, identify the grape. (3 x 10 marks)";
  const ground = [{ slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany" }];
  ok("V6 un-listed family = clean", varietyFamilyProblems(stem, ground).length === 0);
}
// V7. NO-VARIETY wine is not double-flagged here (the resolver already flags it).
{
  const ground = [{ slot: 4, varieties: [], region: "Douro", country: "Portugal" }];
  ok("V7 no-variety wine not flagged by family rule", varietyFamilyProblems(bordeauxStem, ground).length === 0);
}

// --- Same-variety flight consistency (EK-0040, R2) ---
// W1. THE FLAGGED DEFECT (gen_p3_F1_...): a hedged "same single, or predominant, grape variety" stem
// over a Sémillon-dominant Sauternes + a 100%-Chenin Coteaux du Layon — different predominant grapes.
{
  const stem =
    "Wines 1 and 2 are made from the same single, or predominant, grape variety. " +
    "a) Identify the grape variety or varieties, giving your reasons. (10 marks)";
  const ground = [
    { slot: 1, varieties: ["Semillon", "Sauvignon Blanc"], region: "Sauternes, Bordeaux", country: "France" },
    { slot: 2, varieties: ["Chenin Blanc"], region: "Coteaux du Layon, Loire", country: "France" },
  ];
  const p = sameVarietyProblems(stem, ground);
  ok("W1 Sauternes vs Coteaux du Layon 'same/predominant variety' = flagged", p.length === 1 && /W2/.test(p[0]) && /Chenin Blanc/.test(p[0]));
}
// W2. VALID: a genuine same-variety flight (all predominantly Grenache) is clean — and the hedge's
// intended case, a Châteauneuf blend beside a McLaren Vale varietal Grenache, must NOT be flagged.
{
  const stem = "Wines 1 to 3 are made from the same single, or predominant, grape variety. Identify it. (15 marks)";
  const ground = [
    { slot: 1, varieties: ["Grenache", "Syrah", "Mourvèdre"], region: "Châteauneuf-du-Pape", country: "France" },
    { slot: 2, varieties: ["Grenache"], region: "McLaren Vale", country: "Australia" },
    { slot: 3, varieties: ["Garnacha"], region: "Priorat", country: "Spain" },
  ];
  ok("W2 all predominantly Grenache (synonyms folded) = clean", sameVarietyProblems(stem, ground).length === 0);
}
// W3. NO FALSE POSITIVE: a "different grape variety" stem carries no same-variety promise.
{
  const stem = "Wines 1 and 2 are each made from a different single grape variety. Identify each. (2 x 5 marks)";
  const ground = [
    { slot: 1, varieties: ["Semillon"], region: "Sauternes", country: "France" },
    { slot: 2, varieties: ["Chenin Blanc"], region: "Coteaux du Layon", country: "France" },
  ];
  ok("W3 'different variety' stem = clean", sameVarietyProblems(stem, ground).length === 0);
}
// W4. SUBSET-SCOPED: a per-pair "same single grape variety" claim is not flight-wide, so an unlike
// wine outside the pair must not be read as a contradiction.
{
  const stem =
    "Wines 1-4 are from four different countries and two different grape varieties. 1 & 2 are a pair " +
    "and 3 & 4 are a pair. Each pair is from the same single grape variety.";
  const ground = [
    { slot: 1, varieties: ["Chardonnay"], region: "Burgundy", country: "France" },
    { slot: 2, varieties: ["Chardonnay"], region: "Margaret River", country: "Australia" },
    { slot: 3, varieties: ["Riesling"], region: "Mosel", country: "Germany" },
    { slot: 4, varieties: ["Riesling"], region: "Clare Valley", country: "Australia" },
  ];
  ok("W4 subset-scoped same-variety stem = clean", sameVarietyProblems(stem, ground).length === 0);
}
// W5. NO PROMISE: a stem that names no variety premise at all is never checked.
{
  const stem = "Wines 1 and 2 are both sweet white wines from France. Compare them. (25 marks)";
  const ground = [
    { slot: 1, varieties: ["Semillon"], region: "Sauternes", country: "France" },
    { slot: 2, varieties: ["Chenin Blanc"], region: "Coteaux du Layon", country: "France" },
  ];
  ok("W5 no variety premise = clean", sameVarietyProblems(stem, ground).length === 0);
}

console.log(`\nstem-scoring tests: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
