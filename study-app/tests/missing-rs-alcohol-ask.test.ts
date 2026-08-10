// missing-rs-alcohol-ask.test.ts — a sweet/fortified flight must ask for the residual-sugar readout
// (and, when a wine is fortified, the alcohol readout). Code MISSING_RS_ALCOHOL_ASK.
//
// Cross-paper reviewer cluster (7 validated Paper 3 signals — fb_581/582/585/592/594/596/602): the
// real D3 papers award 2–3 marks for "state the approximate residual sugar in g/L" (and often the
// alcohol %abv) whenever a flight holds sweet/fortified wines, and the generated questions never ask
// it. sweetFortifiedAskViolations classifies each keyed wine and requires the ask as a sub-part.
import { describe, it, expect } from "vitest";
import {
  sweetFortifiedAskViolations,
  validateQuestion,
  type QuestionForAudit,
} from "../src/lib/question-validator";

const q = (
  questionText: string,
  wines: QuestionForAudit["wines"],
): QuestionForAudit => ({
  questionId: "x",
  paper: 3,
  family: "F1",
  questionText,
  wines,
});

// A 3-wine sweet (botrytis) flight, keyed from the label + style.
const sweetWines: QuestionForAudit["wines"] = [
  { slot: 1, varieties: ["Sémillon"], region: "Sauternes", country: "France", fullText: "Château Suduiraut, Sauternes, France", style_category: "Botrytis sweet" },
  { slot: 2, varieties: ["Furmint"], region: "Tokaj", country: "Hungary", fullText: "Royal Tokaji, 6 Puttonyos Aszú, Tokaj, Hungary", style_category: "Botrytis sweet" },
  { slot: 3, varieties: ["Chenin Blanc"], region: "Coteaux du Layon", country: "France", fullText: "Domaine des Baumard, Coteaux du Layon, France", rs: 120 },
];

const REJECT_STEM =
  "Wines 1, 2 and 3 are from three different countries. Each has residual sugar.\n\nFor each wine:\na) Identify the country and region of origin as closely as possible. (3 x 8 marks)\nb) Comment on the style of the wine. (3 x 9 marks)\nc) Comment on quality and commercial position. (3 x 8 marks)";

const PASS_STEM =
  "Wines 1, 2 and 3 are from three different countries. Each has residual sugar.\n\nFor each wine:\na) Identify the country and region of origin as closely as possible. (3 x 6 marks)\nb) State the approximate residual sugar in g/L. (3 x 2 marks)\nc) Comment on the style of the wine. (3 x 9 marks)\nd) Comment on quality and commercial position. (3 x 8 marks)";

describe("sweet flight — residual-sugar readout required", () => {
  it("rejects a sweet flight with no RS sub-part (MISSING_RS_ALCOHOL_ASK)", () => {
    const hits = sweetFortifiedAskViolations(q(REJECT_STEM, sweetWines));
    expect(hits.length).toBe(1);
    expect(hits[0].rule).toBe("MISSING_RS_ALCOHOL_ASK");
    expect(hits[0].severity).toBe("hard");
    expect(hits[0].detail).toMatch(/residual sugar/i);
  });

  it("is a hard reject through validateQuestion", () => {
    const res = validateQuestion(q(REJECT_STEM, sweetWines));
    expect(res.violations.some((v) => v.rule === "MISSING_RS_ALCOHOL_ASK" && v.severity === "hard")).toBe(true);
  });

  it("passes once the RS sub-part is present", () => {
    expect(sweetFortifiedAskViolations(q(PASS_STEM, sweetWines))).toEqual([]);
    const res = validateQuestion(q(PASS_STEM, sweetWines));
    expect(res.violations.some((v) => v.rule === "MISSING_RS_ALCOHOL_ASK")).toBe(false);
  });

  it("does not accept the stem premise 'each has residual sugar' as the ask", () => {
    // The RS phrase is in the stem, not a sub-part — that must not satisfy the rule.
    const hits = sweetFortifiedAskViolations(q(REJECT_STEM, sweetWines));
    expect(hits[0].rule).toBe("MISSING_RS_ALCOHOL_ASK");
  });

  it("does not accept 'comment on how the residual sugar was achieved' (a method ask) as the readout", () => {
    const stem =
      "Wines 1, 2 and 3 each have residual sugar.\n\nFor each wine:\na) Identify the origin. (3 x 8 marks)\nb) Comment on the mechanism by which the residual sugar has been achieved. (3 x 9 marks)\nc) Comment on quality. (3 x 8 marks)";
    const hits = sweetFortifiedAskViolations(q(stem, sweetWines));
    expect(hits.some((v) => v.rule === "MISSING_RS_ALCOHOL_ASK")).toBe(true);
  });
});

describe("fortified flight — RS and alcohol readouts both required", () => {
  const fortifiedWines: QuestionForAudit["wines"] = [
    { slot: 1, varieties: ["Touriga Nacional"], region: "Douro", country: "Portugal", fullText: "Taylor's 20 Year Old Tawny Port, Douro, Portugal" },
    { slot: 2, varieties: ["Palomino"], region: "Jerez", country: "Spain", fullText: "Lustau, Oloroso Sherry, Jerez, Spain" },
    { slot: 3, varieties: ["Grenache"], region: "Banyuls", country: "France", fullText: "Domaine du Mas Blanc, Banyuls, France" },
  ];

  it("rejects a fortified flight that asks RS but not alcohol", () => {
    const stem =
      "Wines 1 to 3 are from three different countries.\n\nFor each wine:\na) Identify the origin. (3 x 6 marks)\nb) State the approximate residual sugar in g/L. (3 x 2 marks)\nc) Comment on the method of production. (3 x 8 marks)\nd) Comment on quality. (3 x 9 marks)";
    const hits = sweetFortifiedAskViolations(q(stem, fortifiedWines));
    expect(hits.length).toBe(1);
    expect(hits[0].rule).toBe("MISSING_RS_ALCOHOL_ASK");
    expect(hits[0].detail).toMatch(/alcohol/i);
  });

  it("passes when both the RS and the alcohol readouts are present", () => {
    const stem =
      "Wines 1 to 3 are from three different countries.\n\nFor each wine:\na) Identify the origin. (3 x 4 marks)\nb) State the approximate residual sugar in g/L. (3 x 2 marks)\nc) State the alcohol level (% abv). (3 x 2 marks)\nd) Comment on the method of production. (3 x 8 marks)\ne) Comment on quality. (3 x 9 marks)";
    expect(sweetFortifiedAskViolations(q(stem, fortifiedWines))).toEqual([]);
  });
});

describe("all-dry flight — unaffected", () => {
  const dryWines: QuestionForAudit["wines"] = [
    { slot: 1, varieties: ["Sauvignon Blanc"], region: "Sancerre", country: "France", fullText: "Domaine Vacheron, Sancerre, France" },
    { slot: 2, varieties: ["Chardonnay"], region: "Chablis", country: "France", fullText: "William Fèvre, Chablis, France" },
    { slot: 3, varieties: ["Riesling"], region: "Clare Valley", country: "Australia", fullText: "Grosset Polish Hill Riesling, Clare Valley, Australia" },
  ];

  it("does not require (or gain) the RS sub-part", () => {
    const stem =
      "Wines 1 to 3 are from three different countries.\n\nFor each wine:\na) Identify the origin. (3 x 8 marks)\nb) Comment on the style. (3 x 9 marks)\nc) Comment on quality. (3 x 8 marks)";
    expect(sweetFortifiedAskViolations(q(stem, dryWines))).toEqual([]);
  });
});
