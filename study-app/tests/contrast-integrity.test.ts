// contrast-integrity.test.ts — a compare/contrast/explain ask must sit over wines that actually
// differ on the dimension it names.
//
// Admin bin cluster (Paper 3, 5 reasoned bins): questions that ask the candidate to explain / compare
// the sweetness mechanism or the method of production over wines that all share the SAME value — no
// contrast to earn the marks with. The reviewer's notes:
//   • gen_p3_F7_1785964980721 — "the method in which sweetness has been achieved is the same in each
//     pair, typically we should see contrast within a pair" (a paired flight).
//   • gen_p3_F6_1785964441098 — "3 of these wines were made sweet by late harvesting … fewer wines".
//   • gen_p3_F6_1785881213511 — "16 marks … for the methods of production … method to make these two
//     wines is identical so there's no compare and contrast".
// The validator resolves the dimension on the flight's own wine records and rejects when contrast is
// absent (flight-wide, or per declared pair).
import { describe, it, expect } from "vitest";
import { contrastIntegrityViolations, validateQuestion, type QuestionForAudit } from "../src/lib/question-validator";

const q = (questionText: string, wines: QuestionForAudit["wines"]): QuestionForAudit => ({
  questionId: "x",
  paper: 3,
  family: "F7",
  questionText,
  wines,
});

