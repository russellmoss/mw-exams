// mark-budget.test.ts — the hard MW mark-allocation rule (validateMarkBudget).
//
// Two non-negotiable facts about a real IMW tasting paper, stated verbatim by candidates and accepted
// by the analysis loop:
//   • fb_138: "there should be exactly 25 points per wine. This is a hard fast rule."
//   • fb_96:  "every wine … will have exactly 25 marks available … This question has 70 marks for 2
//              wines, which would not occur." → the sub-part marks must sum to EXACTLY 25 × wineCount.
//   • fb_73:  "Commercial positioning is always at least five points"; "The only questions ever for 2
//              points are … residual sugar in g[/l] … and … alcohol percentage." → commercial / quality
//              / style / method-of-production parts carry a 5-mark-per-wine floor; only a literal numeric
//              readout may sit at 2 marks.
//   • fb_79:  the grading granularity described only makes sense above that 5-mark floor.
//
// The validator sums every sub-part's marks (expanding "n × m"), rejects any total ≠ 25 × wineCount with
// MARKS_TOTAL_MISMATCH, and rejects an under-floor written task with MARKS_BELOW_FLOOR.
import { describe, it, expect } from "vitest";
import { validateMarkBudget, type QuestionForAudit, type AuditWine } from "../src/lib/question-validator";

const wines = (n: number): AuditWine[] =>
  Array.from({ length: n }, (_, i) => ({
    slot: i + 1,
    varieties: ["Chardonnay"],
    region: "Chablis",
    country: "France",
  }));

const q = (questionText: string, wineCount: number): QuestionForAudit => ({
  questionId: "test",
  paper: 1,
  family: "F1",
  questionText,
  wines: wines(wineCount),
});

describe("validateMarkBudget — total must equal 25 × wineCount", () => {
  it("passes a four-wine flight summing to exactly 100", () => {
    const text = `Wines 1 to 4 are from four different countries.
For each wine:
a) Identify the grape variety and country of origin as closely as possible. (4 x 8 marks)
b) Comment on the style and key winemaking decisions. (4 x 9 marks)
c) Assess quality and commercial position. (4 x 8 marks)`;
    // 4×8 + 4×9 + 4×8 = 32 + 36 + 32 = 100 = 25 × 4.
    expect(validateMarkBudget(q(text, 4))).toEqual([]);
  });

  it("fails the fb_96 stem (2 wines, 70 marks) with MARKS_TOTAL_MISMATCH", () => {
    // fb_96: "This question has 70 marks for 2 wines, which would not occur."
    const text = `Wines 1 and 2 are from the same country but made in contrasting styles.
For each wine:
a) Identify the grape variety and origin as closely as possible. (2 x 7 marks)
b) Comment on the style, method of production and quality of each wine. (2 x 28 marks)`;
    // 2×7 + 2×28 = 14 + 56 = 70 ≠ 50.
    const v = validateMarkBudget(q(text, 2));
    const hit = v.find((x) => x.rule === "MARKS_TOTAL_MISMATCH");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("hard");
    expect(hit!.detail).toMatch(/70/);
    expect(hit!.detail).toMatch(/25 × 2 wines = 50/);
  });
});

describe("validateMarkBudget — per-task 5-mark floor", () => {
  it("fails a 2-mark 'comment on commercial positioning' part with MARKS_BELOW_FLOOR", () => {
    // fb_73: "the number of marks is often 2. This would never happen … Commercial positioning is
    // always at least five points."
    const text = `Wines 1 and 2 are dry white wines from the same country.
For each wine:
a) Identify the grape variety and region of origin as closely as possible. (2 x 15 marks)
b) Comment on the style and quality of each wine. (2 x 8 marks)
c) Comment on the commercial positioning of the wine. (2 x 2 marks)`;
    const v = validateMarkBudget(q(text, 2));
    const hit = v.find((x) => x.rule === "MARKS_BELOW_FLOOR");
    expect(hit).toBeDefined();
    expect(hit!.severity).toBe("hard");
    expect(hit!.detail).toMatch(/2 marks/);
    // The rest of the budget is sound (30 + 16 + 4 = 50 = 25 × 2), so only the floor fires.
    expect(v.some((x) => x.rule === "MARKS_TOTAL_MISMATCH")).toBe(false);
  });

  it("passes a 2-mark 'state the residual sugar in g/L' part (literal numeric readout)", () => {
    // fb_73: RS in g/l and ABV % are the only asks the exam ever prices at 2 marks.
    const text = `Wines 1 and 2 are sweet wines from the same country.
For each wine:
a) Identify the grape variety and region of origin as closely as possible. (2 x 15 marks)
b) Comment on the style and quality of each wine. (2 x 8 marks)
c) State the residual sugar in g/L. (2 x 2 marks)`;
    // 30 + 16 + 4 = 50 = 25 × 2, and the 2-mark part is a literal readout → exempt from the floor.
    expect(validateMarkBudget(q(text, 2))).toEqual([]);
  });

  it("also exempts a 2-mark 'state the alcohol in % abv' part", () => {
    const text = `Wines 1 and 2 are dry white wines from the same country.
For each wine:
a) Identify the grape variety and region of origin as closely as possible. (2 x 15 marks)
b) Comment on the style and quality of each wine. (2 x 8 marks)
c) State the alcohol in % abv. (2 x 2 marks)`;
    expect(validateMarkBudget(q(text, 2))).toEqual([]);
  });
});
