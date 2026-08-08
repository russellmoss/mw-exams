// mark-token-scope.test.ts — expandMarkTokens, the shared reader for the three mark notations the
// IMW actually prints.
//
// A mark token is only worth its face value when it stands alone. Until this existed, every
// mark-totalling site in the app read face value only, which made TEN real IMW questions look like
// mis-allocations:
//   • every 2013 paper scopes bare marks under a section header ("For each wine" + "(15 marks)"),
//     so 2013 P1 Q1 summed to 35 against an expected 50;
//   • 2011 P3 Q1 prints "(8 marks per pair)", summing to 48 against 300;
//   • the 2012 papers print marks with no unit at all — "(4 x 10)" and a bare "(15)" — zeroing out
//     all eight of that year's questions.
// All 162 real questions in data/structured/corpus_questions.json total exactly 25 marks per wine
// once the notations are read correctly; the corpus test at the bottom is the regression gate on that.
//
// The two OVERRIDES are what keep the scoping honest, and both were found by measuring the change
// against the live bank rather than by reading code — each was a real banked question that the first
// draft of the expander would have newly quarantined.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expandMarkTokens } from "../src/lib/question-rules.mjs";

const total = (text: string, n: number) => expandMarkTokens(text, n).total;

describe("expandMarkTokens", () => {
  it("reads an explicit multiplier at face value", () => {
    expect(total("a) Identify. (3 x 15 marks)\nb) Comment. (3 x 10 marks)", 3)).toBe(75);
  });

  it("distributes a bare token under a per-wine header (2013 notation)", () => {
    // 2013 P1 Q1: 15 per wine over two wines, plus a pooled 20 = 50.
    const q = [
      "Wines 1 and 2 are from the same country.",
      "For each wine:",
      "a) Identify the origin and grape variety. (15 marks)",
      "For both wines:",
      "b) Compare and contrast quality and style. (20 marks)",
    ].join("\n");
    expect(total(q, 2)).toBe(50);
  });

  it("accepts a header with no trailing colon (2013 Paper 3 notation)", () => {
    const q = [
      "Wines 1-3 are all from the same country.",
      "For all three wines",
      "a) Identify the country and regions of origin. (24 marks)",
      "For each wine",
      "c) Comment on the method of production. (7 marks)",
      "d) Discuss the quality. (10 marks)",
    ].join("\n");
    expect(total(q, 3)).toBe(75);
  });

  it("expands a 'per pair' phrase over the flight's pairs (2011 P3 Q1)", () => {
    const q = [
      "Wines 1 to 12 are all presented in pairs.",
      "For each pair:",
      "a) Identify the region of origin (8 marks per pair)",
      "b) Comment on the methods of production (14 marks per pair)",
      "c) Compare the quality of the two wines (20 marks per pair)",
      "For each wine:",
      "d) State the alcohol to the nearest degree (12 x 2 marks)",
      "e) State the residual sugar in grammes per litre (12 x 2 marks)",
    ].join("\n");
    expect(total(q, 12)).toBe(300);
  });

  it("counts a unitless multiplier, and a bare number only under that convention (2012)", () => {
    const q2012 = [
      "Wines 5-7 are all made from the same single grape variety.",
      "With reference to all three wines:",
      "a) Identify the grape variety (15)",
      "Then for each wine:",
      "b) Identify the origin as closely as possible (3 x 10\\)",
      "c) Discuss the quality (3 x 10\\)",
    ].join("\n");
    expect(total(q2012, 3)).toBe(75);
  });

  it("never reads a parenthesised vintage as marks in a normally-marked question", () => {
    // The convention is off — every token here says "marks" — so "(2015)" is not a mark token.
    const q = "Wines 1-2 are from the same vintage (2015).\nFor each wine:\na) Identify the origin. (2 x 25 marks)";
    expect(total(q, 2)).toBe(50);
  });

  it("OVERRIDE 1: a flight-wide sub-part is not scoped by the header it sits under", () => {
    // Live bank gen_p2_F4_1786072594422 — the pooled comparison is the last part inside the
    // "For each wine:" block. Scoping its 14 marks by 2 turned a valid 50 into 64.
    const q = [
      "Wines 5 and 6 are from different countries.",
      "",
      "For each wine:",
      "a) Identify the grape variety and origin as closely as possible. (2 x 8 marks)",
      "b) Comment on the quality and maturity of each wine. (2 x 10 marks)",
      "c) Compare and contrast the style and commercial position of these two wines. (14 marks)",
    ].join("\n");
    expect(total(q, 2)).toBe(50);
  });

  it("OVERRIDE 1: also applies to a trailing 'with reference to all N wines' part", () => {
    // Live bank gen_p2_F2_1785861340124.
    const q = [
      "Wines 1 to 4 are from the same country of origin.",
      "",
      "For all four wines:",
      "a) Identify the country of origin. (20 marks)",
      "",
      "For each wine:",
      "b) Identify the grape variety as precisely as possible. (4 x 10 marks)",
      "c) Comment on the style, quality and commercial position. (4 x 7 marks)",
      "",
      "Discuss, with reference to all four wines, the role of regional diversity. (12 marks)",
    ].join("\n");
    expect(total(q, 4)).toBe(100);
  });

  it("OVERRIDE 2: adjacent bare tokens are an enumeration, not one scoped value", () => {
    // Live bank gen_p3_F6_1786061618120 — jagged per-wine marks listed one per wine. Scoping each
    // by 3 turned a valid 75 into 209.
    const q = [
      "Wines 1 to 3 are all rosé wines.",
      "",
      "For each wine:",
      "a) Identify the grape variety and the origin. (13 marks) (12 marks) (14 marks)",
      "",
      "b) Comment on the style and key winemaking decisions. (9 marks) (11 marks) (8 marks)",
      "",
      "With reference to all three wines:",
      "c) Compare the commercial positions of these wines. (8 marks)",
    ].join("\n");
    expect(total(q, 3)).toBe(75);
  });

  it("a non-adjacent second token in one part is still scoped independently", () => {
    const q = "For each wine:\na) Identify the origin (10 marks) and comment on quality (15 marks)";
    expect(total(q, 2)).toBe(50);
  });

  it("falls back to face value when the wine count is unknown", () => {
    // Callers without wines (the served-stem hash, the multiplier-derived wine count) must keep the
    // pre-scoping reading, or a stored fingerprint moves under them.
    const q = "For each wine:\na) Identify the origin. (15 marks)";
    expect(total(q, 0)).toBe(15);
  });
});

describe("the real corpus totals 25 marks per wine, every question", () => {
  it("all 162 IMW questions 2011-2026 balance exactly", () => {
    const corpus = JSON.parse(
      readFileSync(join(__dirname, "../../data/structured/corpus_questions.json"), "utf8")
    ) as { qid: string; text: string; flight_size: number }[];
    const off = corpus
      .map((q) => ({ qid: q.qid, got: total(q.text, q.flight_size), want: q.flight_size * 25 }))
      .filter((r) => r.got !== r.want);
    expect(off).toEqual([]);
    expect(corpus.length).toBe(162);
  });
});
