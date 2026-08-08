// audit-historical-import.mjs — did the historical import actually produce sound questions?
//
//   node --import ./scripts/ts-loader.mjs scripts/audit-historical-import.mjs [--verbose]
//
// READ-ONLY. The import runs everything through the normal engine, so the normal validators have
// already had their say — this checks the things that are specific to importing rather than
// generating, and that nothing else looks at:
//
//   1. STEM FIDELITY. The banked question_text must be byte-identical to the corpus stem (after
//      slot renumbering). This is the whole premise of the exercise; if it drifts, candidates are
//      practising a paraphrase of the exam and nobody would notice.
//   2. MARKS. total_marks must be 25 x wineCount and must agree with the stem's own tokens.
//   3. FLIGHT SIZE. The wine count must be the one the real paper set.
//   4. WINE FRESHNESS. The point of the substitution is CURRENT wines. Flags a flight whose wines
//      all predate a cutoff vintage, and flags any wine carried over from the original paper.
//   5. GRADABILITY. A question with no model answer or no answer key cannot be studied.
//   6. QUARANTINE. Which imports the audit rejected, and why.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { selectImportableStems, historicalQuestionId } from "@/lib/historical-stems";

const VERBOSE = process.argv.includes("--verbose");
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const sql = neon(process.env.DATABASE_URL);

const corpus = JSON.parse(readFileSync(new URL("../../data/structured/corpus_questions.json", import.meta.url), "utf8"));
const { stems } = selectImportableStems(corpus);
const byId = new Map(stems.map((s) => [historicalQuestionId(s), s]));

// The wines the Institute actually poured, so we can prove we did not simply re-serve them.
const exams = JSON.parse(readFileSync(new URL("../../data/exams.json", import.meta.url), "utf8"));
const originalWines = new Set();
for (const year of exams) {
  for (const p of year.papers || []) {
    for (const w of p.wines || []) originalWines.add(normalizeLabel(w.full_text));
  }
}
function normalizeLabel(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// A vintage older than this in EVERY slot means the flight is not the "currently available" list the
// substitution exists to produce. Deliberately generous — a mature-wine question legitimately pours
// old bottles, so this reports rather than fails.
const STALE_BEFORE = Number(process.argv.find((a) => a.startsWith("--stale-before="))?.split("=")[1] || 2010);

const rows = await sql`
  SELECT g.question_id, g.paper, g.family, g.total_marks, g.status, g.invalid_reasons, g.wines,
         g.question_text, g.model_answer, g.metadata->'historical' AS hist,
         (SELECT COUNT(*)::int FROM stem_answer_keys k WHERE k.question_id = g.question_id) AS keys
  FROM generated_questions g
  WHERE g.question_id LIKE 'hist_%'
  ORDER BY g.question_id`;

console.log(`[audit] ${rows.length} imported question(s) of ${stems.length} importable\n`);
if (!rows.length) process.exit(0);

const problems = [];
const note = (id, kind, detail) => problems.push({ id, kind, detail });
let reusedWineCount = 0;
let staleFlights = 0;

for (const r of rows) {
  const stem = byId.get(r.question_id);
  const wines = Array.isArray(r.wines) ? r.wines : JSON.parse(r.wines || "[]");

  if (!stem) { note(r.question_id, "unknown-stem", "no corpus question with this id"); continue; }

  if (r.question_text !== stem.stemText) note(r.question_id, "stem-drift", "banked stem differs from the corpus text");
  if (r.total_marks !== stem.flightSize * 25) note(r.question_id, "marks", `total_marks ${r.total_marks}, expected ${stem.flightSize * 25}`);
  if (wines.length !== stem.flightSize) note(r.question_id, "flight-size", `${wines.length} wines, the real paper set ${stem.flightSize}`);
  if (r.family !== stem.family) note(r.question_id, "family", `${r.family}, corpus taxonomy says ${stem.family}`);
  if (!r.model_answer) note(r.question_id, "no-model-answer", "unstudyable until the answer lands");
  if (!r.keys) note(r.question_id, "no-answer-key", "ungradable");
  if (r.invalid_reasons) {
    for (const v of r.invalid_reasons) note(r.question_id, `quarantined:${v.rule}`, v.detail);
  }

  // Freshness — the reason the wines are substituted at all.
  const reused = wines.filter((w) => originalWines.has(normalizeLabel(w.fullText)));
  if (reused.length) {
    reusedWineCount += reused.length;
    note(r.question_id, "wine-reused-from-corpus", reused.map((w) => w.fullText).join(" | "));
  }
  const vintages = wines
    .map((w) => (w.fullText.match(/\b(19|20)\d{2}\b/) || [])[0])
    .filter(Boolean)
    .map(Number);
  if (vintages.length === wines.length && vintages.every((v) => v < STALE_BEFORE)) {
    staleFlights++;
    if (VERBOSE) note(r.question_id, "all-vintages-old", `every vintage pre-${STALE_BEFORE}: ${vintages.join(", ")}`);
  }
}

const clean = rows.filter((r) => !problems.some((p) => p.id === r.question_id));
console.log(`clean:        ${clean.length}/${rows.length}`);
console.log(`quarantined:  ${rows.filter((r) => r.invalid_reasons).length}`);
console.log(`awaiting answer: ${rows.filter((r) => !r.model_answer).length}   awaiting key: ${rows.filter((r) => !r.keys).length}`);
console.log(`wines re-used from the original papers: ${reusedWineCount}`);
console.log(`flights where every vintage predates ${STALE_BEFORE}: ${staleFlights}`);

if (problems.length) {
  console.log(`\n${problems.length} finding(s):`);
  const byKind = new Map();
  for (const p of problems) byKind.set(p.kind, [...(byKind.get(p.kind) || []), p]);
  for (const [kind, list] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n  ${kind}  (${list.length})`);
    for (const p of list.slice(0, VERBOSE ? 999 : 8)) console.log(`     ${p.id}  ${p.detail}`);
    if (!VERBOSE && list.length > 8) console.log(`     … and ${list.length - 8} more (--verbose)`);
  }
}

// Coverage, so a partial import is legible at a glance.
const have = new Set(rows.map((r) => r.question_id));
const perPaper = [1, 2, 3].map((p) => {
  const all = stems.filter((s) => s.paper === p);
  return `P${p} ${all.filter((s) => have.has(historicalQuestionId(s))).length}/${all.length}`;
});
console.log(`\ncoverage: ${perPaper.join("   ")}`);
