// id-mark-allocation.test.ts — how many marks a question may put on "name it".
//
// ORIGINAL INTENT (a cross-paper admin bin cluster, 5 reasoned bins): obscure wines are fine, but the
// question then "focuses too much on identification of varietal and region — there are too many marks
// applied to that", and the real paper would "focus on other things, and perhaps might not even ask
// for the variety at all".
//
// RECALIBRATED 2026-08-08. The thresholds that intent was expressed with (10 marks a part; 35% of the
// paper once a flight had a curveball) turned out to describe a much narrower exam than the IMW sets.
// Measured over the 160 importable real questions they rejected 101 — 63% — and, decisively, our
// GENERATED bank is tamer than the real exam at every percentile on this axis (median ID share 32% vs
// 40%, p90 52% vs 60%). The rule was not catching generated excess; it produced 305 of the bank's
// violations for nothing.
//
// The line now sits where the real exam stops (share 80%, single part 30 — both its observed maxima),
// with a soft flag at its p90 (60% / 20) so the reviewer's preference stays visible without retiring
// a question. And a floor was ADDED at 5, because that is where the bin cluster's real defect lived.
import { describe, it, expect } from "vitest";
import { idMarkAllocationViolations, flightCompositionViolations, type AuditWine } from "../src/lib/question-validator";

// Five obscure wines no reasonable examiner treats as a banker (all classify as curveballs).
const FIVE_CURVEBALLS: AuditWine[] = [
  { slot: 1, varieties: ["Savagnin"], region: "Jura", country: "France" },
  { slot: 2, varieties: ["Assyrtiko"], region: "Santorini", country: "Greece" },
  { slot: 3, varieties: ["Furmint"], region: "Somló", country: "Hungary" },
  { slot: 4, varieties: ["Blaufränkisch"], region: "Mittelburgenland", country: "Austria" },
  { slot: 5, varieties: ["Xinomavro"], region: "Naoussa", country: "Greece" },
];

const TWO_BANKERS: AuditWine[] = [
  { slot: 1, varieties: ["Sauvignon Blanc"], region: "Sancerre", country: "France" },
  { slot: 2, varieties: ["Sauvignon Blanc"], region: "Marlborough", country: "New Zealand" },
];

const q = (questionText: string, wines: AuditWine[], totalMarks?: number) => ({
  questionId: "test",
  paper: 3,
  family: "F5",
  questionText,
  totalMarks,
  wines,
});
const hard = <T extends { severity: string }>(v: T[]) => v.filter((x) => x.severity === "hard");
const soft = <T extends { severity: string }>(v: T[]) => v.filter((x) => x.severity === "soft");

describe("the share of a paper spent on identification", () => {
  it("allows the real exam's median shape — 50 of 100 marks on ID", () => {
    // This is the fixture the old 35% cap rejected. 50% sits between the real exam's median (40%) and
    // its p90 (60%); 28% of real IMW questions go above it. It is not a defect.
    const text = `Wines 1-5 are from five different countries.
a) For wine 1, identify the grape variety and region of origin. (10 marks)
b) For wine 2, identify the grape variety and region of origin. (10 marks)
c) For wine 3, identify the grape variety and region of origin. (10 marks)
d) For wine 4, identify the grape variety and region of origin. (10 marks)
e) For wine 5, identify the grape variety and region of origin. (10 marks)
f) Comment on the style, method of production and quality of each wine. (50 marks)`;
    expect(idMarkAllocationViolations(q(text, FIVE_CURVEBALLS, 100))).toEqual([]);
  });

  it("but the five-curveball FLIGHT is still rejected — by the rule that has signal on it", () => {
    // The bin's real complaint was the flight, not the arithmetic. flight-composition catches it
    // twice over, so recalibrating the mark cap does not let this question through.
    const v = flightCompositionViolations(FIVE_CURVEBALLS);
    expect(v.length).toBeGreaterThan(0);
    expect(v.some((x) => /no banker/.test(x.detail))).toBe(true);
    expect(v.some((x) => /5 curveballs/.test(x.detail))).toBe(true);
  });

  it("flags an elevated share softly at the real exam's p90", () => {
    const text = `Wines 1 and 2 are dry white wines.
a) Identify the grape variety and region of origin of each wine. (2 x 17 marks)
b) Comment on the quality of each wine. (2 x 8 marks)`;
    const v = idMarkAllocationViolations(q(text, TWO_BANKERS, 50));
    expect(hard(v)).toHaveLength(0);
    expect(soft(v).some((x) => /68%/.test(x.detail))).toBe(true);
  });

  it("rejects a share beyond anything the real exam has ever set", () => {
    const text = `Wines 1 and 2 are dry white wines.
a) Identify the grape variety and region of origin of each wine. (2 x 23 marks)
b) Comment on the quality of each wine. (2 x 2 marks)`;
    const v = idMarkAllocationViolations(q(text, TWO_BANKERS, 50));
    expect(hard(v).some((x) => /92%/.test(x.detail))).toBe(true);
  });
});

