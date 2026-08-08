// subset-scoped-stem.test.ts — a stem that talks about part of the flight, not all of it.
//
// Real MW stems routinely make one claim about a SUBSET and a different claim about the rest:
//
//     "Wines 1-3 are from different countries and are each made from a different, single grape
//      variety. Wine 4 is a blend of all three of these varieties."   (2022 Paper 2 Q1)
//
// Read flight-wide, that stem rejects the blend it has just asked for and counts four countries where
// it asked for three. The shared rule layer had always guarded its own cardinality checks against
// this; crossCheckStemFacts and the engine's variety check had not.
//
// The guard has to know the FLIGHT SIZE, which is the subtle part and the reason for this file. The
// pre-existing isSubsetSplit() matches the phrase "Wines 1 and 2 …", which on a two-wine flight is
// the whole flight — gating on that alone silenced three legitimate rules outright (caught by
// tests/stem-predicate-mismatch.test.ts and tests/stem-fact-cross-check.test.ts). A stem is only
// subset-SCOPED when the group it names is smaller than the flight.
import { describe, it, expect } from "vitest";
import { subsetScopedStem } from "../src/lib/question-rules.mjs";
import { crossCheckStemFacts, type AuditWine } from "../src/lib/question-validator";

describe("subsetScopedStem", () => {
  it("is true when the stem's first group is smaller than the flight", () => {
    const stem =
      "Wines 1-3 are from different countries and are each made from a different, single grape variety. Wine 4 is a blend of all three of these varieties.";
    expect(subsetScopedStem(stem, 4)).toBe(true);
  });

  it("is FALSE when the named group IS the whole flight", () => {
    // The regression this file exists for: guarding on the phrase alone disabled the rules entirely
    // for every ordinary two-wine question.
    expect(subsetScopedStem("Wines 1 and 2 are from the same country.", 2)).toBe(false);
    expect(subsetScopedStem("Wines 1 and 2 are from the same region.", 2)).toBe(false);
  });

  it("is false for a plain flight-wide stem and for an unknown wine count", () => {
    expect(subsetScopedStem("Wines 1-4 are from four different countries.", 4)).toBe(false);
    expect(subsetScopedStem("Wines 1-3 are from the same region. Wine 4 differs.", 0)).toBe(false);
  });
});

describe("crossCheckStemFacts honours subset scoping", () => {
  const wines: AuditWine[] = [
    { slot: 1, varieties: ["Cabernet Sauvignon"], region: "Coonawarra", country: "Australia" },
    { slot: 2, varieties: ["Merlot"], region: "Walla Walla Valley", country: "USA" },
    { slot: 3, varieties: ["Cabernet Franc"], region: "Chinon", country: "France" },
    {
      slot: 4,
      varieties: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"],
      region: "Haut-Médoc",
      country: "France",
      is_blend: true,
    },
  ];
  const stem =
    "Wines 1-3 are from different countries and are each made from a different, single grape variety. Wine 4 is a blend of all three of these varieties.";

  it("does not reject the blend the stem itself asks for", () => {
    const hits = crossCheckStemFacts({
      questionId: "x",
      paper: 2,
      family: "F3",
      questionText: stem,
      wines,
    });
    expect(hits.filter((v) => v.rule === "stem-fact-singular-variety-blend")).toEqual([]);
  });

  it("does not count the fourth wine against a three-country claim", () => {
    const hits = crossCheckStemFacts({
      questionId: "x",
      paper: 2,
      family: "F3",
      questionText: stem,
      wines,
    });
    const countryHits = hits.filter(
      (v) => v.rule === "STEM_PREDICATE_MISMATCH" && /countries/i.test(v.detail)
    );
    expect(countryHits).toEqual([]);
  });
});

describe("'same region but different sub-regions' is not a contradiction", () => {
  it("accepts two sub-regions of one region", () => {
    // Real: 2022 Paper 2 Q2 and Q3, whose stems are identical. What the key resolves as each wine's
    // region IS its sub-region, so a difference between them is what the stem predicts.
    const hits = crossCheckStemFacts({
      questionId: "x",
      paper: 2,
      family: "F2",
      questionText:
        "Wines 1 and 2 are from the same region but different sub-regions.\nFor each wine:\na) Identify the sub-region as closely as possible. (2 x 10 marks)",
      wines: [
        { slot: 1, varieties: ["Syrah"], region: "Barossa Valley", country: "Australia" },
        { slot: 2, varieties: ["Syrah"], region: "Eden Valley", country: "Australia" },
      ],
    });
    expect(hits.filter((v) => /same region/i.test(v.detail))).toEqual([]);
  });

  it("still fires on a plain 'same region' stem over two regions", () => {
    const hits = crossCheckStemFacts({
      questionId: "x",
      paper: 1,
      family: "F2",
      questionText: "Wines 1 and 2 are from the same region.",
      wines: [
        { slot: 1, varieties: ["Chenin Blanc"], region: "Savennières", country: "France" },
        { slot: 2, varieties: ["Chenin Blanc"], region: "Vouvray", country: "France" },
      ],
    });
    expect(hits.some((v) => /same region/i.test(v.detail))).toBe(true);
  });
});
