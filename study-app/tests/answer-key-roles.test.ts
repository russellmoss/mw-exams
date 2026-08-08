// answer-key-roles.test.ts — keying each wine's banker/curveball ROLE, end to end.
//
// This is what promotes validateAnswerKeyClaims Rule 1 from a review flag to an enforced correction.
// The rule only enforces against a role the ANSWER KEY stores, so three links all have to hold:
//
//   1. parseCurveballSlots       reads the generator's declaration out of its metadata
//   2. buildKeyForRow            stamps role + role_source onto the ground truth
//   3. isBanker                  is the fallback for everything generated before migration 065,
//                                and the source the backfill script stamps as role_source='derived'
//
// The load-bearing distinction throughout is NULL vs []. "The generator didn't say" must never become
// "the generator said there are no curveballs": the second is enforced, and defaulting to it would key
// every wine a banker and turn every legitimate mention of a curveball in a debrief into a rewrite.
import { describe, it, expect } from "vitest";
import { parseCurveballSlots } from "../src/lib/question-engine";
import { isBanker, answerKeyFlight } from "../src/lib/question-validator";
import { createAnswerKeyBuilder } from "../src/lib/stem-answer-key.mjs";

describe("parseCurveballSlots", () => {
  it("reads a single declared slot", () => {
    expect(parseCurveballSlots("- CurveballSlots: 2\n- CurveballLevel: medium", 4)).toEqual([2]);
  });

  it("reads several, deduped and sorted", () => {
    expect(parseCurveballSlots("CurveballSlots: [4, 2, 2]", 4)).toEqual([2, 4]);
  });

  it("treats an explicit None as a positive all-anchor declaration", () => {
    expect(parseCurveballSlots("CurveballSlots: None", 3)).toEqual([]);
  });

  it("returns null when the line is absent — NOT an empty array", () => {
    // The whole point: absent means undeclared, so the role stays derived and only flags.
    expect(parseCurveballSlots("- CurveballLevel: low", 3)).toBeNull();
  });

  it("returns null when the bracketed instruction survives into the output", () => {
    const leaked = "- CurveballSlots: [the wine NUMBER(S) that are curveballs, comma-separated]";
    expect(parseCurveballSlots(leaked, 4)).toBeNull();
  });

  it("returns null when it says something unusable rather than inferring none", () => {
    expect(parseCurveballSlots("CurveballSlots: the Sylvaner", 4)).toBeNull();
  });

  it("drops slots outside the flight instead of trusting them", () => {
    // A hallucinated "wine 7" in a 4-wine flight is not evidence about any real wine.
    expect(parseCurveballSlots("CurveballSlots: 2, 7", 4)).toEqual([2]);
    expect(parseCurveballSlots("CurveballSlots: 7, 9", 4)).toBeNull();
  });
});

describe("isBanker — the appellation-only signals are colour-blind without an exclude", () => {
  // Attempt 249: the debrief called the Rayas CdP BLANC "the classic curveball here" and Rule 1 fired,
  // because /chateauneuf/ carries no variety gate and was calibrated on the rouge. CdP Blanc is a few
  // percent of the appellation. A variety gate cannot fix this — the white's grapes include Grenache
  // Blanc, and /grenache/ matches that.
  const cdp = (label: string, varieties: string[]) => ({
    slot: 1,
    varieties,
    region: "Southern Rhône",
    country: "France",
    fullText: label,
  });

  it("keeps Châteauneuf-du-Pape rouge a banker", () => {
    expect(isBanker(cdp("Château Rayas, Châteauneuf-du-Pape, 2020. Southern Rhône, France.", ["Grenache"]))).toBe(true);
  });

  it("no longer keys Châteauneuf-du-Pape Blanc a banker", () => {
    expect(
      isBanker(cdp("Château Rayas, Châteauneuf-du-Pape Blanc, 2020. Southern Rhône, France.", ["Grenache Blanc", "Clairette"]))
    ).toBe(false);
  });

  it("still keys Condrieu Viognier a banker (reviewer calibration, PR #112)", () => {
    expect(
      isBanker({ slot: 1, varieties: ["Viognier"], region: "Condrieu, Northern Rhône", country: "France" })
    ).toBe(true);
  });
});

describe("buildKeyForRow — stamps the declared role onto the ground truth", () => {
  const build = () =>
    createAnswerKeyBuilder({
      variety_lexicon: { varieties: ["Pinot Gris", "Sylvaner"], synonyms: {} },
      appellation_varieties: {
        alsace: { country: "France", region: "Alsace", varieties: ["Pinot Gris"] },
      },
      stem_proprietary_blends: { entries: [] },
      stem_style_lexicon: { styles: [] },
      mock_wine_bank: [],
    }).buildKeyForRow;

  const row = (curveball_slots: number[] | null | undefined) => ({
    paper: 1,
    question_text: "Wines 1 and 2 are from the same region.",
    wines: [
      { slot: 1, fullText: "Domaine Zind-Humbrecht, Pinot Gris, 2020. Alsace, France. (13.5%)" },
      { slot: 2, fullText: "Domaine Ostertag, Sylvaner, 2021. Alsace, France. (12.5%)" },
    ],
    wine_profiles: {},
    ...(curveball_slots === undefined ? {} : { curveball_slots }),
  });

  // The builder is .mjs, so TS infers its bucket shape from the literal and does not know about the
  // fields added conditionally. Read the ground through this view rather than annotating each callback.
  type Keyed = { slot: number; role?: string; role_source?: string };
  const groundOf = (curveball_slots: number[] | null | undefined): Keyed[] =>
    build()(row(curveball_slots)).ground as unknown as Keyed[];

  it("marks the declared slot a curveball and every other wine a banker", () => {
    const ground = groundOf([2]);
    expect(ground.map((g) => [g.slot, g.role])).toEqual([
      [1, "banker"],
      [2, "curveball"],
    ]);
    expect(ground.every((g) => g.role_source === "generator")).toBe(true);
  });

  it("marks every wine a banker on an explicit all-anchor declaration", () => {
    expect(groundOf([]).map((g) => g.role)).toEqual(["banker", "banker"]);
  });

  it("stamps NO role when the generator did not declare one", () => {
    for (const undeclared of [null, undefined]) {
      const ground = groundOf(undeclared);
      expect(ground.every((g) => g.role === undefined)).toBe(true);
      expect(ground.every((g) => g.role_source === undefined)).toBe(true);
    }
  });
});

describe("answerKeyFlight carries the role through to the rule", () => {
  it("preserves role and derives nothing of its own", () => {
    const flight = answerKeyFlight(
      [
        { slot: 1, varieties: ["Pinot Gris"], region: "Alsace", role: "banker" },
        { slot: 2, varieties: ["Sylvaner"], region: "Alsace", role: "curveball" },
      ],
      [{ slot: 1, fullText: "Alsace Pinot Gris" }, { slot: 2, fullText: "Alsace Sylvaner" }]
    );
    expect(flight.map((w) => w.role)).toEqual(["banker", "curveball"]);
  });

  it("leaves role undefined when the stored key has none, so Rule 1 stays soft", () => {
    const flight = answerKeyFlight([{ slot: 1, varieties: ["Sylvaner"], region: "Alsace" }], []);
    expect(flight[0].role).toBeUndefined();
  });
});
