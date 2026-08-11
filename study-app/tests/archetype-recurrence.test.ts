// archetype-recurrence.test.ts — the recurring-archetype guard.
//
// Feedback cluster (cross-paper, 7 validated signals — fb_613/612/609/606/560/521 P1, fb_564 P2):
// Mike Juergens rejected banked questions not because a WINE repeated (the dedup guards catch that)
// but because a question SHAPE repeated far above real MW exam frequency — "a Soave Classico against
// neutral Italian whites, same country / different regions" and "a Riesling from Germany vs one from
// Australia", again and again.
//
// The guard keys on an ARCHETYPE = paper + wine count + stem-family id + the normalised
// variety|region of the flight's highest-classicism (banker) wine, and enforces two rules:
//   1. reject a candidate whose archetype ALREADY occurs more than twice in the recent-40 window;
//   2. cap any single anchor appellation (e.g. Soave) at 3 appearances per rolling 40, regardless of
//      stem family.
// Exercised here as pure functions — no model call, no database.
import { describe, it, expect } from "vitest";
import {
  computeArchetypeKey,
  archetypeAnchorAppellation,
  archetypeSelectionRejection,
  ARCHETYPE_MAX_REPEATS,
  ANCHOR_MAX_PER_WINDOW,
} from "../src/lib/question-engine";
import { deriveStemFamily } from "../src/lib/db";
// Side-effect: register the appellation resolver so a Soave/Chablis label resolves its variety, the
// same way the engine does at generation time.
import "../src/lib/appellation-resolver";

const wine = (fullText: string) => ({ slot: 0, fullText });

// A same-country / different-regions Italian flight anchored on a Soave Classico banker, with two
// neutral non-banker Italian white curveballs — the exact shape the reviewer flagged repeatedly.
const SOAVE = wine("Pieropan, Soave Classico, Garganega, Veneto, Italy (12.5%) 2021");
const GAVI = wine("La Scolca, Gavi di Gavi, Cortese, Piedmont, Italy (12%) 2022");
const VERDICCHIO = wine("Bucci, Verdicchio dei Castelli di Jesi, Marche, Italy (13%) 2021");
const LUGANA = wine("Ca' dei Frati, Lugana, Turbiana, Lombardy, Italy (13%) 2022");

// A same-country / different-regions FRENCH flight anchored on a Chablis banker — a DIFFERENT anchor.
const CHABLIS = wine("Domaine William Fèvre, Chablis 1er Cru, Chardonnay, Burgundy, France (13%) 2020");
const MUSCADET = wine("Domaine de la Pépière, Muscadet Sèvre et Maine, Loire, France (12%) 2021");
const PICPOUL = wine("Domaine Félines Jourdan, Picpoul de Pinet, Languedoc, France (13%) 2022");

const SCDR_STEM =
  "Wines 1 to 3 are from the same country but from three different regions. Each is made from a different, single grape variety.";
const SAME_VARIETY_STEM = "Wines 1 and 2 are made from the same single grape variety.";

describe("deriveStemFamily maps the reviewer's cluster onto the four families", () => {
  it("same country / different regions", () => {
    expect(deriveStemFamily(SCDR_STEM)).toBe("same-country/different-regions");
    expect(
      deriveStemFamily("Wines 1 and 2 are from the same country but from different regions.")
    ).toBe("same-country/different-regions");
  });
  it("same region / different varieties (fb_609)", () => {
    expect(
      deriveStemFamily(
        "Wines 1 and 2 are from the same region of origin but are made from two different single grape varieties."
      )
    ).toBe("same-region/different-varieties");
  });
  it("different countries / different varieties (fb_564)", () => {
    expect(
      deriveStemFamily(
        "Wines 1 and 2 are from different countries and are each made from a different, single grape variety."
      )
    ).toBe("different-countries/different-varieties");
  });
  it("same variety / different countries (fb_521)", () => {
    expect(deriveStemFamily(SAME_VARIETY_STEM)).toBe("same-variety/different-countries");
  });
});

describe("the Soave flight anchors on the Soave Classico banker", () => {
  it("picks Soave as the anchor appellation over the neutral curveballs", () => {
    expect(archetypeAnchorAppellation([SOAVE, GAVI, VERDICCHIO])).toBe("soave");
  });
});

