// shared-variety-scaffold.test.ts — R11: a same-variety flight asks the variety ONCE, flight-wide.
//
// Ledger: attempt #344 (gen_p2_F5_1786023511251). The generated stem said "made from the same
// single grape variety" then marked "a) Identify the grape variety and region of origin as closely
// as possible. (2 × 10 marks)" — paying per wine for one shared answer, a format no real stem
// 2011–2025 uses. Real stems scaffold: "With reference to both wines: a) Identify the grape
// variety. (10 marks) / For each wine: b) …".
import { describe, it, expect } from "vitest";
import { applyQuestionRules } from "../src/lib/question-rules.mjs";

const PAIR_WINES = [
  { slot: 1, varieties: ["syrah"], region: "Crozes-Hermitage", country: "France" },
  { slot: 2, varieties: ["syrah"], region: "Barossa Valley", country: "Australia" },
];

const r11 = (questionText: string, wines = PAIR_WINES) =>
  applyQuestionRules({ paper: 2, questionText, wines }).filter(
    (v) => v.rule === "shared-variety-marked-per-wine"
  );

describe("R11 shared-variety-marked-per-wine", () => {
  it("flags the incident stem: shared variety marked (2 × 10) per wine", () => {
    const violations = r11(
      "Wines 1 and 2 are made from the same single grape variety and are from different countries.\n\n" +
        "a) Identify the grape variety and region of origin as closely as possible. (2 × 10 marks)\n" +
        "b) Compare and contrast the methods of production with reference to the style of each wine. (2 × 8 marks)\n" +
        "c) Comment on quality and commercial position. (2 × 7 marks)"
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe("hard");
  });

  it("passes the corpus-correct scaffolded shape (flat flight-wide variety mark)", () => {
    expect(
      r11(
        "Wines 1 and 2 are both made from the same single grape variety, from different countries.\n\n" +
          "With reference to both wines:\n" +
          "a) Identify the grape variety. (10 marks)\n" +
          "For each wine:\n" +
          "b) Identify the origin as closely as possible. (2 x 8 marks)\n" +
          "c) Comment on quality and commercial position. (2 x 12 marks)"
      )
    ).toEqual([]);
  });

  it("passes the real combined flight-wide form (flat mark covering variety + origin)", () => {
    // 2018 P1: "For both wines: a) Identify the country of origin and grape variety. (25 marks)"
    expect(
      r11(
        "Wines 1 and 2 are from the same country and are made from the same single grape variety.\n" +
          "For both wines:\n" +
          "a) Identify the country of origin and grape variety. (25 marks)\n" +
          "b) Compare and contrast quality and style, with reference to winemaking. (25 marks)"
      )
    ).toEqual([]);
  });

  it("does not fire when the stem never claims a shared variety", () => {
    expect(
      r11(
        "Wines 1 and 2 are from different countries.\n\n" +
          "a) Identify the grape variety and region of origin as closely as possible. (2 × 10 marks)\n" +
          "b) Comment on quality and commercial position. (2 × 15 marks)",
        [
          { slot: 1, varieties: ["syrah"], region: "Rhône", country: "France" },
          { slot: 2, varieties: ["malbec"], region: "Mendoza", country: "Argentina" },
        ]
      )
    ).toEqual([]);
  });

  it("exempts pair-split flights where the multiplier counts pairs, not wines", () => {
    // Real format (2019 P2): 6 wines, 3 pairs, variety identified per PAIR.
    const sixWines = [
      { slot: 1, varieties: ["pinot noir"], country: "France" },
      { slot: 2, varieties: ["pinot noir"], country: "USA" },
      { slot: 3, varieties: ["syrah"], country: "France" },
      { slot: 4, varieties: ["syrah"], country: "Australia" },
      { slot: 5, varieties: ["nebbiolo"], country: "Italy" },
      { slot: 6, varieties: ["nebbiolo"], country: "Australia" },
    ];
    expect(
      r11(
        "Wines 1-2, 3-4 and 5-6 are pairs. Each pair is made from the same single grape variety.\n\n" +
          "For each pair:\n" +
          "a) Identify the grape variety with reference to both wines. (3 x 10 marks)\n" +
          "b) Compare and contrast the quality, maturity, and capacity to age. (3 x 20 marks)\n" +
          "For each wine:\n" +
          "c) Identify the origin as closely as possible. (6 x 10 marks)",
        sixWines
      )
    ).toEqual([]);
  });

  it("does not fire when a per-wine origin part merely MENTIONS the variety (gen_p1_F1_1786016636975)", () => {
    // Real banked question in the corpus-correct format: flat flight-wide variety part, then a
    // per-wine origin part whose text references how "the variety is expressed". Must not flag.
    expect(
      r11(
        "Wines 1 and 2 are made from the same single grape variety.\n\n" +
          "For both wines:\n" +
          "a) Identify the grape variety. (10 marks)\n\n" +
          "For each wine:\n" +
          "b) Identify the region of origin as closely as possible and comment on how the character of the variety is expressed differently in each wine. (2 x 15 marks)\n" +
          "c) Comment on the style, quality and commercial position of each wine. (2 x 5 marks)"
      )
    ).toEqual([]);
  });

  it("still fires on \"Identify the common grape variety\" marked per wine", () => {
    const violations = r11(
      "Wines 1-3 are all made predominantly from the same grape variety.\n\n" +
        "For each wine:\n\n" +
        "a) Identify the common grape variety and the region of origin as closely as possible. (3 x 8 marks)\n" +
        "b) Comment on the style and the key winemaking decisions behind each wine. (3 x 9 marks)\n" +
        "c) Assess the quality and the commercial position. (3 x 8 marks)",
      [
        { slot: 1, varieties: ["grenache"], country: "France" },
        { slot: 2, varieties: ["grenache"], country: "Spain" },
        { slot: 3, varieties: ["grenache"], country: "Australia" },
      ]
    );
    expect(violations).toHaveLength(1);
  });

  it("does not fire on per-wine ORIGIN parts in a same-variety flight", () => {
    expect(
      r11(
        "Wines 1 and 2 are made from the same single grape variety.\n\n" +
          "With reference to both wines:\n" +
          "a) Identify the grape variety. (10 marks)\n" +
          "Then for each wine:\n" +
          "b) Identify the origin as closely as possible. (2 x 10 marks)\n" +
          "c) Discuss quality, with particular reference to winemaking. (2 x 10 marks)"
      )
    ).toEqual([]);
  });
});
