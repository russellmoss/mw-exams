// mark-budget.test.ts — a flight's available marks must total EXACTLY 25 × the number of wines, and
// every part must be visibly scoped (per-wine 'N × m' or a whole-flight aggregate).
//
// Accepted user feedback, cross-paper (3 validated signals):
//   • fb_96  (paper 1): "every wine … will have exactly 25 marks available … non-negotiable" — a
//     two-wine flight with 70 marks would never occur.
//   • fb_138 (paper 1, stem-sniper): "there should be exactly 25 points per wine. This is a hard fast
//     rule" — a four-wine flight must total 100.
//   • fb_344 (paper 2): a flight-wide task "should be broken out … made clear which question applied
//     and was marked across the flight" — bare aggregate marks without whole-flight wording are
//     ambiguous.
import { describe, it, expect } from "vitest";
import { checkMarkBudget, type AuditWine } from "../src/lib/question-validator";

const TWO_WINES: AuditWine[] = [
  { slot: 1, varieties: ["Chenin Blanc"], region: "Vouvray", country: "France" },
  { slot: 2, varieties: ["Chenin Blanc"], region: "Swartland", country: "South Africa" },
];

const FOUR_WINES: AuditWine[] = [
  { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany" },
  { slot: 2, varieties: ["Tempranillo"], region: "Rioja", country: "Spain" },
  { slot: 3, varieties: ["Syrah"], region: "Barossa", country: "Australia" },
  { slot: 4, varieties: ["Cabernet Sauvignon"], region: "Napa Valley", country: "USA" },
];

const q = (questionText: string, wines: AuditWine[]) => ({
  questionId: "test",
  paper: 1,
  family: "F1",
  questionText,
  wines,
});

describe("checkMarkBudget — total must equal 25 × wineCount", () => {
  it("rejects a two-wine question totalling 70 marks (fb_96)", () => {
    const text =
      "Wines 1 and 2 are from the same country but made in contrasting styles.\n\n" +
      "For each wine:\n" +
      "a) Identify the grape variety and origin as closely as possible. (2 x 7 marks)\n" +
      "b) Comment on the style, method of production and quality of each wine. (2 x 28 marks)";
    const v = checkMarkBudget(q(text, TWO_WINES));
    expect(v.some((x) => x.rule === "mark_total_mismatch" && x.severity === "hard")).toBe(true);
    const hit = v.find((x) => x.rule === "mark_total_mismatch")!;
    expect(hit.detail).toMatch(/70 marks/);
    expect(hit.detail).toMatch(/exactly 50/);
  });

  it("passes a two-wine question totalling 50 marks", () => {
    const text =
      "Wines 1 and 2 are from the same country but made in contrasting styles.\n\n" +
      "For each wine:\n" +
      "a) Identify the grape variety and origin as closely as possible. (2 x 10 marks)\n" +
      "b) Comment on the style, method of production and quality of each wine. (2 x 15 marks)";
    expect(checkMarkBudget(q(text, TWO_WINES))).toEqual([]);
  });

  it("rejects a four-wine question that does not sum to 100 (fb_138)", () => {
    const text =
      "Wines 1 to 4 are from four different countries. Each wine is made from a different, single grape variety.\n\n" +
      "For each wine:\n" +
      "a) Identify the grape variety and the country of origin. (4 x 8 marks)\n" +
      "b) Comment on the style, method of production and quality. (4 x 8 marks)";
    const v = checkMarkBudget(q(text, FOUR_WINES));
    const hit = v.find((x) => x.rule === "mark_total_mismatch")!;
    expect(hit).toBeDefined();
    expect(hit.detail).toMatch(/64 marks/);
    expect(hit.detail).toMatch(/exactly 100/);
  });

  it("passes a four-wine flight-wide part + per-wine parts summing to 100", () => {
    // Part a is a single aggregate marked across the whole flight ("For all four wines"); b and c are
    // per-wine ('4 × m'). 20 + 4×8 + 4×12 = 100 = 25 × 4.
    const text =
      "Wines 1 to 4 are from four different countries. Each wine is made from a different, single grape variety.\n\n" +
      "a) For all four wines, identify each grape variety and country of origin. (20 marks)\n\n" +
      "For each wine:\n" +
      "b) Comment on the style and key winemaking decisions. (4 x 8 marks)\n" +
      "c) Assess the quality and commercial position. (4 x 12 marks)";
    expect(checkMarkBudget(q(text, FOUR_WINES))).toEqual([]);
  });
});

describe("checkMarkBudget — scope must be explicit (fb_344)", () => {
  it("rejects a bare aggregate mark value carrying per-wine wording", () => {
    // 'a)' is worth a bare 25 marks but scoped "For each wine:" — ambiguous (is it 25 total or per wine?).
    const text =
      "Wines 1 and 2 are made from the same single grape variety and are from different countries.\n\n" +
      "For each wine:\n" +
      "a) Identify the grape variety and region of origin as closely as possible. (25 marks)\n" +
      "b) Comment on the style and quality of each wine. (2 x 12 marks)\n" +
      "c) Comment on the commercial position. (1 marks)";
    const v = checkMarkBudget(q(text, TWO_WINES));
    expect(v.some((x) => x.rule === "mark_scope_ambiguous" && x.severity === "hard")).toBe(true);
  });

  it("accepts a bare aggregate value when wording scopes it to the whole flight", () => {
    // fb_344's fix: the shared-variety task is broken out as a single flight-wide aggregate.
    const text =
      "Wines 1 and 2 are made from the same single grape variety and are from different countries.\n\n" +
      "For both wines:\n" +
      "a) Identify the grape variety. (10 marks)\n\n" +
      "For each wine:\n" +
      "b) Identify the region of origin as closely as possible. (2 x 13 marks)\n" +
      "c) Comment on the style and quality of each wine. (2 x 7 marks)";
    expect(checkMarkBudget(q(text, TWO_WINES))).toEqual([]);
  });
});

describe("checkMarkBudget — fail-safe", () => {
  it("says nothing when there are no wines or no mark annotations", () => {
    expect(checkMarkBudget(q("Identify each wine.", TWO_WINES))).toEqual([]);
    expect(checkMarkBudget(q("a) Identify. (2 x 10 marks)", []))).toEqual([]);
  });
});