describe("the size of a single identification part", () => {
  // The real corpus pays 5 → 30 for one ID part, median 10, p75 15, p90 20.
  it.each([
    ["13 marks for the country — the real exam does this twice", 13],
    ["15 marks for the region — 2011 P1 Q1 does exactly this", 15],
    ["20 marks — the real exam's p90", 20],
  ])("allows %s", (_label, marks) => {
    const text = `Wines 1 and 2 are made from the same single grape variety.
a) Identify the country of origin. (${marks} marks)
b) Comment on the style, method of production and quality of each wine. (2 x 25 marks)`;
    expect(hard(idMarkAllocationViolations(q(text, TWO_BANKERS, 100)))).toHaveLength(0);
  });

  it("flags 25 marks softly, and rejects 40 outright", () => {
    const mk = (marks: number) => `Wines 1 and 2 are made from the same single grape variety.
a) Identify the grape variety. (${marks} marks)
b) Comment on the style, method of production and quality of each wine. (2 x 40 marks)`;
    const soft25 = idMarkAllocationViolations(q(mk(25), TWO_BANKERS, 105));
    expect(hard(soft25)).toHaveLength(0);
    expect(soft(soft25).some((x) => /25 marks/.test(x.detail))).toBe(true);

    const hard40 = idMarkAllocationViolations(q(mk(40), TWO_BANKERS, 120));
    expect(hard(hard40).some((x) => /40 marks/.test(x.detail))).toBe(true);
  });

  it("treats the per-wine multiplier as the per-wine value — '(2 x 10 marks)' is legal", () => {
    const text = `Wines 1 and 2 are dry white wines.
a) Identify the grape variety and origin of each wine as closely as possible. (2 x 10 marks)
b) Comment on the style, method of production and quality of each wine. (2 x 15 marks)`;
    expect(idMarkAllocationViolations(q(text, TWO_BANKERS, 50))).toEqual([]);
  });
});

describe("the floor — where the reviewer's bin actually went wrong", () => {
  it("rejects a 1-mark 'Identify the grape variety' (the 2026-08 bin pair)", () => {
    // Byte-identical stems, both binned. The old rule flagged the 13-mark country part, which the real
    // exam sets twice; it said nothing about pricing the grape variety at one mark, which the real
    // exam never does — no identification part in the corpus is worth less than 5.
    const text = `Wines 1 and 2 are made from the same single grape variety.
a) Identify the country of origin. (13 marks)
b) Comment on the style, method of production and quality of each wine. (2 x 18 marks)
c) Identify the grape variety. (1 marks)`;
    const v = idMarkAllocationViolations(q(text, TWO_BANKERS, 50));
    expect(hard(v).some((x) => /1 mark\b/.test(x.detail) && /floor/.test(x.detail))).toBe(true);
  });

  it("allows a 5-mark ID part — the real corpus minimum", () => {
    const text = `Wines 1 and 2 are made from the same single grape variety.
a) Identify the region of origin as closely as possible. (2 x 5 marks)
b) Comment on the style, method of production and quality of each wine. (2 x 20 marks)`;
    expect(hard(idMarkAllocationViolations(q(text, TWO_BANKERS, 50)))).toHaveLength(0);
  });
});
