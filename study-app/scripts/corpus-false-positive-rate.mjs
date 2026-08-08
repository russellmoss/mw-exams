// corpus-false-positive-rate.mjs — which of our hard rules reject the REAL exam?
//
//   node --import ./scripts/ts-loader.mjs scripts/corpus-false-positive-rate.mjs [--rule=name]
//
// Runs the stem-shape hard rules over all 160 importable questions from the real IMW corpus, paired
// with the real wines the Institute poured. Every hard hit is a FALSE POSITIVE by construction: the
// input is a genuine past-paper question, so a rule that rejects it is describing our model of the
// exam rather than the exam.
//
// This exists because the first historical-import run banked 4 of 20. The failures were not bad wine
// choices -- they were stem-shape rules firing on stems the model was forbidden to change, so it
// redrafted three times, failed identically each time, and fell back. Guessing which rules to exempt
// would repeat the mistake; this measures it. (Same method that retired `missing-variety-id-part` on
// 2026-08-07 for "firing on a third of the real modern corpus".)
//
// No database and no network -- it reads the corpus off disk.

import { readFileSync } from "node:fs";
import { selectImportableStems } from "@/lib/historical-stems";
import {
  validateQuestion,
  idMarkAllocationViolations,
  partTaskRepertoireViolations,
  validateMarkBudget,
  stemPreannouncesDiscriminator,
  contrastIntegrityViolations,
  crossCheckStemFacts,
  validateSingleWineFlight,
  flightWineCountViolations,
} from "@/lib/question-validator";
import { winesFromText, stemDisclosureViolations, sweetnessOutOfPaperViolations } from "@/lib/question-rules.mjs";

const ONLY = process.argv.find((a) => a.startsWith("--rule="))?.split("=")[1];

const root = new URL("../../data/", import.meta.url);
const corpus = JSON.parse(readFileSync(new URL("structured/corpus_questions.json", root), "utf8"));
const exams = JSON.parse(readFileSync(new URL("exams.json", root), "utf8"));

// The real wines, by year/paper/slot, so each stem is judged against the flight it was actually set on.
const wineAt = new Map();
for (const y of exams) {
  for (const p of y.papers || []) {
    for (const w of p.wines || []) wineAt.set(`${y.year}_${p.paper}_${w.slot}`, w.full_text);
  }
}

const { stems } = selectImportableStems(corpus);

// Build AuditWine records from the real labels. Variety/country/blend are text-detected exactly as
// the engine's own text adapter does; region falls back to the label so region-sensitive rules have
// something real to read. This under-resolves compared with the answer key, which makes the run
// CONSERVATIVE -- an unresolved wine reads as a curveball, which loosens the id-mark caps rather than
// tightening them. A rule that still fires here fires on generous inputs.
function auditWines(stem) {
  const labels = stem.originalSlots.map((slot) => wineAt.get(`${stem.year}_${stem.paper}_${slot}`) || "");
  return winesFromText(labels.map((fullText, i) => ({ slot: i + 1, fullText }))).map((w) => ({
    ...w,
    region: w.fullText,
    style: "",
  }));
}

const RULES = [
  ["id-mark-allocation", (q) => idMarkAllocationViolations(q)],
  ["part-task-repertoire", (q) => partTaskRepertoireViolations(q)],
  ["mark-budget", (q) => validateMarkBudget(q)],
  ["stem-preannounces-discriminator", (q) => stemPreannouncesDiscriminator(q.questionText)],
  ["stem-discloses-discriminator", (q) => stemDisclosureViolations(q.questionText)],
  ["sweetness-out-of-paper", (q) => sweetnessOutOfPaperViolations(q.paper, q.questionText)],
  ["contrast-integrity", (q) => contrastIntegrityViolations(q)],
  ["cross-check-stem-facts", (q) => crossCheckStemFacts(q)],
  ["single-wine-flight", (q) => validateSingleWineFlight(q)],
  ["flight-wine-count", (q) => flightWineCountViolations(q)],
];

const results = new Map(RULES.map(([name]) => [name, { hard: [], soft: [] }]));

for (const stem of stems) {
  const wines = auditWines(stem);
  const q = {
    questionId: `hist_${stem.qid}`,
    paper: stem.paper,
    family: stem.family,
    questionText: stem.stemText,
    totalMarks: stem.totalMarks,
    wines,
  };
  for (const [name, fn] of RULES) {
    if (ONLY && name !== ONLY) continue;
    let out = [];
    try {
      out = fn(q) || [];
    } catch (err) {
      out = [{ rule: name, severity: "hard", detail: `THREW: ${err?.message || err}` }];
    }
    for (const v of out) {
      if (v.rule !== name && !v.rule?.startsWith(name)) continue; // some fns emit several rule ids
      results.get(name)[v.severity === "hard" ? "hard" : "soft"].push({ qid: stem.qid, detail: v.detail });
    }
  }
}

