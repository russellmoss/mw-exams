// scope-header-ask.test.ts — R-SCOPE (EK-0172): a collective scope header + pooled tariff over a
// per-wine identification of an attribute the stem declares NON-SHARED is a hard mismatch.
//
// Mike Juergens rejected a four-wine flight of four DIFFERENT grape varieties whose part (a) read
// "With reference to all four wines: a) Identify the grape variety for each wine. (16 marks)". A
// collective header promises ONE shared conclusion; four distinct varieties are four separate answers
// and belong under "For each wine:" with an "N x M" tariff. EK-0172 recorded this as prompt guidance
// only and it recurred, so it is now an enforced gate wired into validateQuestion BY DEFAULT.
import { describe, it, expect } from "vitest";
import {
  validateQuestion,
  validateScopeHeaderAsk,
  parseScopedSubParts,
  type AuditWine,
  type QuestionForAudit,
} from "../src/lib/question-validator";

// Four dry whites, four distinct varieties, France ×3 / Austria ×1 — the reviewed flight's wines.
const FOUR_DISTINCT: AuditWine[] = [
  { slot: 1, varieties: ["Sauvignon Blanc"], region: "Sancerre", country: "France", colour: "white" },
  { slot: 2, varieties: ["Chenin Blanc"], region: "Saumur", country: "France", colour: "white" },
  { slot: 3, varieties: ["Riesling"], region: "Wachau", country: "Austria", colour: "white" },
  { slot: 4, varieties: ["Pinot Gris"], region: "Alsace", country: "France", colour: "white" },
];

// The rejected shape: collective header, single pooled 16-mark tariff, per-wine variety ask.
const DEFECT_TEXT =
  "Wines 3 to 6 are from two different countries and are each made from a different, single grape variety.\n\n" +
  "With reference to all four wines:\n" +
  "a) Identify the grape variety for each wine. (16 marks)\n\n" +
  "For each wine:\n" +
  "b) Identify the origin as closely as possible. (4 x 8 marks)\n" +
  "c) Comment on the style, quality, and commercial position. (4 x 13 marks)";

// The corrected shape: distributive header, per-wine "N x M" tariff on the variety ask.
const FIXED_TEXT =
  "Wines 3 to 6 are from two different countries and are each made from a different, single grape variety.\n\n" +
  "For each wine:\n" +
  "a) Identify the grape variety. (4 x 5 marks)\n" +
  "b) Identify the origin as closely as possible. (4 x 8 marks)\n" +
  "c) Comment on the style, quality, and commercial position. (4 x 12 marks)";

const q = (questionText: string, wines: AuditWine[]): QuestionForAudit => ({
  questionId: "test",
  paper: 1,
  family: "F4",
  questionText,
  wines,
});

describe("R-SCOPE fires on the reviewed defect", () => {
  it("flags the collective-header / pooled-tariff / per-wine-variety-ask mismatch", () => {
    const v = validateScopeHeaderAsk(q(DEFECT_TEXT, FOUR_DISTINCT));
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("scope_header_ask_mismatch");
    expect(v[0].severity).toBe("hard");
  });

  it("is on by default through validateQuestion (no opt-out needed)", () => {
    const res = validateQuestion(q(DEFECT_TEXT, FOUR_DISTINCT));
    expect(res.ok).toBe(false);
    expect(res.violations.some((x) => x.rule === "scope_header_ask_mismatch" && x.severity === "hard")).toBe(true);
  });
});

describe("R-SCOPE does not fire where the shape is legitimate", () => {
  it("accepts the corrected per-wine distributive form", () => {
    expect(validateScopeHeaderAsk(q(FIXED_TEXT, FOUR_DISTINCT))).toHaveLength(0);
  });

  it("accepts a genuine same-variety collective flight (one shared answer)", () => {
    const sameVariety =
      "Wines 1 to 4 are from four different countries and are made from the same single grape variety.\n\n" +
      "With reference to all four wines:\n" +
      "a) Identify the grape variety. (16 marks)\n\n" +
      "For each wine:\n" +
      "b) Identify the origin as closely as possible. (4 x 9 marks)";
    const wines: AuditWine[] = [
      { slot: 1, varieties: ["Chardonnay"], region: "Chablis", country: "France", colour: "white" },
      { slot: 2, varieties: ["Chardonnay"], region: "Margaret River", country: "Australia", colour: "white" },
      { slot: 3, varieties: ["Chardonnay"], region: "Sonoma", country: "USA", colour: "white" },
      { slot: 4, varieties: ["Chardonnay"], region: "Casablanca", country: "Chile", colour: "white" },
    ];
    expect(validateScopeHeaderAsk(q(sameVariety, wines))).toHaveLength(0);
  });

  it("permits the integrated 2023 P1 Q3 exception (fewer named answers than wines)", () => {
    // Contrived to isolate the count-gate: distinctness clause present, collective + pooled + per-wine
    // qualifier present, but the ask names THREE varieties across four wines — an integrated answer.
    const integrated =
      "Wines 3 to 6 are from two different countries and are each made from a different, single grape variety.\n\n" +
      "With reference to all four wines:\n" +
      "a) Identify the three grape varieties for each wine. (16 marks)";
    expect(validateScopeHeaderAsk(q(integrated, FOUR_DISTINCT))).toHaveLength(0);
  });
});

describe("parseScopedSubParts classifies headers and tariffs", () => {
  it("reads the defect's parts", () => {
    const parts = parseScopedSubParts(DEFECT_TEXT);
    const a = parts.find((p) => p.label === "a")!;
    expect(a.scope).toBe("collective");
    expect(a.tariff).toBe("pooled");
    const b = parts.find((p) => p.label === "b")!;
    expect(b.scope).toBe("distributive");
    expect(b.tariff).toBe("per-wine");
    expect(b.count).toBe(4);
  });
});
