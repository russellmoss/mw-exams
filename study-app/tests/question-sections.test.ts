import { describe, it, expect } from "vitest";
import {
  deriveQuestion,
  markPhrase,
  SECTION_A_HEADING,
  SECTION_B_HEADING,
} from "../src/lib/question-sections";

describe("deriveQuestion — mixed scope", () => {
  const stem = `Wines 1 to 4 are from four different countries.
For the flight as a whole:
a) Identify the country of origin of each wine. (20 marks)
b) Comment on what the wines have in common. (20 marks)
For each wine:
c) Assess the quality and maturity. (4 x 15 marks)`;

  const d = deriveQuestion(stem, 4);

  it("groups into two sections, flight first", () => {
    expect(d.scopes).toEqual(["flight", "per_wine"]);
    expect(d.sections[0].heading).toBe(SECTION_A_HEADING);
    expect(d.sections[1].heading).toBe(SECTION_B_HEADING);
  });

  it("keeps sub-part letters continuous across sections", () => {
    expect(d.sections[0].subParts.map((p) => p.label)).toEqual(["a", "b"]);
    expect(d.sections[1].subParts.map((p) => p.label)).toEqual(["c"]);
  });

  it("computes section subtotals and per-wine marks", () => {
    expect(d.sections[0].subtotal).toBe(40); // Section A: 20 + 20
    expect(d.sections[1].subtotal).toBe(60); // Section B: 4 x 15
    const c = d.sections[1].subParts[0];
    expect(c.marksPerWine).toBe(15);
    expect(markPhrase(c, 4)).toBe("15 marks per wine (60 total)");
  });

  it("total across both sections is 25 x wines", () => {
    const total = d.sections.reduce((s, sec) => s + sec.subtotal, 0);
    expect(total).toBe(25 * 4);
  });
});

describe("deriveQuestion — single scope", () => {
  it("produces one per-wine scope with no flight section", () => {
    const stem = `Wines 1 and 2 are Chardonnay.
a) Identify the region of each wine. (2 x 12 marks)
b) Assess quality and commercial appeal. (2 x 13 marks)`;
    const d = deriveQuestion(stem, 2);
    expect(d.scopes).toEqual(["per_wine"]);
    expect(d.sections).toHaveLength(1);
    expect(markPhrase(d.sections[0].subParts[0], 2)).toBe("12 marks per wine (24 total)");
  });

  it("infers per-wine from a divisible flat number when unmarked", () => {
    const stem = `a) Identify the variety. (30 marks)`;
    const d = deriveQuestion(stem, 3);
    expect(d.subParts[0].scope).toBe("per_wine");
    expect(d.subParts[0].marksPerWine).toBe(10);
  });
});
