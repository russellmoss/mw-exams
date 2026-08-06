// sync-theory-data.mjs — prebuild step. Projects the repo-root theory corpus into a compact
// grading index at study-app/public/data/theory-grading-index.json, so the live grading route
// reads exactly the same rubrics the offline pipeline produced.
//
// Why a projection rather than a straight copy: theory_rubrics.json carries the full extraction
// record (every quote, provenance, extraction notes) at ~320KB. The grader needs the marking
// content and the examiners' quotes — which are the most persuasive thing we can show a
// candidate — but not the audit trail. This trims to what the prompt actually uses.
//
// Idempotent, and fails soft: if the corpus is absent the build continues with no theory
// grading rather than breaking the whole deploy.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "..", "data", "theory");
const dstDir = join(here, "..", "public", "data");
const dst = join(dstDir, "theory-grading-index.json");

const rubricsPath = join(srcDir, "theory_rubrics.json");
const questionsPath = join(srcDir, "theory_questions.json");

if (!existsSync(rubricsPath) || !existsSync(questionsPath)) {
  console.warn("sync-theory-data: theory corpus missing, skipping (theory grading will be unavailable)");
  process.exit(0);
}

const rubrics = JSON.parse(readFileSync(rubricsPath, "utf-8"));
const questions = JSON.parse(readFileSync(questionsPath, "utf-8"));
const byId = new Map(questions.map((q) => [q.id, q]));

// Model answers are optional context. The index records only whether one exists; the route
// does not send it to the grader, because grading against a model answer is exactly the
// failure mode this system was built to avoid (a theory question admits many valid answers).
let answerIds = new Set();
const answersPath = join(srcDir, "theory_answers_index.json");
if (existsSync(answersPath)) {
  answerIds = new Set(JSON.parse(readFileSync(answersPath, "utf-8")).map((a) => a.id));
}

const PAPER_TITLES = {
  1: "Viticulture",
  2: "Vinification and pre-bottling procedures",
  3: "Handling of wine",
  4: "The business of wine",
  5: "Contemporary issues",
};

const index = rubrics
  .map((r) => {
    const q = byId.get(r.id);
    if (!q) return null;
    return {
      id: r.id,
      year: r.year,
      paper: r.paper,
      question: r.question,
      section: r.section,
      domain: r.domain,
      paperTitle: PAPER_TITLES[r.paper] ?? null,
      questionText: q.text,
      // --- marking content ---
      commandWord: r.command_word ?? null,
      commandWordDemand: r.command_word_demand ?? null,
      definitionsRequired: (r.definitions_required ?? []).map((d) => ({
        term: d.term,
        quote: d.quote,
      })),
      coreRequirements: (r.required_elements ?? [])
        .filter((e) => e.weight === "core")
        .map((e) => ({ element: e.element, quote: e.quote })),
      differentiators: (r.required_elements ?? [])
        .filter((e) => e.weight === "differentiator")
        .map((e) => ({ element: e.element, quote: e.quote })),
      creditSignals: (r.credit_signals ?? []).map((s) => ({ signal: s.signal, quote: s.quote })),
      penaltySignals: (r.penalty_signals ?? []).map((s) => ({ signal: s.signal, quote: s.quote })),
      scopeTraps: (r.scope_traps ?? []).map((t) => ({ trap: t.trap, quote: t.quote })),
      examplesExpected: r.examples_expected ?? null,
      performanceNote: r.performance_note ?? null,
      // --- provenance, surfaced to the grader and the candidate ---
      evidenceQuality: r.evidence_quality ?? null,
      sourceReport: r.source_report ?? null,
      textSource: r.text_source ?? "pdf_text_layer",
      hasModelAnswer: answerIds.has(r.id),
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.year - b.year || a.paper - b.paper || a.question - b.question);

mkdirSync(dstDir, { recursive: true });
writeFileSync(dst, JSON.stringify(index), "utf-8");

const years = [...new Set(index.map((r) => r.year))].sort();
const kb = Math.round(JSON.stringify(index).length / 1024);
console.log(
  `sync-theory-data: ${index.length} rubric-backed questions (${years.join(", ")}) -> public/data/theory-grading-index.json (${kb}KB)`
);
