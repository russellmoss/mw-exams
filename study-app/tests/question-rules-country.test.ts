// question-rules-country.test.ts — country canonicalisation in the shared rule layer.
//
// The 2026-08-05 corpus audit flagged a correct same-country flight as HARD because the answer-key
// resolver had emitted a region-qualified country for one wine: "stem says same country; key has
// france, south west france". The rules compared countries as raw strings. canonCountry now
// collapses a value that ENDS on a known country to that country before the R1/R4 diversity
// comparisons, so region-qualified resolutions stop reading as extra countries.
import { describe, it, expect } from "vitest";
import { canonCountry, applyQuestionRules } from "../src/lib/question-rules.mjs";

describe("canonCountry", () => {
  it.each([
    ["France", "france"],
    ["South West France", "france"], // the audited defect
    ["Tuscany, Italy", "italy"],
    ["United States", "usa"], // folds to detectCountryName's canonical form
    ["USA", "usa"],
    ["South Africa", "south africa"], // its own country, not a qualified "africa"
    ["New Zealand", "new zealand"],
  ])("%s → %s", (input, expected) => {
    expect(canonCountry(input)).toBe(expected);
  });

  it("passes unknown values through norm()'d so equal strings still compare equal", () => {
    expect(canonCountry("Somewhere Fictional")).toBe("somewhere fictional");
    expect(canonCountry("")).toBe("");
  });

  it("does not collapse a country merely CONTAINING another's name mid-string", () => {
    // Ends-on matching only: "France" inside a longer non-suffix string must not anchor.
    expect(canonCountry("France Import Co Region")).toBe("france import co region");
  });
});

describe("R4 same-country with region-qualified countries", () => {
  const wines = (c1: string, c2: string) => [
    { slot: 1, varieties: ["tannat"], region: "Madiran", country: c1 },
    { slot: 2, varieties: ["malbec"], region: "Cahors", country: c2 },
  ];

  it("no longer flags france vs south west france (the audited defect)", () => {
    const violations = applyQuestionRules({
      paper: 2,
      questionText: "Wines 1-2 are from the same country and are made from different grape varieties.",
      wines: wines("France", "South West France"),
    });
    expect(violations.filter((v) => v.rule === "same-country")).toEqual([]);
  });

  it("still flags genuinely different countries", () => {
    const violations = applyQuestionRules({
      paper: 2,
      questionText: "Wines 1-2 are from the same country and are made from different grape varieties.",
      wines: wines("France", "Spain"),
    });
    expect(violations.filter((v) => v.rule === "same-country" && v.severity === "hard")).toHaveLength(1);
  });
});

describe("R1 country-diversity counts canonicalised countries", () => {
  it("a 'three different countries' stem over france + south-west-france + spain keys only two", () => {
    const violations = applyQuestionRules({
      paper: 2,
      questionText: "The following three wines come from three different countries.",
      wines: [
        { slot: 1, varieties: ["tannat"], region: "Madiran", country: "France" },
        { slot: 2, varieties: ["malbec"], region: "Cahors", country: "South West France" },
        { slot: 3, varieties: ["tempranillo"], region: "Rioja", country: "Spain" },
      ],
    });
    const hard = violations.filter((v) => v.rule === "country-diversity" && v.severity === "hard");
    expect(hard).toHaveLength(1);
    expect(hard[0].detail).toContain("only 2 distinct");
  });
});
