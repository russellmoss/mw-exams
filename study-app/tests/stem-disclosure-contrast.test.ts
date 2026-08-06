// stem-disclosure-contrast.test.ts — rules R9 (contrast-without-contrast) and R10
// (stem-discloses-discriminator), built from Mike Juergens' bin-reason corpus
// (outputs/feedback_analyses/mike_bin_reasons_2026-08-05.md, Classes 1 and 3).
//
// Every positive fixture is a stem Mike actually binned; every protected negative is either a REAL
// historical stem from data/exams.json (a pattern that fires on a genuine IMW stem is wrong by
// definition) or a genuinely-contrasting flight. The load-bearing distinction for R10: real stems
// say "made using different METHODS OF PRODUCTION" (2021 P3 Q2, 2023 P3 Q2) — a defined style-level
// constraint — while the binned stems say "contrasting approaches in the winery", which hands the
// candidate the deduction. For R9: Fino vs Oloroso share a category but contrast in method
// (biological vs oxidative) and must pass; Trentodoc vs Blanc de Blancs differ in label but share
// the traditional method and must fire.
import { describe, it, expect } from "vitest";
import { applyQuestionRules, stemDisclosureViolations, methodClass } from "../src/lib/question-rules.mjs";

// ── R10: stem discloses the discriminator ────────────────────────────────────────────────────────

describe("R10 stem-discloses-discriminator — Mike's binned stems fire", () => {
  it.each([
    // gen_p1_F5_1785957210763
    ["Wines 1 and 2 are dry white wines from different countries, made by contrasting approaches in the winery."],
    // gen_p1_F5_1785951884693
    ["Wines 1 to 4 have each been made using a different approach to fermentation and maturation."],
    // gen_p1_F5_1785951608542
    ["Wines 1 and 2 have been made using very different approaches."],
    // gen_p1_F5_1785951398212
    ["Wines 1 to 3 come from three different countries and have been made using contrasting production techniques."],
    // gen_p1_F5_1785885210682
    ["Wines 1 to 4 have each been handled very differently in the cellar, with contrasting decisions taken over fermentation, maturation vessel, lees contact and exposure to oxygen."],
    // gen_p1_F5_1785884746129
    ["Wines 1 and 2 are dry white wines from two different countries. Both show developed, toasty aromatic character, but each has arrived at that character by a very different route in the winery."],
    // gen_p2_F7_1785950399976
    ["Wines 1 and 2 are from the same region of origin but belong to different official quality categories."],
    // gen_p3_F7_1785941730286
    ["Wines 1 and 2 are from different countries. b) Compare the method of production, with reference to the relative roles of oxidation and biological ageing."],
  ])("%s", (stem) => {
    const v = stemDisclosureViolations(stem);
    expect(v).toHaveLength(1);
    expect(v[0].rule).toBe("stem-discloses-discriminator");
    expect(v[0].severity).toBe("soft");
  });

  it.each([
    // Class 5 additions — gen_p3_F7_1785964017240, gen_p3_F4_1785964281304, gen_p3_F2_1785964017222
    ["b) Comment on the key production decisions evident in the wine, including how the bubbles were created. (4 x 8 marks)"],
    ["c) Comment on the style and quality, citing any relevant official quality designation. (3 x 5 marks)"],
    ["c) Comment on the role of autolysis and dosage in each wine. (2 x 4 marks)"],
  ])("Class 5 un-MW ask fires: %s", (stem) => {
    const v = stemDisclosureViolations(stem);
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("soft");
  });

  it.each([
    // Mike's own suggested realistic single-topic ask.
    ["b) Discuss the role of yeast in the production of each wine."],
    // 2023 P1 Q2 (real stem): "quality level" in a contribute-construction, not a citing-ask.
    ["b) Comment on the structural components of the wine, commenting on how these components contribute to its quality level. (4 x 10 marks)"],
    // Real production ask — the mechanism belongs in the answer, and the stem stays silent on bubbles.
    ["a) Comment on the method of production of each wine. (2 x 10 marks)"],
  ])("Class 5 negatives stay clean: %s", (stem) => {
    expect(stemDisclosureViolations(stem)).toEqual([]);
  });

  it("emits at most one disclosure verdict even when several patterns match", () => {
    const stem =
      "Wines 1 and 2 have been handled very differently in the cellar, made using contrasting approaches, each by a very different route.";
    expect(stemDisclosureViolations(stem)).toHaveLength(1);
  });
});

