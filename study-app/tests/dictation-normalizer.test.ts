import { describe, it, expect } from "vitest";
import { normalizeDictatedTerms } from "../src/lib/dictation-normalizer";

/**
 * The stakes are asymmetric: failing to fix a mangled term costs a small professionalism deduction,
 * but "fixing" Sémillon into Sauvignon rewrites the candidate's actual call and corrupts the mark.
 * The tests below weight accordingly — most of them assert that we DON'T touch something.
 */

const TERMS = [
  "Chardonnay",
  "Sauvignon Blanc",
  "Sémillon",
  "Gewürztraminer",
  "Riesling",
  "Grüner Veltliner",
  "Pinot Noir",
  "Pinot Gris",
  "Nebbiolo",
  "Syrah",
  "Melon de Bourgogne",
  "Pedro Ximénez",
  "Barossa Valley",
  "Chablis",
  "Sauternes",
];

const run = (text: string) => normalizeDictatedTerms(text, TERMS);

describe("normalizeDictatedTerms", () => {
  it("repairs a split-and-misspelled term", () => {
    const r = run("A classic gewurtz traminer from Alsace.");
    expect(r.text).toContain("Gewürztraminer");
    expect(r.substitutions).toEqual([{ from: "gewurtz traminer", to: "Gewürztraminer" }]);
  });

  it("repairs a missing accent", () => {
    const r = run("Aged gruner veltliner.");
    expect(r.text).toContain("Grüner Veltliner");
  });

  it("does not treat capitalisation as a misspelling", () => {
    const text = "clearly chardonnay, not riesling";
    const r = run(text);
    expect(r.text).toBe(text);
    expect(r.substitutions).toEqual([]);
  });

  it("leaves a correctly spelled term completely alone", () => {
    const text = "Chardonnay from Chablis, with Sémillon alongside.";
    const r = run(text);
    expect(r.text).toBe(text);
    expect(r.substitutions).toEqual([]);
  });

  it("does not confuse Sémillon with Sauvignon Blanc", () => {
    const r = run("I think this is semillon rather than sauvignon blanc.");
    expect(r.text).not.toContain("Sauvignon Blanc rather");
    for (const s of r.substitutions) expect(s.to).not.toBe("Sauvignon Blanc");
  });

  it("does not flip Pinot Noir into Pinot Gris", () => {
    const r = run("Clearly pinot noir on the nose.");
    expect(r.text).toContain("Pinot Noir");
    expect(r.text).not.toContain("Pinot Gris");
  });

  it("refuses to guess when two terms are equally close", () => {
    // "pinot xris" sits one edit from Gris and far from Noir — but a genuinely ambiguous span
    // must be left as written rather than resolved arbitrarily.
    const r = normalizeDictatedTerms("a pinot xxxx wine", ["Pinot Noir", "Pinot Gris"]);
    expect(r.substitutions).toEqual([]);
  });

  it("never rewrites a short word, where one edit reaches too many grapes", () => {
    const r = normalizeDictatedTerms("the wine is syra", ["Syrah", "Sirah"]);
    expect(r.substitutions).toEqual([]);
  });

  it("prefers the longest matching phrase", () => {
    const r = run("Made from melon de bourgone in the Loire.");
    expect(r.text).toContain("Melon de Bourgogne");
    expect(r.substitutions).toHaveLength(1);
  });

  it("handles multi-word terms with accents", () => {
    const r = run("A sweet pedro ximenes.");
    expect(r.text).toContain("Pedro Ximénez");
  });

  it("repairs regions too, not just grapes", () => {
    const r = run("Probably barrosa valley shiraz.");
    expect(r.text).toContain("Barossa Valley");
  });

  it("reports every substitution so it can be disclosed, not applied silently", () => {
    const r = run("gewurtz traminer and gruner veltliner");
    expect(r.substitutions.length).toBe(2);
    expect(r.substitutions.every((s) => s.from && s.to)).toBe(true);
  });

  it("returns the input untouched when there is nothing to fix", () => {
    const text = "Structured, dry, high acidity, clearly cool climate.";
    expect(run(text)).toEqual({ text, substitutions: [] });
  });

  it("never builds a phrase across punctuation", () => {
    // Regression: "chardonnay, not riesling" was read as one span and matched to "Chardonnay",
    // deleting the ", not" and inverting the candidate's meaning.
    const text = "chardonnay, not riesling";
    expect(run(text).text).toBe(text);
    expect(run("Sauternes. Sémillon dominant.").text).toBe("Sauternes. Sémillon dominant.");
  });

  it("does not absorb an adjacent ordinary word into a term", () => {
    // Regression: a long span could reach a shorter term within the span's own tolerance.
    const text = "chardonnay not oaked";
    expect(run(text).text).toBe(text);
  });

  it("is safe on empty or vocabulary-less input", () => {
    expect(normalizeDictatedTerms("", TERMS).text).toBe("");
    expect(normalizeDictatedTerms("Chardonnay", []).substitutions).toEqual([]);
  });

  it("preserves the surrounding text exactly", () => {
    const r = run("Wine 1: gewurtz traminer — 12.5% abv, off-dry.");
    expect(r.text).toBe("Wine 1: Gewürztraminer — 12.5% abv, off-dry.");
  });
});
