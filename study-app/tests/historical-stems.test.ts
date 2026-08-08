// historical-stems.test.ts — the one edit made to an authoritative past-paper stem.
//
// A banked flight is numbered 1..n; a past-paper question names its slots inside a twelve-wine paper
// ("Wines 10-12"). 117 of the 162 corpus questions need renumbering. Since the source compilation is
// authoritative and never paraphrased, that edit has to be provably minimal — these tests are the
// proof: digits inside a "Wine(s) …" reference move, and nothing else in the string does.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  renumberStemSlots,
  selectImportableStems,
  historicalQuestionId,
  historicalMetadata,
  MAX_IMPORTABLE_FLIGHT,
  type CorpusQuestion,
} from "../src/lib/historical-stems";

const corpus = (): CorpusQuestion[] =>
  JSON.parse(readFileSync(join(__dirname, "../../data/structured/corpus_questions.json"), "utf8"));

describe("renumberStemSlots", () => {
  it("rewrites a hyphen range", () => {
    expect(renumberStemSlots("Wines 10-12 are all from different countries.", [10, 11, 12])).toBe(
      "Wines 1-3 are all from different countries."
    );
  });

  it("rewrites a 'to' range and an en dash", () => {
    expect(renumberStemSlots("Wines 7 to 12 are a mixed bag.", [7, 8, 9, 10, 11, 12])).toBe(
      "Wines 1 to 6 are a mixed bag."
    );
    expect(renumberStemSlots("Wines 5–6 are from the same region.", [5, 6])).toBe(
      "Wines 1–2 are from the same region."
    );
  });

  it("rewrites an 'and' enumeration and a lone wine", () => {
    expect(renumberStemSlots("Wines 5 and 6 are from different countries.", [5, 6])).toBe(
      "Wines 1 and 2 are from different countries."
    );
    expect(renumberStemSlots("Wine 9 is an outlier.", [9])).toBe("Wine 1 is an outlier.");
  });

  it("leaves mark tokens and plain counts alone", () => {
    const stem = [
      "Wines 9-12 are from four different countries.",
      "For each wine:",
      "a) Identify the origin. (4 x 10 marks)",
      "b) Comment on quality. (4 x 15 marks)",
    ].join("\n");
    expect(renumberStemSlots(stem, [9, 10, 11, 12])).toBe(
      [
        "Wines 1-4 are from four different countries.",
        "For each wine:",
        "a) Identify the origin. (4 x 10 marks)",
        "b) Comment on quality. (4 x 15 marks)",
      ].join("\n")
    );
  });

  it("is a no-op on a stem already numbered from 1", () => {
    const stem = "Wines 1 to 3 are from the same region.\na) Identify it. (3 x 25 marks)";
    expect(renumberStemSlots(stem, [1, 2, 3])).toBe(stem);
  });

  it("throws rather than guess when the stem names a slot the flight does not hold", () => {
    expect(() => renumberStemSlots("Wines 4-6 are red.", [1, 2, 3])).toThrow(/not one of this question's slots/);
  });

  it("changes nothing but digits, on every corpus question", () => {
    for (const q of corpus()) {
      const out = renumberStemSlots(q.text, q.wine_slots);
      // Masking every number must leave the two strings identical — proof no word moved.
      expect(out.replace(/\d+/g, "#")).toBe(q.text.replace(/\d+/g, "#"));
    }
  });
});

describe("selectImportableStems", () => {
  const { stems, ineligible } = selectImportableStems(corpus());

  it("keeps every question except the two whole-paper flights", () => {
    expect(stems.length + ineligible.length).toBe(162);
    expect(ineligible.map((i) => i.qid).sort()).toEqual(["2011_p3_q1", "2026_p3_q2"]);
    expect(ineligible.every((i) => i.reason === "whole-paper-flight")).toBe(true);
    expect(stems.length).toBe(160);
  });

  it("gives every importable stem a flight the bank can serve", () => {
    for (const s of stems) {
      expect(s.flightSize).toBeGreaterThanOrEqual(1);
      expect(s.flightSize).toBeLessThanOrEqual(MAX_IMPORTABLE_FLIGHT);
      expect(s.totalMarks).toBe(s.flightSize * 25);
    }
  });

  it("numbers every renumbered stem from 1", () => {
    for (const s of stems) {
      const first = s.stemText.match(/\bwines?\s+(\d+)/i);
      if (first) expect(Number(first[1])).toBe(1);
    }
  });

  it("namespaces ids away from generated questions and records provenance", () => {
    const s = stems.find((x) => x.qid === "2013_p2_q4")!;
    expect(historicalQuestionId(s)).toBe("hist_2013_p2_q4");
    const meta = historicalMetadata(s) as { source: string; historical: Record<string, unknown> };
    expect(meta.source).toBe("historical_stem");
    expect(meta.historical.year).toBe(2013);
    expect(meta.historical.stemRenumbered).toBe(true);
  });
});
