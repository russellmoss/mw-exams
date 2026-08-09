// pooled-block-scope.test.ts — R12, the mirror of R11.
//
// R11 catches a SHARED property marked per wine. R12 catches the opposite: a PER-WINE property
// pooled under a flight-wide header. The reviewer filed the same complaint six times in one sitting
// on 2026-08-09 (attempts #469, #471, #473, #476, #477, #478) — "any time you have a Part A that's
// going to reference all three wines, there has to be some sort of commonality across the wines" —
// against stems shaped like:
//
//   Wines 4 to 6 … each made predominantly from a DIFFERENT, single grape variety.
//   With reference to all three wines:
//   a) Identify the grape variety of each wine. (15 marks)
//
// The header promises one shared answer, "of each wine" wants three, the flat 15 pays for one, and
// the stem has just denied the commonality the header asserts. 104 banked questions carry one of the
// two malformations (76 servable at the time of writing).
//
// The counter-examples below are the load-bearing half of this file: measured over all 162 real
// questions there are 66 pooled blocks, and R12 must stay silent on every one of them.
import { describe, it, expect } from "vitest";
import { applyQuestionRules, expandMarkTokens } from "../src/lib/question-rules.mjs";

const POOLED_RULES = ["pooled-block-marked-per-wine", "pooled-block-per-wine-task"];

const fired = (questionText: string, wineCount: number) =>
  applyQuestionRules({
    paper: 1,
    questionText,
    wines: Array.from({ length: wineCount }, (_, i) => ({ slot: i + 1, varieties: [] })),
  })
    .filter((v: { rule: string }) => POOLED_RULES.includes(v.rule))
    .map((v: { rule: string }) => v.rule);

describe("R12 — a pooled block is answered once and pays once", () => {
  it("flags a determinate identification whose object is per-wine (attempt #476)", () => {
    const q =
      "Wines 3 to 6 are each from a different country and each made predominantly from a different, single grape variety.\n\n" +
      "With reference to all four wines:\na) Identify the grape variety of each wine. (16 marks)\n\n" +
      "For each wine:\nb) Identify the origin as closely as possible. (4 x 5 marks)\n" +
      "c) Comment on the style, quality, and commercial position. (4 x 16 marks)";
    expect(fired(q, 4)).toContain("pooled-block-per-wine-task");
  });

  it.each([
    ["all three wines", 3, "a) Identify the grape variety of each wine. (15 marks)"],
    ["both wines", 2, "a) Identify the grape variety of each wine. (16 marks)"],
    // "for each wine" reads identically to "of each wine" — the object is still per-wine (#477).
    ["all three wines", 3, "a) Identify the grape variety and country of origin for each wine. (24 marks)"],
  ])("flags the per-wine object under 'With reference to %s'", (hdr, n, part) => {
    expect(fired(`Wines are from different countries.\n\nWith reference to ${hdr}:\n${part}`, n)).toContain(
      "pooled-block-per-wine-task"
    );
  });

  it("flags an explicit per-wine multiplier under a pooled header", () => {
    // Self-contradictory without needing to read the stem: the header says one answer, the marks say
    // four. Zero occurrences in the 162 real questions.
    const q =
      "Wines 1 to 4 are a mixed flight.\n\nWith reference to all four wines:\n" +
      "a) Identify the grape variety or varieties and origin of each wine as closely as possible. (4 x 8 marks)";
    expect(fired(q, 4)).toContain("pooled-block-marked-per-wine");
  });

  it("is ground-truth independent — it fires on an unkeyed flight", () => {
    // The cohort carrying this defect is largely unkeyed; a rule needing an answer key would skip
    // exactly the rows that have the bug.
    const q = "Wines 1 to 3.\n\nWith reference to all three wines:\na) Identify the grape variety of each wine. (15 marks)";
    expect(fired(q, 3)).toContain("pooled-block-per-wine-task");
  });
});

