import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { checkStemShape } from "@/lib/question-rules.mjs";
import { validateQuestion } from "@/lib/question-validator";
import { selectImportableStems } from "@/lib/historical-stems";

/**
 * checkWineReferenceShape exists because the generator's reasoning used to land in a WINE slot. On
 * 2026-08-09 it started landing in the QUESTION TEXT instead, while the model worked out how to make
 * the marks total 25 x wines — and nothing rejected the draft for it. The validator's part extractor
 * read each fragment as a sub-part command and returned part-task-repertoire, 380 violations on one
 * candidate, only AFTER a full Tavily wine enrichment had been paid for.
 *
 * Every SPILLS entry below is a verbatim fragment from a real rejected draft.
 */

const SPILLS = [
  "a) actually rereading the instructions (10 marks)",
  "a) f must be divisible by 3 (9 marks)",
  "a) flat shared part that divides evenly (12 marks)",
  "a) 9 marks shared not per wine so 3 marks per wine equivalent",
  "a) 23 per wine from the per wine parts (23 marks)",
  "b) but that doesn t use the same variety identified once (5 marks)",
];

describe("checkStemShape", () => {
  it.each(SPILLS)("rejects generator reasoning: %s", (text) => {
    const r = checkStemShape(text);
    expect(r.ok).toBe(false);
    expect(r.problem).toMatch(/generator reasoning/);
  });

  it("passes a normal multi-wine stem", () => {
    const stem =
      "Wines 3-6 are made from the same single grape variety, from four different countries.\n\n" +
      "With reference to all four wines:\na) Identify the grape variety. (16 marks)\n\n" +
      "For each wine:\nb) Identify the origin as closely as possible. (4 x 10 marks)\n" +
      "c) Comment on the style, quality and commercial position of the wine. (4 x 11 marks)";
    expect(checkStemShape(stem).ok).toBe(true);
  });

  it("does not treat mark NOTATION as deliberation", () => {
    // "(3 x 8 marks)" is the correct notation. Only prose ABOUT the arithmetic is a marker — a rule
    // that fired on numbers would reject every question in the corpus.
    expect(checkStemShape("a) Identify the variety. (3 x 8 marks) b) Comment on quality. (3 x 17 marks)").ok).toBe(true);
  });
});

describe("wired into validateQuestion (the nightly audit's entry point)", () => {
  // Before this wiring, a reasoning-filled stem in the BANK was caught only indirectly — the part
  // extractor read each fragment as a sub-part and emitted hundreds of part-task-repertoire
  // violations. This is the purpose-built verdict: one hard `stem-shape` violation, quarantining via
  // the same invalid_reasons machinery as every other hard rule.
  const base = {
    questionId: "q1",
    paper: 1 as const,
    family: "F1",
    questionText:
      "Wines 1 and 2 are from the same country. actually rereading the instructions, f must be " +
      "divisible by 3.\na) Identify the grape variety. (2 x 10 marks)",
    totalMarks: 50,
    wines: [
      { slot: 1, varieties: ["chardonnay"], region: "Burgundy", country: "France" },
      { slot: 2, varieties: ["chardonnay"], region: "Margaret River", country: "Australia" },
    ],
  };

  it("emits a hard stem-shape violation on a deliberation stem", () => {
    const res = validateQuestion(base);
    const hit = res.violations.find((v) => v.rule === "stem-shape");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("hard");
    expect(hit!.detail).toMatch(/generator reasoning/);
    expect(res.ok).toBe(false);
  });

  it("stands down when the stem is a verbatim past paper (stemIsAuthoritative)", () => {
    // Same gating as the other stem-shape rules: a historical stem may not be edited, so a rule whose
    // only fix is a stem edit must not fire on it. (No real stem trips the markers — the corpus sweep
    // below proves that — but the gate keeps this rule in the family's contract.)
    const res = validateQuestion({ ...base, stemIsAuthoritative: true });
    expect(res.violations.find((v) => v.rule === "stem-shape")).toBeUndefined();
  });

  it("does not fire on a clean generated stem", () => {
    const res = validateQuestion({
      ...base,
      questionText:
        "Wines 1 and 2 are from the same single grape variety.\n" +
        "a) Identify the grape variety. (10 marks)\n" +
        "For each wine:\nb) Identify the origin as closely as possible. (2 x 10 marks)\n" +
        "c) Comment on the quality of the wine. (2 x 10 marks)",
    });
    expect(res.violations.find((v) => v.rule === "stem-shape")).toBeUndefined();
  });
});

describe("the guard does not reject the real exam", () => {
  it("passes every importable stem in the 2011-2026 corpus", () => {
    // The decisive test. These are stems the IMW actually set; a guard that rejects any of them is
    // describing our model of the exam rather than the exam, and would silently block remediation
    // from ever reproducing that shape.
    const corpus = JSON.parse(
      readFileSync(new URL("../../data/structured/corpus_questions.json", import.meta.url), "utf8")
    );
    const { stems } = selectImportableStems(corpus);
    expect(stems.length).toBeGreaterThan(100);
    const rejected = stems
      .filter((s: { stemText: string }) => !checkStemShape(s.stemText).ok)
      .map((s: { qid: string; stemText: string }) => `${s.qid}: ${checkStemShape(s.stemText).problem}`);
    expect(rejected, `the guard rejects real past-paper stems:\n${rejected.join("\n")}`).toEqual([]);
  });
});
