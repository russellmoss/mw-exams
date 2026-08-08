// historical-stem-exemptions.test.ts — the stem-shape rules must be silent on a real past paper.
//
// The bank's validators encode our model of the MW exam. Measured against the exam itself, that model
// is narrower than the thing it models: run over all 160 importable corpus questions,
// `validateQuestion` rejects 119 of them on STEM-SHAPE grounds alone — id-mark-allocation on 102
// (the IMW routinely pays 15 marks for "Identify the region" against our 10-mark cap),
// part-task-repertoire on 30 (it does not know "identify the vintage" or "to whom is this wine most
// likely to appeal, and why" are real asks), and a tail of parser limits on paired stems.
//
// On a GENERATED stem those rules earn their keep — the model really does invent off-repertoire
// tasks and over-weight identification. On an IMPORTED stem they are unsatisfiable: the only fix
// each one offers is "edit the stem", and the stem is the one thing the import may not change. The
// first import run banked 4 of 20 because of this; the model redrafted three times, failed
// identically each time, and fell back to a banked question.
//
// So `stemIsAuthoritative` scopes them rather than removing them. This test is the contract:
// zero stem-shape rejections on the real corpus with the flag on, and the rules still armed without
// it. If a new stem-shape rule is added and not scoped, the first assertion fails.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { validateQuestion, type AuditWine } from "../src/lib/question-validator";
import { selectImportableStems, type CorpusQuestion } from "../src/lib/historical-stems";
import { winesFromText } from "../src/lib/question-rules.mjs";

const DATA = join(__dirname, "../../data");
const corpus = (): CorpusQuestion[] =>
  JSON.parse(readFileSync(join(DATA, "structured/corpus_questions.json"), "utf8"));

// The real wines the Institute poured, by year/paper/slot.
function wineIndex(): Map<string, string> {
  const exams = JSON.parse(readFileSync(join(DATA, "exams.json"), "utf8")) as {
    year: number;
    papers: { paper: number; wines: { slot: number; full_text: string }[] }[];
  }[];
  const m = new Map<string, string>();
  for (const y of exams) {
    for (const p of y.papers || []) {
      for (const w of p.wines || []) m.set(`${y.year}_${p.paper}_${w.slot}`, w.full_text);
    }
  }
  return m;
}

// Rules whose only possible fix is an edit to the stem. Wine-side rules are deliberately NOT listed:
// they still fire here, because these text-derived wine records under-resolve compared with the
// answer key (region is the raw label, so "same region" can never hold). That is a limit of the
// fixture, not of the rules — and it is why this test asserts only on the stem-shape set.
const STEM_SHAPE_RULES = new Set([
  "id-mark-allocation",
  "part-task-repertoire",
  "flight-wine-count",
  "stem-preannounces-discriminator",
  "stem-discloses-discriminator",
  "single-wine-flight",
  "sweetness-out-of-paper",
  "MARKS_BELOW_FLOOR",
  "MARKS_TOTAL_MISMATCH",
  "marks",
]);

function judge(stemIsAuthoritative: boolean) {
  const wines = wineIndex();
  const hits: { qid: string; rule: string }[] = [];
  for (const stem of selectImportableStems(corpus()).stems) {
    const labels = stem.originalSlots.map((slot) => wines.get(`${stem.year}_${stem.paper}_${slot}`) || "");
    const auditWines: AuditWine[] = winesFromText(
      labels.map((fullText: string, i: number) => ({ slot: i + 1, fullText }))
    ).map((w: { slot: number; fullText: string; varieties: string[]; country: string; is_blend: boolean }) => ({
      ...w,
      region: w.fullText,
      style: "",
    }));
    const res = validateQuestion({
      questionId: `hist_${stem.qid}`,
      paper: stem.paper,
      family: stem.family,
      questionText: stem.stemText,
      totalMarks: stem.totalMarks,
      wines: auditWines,
      ...(stemIsAuthoritative ? { stemIsAuthoritative: true } : {}),
    });
    for (const v of res.violations) {
      if (v.severity === "hard" && STEM_SHAPE_RULES.has(v.rule)) hits.push({ qid: stem.qid, rule: v.rule });
    }
  }
  return hits;
}

describe("stem-shape rules on a verbatim past-paper stem", () => {
  it("reject NOTHING in the real corpus when the stem is authoritative", () => {
    const hits = judge(true);
    // Named individually so a regression says which rule came back, not just that a count moved.
    expect([...new Set(hits.map((h) => h.rule))]).toEqual([]);
    expect(hits).toEqual([]);
  });

  it("stay armed when the stem is generated — this scopes the rules, it does not retire them", () => {
    const hits = judge(false);
    const rules = new Set(hits.map((h) => h.rule));
    expect(rules.has("part-task-repertoire")).toBe(true);
    // `id-mark-allocation` is deliberately NOT asserted here any more. It was recalibrated against
    // this very corpus on 2026-08-08 (see tests/id-mark-allocation.test.ts): its thresholds are now
    // the real exam's own observed maxima, so by construction it fires on none of these 160 questions
    // in either mode. That is the rule being fixed rather than scoped — the outcome this file's
    // sibling rules are still waiting for.
    expect(rules.has("id-mark-allocation")).toBe(false);
    // The measured baseline: real questions still rejected on stem shape alone, down from 119 once the
    // mark-allocation caps stopped describing an exam the IMW does not set. Pinned so the remaining
    // gap between our model of the exam and the exam stays visible.
    expect(new Set(hits.map((h) => h.qid)).size).toBe(39);
  });
});