describe("(3) archetypeKey is stable across wine-order permutations", () => {
  it("the key does not depend on the order the wines are listed in", () => {
    const a = computeArchetypeKey(1, [SOAVE, GAVI, VERDICCHIO], SCDR_STEM);
    const b = computeArchetypeKey(1, [VERDICCHIO, GAVI, SOAVE], SCDR_STEM);
    const c = computeArchetypeKey(1, [GAVI, SOAVE, VERDICCHIO], SCDR_STEM);
    expect(a).toBe(b);
    expect(a).toBe(c);
    expect(archetypeAnchorAppellation([SOAVE, GAVI, VERDICCHIO])).toBe(
      archetypeAnchorAppellation([VERDICCHIO, GAVI, SOAVE])
    );
  });
});

// Build a recent-window entry the way the engine + db do: the archetype key + anchor appellation of a
// flight/stem/paper.
const entry = (paper: number, wines: { slot: number; fullText: string }[], stem: string) => ({
  archetypeKey: computeArchetypeKey(paper, wines, stem),
  anchorAppellation: archetypeAnchorAppellation(wines),
});

describe("(1) a 4th same-country/different-regions + Soave P1 question in the window is rejected", () => {
  it("rejects the candidate once its archetype already occurs more than twice", () => {
    // Three earlier P1 Soave-anchored same-country/different-regions flights (different curveballs, so
    // the wine-level dedup would pass all of them). Their archetype key is identical.
    const recent = [
      entry(1, [SOAVE, GAVI, VERDICCHIO], SCDR_STEM),
      entry(1, [SOAVE, GAVI, LUGANA], SCDR_STEM),
      entry(1, [SOAVE, VERDICCHIO, LUGANA], SCDR_STEM),
    ];
    expect(recent.filter((r) => r.archetypeKey === recent[0].archetypeKey)).toHaveLength(3);
    expect(ARCHETYPE_MAX_REPEATS).toBe(2);

    const candidate = entry(1, [SOAVE, GAVI, VERDICCHIO], SCDR_STEM);
    const reason = archetypeSelectionRejection(candidate, recent);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/archetype|anchor/i);
  });
});

describe("(2) the same stem family with a different anchor region is accepted", () => {
  it("accepts a France/Chablis same-country/different-regions flight against a Soave-heavy window", () => {
    const recent = [
      entry(1, [SOAVE, GAVI, VERDICCHIO], SCDR_STEM),
      entry(1, [SOAVE, GAVI, LUGANA], SCDR_STEM),
      entry(1, [SOAVE, VERDICCHIO, LUGANA], SCDR_STEM),
    ];
    // Same stem FAMILY (same-country/different-regions) but a different anchor (Chablis, not Soave).
    const candidate = entry(1, [CHABLIS, MUSCADET, PICPOUL], SCDR_STEM);
    expect(deriveStemFamily(SCDR_STEM)).toBe("same-country/different-regions");
    expect(candidate.anchorAppellation).toBe("chablis");
    expect(candidate.archetypeKey).not.toBe(recent[0].archetypeKey);
    expect(archetypeSelectionRejection(candidate, recent)).toBeNull();
  });
});

describe("the anchor cap crosses stem families", () => {
  it("caps Soave at 3 per window even when no single archetype is over-represented", () => {
    // Two same-country/different-regions + one same-variety, all anchored on Soave. No single
    // archetype occurs more than twice, but the Soave anchor appears three times.
    const recent = [
      entry(1, [SOAVE, GAVI, VERDICCHIO], SCDR_STEM),
      entry(1, [SOAVE, GAVI, LUGANA], SCDR_STEM),
      entry(1, [SOAVE, GAVI], SAME_VARIETY_STEM),
    ];
    const key0 = recent[0].archetypeKey;
    expect(recent.filter((r) => r.archetypeKey === key0)).toHaveLength(2); // not over the archetype cap
    expect(recent.filter((r) => r.anchorAppellation === "soave")).toHaveLength(ANCHOR_MAX_PER_WINDOW);

    const candidate = entry(1, [SOAVE, GAVI], SAME_VARIETY_STEM);
    const reason = archetypeSelectionRejection(candidate, recent);
    expect(reason).toBeTruthy();
    expect(reason).toMatch(/anchor appellation "soave"/i);
  });
});
