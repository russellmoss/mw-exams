// appellation-resolver.test.ts — the server-only bridge to the 220-entry appellation dataset.
//
// A banked Paper 1 flight promised three different grape varieties and delivered two Chenin Blancs:
// Savennieres + Gruner Veltliner + Kloof Street White. Neither Chenin label contains "chenin", and
// the generation stage's own appellation table holds 21 entries against the answer key's 220, so it
// saw nothing to compare. The rule was right; the detection was blind.
import { describe, it, expect } from "vitest";
import "../src/lib/appellation-resolver";
import { detectPrimaryVariety } from "../src/lib/question-rules.mjs";

describe("appellations the 21-entry table missed", () => {
  it.each([
    ["Domaine Belargus Roche aux Moines, 2022. Savennières, Loire Valley, France.", "chenin blanc"],
    ["Domaine Huet, Le Mont Sec, 2021. Vouvray, Loire Valley, France.", "chenin blanc"],
  ])("%s", (label, expected) => {
    expect(detectPrimaryVariety(label)).toBe(expected);
  });
});

describe("does not over-claim", () => {
  it("leaves a BLEND appellation unknown rather than asserting one grape", () => {
    // Pauillac is a Bordeaux blend. Guessing a single variety here would be worse than no guess:
    // it would make the distinct-variety rule fire on flights that are perfectly legal.
    expect(detectPrimaryVariety("Château Batailley, Pauillac, 2016. Bordeaux, France.")).toBe("unknown");
  });

  it("keeps the hand-written table winning where it disambiguates", () => {
    expect(detectPrimaryVariety("Avignonesi, Vino Nobile di Montepulciano, 2019. Tuscany, Italy.")).toBe("sangiovese");
    expect(detectPrimaryVariety("Valle Reale, Montepulciano d'Abruzzo, 2021. Abruzzo, Italy.")).toBe("montepulciano");
  });
});
