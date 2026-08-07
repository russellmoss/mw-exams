// stem-predicate-mismatch.test.ts — the stem's NON-VARIETY factual predicates must match the flight.
//
// The shipped stem-fact checker (stem-fact-cross-check.test.ts) only validated variety/blend claims,
// so other stem predicates still passed unchecked. Three accepted user-feedback signals drove this:
//   • fb_121 (paper 2) — a "four different countries" stem served two USA wines.
//   • fb_89  (paper 1) — a "both wines have residual sugar" stem keyed a bone-dry Savennières.
//   • fb_120 (paper 1) — a "same country … contrasting styles" stem keyed one shared style.
// crossCheckStemFacts now parses four further axes (country cardinality, region cardinality,
// sweetness, style contrast) and emits STEM_PREDICATE_MISMATCH naming the predicate + offending wine.
import { describe, it, expect } from "vitest";
import { crossCheckStemFacts, validateQuestion, type QuestionForAudit } from "../src/lib/question-validator";

const q = (questionText: string, wines: QuestionForAudit["wines"], paper = 2): QuestionForAudit => ({
  questionId: "x",
  paper,
  family: "F3",
  questionText,
  wines,
});

describe("country cardinality", () => {
  // fb_121 flight: "four different countries" but two of the four wines are from the USA.
  const fb121 = q(
    "Wines 1 to 4 are all made from the same single grape variety, from four different countries. Identify the grape variety.",
    [
      { slot: 1, varieties: ["Cabernet Sauvignon"], region: "Napa Valley", country: "USA" },
      { slot: 2, varieties: ["Cabernet Sauvignon"], region: "Margaux", country: "France" },
      { slot: 3, varieties: ["Cabernet Sauvignon"], region: "Coonawarra", country: "Australia" },
      { slot: 4, varieties: ["Cabernet Sauvignon"], region: "Sonoma", country: "USA" },
    ]
  );

  it("is a hard STEM_PREDICATE_MISMATCH naming the predicate and the duplicate wine", () => {
    const res = validateQuestion(fb121);
    expect(res.ok).toBe(false);
    const hit = res.violations.find((v) => v.rule === "STEM_PREDICATE_MISMATCH")!;
    expect(hit).toBeDefined();
    expect(hit.severity).toBe("hard");
    expect(hit.detail).toMatch(/different countries/i);
    expect(hit.detail).toMatch(/wine 4/);
  });

  it("folds synonyms so USA/United States don't read as two distinct countries", () => {
    const res = crossCheckStemFacts(q("Wines 1 to 3 are from three different countries.", [
      { slot: 1, varieties: ["Zinfandel"], region: "Napa", country: "USA" },
      { slot: 2, varieties: ["Zinfandel"], region: "Sonoma", country: "United States" },
      { slot: 3, varieties: ["Primitivo"], region: "Puglia", country: "Italy" },
    ]));
    expect(res.some((v) => v.rule === "STEM_PREDICATE_MISMATCH" && /different countries/i.test(v.detail))).toBe(true);
  });

  it("does not fire when the four countries really are distinct", () => {
    const res = crossCheckStemFacts(q("Wines 1 to 4 are from four different countries.", [
      { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany" },
      { slot: 2, varieties: ["Riesling"], region: "Alsace", country: "France" },
      { slot: 3, varieties: ["Riesling"], region: "Clare Valley", country: "Australia" },
      { slot: 4, varieties: ["Riesling"], region: "Wachau", country: "Austria" },
    ]));
    expect(res.filter((v) => v.rule === "STEM_PREDICATE_MISMATCH")).toHaveLength(0);
  });

  it("fires on a 'same country' stem over two countries", () => {
    const res = crossCheckStemFacts(q("Wines 1 and 2 are from the same country.", [
      { slot: 1, varieties: ["Nebbiolo"], region: "Barolo", country: "Italy" },
      { slot: 2, varieties: ["Tempranillo"], region: "Rioja", country: "Spain" },
    ]));
    const hit = res.find((v) => v.rule === "STEM_PREDICATE_MISMATCH")!;
    expect(hit).toBeDefined();
    expect(hit.detail).toMatch(/same country/i);
    expect(hit.detail).toMatch(/wine 2/);
  });
});

describe("region cardinality", () => {
  it("fires on a 'same region' stem over two different regions", () => {
    const res = crossCheckStemFacts(q("Wines 1 and 2 are from the same region.", [
      { slot: 1, varieties: ["Chenin Blanc"], region: "Savennières", country: "France" },
      { slot: 2, varieties: ["Chenin Blanc"], region: "Vouvray", country: "France" },
    ]));
    const hit = res.find((v) => v.rule === "STEM_PREDICATE_MISMATCH")!;
    expect(hit).toBeDefined();
    expect(hit.detail).toMatch(/same region/i);
    expect(hit.detail).toMatch(/wine 2/);
  });

  it("passes when both wines really share the region", () => {
    const res = crossCheckStemFacts(q("Wines 1 and 2 are from the same region.", [
      { slot: 1, varieties: ["Chenin Blanc"], region: "Vouvray", country: "France" },
      { slot: 2, varieties: ["Chenin Blanc"], region: "Vouvray", country: "France" },
    ]));
    expect(res.filter((v) => v.rule === "STEM_PREDICATE_MISMATCH")).toHaveLength(0);
  });

  it("fires when 'three different regions' keys only two distinct", () => {
    const res = crossCheckStemFacts(q("Wines 1 to 3 are from three different regions.", [
      { slot: 1, varieties: ["Pinot Noir"], region: "Volnay", country: "France" },
      { slot: 2, varieties: ["Pinot Noir"], region: "Pommard", country: "France" },
      { slot: 3, varieties: ["Pinot Noir"], region: "Volnay", country: "France" },
    ]));
    expect(res.some((v) => v.rule === "STEM_PREDICATE_MISMATCH" && /different regions/i.test(v.detail))).toBe(true);
  });
});

describe("sweetness", () => {
  // fb_89 flight: "both wines have residual sugar", but Savennières is keyed bone dry.
  const fb89 = q(
    "Wines 1 and 2 are from the same region. Both wines have residual sugar.\n\n" +
      "a) Identify the region of origin. (4 marks)\n" +
      "b) For each wine, identify the grape variety and comment on how the sweetness has been achieved. (2 x 8 marks)",
    [
      { slot: 1, varieties: ["Chenin Blanc"], region: "Anjou", country: "France", style: "Savennières (bone dry)", style_category: "still_dry", rs: 2 },
      { slot: 2, varieties: ["Chenin Blanc"], region: "Anjou", country: "France", style: "Coteaux du Layon", style_category: "still_sweet", rs: 120 },
    ],
    1
  );

  it("is a hard STEM_PREDICATE_MISMATCH naming the bone-dry wine", () => {
    const res = validateQuestion(fb89);
    expect(res.ok).toBe(false);
    const hit = res.violations.find((v) => v.rule === "STEM_PREDICATE_MISMATCH")!;
    expect(hit).toBeDefined();
    expect(hit.severity).toBe("hard");
    expect(hit.detail).toMatch(/residual sugar/i);
    expect(hit.detail).toMatch(/wine 1/);
  });

  it("fires via the RS threshold alone (below 5 g/L)", () => {
    const res = crossCheckStemFacts(q("Wines 1 and 2 are sweet wines.", [
      { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany", rs: 3 },
      { slot: 2, varieties: ["Riesling"], region: "Mosel", country: "Germany", rs: 60 },
    ]));
    expect(res.some((v) => v.rule === "STEM_PREDICATE_MISMATCH" && /wine 1/.test(v.detail))).toBe(true);
  });

  it("passes when both wines genuinely carry residual sugar", () => {
    const res = crossCheckStemFacts(q("Wines 1 and 2 both have residual sugar.", [
      { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany", style_category: "still_sweet", rs: 45 },
      { slot: 2, varieties: ["Chenin Blanc"], region: "Vouvray", country: "France", style_category: "still_off_dry", rs: 20 },
    ]));
    expect(res.filter((v) => v.rule === "STEM_PREDICATE_MISMATCH")).toHaveLength(0);
  });
});

describe("style contrast", () => {
  // fb_120 shape: a same-country pair asked for "contrasting styles" but keyed one shared style tag.
  // SOFT only — the taxonomy cannot prove the absence of contrast (see the rule's comment), so this
  // flags for review instead of rejecting.
  const chablisMeursault = q(
    "Wines 1 and 2 are from the same country but made in contrasting styles.",
    [
      { slot: 1, varieties: ["Chardonnay"], region: "Chablis", country: "France", style_category: "still_dry" },
      { slot: 2, varieties: ["Chardonnay"], region: "Meursault", country: "France", style_category: "still_dry" },
    ]
  );

  it("flags when all wines share one style tag", () => {
    const res = crossCheckStemFacts(chablisMeursault);
    const hit = res.find((v) => v.rule === "STEM_PREDICATE_MISMATCH")!;
    expect(hit).toBeDefined();
    expect(hit.detail).toMatch(/contrasting styles/i);
  });

  it("flags SOFT, so an oaked-vs-unoaked pair is not rejected", () => {
    // Chablis vs Meursault share `still_dry` but contrast sharply on oak and texture — a real exam
    // question. A hard reject here would bin legitimate flights, so the whole question must stay ok.
    const res = crossCheckStemFacts(chablisMeursault);
    expect(res.find((v) => v.rule === "STEM_PREDICATE_MISMATCH")!.severity).toBe("soft");
    expect(validateQuestion(chablisMeursault).ok).toBe(true);
  });

  it("passes when the two wines carry contrasting style tags", () => {
    const res = crossCheckStemFacts(q(
      "Wines 1 and 2 are from the same country but made in contrasting styles.",
      [
        { slot: 1, varieties: ["Chenin Blanc"], region: "Savennières", country: "France", style_category: "still_dry" },
        { slot: 2, varieties: ["Chenin Blanc"], region: "Vouvray", country: "France", style_category: "still_sweet" },
      ]
    ));
    expect(res.filter((v) => v.rule === "STEM_PREDICATE_MISMATCH")).toHaveLength(0);
  });
});