describe("R10 — real historical stems never fire", () => {
  it.each([
    // 2021 P3 Q2 / 2023 P3 Q2 — "different methods of production" is exam-authentic phrasing.
    ["Wines 4-8 are all made using different methods of production. For each wine: a) Comment on the method of production."],
    ["Wines 5-7 are all made using different methods of production. For each wine: a) Identify the origin as closely as possible."],
    // 2018 P3 Q1 — producer diversity, not disclosure.
    ["Wines 1-6 are presented as pairs. Each pair is made by a different single producer."],
    // 2014 P3 Q4 — country diversity.
    ["Wines 11-12 are produced in different countries. For each wine identify the country and region."],
    // Mike's own suggested realistic phrasing ("at best we would see 'discuss the role of yeast'").
    ["Wines 1 and 2 are from the same country. b) Discuss the role of yeast in the production of each wine."],
    // Ordinary stems.
    ["Wines 1 to 3 are from three different countries and are each made from a different, single grape variety."],
    ["Wines 1 and 2 are made from the same single grape variety and are from different countries."],
  ])("%s", (stem) => {
    expect(stemDisclosureViolations(stem)).toEqual([]);
  });
});

// ── R9: contrast-without-contrast ────────────────────────────────────────────────────────────────

describe("methodClass", () => {
  it.each([
    ["Fino", "Sherry", "biological-ageing"],
    ["Oloroso", "Sherry", "oxidative-ageing"],
    ["Vin Jaune", "Oxidative (Jura)", "biological-ageing"],
    ["Trentodoc", "Traditional-method sparkling", "traditional-sparkling"],
    ["Blanc de Blancs", "Traditional-method sparkling", "traditional-sparkling"],
    ["Prosecco", "Tank-method sparkling", "tank-sparkling"],
    ["Vintage Port", "Port", "reductive-port"],
    ["Tawny Port", "Port", "oxidative-port"],
    ["Sauternes / Barsac", "Botrytis sweet", "botrytis"],
    // Positively unresolvable — generic labels and non-P3 wines skip the R9 comparison entirely.
    ["Sherry", "Sherry", null],
    ["Port", "Port", null],
    ["Sparkling", "Sparkling", null],
    [undefined, undefined, null],
  ])("%s/%s -> %s", (style, cat, expected) => {
    expect(methodClass(style, cat)).toBe(expected);
  });
});

const p3 = (questionText: string, wines: { style?: string; style_category?: string }[]) =>
  applyQuestionRules({
    paper: 3,
    questionText,
    wines: wines.map((w, i) => ({
      slot: i + 1,
      varieties: ["chardonnay"],
      region: `R${i}`,
      country: `C${i}`,
      ...w,
    })),
  }).filter((v) => v.rule === "contrast-without-contrast");

describe("R9 contrast-without-contrast", () => {
  it("fires on Mike's promise case — 'different methods' over two traditional-method sparklings", () => {
    // gen_p3_F5_1785894043309: [Sparkling(generic), Trentodoc, Blanc de Blancs]
    const v = p3("Wines 1 to 3 are from three different countries and are made using different methods of production.", [
      { style: "Sparkling", style_category: "Sparkling" },
      { style: "Trentodoc", style_category: "Traditional-method sparkling" },
      { style: "Blanc de Blancs", style_category: "Traditional-method sparkling" },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("hard");
  });

  it("passes the promise when methods genuinely differ (the real 2021/2023 shape)", () => {
    const v = p3("Wines 1 to 3 are all made using different methods of production.", [
      { style: "Champagne", style_category: "Traditional-method sparkling" },
      { style: "Prosecco", style_category: "Tank-method sparkling" },
      { style: "Tawny Port", style_category: "Port" },
    ]);
    expect(v).toEqual([]);
  });

  it("fires on a compare-methods ask over one shared method", () => {
    const v = p3("For both wines: a) Compare and contrast the methods of production. (16 marks)", [
      { style: "Champagne", style_category: "Traditional-method sparkling" },
      { style: "Cava", style_category: "Traditional-method sparkling" },
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].detail).toContain("no contrast");
  });

  it("passes a compare-methods ask over Fino vs Oloroso — same category, contrasting methods", () => {
    const v = p3("For both wines: a) Compare and contrast the methods of production.", [
      { style: "Fino", style_category: "Sherry" },
      { style: "Oloroso", style_category: "Sherry" },
    ]);
    expect(v).toEqual([]);
  });

  it("skips when methods cannot be positively resolved (generic labels)", () => {
    // gen_p3_F6_1785881213511's shape: bare "Port" is unresolvable — no guessing, no fire.
    const v = p3("Compare and contrast the methods of production used to make these two wines.", [
      { style: "Port", style_category: "Port" },
      { style: "Vintage Port", style_category: "Port" },
    ]);
    expect(v).toEqual([]);
  });

  it("skips non-P3 wines with no style data at all", () => {
    const v = p3("Compare and contrast the methods of production.", [{}, {}]);
    expect(v).toEqual([]);
  });
});
