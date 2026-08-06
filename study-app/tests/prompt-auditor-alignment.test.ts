// The generation prompt and the post-save auditor must agree on mark allocation.
//
// Until 2026-08-06 they did not: the prompt's "reliable allocation" template put 10 of 25 marks per
// wine (40%) on identification, while idMarkAllocationViolations() caps ID at 35% the moment a
// flight contains one curveball — so the model followed its instructions and the auditor quarantined
// the result. 422 of 529 quarantined bank questions carried that one rule. These tests pin the
// contract: the allocation the prompt TEACHES must pass the auditor's caps under the auditor's most
// hostile classification (every wine a curveball, which is also what unresolvable wines default to).

import { describe, it, expect } from "vitest";
import { idMarkAllocationViolations, type AuditWine } from "../src/lib/question-validator";

// Wines guaranteed to classify as curveballs: no BANKER_SIGNALS region matches.
function curveballFlight(n: number): AuditWine[] {
  return Array.from({ length: n }, (_, i) => ({
    slot: i + 1,
    varieties: ["Obscurello"],
    region: "Unknown Uplands",
    country: "Atlantis",
    fullText: `Wine ${i + 1}: Obscurello, Unknown Uplands, Atlantis`,
  }));
}

// The prompt's recommended default shape (question-generation-prompt.ts "Reliable allocation"):
// (a) ID = N × 8, (b) winemaking = N × 9, (c) quality/commercial = N × 8 → 25/wine.
function templateQuestion(n: number): string {
  return [
    `Wines 1 to ${n} are made in different styles.`,
    `a) Identify the grape variety and origin of each wine as closely as possible. (${n} x 8 marks)`,
    `b) Comment on the key winemaking decisions behind each wine. (${n} x 9 marks)`,
    `c) Assess the quality, maturity and commercial position of each wine. (${n} x 8 marks)`,
  ].join("\n");
}

describe("prompt template vs auditor ID-mark caps", () => {
  it.each([2, 3, 4, 5, 6])(
    "the prompt's default allocation passes the 35% curveball cap for a %i-wine flight",
    (n) => {
      const violations = idMarkAllocationViolations({
        questionId: "t",
        paper: 2,
        family: "F4",
        questionText: templateQuestion(n),
        totalMarks: n * 25,
        wines: curveballFlight(n),
      });
      expect(violations).toEqual([]);
    }
  );

  it("the pre-fix template (10 ID marks per wine) fails the cap on a curveball flight — the bug this guards against", () => {
    const n = 4;
    const text = [
      `Wines 1 to ${n} are made in different styles.`,
      `a) Identify the grape variety and origin of each wine as closely as possible. (${n} x 10 marks)`,
      `b) Comment on the key winemaking decisions behind each wine. (${n} x 8 marks)`,
      `c) Assess the quality, maturity and commercial position of each wine. (${n} x 7 marks)`,
    ].join("\n");
    const violations = idMarkAllocationViolations({
      questionId: "t",
      paper: 2,
      family: "F4",
      questionText: text,
      totalMarks: n * 25,
      wines: curveballFlight(n),
    });
    expect(violations.some((v) => v.rule === "id-mark-allocation")).toBe(true);
  });

  it("the prompt's worked example (2 x 8 ID) passes the single-part 10-mark cap and the 35% cap", () => {
    const text = [
      "Wines 1 and 2 are from different countries.",
      "a) Identify the grape variety and region of origin as closely as possible. (2 x 8 marks)",
      "b) Comment on the style and the key winemaking decisions behind each wine. (2 x 9 marks)",
      "c) Assess quality, maturity and commercial position. (2 x 8 marks)",
    ].join("\n");
    const violations = idMarkAllocationViolations({
      questionId: "t",
      paper: 1,
      family: "F4",
      questionText: text,
      totalMarks: 50,
      wines: curveballFlight(2),
    });
    expect(violations).toEqual([]);
  });
});
