// stem-constraint-preservation.test.ts — printed flight-relationship constraints must survive
// Stem Detail derivation.
//
// Production incident (attempt #344, gen_p2_F5_1786023511251): the exam_real variant dropped
// "made from the same single grape variety" from the preamble — the LLM read a printed constraint
// as coaching. variantPreservesStructure only checked sub-question labels + mark tokens, so the
// fact-dropping variant passed, the candidate reasoned "no information about varietals", and the
// debrief then showed the canonical stem. The gate now also requires every constraint phrase in
// the canonical stem to survive into the variant.
import { describe, it, expect } from "vitest";
import {
  extractStemConstraints,
  variantPreservesConstraints,
  variantPreservesStructure,
} from "../src/lib/prompts/stemDetail";

// The real question from the incident, verbatim from generated_questions.
const CANONICAL =
  "Wines 1 and 2 are made from the same single grape variety and are from different countries.\n\n" +
  "a) Identify the grape variety and region of origin as closely as possible. (2 × 10 marks)\n" +
  "b) Compare and contrast the methods of production with reference to the style of each wine. (2 × 8 marks)\n" +
  "c) Comment on quality and commercial position. (2 × 7 marks)";

// The variant production actually stored — same structure, constraint stripped.
const BAD_EXAM_REAL =
  "Wines 1 and 2 are from different countries.\n\n" +
  "a) Identify the grape variety and region of origin as closely as possible. (2 × 10 marks)\n" +
  "b) Compare and contrast the methods of production with reference to the style of each wine. (2 × 8 marks)\n" +
  "c) Comment on quality and commercial position. (2 × 7 marks)";

// The stored guided variant — adds a framing sentence, keeps both constraints.
const GOOD_GUIDED =
  "Wines 1 and 2 are made from the same single grape variety and are from different countries. " +
  "These two wines illustrate how a single variety expresses itself differently according to contrasting national or regional winemaking traditions.\n\n" +
  "a) Identify the grape variety and region of origin as closely as possible. (2 × 10 marks)\n" +
  "b) Compare and contrast the methods of production with reference to the style of each wine. (2 × 8 marks)\n" +
  "c) Comment on quality and commercial position. (2 × 7 marks)";

describe("extractStemConstraints", () => {
  it("finds both flight-relationship facts in the incident stem", () => {
    const constraints = extractStemConstraints(CANONICAL);
    expect(constraints).toContain("same single grape variety");
    expect(constraints).toContain("different countries");
  });

  it("finds counted constraints (\"from three different countries\")", () => {
    expect(
      extractStemConstraints("Wines 10-12 are from three different countries. All are made from the same single grape variety.")
    ).toEqual(expect.arrayContaining(["three different countries", "same single grape variety"]));
  });

  it("survives the corpus comma-bug (\"same, single grape variety\")", () => {
    expect(extractStemConstraints("Wines 1-4 are from the same, single grape variety.")).toContain(
      "same single grape variety"
    );
  });

  it("returns nothing for a stem with no relationship facts", () => {
    expect(extractStemConstraints("a) Identify the wine as closely as possible. (10 marks)")).toEqual([]);
  });
});

describe("variantPreservesConstraints", () => {
  it("rejects the production fact-dropping variant", () => {
    expect(variantPreservesConstraints(CANONICAL, BAD_EXAM_REAL)).toBe(false);
  });

  it("accepts the guided variant that keeps every constraint", () => {
    expect(variantPreservesConstraints(CANONICAL, GOOD_GUIDED)).toBe(true);
  });

  it("accepts a variant that only re-punctuates a constraint", () => {
    expect(
      variantPreservesConstraints(
        "Wines 1 and 2 are made from the same single grape variety.",
        "Wines 1 and 2 are made from the same, single grape variety."
      )
    ).toBe(true);
  });
});

describe("variantPreservesStructure (the pick() gate)", () => {
  it("now rejects the incident variant even though its marks/labels are identical", () => {
    expect(variantPreservesStructure(CANONICAL, BAD_EXAM_REAL)).toBe(false);
  });

  it("still accepts the guided variant", () => {
    expect(variantPreservesStructure(CANONICAL, GOOD_GUIDED)).toBe(true);
  });

  it("still rejects a variant that alters marks", () => {
    expect(
      variantPreservesStructure(CANONICAL, CANONICAL.replace("(2 × 10 marks)", "(2 × 8 marks)"))
    ).toBe(false);
  });
});