describe("sweetness mechanism — flight-wide", () => {
  it("rejects a five-wine residual-sugar flight where three are late harvest (part b asks the mechanism)", () => {
    // gen_p3_F6_1785964441098 shape: five different countries, all with residual sugar.
    const question = q(
      "Wines 1 to 5 each have residual sugar and come from five different countries.\n\n" +
        "For each wine:\n" +
        "a) Identify the region of origin and the grape variety as closely as possible. (5 x 6 marks)\n" +
        "b) Explain the mechanism by which the sweetness has been achieved. (5 x 8 marks)",
      [
        { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany", style: "Late Harvest Riesling", style_category: "Late-harvest sweet" },
        { slot: 2, varieties: ["Chenin Blanc"], region: "Vouvray", country: "France", style: "Late Harvest Chenin", style_category: "Late-harvest sweet" },
        { slot: 3, varieties: ["Riesling"], region: "Clare Valley", country: "Australia", style: "Late Harvest Riesling", style_category: "Late-harvest sweet" },
        { slot: 4, varieties: ["Sémillon"], region: "Sauternes", country: "France", style: "Sauternes", style_category: "Botrytis sweet" },
        { slot: 5, varieties: ["Muscat"], region: "Rutherglen", country: "Australia", style: "Rutherglen Muscat", style_category: "Fortified Muscat" },
      ]
    );
    const v = contrastIntegrityViolations(question);
    const hit = v.find((x) => x.rule === "contrast-integrity")!;
    expect(hit).toBeDefined();
    expect(hit.severity).toBe("hard");
    expect(hit.detail).toMatch(/3 of 5/);
    expect(hit.detail).toMatch(/late harvest/);
    expect(hit.detail).toMatch(/part b/);
    expect(validateQuestion(question).ok).toBe(false);
  });

  it("rejects a two-wine flight where BOTH wines share the mechanism (all wines)", () => {
    // gen_p3_F7_1785881099613: two countries, both residual sugar, same method → no contrast.
    const question = q(
      "Wines 1 and 2 are from two different countries. Both have residual sugar.\n\n" +
        "For both wines:\n" +
        "b) Explain how the sweetness has been achieved in each wine. (2 x 10 marks)",
      [
        { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany", style: "Auslese", style_category: "Late-harvest sweet" },
        { slot: 2, varieties: ["Chenin Blanc"], region: "Coteaux du Layon", country: "France", style: "Late Harvest Chenin", style_category: "Late-harvest sweet" },
      ]
    );
    const hit = contrastIntegrityViolations(question).find((x) => x.rule === "contrast-integrity")!;
    expect(hit.detail).toMatch(/all 2 wines use late harvest/);
    expect(hit.detail).toMatch(/no contrast available for part b/);
  });

  it("passes a two-wine flight of botrytis vs fortified (genuine contrast)", () => {
    const question = q(
      "Wines 1 and 2 are from two different countries. Both have residual sugar.\n\n" +
        "For each wine:\n" +
        "a) Identify the region of origin as closely as possible. (2 x 8 marks)\n" +
        "b) State the approximate residual sugar in g/L. (2 x 2 marks)\n" +
        "c) State the alcohol level (% abv). (2 x 2 marks)\n" +
        "d) Explain the mechanism by which the sweetness has been achieved. (2 x 8 marks)\n" +
        "e) Comment on quality and commercial position. (2 x 5 marks)",
      [
        { slot: 1, varieties: ["Sémillon"], region: "Sauternes", country: "France", style: "Sauternes", style_category: "Botrytis sweet" },
        { slot: 2, varieties: ["Muscat"], region: "Rutherglen", country: "Australia", style: "Rutherglen Muscat", style_category: "Fortified Muscat" },
      ]
    );
    expect(contrastIntegrityViolations(question)).toEqual([]);
    expect(validateQuestion(question).ok).toBe(true);
  });
});

describe("sweetness mechanism — declared pair structure", () => {
  it("rejects a paired flight where each pair shares a mechanism", () => {
    // gen_p3_F7_1785964980721: three pairs, contrast expected WITHIN each pair.
    const question = q(
      "Wines 1 to 6 form three pairs: 1 and 2, 3 and 4, 5 and 6. The wines within each pair are from " +
        "the same country and made from the same grape variety.\n\n" +
        "For each wine:\n" +
        "a) Identify the region of origin. (6 x 4 marks)\n" +
        "b) Explain the method by which the sweetness has been achieved. (6 x 6 marks)",
      [
        { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany", style: "Auslese", style_category: "Late-harvest sweet" },
        { slot: 2, varieties: ["Riesling"], region: "Mosel", country: "Germany", style: "Spätlese", style_category: "Late-harvest sweet" },
        { slot: 3, varieties: ["Sémillon"], region: "Sauternes", country: "France", style: "Sauternes", style_category: "Botrytis sweet" },
        { slot: 4, varieties: ["Sémillon"], region: "Barsac", country: "France", style: "Barsac", style_category: "Botrytis sweet" },
        { slot: 5, varieties: ["Muscat"], region: "Rutherglen", country: "Australia", style: "Rutherglen Muscat", style_category: "Fortified Muscat" },
        { slot: 6, varieties: ["Muscat"], region: "Rutherglen", country: "Australia", style: "Liqueur Muscat", style_category: "Fortified Muscat" },
      ]
    );
    const hits = contrastIntegrityViolations(question).filter((x) => x.rule === "contrast-integrity");
    expect(hits).toHaveLength(3);
    expect(hits.every((h) => h.severity === "hard")).toBe(true);
    expect(hits.map((h) => h.detail).join(" ")).toMatch(/wines 1 and 2/);
    expect(hits.map((h) => h.detail).join(" ")).toMatch(/within the pair/);
    expect(validateQuestion(question).ok).toBe(false);
  });

  it("passes a paired flight where each pair genuinely contrasts", () => {
    const question = q(
      "Wines 1 to 4 form two pairs: 1 and 2, 3 and 4.\n\n" +
        "b) Explain how the sweetness has been achieved in each wine. (4 x 6 marks)",
      [
        { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany", style: "Auslese", style_category: "Late-harvest sweet" },
        { slot: 2, varieties: ["Sémillon"], region: "Sauternes", country: "France", style: "Sauternes", style_category: "Botrytis sweet" },
        { slot: 3, varieties: ["Muscat"], region: "Rutherglen", country: "Australia", style: "Rutherglen Muscat", style_category: "Fortified Muscat" },
        { slot: 4, varieties: ["Furmint"], region: "Tokaj", country: "Hungary", style: "Aszú", style_category: "Botrytis sweet" },
      ]
    );
    expect(contrastIntegrityViolations(question)).toEqual([]);
  });
});

describe("method of production dimension", () => {
  it("rejects a two-wine compare-methods ask over one shared method", () => {
    // gen_p3_F6_1785881213511: two Ports, 16 marks for a method of production with no contrast.
    const question = q(
      "Wines 1 and 2 are from the same region and share the same principal grape varieties.\n\n" +
        "b) Compare and contrast the methods of production used to make each wine. (16 marks)",
      [
        { slot: 1, varieties: ["Touriga Nacional"], region: "Douro", country: "Portugal", style: "Vintage Port", style_category: "Port" },
        { slot: 2, varieties: ["Touriga Nacional"], region: "Douro", country: "Portugal", style: "LBV Port", style_category: "Port" },
      ]
    );
    const hit = contrastIntegrityViolations(question).find((x) => x.rule === "contrast-integrity")!;
    expect(hit).toBeDefined();
    expect(hit.detail).toMatch(/all 2 wines use reductive-port/);
  });

  it("passes a compare-methods ask over Fino vs Oloroso (biological vs oxidative ageing)", () => {
    const question = q(
      "Wines 1 and 2 are from the same region.\n\n" +
        "b) Compare and contrast the methods of production. (16 marks)",
      [
        { slot: 1, varieties: ["Palomino"], region: "Jerez", country: "Spain", style: "Fino", style_category: "Sherry" },
        { slot: 2, varieties: ["Palomino"], region: "Jerez", country: "Spain", style: "Oloroso", style_category: "Sherry" },
      ]
    );
    expect(contrastIntegrityViolations(question)).toEqual([]);
  });
});

describe("guards", () => {
  it("does not fire when no sub-question asks to compare/explain a dimension", () => {
    const question = q(
      "Wines 1 to 5 each have residual sugar and come from five different countries.\n\n" +
        "a) Identify the region of origin and the grape variety as closely as possible. (5 x 12 marks)",
      [
        { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany", style: "Auslese", style_category: "Late-harvest sweet" },
        { slot: 2, varieties: ["Riesling"], region: "Clare Valley", country: "Australia", style: "Late Harvest Riesling", style_category: "Late-harvest sweet" },
      ]
    );
    expect(contrastIntegrityViolations(question)).toEqual([]);
  });

  it("skips wines whose mechanism cannot be positively resolved", () => {
    const question = q(
      "Wines 1 and 2 have residual sugar.\n\nb) Explain how the sweetness has been achieved. (2 x 10 marks)",
      [
        { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany" },
        { slot: 2, varieties: ["Chenin Blanc"], region: "Vouvray", country: "France" },
      ]
    );
    expect(contrastIntegrityViolations(question)).toEqual([]);
  });
});
