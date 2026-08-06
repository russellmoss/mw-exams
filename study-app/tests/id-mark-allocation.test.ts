// id-mark-allocation.test.ts — cap variety/origin ID marks against flight difficulty.
//
// A recurring admin bin cluster (cross-paper, 5 reasoned bins) was, in the reviewer's own words,
// that obscure wines are fine but the question then "focuses too much on identification of varietal
// and region — there are too many marks applied to that", and that on the real exam the paper would
// "focus on other things, and perhaps might not even ask for the variety at all". The validator now
// parses each sub-question's marks, sums the variety/region/origin identification marks, and rejects
// a flight that awards them more than 50% of the total with no curveballs / 35% with one or more, or
// that awards any single identification part more than 10 marks.
import { describe, it, expect } from "vitest";
import { idMarkAllocationViolations, type AuditWine } from "../src/lib/question-validator";

// Five obscure wines no reasonable examiner treats as a banker (all classify as curveballs).
const FIVE_CURVEBALLS: AuditWine[] = [
  { slot: 1, varieties: ["Savagnin"], region: "Jura", country: "France" },
  { slot: 2, varieties: ["Assyrtiko"], region: "Santorini", country: "Greece" },
  { slot: 3, varieties: ["Furmint"], region: "Somló", country: "Hungary" },
  { slot: 4, varieties: ["Blaufränkisch"], region: "Mittelburgenland", country: "Austria" },
  { slot: 5, varieties: ["Xinomavro"], region: "Naoussa", country: "Greece" },
];

const q = (questionText: string, wines: AuditWine[], totalMarks?: number) => ({
  questionId: "test",
  paper: 3,
  family: "F5",
  questionText,
  totalMarks,
  wines,
});

describe("idMarkAllocationViolations — difficulty-scaled ceiling", () => {
  it("rejects a five-curveball flight with 5 x 10 ID marks out of 100", () => {
    // 50 ID marks over a five-curveball flight — the 35% cap is 35, so this is over-weighted.
    const text = `Wines 1-5 are from five different countries.
a) For wine 1, identify the grape variety and region of origin. (10 marks)
b) For wine 2, identify the grape variety and region of origin. (10 marks)
c) For wine 3, identify the grape variety and region of origin. (10 marks)
d) For wine 4, identify the grape variety and region of origin. (10 marks)
e) For wine 5, identify the grape variety and region of origin. (10 marks)
f) Comment on the style, method of production and quality of each wine. (50 marks)`;
    const v = idMarkAllocationViolations(q(text, FIVE_CURVEBALLS, 100));
    expect(v.some((x) => x.rule === "id-mark-allocation" && x.severity === "hard")).toBe(true);
    // The message states idMarks, total, the applicable cap and the curveball count.
    const hit = v.find((x) => x.rule === "id-mark-allocation")!;
    expect(hit.detail).toMatch(/50 of 100/);
    expect(hit.detail).toMatch(/35% cap \(35 marks\)/);
    expect(hit.detail).toMatch(/5 curveballs/);
  });

  it("passes the same flight with 5 x 5 ID marks and the balance on style/quality", () => {
    // 25 ID marks over a five-curveball flight — under the 35% (35-mark) cap; no single part over 10.
    const text = `Wines 1-5 are from five different countries.
a) For wine 1, identify the grape variety and region of origin. (5 marks)
b) For wine 2, identify the grape variety and region of origin. (5 marks)
c) For wine 3, identify the grape variety and region of origin. (5 marks)
d) For wine 4, identify the grape variety and region of origin. (5 marks)
e) For wine 5, identify the grape variety and region of origin. (5 marks)
f) Comment on the style, method of production and quality of each wine. (75 marks)`;
    expect(idMarkAllocationViolations(q(text, FIVE_CURVEBALLS, 100))).toEqual([]);
  });
});

// Two banker wines (Sancerre + Marlborough Sauvignon) → 0 curveballs → the 50% share cap never
// fires at these totals, so these cases isolate the per-part cap.
const TWO_BANKERS: AuditWine[] = [
  { slot: 1, varieties: ["Sauvignon Blanc"], region: "Sancerre", country: "France" },
  { slot: 2, varieties: ["Sauvignon Blanc"], region: "Marlborough", country: "New Zealand" },
];

describe("idMarkAllocationViolations — bundled attributes and the per-part cap (bin-fix proposal 9)", () => {
  // The exact shape from the 2026-08 bin pair (byte-identical stems, both quoting this validator).
  it("rejects a 13-mark 'Identify the country' part — the multiplier-free bin case", () => {
    const text = `Wines 1 and 2 are made from the same single grape variety.
a) Identify the country of origin. (13 marks)
b) Comment on the style, method of production and quality of each wine. (2 x 18 marks)
c) Identify the grape variety. (1 marks)`;
    const v = idMarkAllocationViolations(q(text, TWO_BANKERS, 50));
    expect(v.some((x) => x.rule === "id-mark-allocation" && x.severity === "hard")).toBe(true);
    expect(v.find((x) => x.rule === "id-mark-allocation")!.detail).toMatch(/13 marks/);
  });

  it("rejects a bundled 'grape variety and country of origin' part at 15 marks", () => {
    const text = `Wines 1 and 2 are dry white wines.
a) Identify the grape variety and country of origin. (15 marks)
b) Comment on the style, method of production and quality of each wine. (2 x 17 marks)`;
    const v = idMarkAllocationViolations(q(text, TWO_BANKERS, 50));
    expect(v.some((x) => x.rule === "id-mark-allocation" && x.severity === "hard")).toBe(true);
    expect(v.find((x) => x.rule === "id-mark-allocation")!.detail).toMatch(/15 marks/);
  });

  it("passes the same content split into two 8-mark parts", () => {
    const text = `Wines 1 and 2 are dry white wines.
a) Identify the grape variety. (8 marks)
b) Identify the country of origin. (8 marks)
c) Comment on the style, method of production and quality of each wine. (2 x 17 marks)`;
    expect(idMarkAllocationViolations(q(text, TWO_BANKERS, 50))).toEqual([]);
  });

  it("treats the per-wine multiplier as the per-wine value — '(2 x 10 marks)' is legal", () => {
    const text = `Wines 1 and 2 are dry white wines.
a) Identify the grape variety and origin of each wine as closely as possible. (2 x 10 marks)
b) Comment on the style, method of production and quality of each wine. (2 x 15 marks)`;
    expect(idMarkAllocationViolations(q(text, TWO_BANKERS, 50))).toEqual([]);
  });
});

describe("idMarkAllocationViolations — single-part cap", () => {
  it("rejects a two-wine question with a single 20-mark 'identify the grape variety' part", () => {
    const text = `Wines 1 and 2 are made from the same single grape variety, from different countries.
a) Identify the grape variety. (20 marks)
b) Comment on the style, method of production and quality of each wine. (2 x 15 marks)`;
    const wines: AuditWine[] = [
      { slot: 1, varieties: ["Nerello Mascalese"], region: "Etna", country: "Italy" },
      { slot: 2, varieties: ["Nerello Mascalese"], region: "Faugères", country: "France" },
    ];
    const v = idMarkAllocationViolations(q(text, wines, 50));
    expect(v.some((x) => x.rule === "id-mark-allocation" && x.severity === "hard")).toBe(true);
    expect(v.find((x) => x.rule === "id-mark-allocation")!.detail).toMatch(/20 marks/);
  });
});