const n = stems.length;
console.log(`[fp] ${n} real IMW questions (2011-2026), judged with the real wines\n`);
console.log("rule                                hard    (rate)   soft");
console.log("-".repeat(66));
for (const [name] of RULES) {
  if (ONLY && name !== ONLY) continue;
  const r = results.get(name);
  const uniq = new Set(r.hard.map((h) => h.qid)).size;
  const flag = uniq === 0 ? "" : uniq / n > 0.1 ? "   <-- rejects the real exam" : "   <-- some";
  console.log(
    `${name.padEnd(34)} ${String(uniq).padStart(4)}  ${((uniq / n) * 100).toFixed(0).padStart(5)}%  ${String(new Set(r.soft.map((s) => s.qid)).size).padStart(5)}${flag}`
  );
}

// ── The decisive check: the FULL audit path, with and without the exemption ─────────────────────
// The table above measures the rules in isolation. This measures what actually gates an import:
// validateQuestion, the one entry point the post-save audit and the review pane both go through.
// With `stemIsAuthoritative` set, a real past-paper question must survive it. Anything still hard
// here would quarantine the import — so this number is the one that has to be zero.
//
// Note the wines are TEXT-DERIVED here, not answer-key-resolved, so a handful of wine-side rules
// cannot see enough to fire. That makes this a floor, not a guarantee — the live import is the real
// test. What it does prove is that no STEM-shape rule rejects the corpus any more.
const gated = [];
const ungated = [];
for (const stem of stems) {
  const q = {
    questionId: `hist_${stem.qid}`,
    paper: stem.paper,
    family: stem.family,
    questionText: stem.stemText,
    totalMarks: stem.totalMarks,
    wines: auditWines(stem),
  };
  const hardOf = (res) => res.violations.filter((v) => v.severity === "hard");
  try {
    const off = hardOf(validateQuestion({ ...q, paperScope: undefined }));
    if (off.length) ungated.push({ qid: stem.qid, rules: [...new Set(off.map((v) => v.rule))] });
  } catch { /* colour rules need richer wines than text gives; ignore for the comparison */ }
  try {
    const on = hardOf(validateQuestion({ ...q, stemIsAuthoritative: true }));
    if (on.length) gated.push({ qid: stem.qid, rules: [...new Set(on.map((v) => v.rule))], detail: on[0].detail });
  } catch (err) {
    gated.push({ qid: stem.qid, rules: ["THREW"], detail: err?.message || String(err) });
  }
}
// Rules whose only possible fix is an edit to the stem. These are the ones that MUST be silent on a
// verbatim past-paper question — a wine-side rule firing here is my harness under-resolving the
// wines (see the note above), not a defect in the rule.
const STEM_SHAPE_RULES = new Set([
  "id-mark-allocation",
  "part-task-repertoire",
  "flight-wine-count",
  "stem-preannounces-discriminator",
  "stem-discloses-discriminator",
  "single-wine-flight",
  "sweetness-out-of-paper",
  "sweetness-reference-out-of-paper",
  "MARKS_BELOW_FLOOR",
  "MARKS_TOTAL_MISMATCH",
  "marks",
]);
const stemShapeOf = (list) => list.flatMap((g) => g.rules.filter((r) => STEM_SHAPE_RULES.has(r)));

console.log(`\n${"=".repeat(66)}`);
console.log(`validateQuestion over the real corpus:`);
console.log(`   stemIsAuthoritative OFF : ${ungated.length}/${n} rejected  (${((ungated.length / n) * 100).toFixed(0)}%)`);
console.log(`   stemIsAuthoritative ON  : ${gated.length}/${n} rejected  (${((gated.length / n) * 100).toFixed(0)}%)`);
console.log(
  `\n   STEM-SHAPE rejections (the ones a fixed stem cannot answer):` +
    `\n      OFF: ${new Set(ungated.filter((g) => g.rules.some((r) => STEM_SHAPE_RULES.has(r))).map((g) => g.qid)).size}` +
    `   ON: ${new Set(gated.filter((g) => g.rules.some((r) => STEM_SHAPE_RULES.has(r))).map((g) => g.qid)).size}   <-- must be 0`
);
if (stemShapeOf(gated).length) {
  console.log(`   STILL FIRING: ${[...new Set(stemShapeOf(gated))].join(", ")}`);
}
if (gated.length) {
  const byRule = new Map();
  for (const g of gated) for (const r of g.rules) byRule.set(r, (byRule.get(r) || 0) + 1);
  const wineSide = [...byRule].filter(([r]) => !STEM_SHAPE_RULES.has(r));
  console.log(
    `\n   remaining are wine-side, and unmeasurable here because this harness passes text-derived\n` +
      `   wines rather than answer-key-resolved ones (region is the raw label, so "same region" can\n` +
      `   never hold, and every wine reads as a curveball to the banker check):\n      ` +
      wineSide.map(([r, c]) => `${r} (${c})`).join(", ")
  );
}

for (const [name] of RULES) {
  if (ONLY && name !== ONLY) continue;
  const hard = results.get(name).hard;
  if (!hard.length) continue;
  console.log(`\n=== ${name} — ${new Set(hard.map((h) => h.qid)).size} real questions rejected`);
  for (const h of hard.slice(0, ONLY ? 60 : 5)) console.log(`   ${h.qid}  ${h.detail.slice(0, 150)}`);
  if (!ONLY && hard.length > 5) console.log(`   … ${hard.length - 5} more (--rule=${name})`);
}
