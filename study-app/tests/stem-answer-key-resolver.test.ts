// stem-answer-key-resolver.test.ts — variety resolution priority in the answer-key builder.
//
// The 2026-08-05 mismatch sweep found the enrichment profile winning over better evidence: a
// "Saumur Blanc" profiled as Cabernet Franc keyed a white wine as a red grape, a "Lagrein Riserva"
// profiled as Pinot Grigio out-ranked the grape printed on the label, and 31 of 36 answer↔key
// identity flags in the corpus audit traced back to keys, not answers. These pin the three fixes:
// the colour-conflict veto (paper-derived colours only), the explicit-label-grape assertion, and
// the untrusted-P3-colour rule (a producer named "Mas Blanc" must not make a Banyuls white).
import { describe, it, expect } from "vitest";
import { createAnswerKeyBuilder, conflictsWithColour } from "../src/lib/stem-answer-key.mjs";

const DATA = {
  variety_lexicon: {
    varieties: ["Chenin Blanc", "Cabernet Franc", "Lagrein", "Pinot Grigio", "Grenache"],
    synonyms: { "grenache noir": "Grenache" },
  },
  appellation_varieties: {
    "saumur blanc": { country: "France", region: "Loire", varieties: ["Chenin Blanc"] },
    saumur: { country: "France", region: "Loire", varieties: ["Cabernet Franc"] },
    banyuls: { country: "France", region: "Roussillon", varieties: ["Grenache Noir"] },
  },
  stem_proprietary_blends: { entries: [] },
  stem_style_lexicon: { styles: [] },
  mock_wine_bank: [],
};

// The .mjs factory's return type is inferred loosely; type the slice these tests read.
interface BuiltKey {
  ground: { slot: number; varieties: string[]; region: string; country: string }[];
  source: Record<number, string>;
  ok: boolean;
  problems: string[];
}
const builder = createAnswerKeyBuilder(DATA) as unknown as { buildKeyForRow: (r: unknown) => BuiltKey };

const row = (paper: number, fullText: string, profileGrapes: string[] | null) => ({
  paper,
  question_text: "a) Identify the grape variety.",
  wines: [{ slot: 1, fullText }],
  wine_profiles: { "1": profileGrapes ? { grape_varieties: profileGrapes } : {} },
});

describe("conflictsWithColour", () => {
  it.each([
    [["Cabernet Franc"], "white", true], // all-red on a white
    [["Chardonnay"], "red", true], // all-white on a red
    [["Syrah", "Viognier"], "red", false], // co-ferment: one grape matches
    [["Rebula"], "white", false], // unknown grape never vetoes
    [["Cabernet Franc"], "unknown", false], // unknown colour never vetoes
  ])("%j vs %s -> %s", (vars, col, expected) => {
    expect(conflictsWithColour(vars, col)).toBe(expected);
  });
});

describe("resolveVariety priorities (via buildKeyForRow)", () => {
  it("colour-vetoes a red-grape profile on a Paper 1 white and falls to the white appellation", () => {
    // The real defect: Saumur Blanc enriched as Cabernet Franc. P1 colour is trusted (white), the
    // profile is all-red -> vetoed -> "saumur blanc" appellation entry wins.
    const key = builder.buildKeyForRow(
      row(1, "Domaine des Roches Neuves, Saumur Blanc, 2022. Loire Valley, France. (13%)", ["Cabernet Franc"])
    );
    expect(key.ground[0].varieties).toEqual(["Chenin Blanc"]);
    expect(key.source[1]).toBe("appellation");
    expect(key.ok).toBe(true); // the vetoed profile must not count as a variety/profile mismatch
  });

  it("asserts the grape printed on the label over a contradicting profile", () => {
    // "Lagrein Riserva" profiled as Pinot Grigio: the label conflict vetoes the profile, and the
    // label's own grape is asserted rather than falling through to an appellation default.
    const key = builder.buildKeyForRow(
      row(2, "Muri-Gries, Lagrein Riserva, 2021. Alto Adige, Italy. (13.5%)", ["Pinot Grigio"])
    );
    expect(key.ground[0].varieties).toEqual(["Lagrein"]);
    expect(key.source[1]).toBe("label");
  });

  it("keeps a consistent profile even when an appellation entry also matches", () => {
    const key = builder.buildKeyForRow(
      row(1, "Thierry Germain, Saumur Blanc Les Memoires, 2021. Loire Valley, France. (13.5%)", ["Chenin Blanc"])
    );
    expect(key.ground[0].varieties).toEqual(["Chenin Blanc"]);
    expect(key.source[1]).toBe("profile");
  });

  it("does NOT let a P3 label-guessed colour veto — 'Mas Blanc' is a producer, not a white wine", () => {
    // colour() reads " blanc " in the producer name and guesses white; the Banyuls appellation is
    // Grenache Noir (red). P3 colours are untrusted, so the resolution must survive.
    const key = builder.buildKeyForRow(
      row(3, "Domaine du Mas Blanc, Banyuls Rimage, 2020. Roussillon, France. (16%)", null)
    );
    expect(key.ground[0].varieties).toEqual(["Grenache Noir"]);
    expect(key.source[1]).toBe("appellation");
  });
});
