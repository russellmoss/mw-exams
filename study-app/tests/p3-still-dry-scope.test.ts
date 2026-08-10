// p3-still-dry-scope.test.ts — Paper 3 admits still dry wines; it just cannot be made ONLY of them.
//
// The rule used to reject any still dry wine on P3 ("sparkling/fortified/sweet/rosé/oxidative only").
// That contradicted the exam. Measured over the 51 real P3 questions in the corpus:
//
//     entirely still dry .... 0
//     contains one or more .. 42  (82%)
//     none .................. 9
//
// 32 of 180 real P3 wines (17.8%) are still dry, and they are not exotica — Nuits St Georges 1er Cru,
// Bandol, Saint-Romain, Riesling Trocken and Alsace Pinot Gris Grand Cru all appear at
// curveball_level=low.
//
// It also created a loop that could not terminate: pickP3StyleCategory draws the most
// under-represented style, still_dry sat at 2.8% banked against a 20% target and so was drawn
// repeatedly, and every such question was then rejected — which kept the deficit at 2.8%. paperScope
// was joint-top blocker on P3 (16 of 40 attempts) while barely registering on P1/P2.
import { describe, it, expect } from "vitest";
import { validatePaperScope } from "../src/lib/question-engine";

const w = (slot: number, fullText: string) => ({ slot, fullText });

// Real P3 still-dry wines, taken verbatim from the corpus.
const NUITS = w(1, "Nuits St Georges, 1er Cru Clos des Argillières, Domaine Rion, 2011. Burgundy, France. (13%)");
const RIESLING_TROCKEN = w(2, "Riesling Trocken Niederhäuser Hermannshöhle, Jakob Schneider, 2023. Nahe, Germany. (12.5%)");
const BANDOL = w(3, "Bandol, Château de Pibarnon, 2013. Provence, France. (14%)");

// Non-still-dry P3 wines that supply the paper's contrast.
const FINO = w(4, "Emilio Lustau, Puerto Fino Sherry NV. Jerez, Spain. (15%)");
const CHAMPAGNE = w(5, "Taittinger Comtes de Champagne, Blanc de Blancs, 1999. Champagne, France. (12.0%)");

describe("Paper 3 admits still dry wines", () => {
  it("accepts a real still dry wine alongside a fortified one", () => {
    // The 82% case: a mixed flight is the NORM on Paper 3, not an exception.
    const r = validatePaperScope(3, [NUITS, FINO]);
    expect(r.violations.join(" ")).not.toMatch(/standard still dry/i);
  });

  it("accepts several still dry wines when one non-still wine anchors the flight", () => {
    const r = validatePaperScope(3, [NUITS, RIESLING_TROCKEN, BANDOL, CHAMPAGNE]);
    expect(r.violations.join(" ")).not.toMatch(/Paper 1 or Paper 2 flight/i);
  });

  it("rejects a flight made ENTIRELY of still dry wines", () => {
    // NOTE the header measurement has one known counterexample — 2018 P3 Q3 (Birichino Cinsault /
    // Mustiguillo Garnacha / red Bandol, i.e. the BANDOL fixture above's own flight) — which is why
    // stemIsAuthoritative below exists. For GENERATED stems the rule stays a hard gate.
    const r = validatePaperScope(3, [NUITS, RIESLING_TROCKEN, BANDOL]);
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/Paper 1 or Paper 2 flight/i);
  });

  it("admits an all-still-dry flight when the stem is a verbatim past paper (2018 P3 Q3)", () => {
    // The real 2018 P3 Q3: three still dry Rhône-variety reds on Paper 3. A historical import must
    // be able to regenerate the flight the Institute actually set.
    const r = validatePaperScope(3, [NUITS, RIESLING_TROCKEN, BANDOL], { stemIsAuthoritative: true });
    expect(r.violations.join(" ")).not.toMatch(/Paper 1 or Paper 2 flight/i);
  });

  it("stemIsAuthoritative does NOT relax per-wine scope on Papers 1 and 2", () => {
    const r = validatePaperScope(1, [FINO], { stemIsAuthoritative: true });
    expect(r.valid).toBe(false);
  });

  it("does not flag the individual wines of an all-still-dry flight", () => {
    // One flight-level violation, not one per wine — the wines are individually legitimate.
    const r = validatePaperScope(3, [NUITS, RIESLING_TROCKEN, BANDOL]);
    const stillDryComplaints = r.violations.filter((v) => /Paper 1 or Paper 2 flight/i.test(v));
    expect(stillDryComplaints).toHaveLength(1);
  });
});

describe("southern-hemisphere botrytis naming is recognised", () => {
  it("does not treat a Noble Riesling as a standard still wine", () => {
    // 11% ABV clears the <=10% sweet floor and the label never says "botrytis" or "rot", so this was
    // being rejected as a still white. It is a botrytised sweet wine.
    const patricia = w(1, "Brown Brothers, Patricia Noble Riesling, 2018. King Valley, Victoria, Australia. (11%)");
    const r = validatePaperScope(3, [patricia, NUITS]);
    expect(r.violations.join(" ")).not.toMatch(/Paper 1 or Paper 2 flight/i);
  });
});

describe("Papers 1 and 2 are unaffected", () => {
  it("still rejects a fortified wine on Paper 1", () => {
    const r = validatePaperScope(1, [w(1, "Emilio Lustau, Puerto Fino Sherry NV. Jerez, Spain. (15%)")]);
    expect(r.valid).toBe(false);
  });

  it("accepts an ordinary white flight on Paper 1", () => {
    const r = validatePaperScope(1, [
      w(1, "Domaine Leflaive, Puligny-Montrachet, 2019. Burgundy, France. (13.0%)"),
      w(2, "Trimbach, Riesling Cuvée Frédéric Emile, 2016. Alsace, France. (12.5%)"),
    ]);
    expect(r.valid).toBe(true);
  });
});