describe("R12 — the real corpus shapes it must never touch", () => {
  it("allows a pooled ask for the one property the stem establishes as shared (2023 P1 Q2)", () => {
    const q =
      "Wines 3-6 are from the same single grape variety.\n\nWith reference to all four wines:\n\n" +
      "a) Identify the grape variety. (16 marks)\n\nFor each wine:\n\n" +
      "b) Comment on the style, quality, and maturity. (4 x 13 marks)\n" +
      "c) Identify the origin as closely as possible. (4 x 8 marks)";
    expect(fired(q, 4)).toEqual([]);
  });

  it("allows the EVIDENTIAL form — shared answer, per-wine justification (2012 P3 Q4, 2021 P2 Q1)", () => {
    // "Identify X, with reference to each wine" asks for ONE answer supported from every glass. Both
    // real questions carry a flat mark, which is the tell.
    const a = "Wines 1 to 4 are the same grape variety.\n\nFor all four wines:\na) Identify the grape variety, with reference to each wine (12 marks)";
    const b = "Wines 1 to 3 are from the same region.\n\nFor all three wines:\na) Identify the region as closely as possible, referencing each wine. (15 marks)";
    expect(fired(a, 4)).toEqual([]);
    expect(fired(b, 3)).toEqual([]);
  });

  it("allows a pooled EVALUATIVE part to range over each wine (2013 P2 Q1, 2017 P3 Q4, 2024 P3 Q2)", () => {
    // Comment/compare parts legitimately mention each wine inside one pooled answer. Only determinate
    // identify/name/state verbs are constrained.
    const q =
      "Wines 3 and 4 are from the same region.\n\nWith reference to both wines:\n\n" +
      "a) Identify the region as closely as possible. (15 marks)\n\n" +
      "b) Compare and contrast the winemaking of the two wines. (15 marks)\n\n" +
      "c) Comment on the quality and commercial potential of each wine. (20 marks)";
    expect(fired(q, 2)).toEqual([]);
  });

  it("only constrains the IDENTIFY clause, not a coordinated second task", () => {
    // Caught by the repair script's dry run against the live bank, not by the corpus: on a
    // same-country flight, "Identify the country of origin AND COMMENT ON the … factors that
    // influence the style of each wine. (18 marks)" is a correct pooled part — the shared country is
    // identified once and "of each wine" attaches to the commentary. Firing here would have let the
    // repair split a genuinely shared answer in two.
    const q =
      "Wines 5 and 6 are from the same country, made from different single grape varieties.\n\n" +
      "With reference to both wines:\n" +
      "a) Identify the country of origin and comment on the key climatic and geographical factors that influence the style of each wine. (18 marks)\n\n" +
      "For each wine:\nb) Identify the grape variety and origin as closely as possible. (2 x 9 marks)\n" +
      "c) Comment on the style, quality, and commercial position. (2 x 7 marks)";
    expect(fired(q, 2)).toEqual([]);
  });

  it("still fires when the per-wine object IS the identification", () => {
    // The guard above must not swallow the real defect: no coordinated second task here.
    const q =
      "Wines 1 and 2 are from different countries.\n\nWith reference to both wines:\n" +
      "a) Identify the region of origin of each wine as closely as possible. (16 marks)\n\n" +
      "For each wine:\nb) Comment. (2 x 17 marks)";
    expect(fired(q, 2)).toContain("pooled-block-per-wine-task");
  });

  it("does not fire on a per-wine identification under a DISTRIBUTIVE header", () => {
    const q =
      "Wines 1 and 2 are from different countries and are made from different single grape varieties.\n\n" +
      "For each wine:\n\na) Identify the grape variety and country and region of origin as closely as possible. (2 x 8 marks)\n\n" +
      "b) Comment on the style of each wine. (2 x 10 marks)";
    expect(fired(q, 2)).toEqual([]);
  });
});

describe("markScopeForHeader — 'For each of the four wines' is distributive", () => {
  // Exposed by R12 as a false positive on the real 2014 P1 Q1: the long form missed the
  // `each\s+wine` test and was caught by the number-word fallback, i.e. classified POOLED — the exact
  // opposite of what it says. It never changed a mark total only because every sub-part beneath it
  // carries an explicit multiplier.
  const q2014 =
    "Wines 1-4 come from the same country.\nWith reference to all four wines\n" +
    "a) Identify the country of origin. (16 marks)\nFor each of the four wines\n" +
    "b) Identify the region of origin as closely as possible. (4 x 5 marks)\n" +
    "c) Discuss the key winemaking techniques used to produce this style. (4 x 8 marks)\n" +
    "d) Discuss quality in relation to the region of origin. (4 x 8 marks)";

  it("no longer reads the long form as a pooled block", () => {
    expect(fired(q2014, 4)).toEqual([]);
  });

  it("still totals 25 marks per wine", () => {
    // The invariant the mark expander exists to protect; re-checked because this header now resolves
    // to a different scope. Verified across all 162 real questions.
    expect(expandMarkTokens(q2014, 4).total).toBe(100);
  });

  it("distributes a BARE mark token beneath the long form", () => {
    // The case where the old misclassification would actually have corrupted a total: a bare
    // "(10 marks)" under "For each of the four wines" is worth 40, not 10.
    const bare = "Wines 1-4 come from the same country.\nFor each of the four wines\na) Identify the origin. (10 marks)";
    expect(expandMarkTokens(bare, 4).total).toBe(40);
  });
});
