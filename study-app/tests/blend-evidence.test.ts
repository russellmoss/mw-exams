// blend-evidence.test.ts — R5 (single-variety-blend) and the enrichment evidence it runs on.
//
// Reviewer attempt #475 rejected a "different single grape varieties" stem because wine 2 was a
// three-grape blend. The row's own wine_profiles had said ["Treixadura","Loureiro","Albariño"],
// confidence "high", since the day it was generated. R5 existed and did not fire, for three
// independent reasons — each fixed here, and each pinned below:
//
//   1. It asked `w.is_blend`, which comes from the answer key, and the key reduces a blend to its
//      dominant grape. The profile was never merged in. (applyWineProfiles)
//   2. Its regex was `single grape variety`, singular, so it never matched the commonest multi-wine
//      phrasing — "different single grape VARIETIES" — which is #475's stem verbatim.
//   3. It was SOFT, so even had it fired it would not have kept the question out of the pool.
//
// The counter-cases matter as much: two REAL past papers say "single grape variety" and announce a
// blend in the same breath, and quarantining those would mean rejecting the actual exam.
import { describe, it, expect } from "vitest";
import { applyQuestionRules } from "@/lib/question-rules.mjs";
import { applyWineProfiles, type AuditWine } from "@/lib/question-validator";

type Rule = { rule: string; severity: string; detail: string };
const r5 = (questionText: string, wines: AuditWine[], paper = 1): Rule[] =>
  (applyQuestionRules({ paper, questionText, wines }) as Rule[]).filter(
    (v) => v.rule === "single-variety-blend"
  );

const wine = (slot: number, varieties: string[], blend?: string[]): AuditWine => ({
  slot,
  varieties,
  region: "r",
  ...(blend ? { is_blend: true, blend_varieties: blend } : {}),
});

describe("R5 — a single-variety stem over a blended wine", () => {
  it("is HARD for three or more grapes, and names them (attempt #475)", () => {
    // The key had resolved this wine to "Treixadura" alone; the profile is what knows better.
    const v = r5("Wines 1 and 2 are from different countries and are made from different single grape varieties.", [
      wine(1, ["Chenin Blanc"]),
      wine(2, ["Treixadura"], ["Treixadura", "Loureiro", "Albariño"]),
    ]);
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("hard");
    expect(v[0].detail).toContain("Treixadura/Loureiro/Albariño");
  });

  it("stays SOFT for two grapes — the 85%-rule varietal is legitimate", () => {
    // Most appellations let a wine labelled for one grape carry a splash of another, so two is not
    // evidence of a defect. Three is: asked to name "the single grape variety" there is no answer.
    const v = r5("Wines 1 and 2 are made from different single grape varieties.", [
      wine(1, ["Chardonnay"]),
      wine(2, ["Grenache Blanc"], ["Grenache Blanc", "Macabeu"]),
    ]);
    expect(v.map((x) => x.severity)).toEqual(["soft"]);
  });

  it("matches both inflections of the stem", () => {
    // The rule was scoped to the singular, i.e. to same-variety flights, while its whole purpose is
    // the different-variety ones.
    const wines = [wine(1, ["Chardonnay"]), wine(2, ["Grenache"], ["Grenache", "Syrah", "Mourvèdre"])];
    expect(r5("Wines 1 and 2 are made from the same single grape variety.", wines)).toHaveLength(1);
    expect(r5("Wines 1 and 2 are made from different single grape varieties.", wines)).toHaveLength(1);
  });

  it("stands down when the stem says 'predominantly'", () => {
    // The exam's own word for "the dominant grape, and a blend is fine".
    const v = r5("Wines 1 and 2 are made predominantly from a different, single grape variety.", [
      wine(1, ["Chardonnay"]),
      wine(2, ["Grenache"], ["Grenache", "Syrah", "Mourvèdre"]),
    ]);
    expect(v).toEqual([]);
  });
});

describe("R5 — real past papers that announce a blend and must not be rejected", () => {
  it("2022 P2 Q1 — 'Wine 4 is a blend of all three of these varieties'", () => {
    const stem =
      "Wines 1-3 are from different countries and are each made from a different, single grape variety. " +
      "Wine 4 is a blend of all three of these varieties.\n\nFor each wine 1-3:\n" +
      "a) Identify the grape variety and the origin as closely as possible. (3 x 15 marks)";
    const wines = [
      wine(1, ["Cabernet Sauvignon"]),
      wine(2, ["Merlot"]),
      wine(3, ["Cabernet Franc"]),
      wine(4, ["Cabernet Sauvignon"], ["Cabernet Sauvignon", "Merlot", "Cabernet Franc", "Petit Verdot"]),
    ];
    expect(r5(stem, wines, 2)).toEqual([]);
  });

  it("2019 P1 Q1 — 'They may be blends or single varieties'", () => {
    const stem =
      "Wines 1-4 are from two different countries. They may be blends or single varieties, but one " +
      "variety is common to all.\n\nWith reference to all four wines:\na) Identify the common grape variety. (20 marks)";
    const wines = [1, 2, 3, 4].map((s) => wine(s, ["Chardonnay"], ["Chardonnay", "Pinot Noir", "Pinot Meunier"]));
    expect(r5(stem, wines)).toEqual([]);
  });

  it("does not use the wide subsetSplit guard, which would swallow every two-wine flight", () => {
    // isSubsetSplit() matches any stem containing "Wines 1 and 2" — including #475's. Guarding R5 on
    // it silently disabled the rule for exactly the flights it is for.
    const v = r5("Wines 1 and 2 are from different countries and are made from different single grape varieties.", [
      wine(1, ["Chenin Blanc"]),
      wine(2, ["Treixadura"], ["Treixadura", "Loureiro", "Albariño"]),
    ]);
    expect(v).toHaveLength(1);
  });
});

describe("applyWineProfiles", () => {
  const base: AuditWine[] = [{ slot: 1, varieties: ["Treixadura"], region: "Ribeiro" }];

  it("marks a wine as a blend from the profile's grape list", () => {
    const [w] = applyWineProfiles(base, { "1": { grape_varieties: ["Treixadura", "Loureiro", "Albariño"] } });
    expect(w.is_blend).toBe(true);
    expect(w.blend_varieties).toEqual(["Treixadura", "Loureiro", "Albariño"]);
  });

  it("does NOT overwrite varieties the key already resolved", () => {
    // varieties drives R1/R2/R3 distinctness; replacing it would be a far wider change than this, and
    // the profile is not authoritative for it. The full list travels in blend_varieties instead.
    const [w] = applyWineProfiles(base, { "1": { grape_varieties: ["Treixadura", "Loureiro", "Albariño"] } });
    expect(w.varieties).toEqual(["Treixadura"]);
  });

  it("fills varieties only when the key left them empty", () => {
    const [w] = applyWineProfiles([{ slot: 1, varieties: [], region: "" }], {
      "1": { grape_varieties: ["Macabeo", "Xarel-lo"] },
    });
    expect(w.varieties).toEqual(["Macabeo", "Xarel-lo"]);
  });

  it("takes colour from the profile, which judged the wine directly", () => {
    const [w] = applyWineProfiles(base, { "1": { colour: "white" } });
    expect(w.colour).toBe("white");
  });

  it("is additive — a single-grape profile never clears a key's blend flag", () => {
    const keyed: AuditWine[] = [{ slot: 1, varieties: ["Grenache"], region: "r", is_blend: true }];
    const [w] = applyWineProfiles(keyed, { "1": { grape_varieties: ["Grenache"] } });
    expect(w.is_blend).toBe(true);
  });

  it("tolerates missing, malformed and absent-slot profiles", () => {
    expect(applyWineProfiles(base, null)[0]).toEqual(base[0]);
    expect(applyWineProfiles(base, "{}")[0]).toEqual(base[0]);
    expect(applyWineProfiles(base, { "9": { grape_varieties: ["x", "y"] } })[0]).toEqual(base[0]);
    expect(applyWineProfiles(base, { "1": { grape_varieties: "not-an-array" } })[0].is_blend).toBeUndefined();
  });
});
