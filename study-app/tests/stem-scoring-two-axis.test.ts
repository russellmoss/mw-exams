/**
 * Tests for the two-axis Stem Sniper scorer and the Hedge & Blend credit layer.
 *
 * Two jobs here:
 *   1. Pin the pre-existing "Two Marks, Not Three" behaviour so the credit refactor can't quietly
 *      change what an ordinary, unhedged answer scores. Every candidate's history depends on that.
 *   2. Cover the Hedge & Blend rules themselves — the discount ladder, the blend floor guarantee,
 *      and the server-side hedge cap that stops a shotgun answer buying credit.
 *
 * See docs/plans/stem-sniper-hedge-and-blend.md.
 */
import { describe, it, expect } from "vitest";
import {
  scoreStemSniper,
  overCapAxes,
  MAX_HEDGE,
  type AnswerKey,
  type TwoAxisPrediction,
} from "../src/lib/stem-scoring";

// One-wine key: a Barossa Shiraz. `plausible` is unused by the two-axis scorer but the type wants it.
const shiraz: AnswerKey = {
  ground_truth: [{ slot: 1, varieties: ["Shiraz"], region: "Barossa Valley", country: "Australia" }],
  plausible: [],
};

// A Bordeaux blend, Merlot-dominant — the case lead-ranking exists for.
const rightBank: AnswerKey = {
  ground_truth: [
    {
      slot: 1,
      varieties: ["Merlot", "Cabernet Franc", "Cabernet Sauvignon"],
      region: "Saint-Émilion",
      country: "France",
      is_blend: true,
    },
  ],
  plausible: [],
};

const only = (preds: TwoAxisPrediction[], key: AnswerKey) => scoreStemSniper(preds, key).grades[0];

describe("two-axis scoring (regression lock — unhedged answers must be unchanged)", () => {
  it("grape + country is a HIT worth a full mark", () => {
    const g = only([{ grape: "Shiraz", country: "Australia" }], shiraz);
    expect(g.verdict).toBe("HIT");
    expect(g.grapeCredit).toBe(1);
    expect(g.countryCredit).toBe(1);
    expect(g.points).toBe(10);
  });

  it("one axis only is a NEAR worth half", () => {
    expect(only([{ grape: "Shiraz", country: "Chile" }], shiraz).verdict).toBe("NEAR");
    expect(only([{ grape: "Nebbiolo", country: "Australia" }], shiraz).points).toBe(5);
  });

  it("neither axis is a MISS worth nothing", () => {
    const g = only([{ grape: "Nebbiolo", country: "Italy" }], shiraz);
    expect(g.verdict).toBe("MISS");
    expect(g.points).toBe(0);
  });

  it("still never marks region — naming the sub-region scores the country axis in full", () => {
    const g = only([{ grape: "Shiraz", country: "Barossa Valley" }], shiraz);
    expect(g.verdict).toBe("HIT");
    expect(g.countryCredit).toBe(1);
  });

  it("a legacy comma-containing country stays ONE answer, not a two-way hedge", () => {
    // Splitting this on the comma would retroactively dock a committed guess by a quarter.
    const g = only([{ grape: "Shiraz", country: "Barossa Valley, South Australia" }], shiraz);
    expect(g.countryCredit).toBe(1);
    expect(g.points).toBe(10);
  });

  it("naming any single component of a blend still earns full grape credit", () => {
    const g = only([{ grape: "Cabernet Franc", country: "France" }], rightBank);
    expect(g.grapeCredit).toBe(1);
    expect(g.verdict).toBe("HIT");
  });

  it("round score is still 1 per wine and matches hits + nears/2 when unhedged", () => {
    const key: AnswerKey = {
      ground_truth: [
        { slot: 1, varieties: ["Shiraz"], region: "Barossa Valley", country: "Australia" },
        { slot: 2, varieties: ["Riesling"], region: "Mosel", country: "Germany" },
      ],
      plausible: [],
    };
    const r = scoreStemSniper(
      [
        { grape: "Shiraz", country: "Australia" }, // HIT
        { grape: "Riesling", country: "France" }, // NEAR
      ],
      key
    );
    expect(r.summary).toEqual({ hits: 1, nears: 1, misses: 0 });
    expect(r.roundPoints).toBe(1.5);
    expect(r.roundMax).toBe(2);
  });
});

describe("Hedge & Blend — hedging costs precision", () => {
  it("two grapes, one right, keeps three quarters of the grape credit", () => {
    const g = only([{ grapes: ["Shiraz", "Grenache"], countries: ["Australia"] }], shiraz);
    expect(g.grapeCredit).toBe(0.75);
    expect(g.countryCredit).toBe(1);
    expect(g.verdict).toBe("HIT"); // still a hit — just not a full one
    expect(g.points).toBe(8.75);
  });

  it("three grapes, one right, keeps half", () => {
    const g = only([{ grapes: ["Shiraz", "Grenache", "Mourvedre"], countries: ["Australia"] }], shiraz);
    expect(g.grapeCredit).toBe(0.5);
  });

  it("hedges the country axis the same way", () => {
    const g = only([{ grapes: ["Shiraz"], countries: ["Australia", "South Africa"] }], shiraz);
    expect(g.countryCredit).toBe(0.75);
    expect(g.grapeCredit).toBe(1);
  });

  it("a hedge that is wholly wrong still scores zero", () => {
    const g = only([{ grapes: ["Nebbiolo", "Sangiovese"], countries: ["Italy", "Spain"] }], shiraz);
    expect(g.verdict).toBe("MISS");
    expect(g.points).toBe(0);
  });

  it("caps the hedge server-side so a shotgun answer cannot buy credit", () => {
    // The right answer sits past the cap and must be dropped, not scored at ½. The submit route
    // refuses this payload outright (see overCapAxes below); the truncation here is the backstop
    // for any other caller that reaches the scorer directly.
    const shotgun = ["Nebbiolo", "Sangiovese", "Barbera", "Shiraz", "Grenache", "Merlot"];
    expect(shotgun.length).toBeGreaterThan(MAX_HEDGE);
    const g = only([{ grapes: shotgun, countries: ["Australia"] }], shiraz);
    expect(g.grapeCredit).toBe(0);
    expect(g.grapeGuesses).toHaveLength(MAX_HEDGE);
  });

  it("de-duplicates repeated tags rather than counting them as a wider hedge", () => {
    const g = only([{ grapes: ["Shiraz", "shiraz", "SHIRAZ "], countries: ["Australia"] }], shiraz);
    expect(g.grapeGuesses).toEqual(["Shiraz"]);
    expect(g.grapeCredit).toBe(1);
  });

  it("reports which tagged answer earned the credit", () => {
    const g = only([{ grapes: ["Grenache", "Shiraz"], countries: ["Chile", "Australia"] }], shiraz);
    expect(g.matchedGrape).toBe("Shiraz");
    expect(g.matchedCountry).toBe("Australia");
  });
});

describe("Hedge & Blend — lead-ranked blends", () => {
  const chips = ["Merlot", "Cabernet Franc"];

  it("naming the dominant grape as lead is FULL credit, not a hedge", () => {
    const g = only(
      [{ grapes: chips, grapeMode: "blend", leadGrapeIndex: 0, countries: ["France"] }],
      rightBank
    );
    expect(g.grapeCredit).toBe(1);
    expect(g.points).toBe(10);
  });

  it("leading with a real-but-not-dominant component is a close call", () => {
    const g = only(
      [{ grapes: chips, grapeMode: "blend", leadGrapeIndex: 1, countries: ["France"] }],
      rightBank
    );
    expect(g.grapeCredit).toBe(0.75);
    expect(g.matchedGrape).toBe("Cabernet Franc");
  });

  it("leading with a grape that isn't in the wine still credits a correctly tagged dominant", () => {
    const g = only(
      [
        {
          grapes: ["Tempranillo", "Merlot"],
          grapeMode: "blend",
          leadGrapeIndex: 0,
          countries: ["France"],
        },
      ],
      rightBank
    );
    expect(g.grapeCredit).toBe(0.75); // right grape, wrong rank
    expect(g.matchedGrape).toBe("Merlot");
  });

  it("never scores below the plain hedge it replaces — opting in is not a trap", () => {
    for (const lead of [0, 1]) {
      const blend = only(
        [{ grapes: chips, grapeMode: "blend", leadGrapeIndex: lead, countries: ["France"] }],
        rightBank
      );
      const hedged = only([{ grapes: chips, grapeMode: "any", countries: ["France"] }], rightBank);
      expect(blend.grapeCredit).toBeGreaterThanOrEqual(hedged.grapeCredit);
    }
  });

  it("clamps an out-of-range lead index rather than scoring undefined", () => {
    const g = only(
      [{ grapes: chips, grapeMode: "blend", leadGrapeIndex: 99, countries: ["France"] }],
      rightBank
    );
    expect(g.grapeCredit).toBe(0.75); // clamped to the last chip, Cabernet Franc
    expect(g.leadGrapeIndex).toBe(1);
  });

  it("ignores blend mode on a Paper 3 style bucket, which has no varietal ranking", () => {
    const port: AnswerKey = {
      ground_truth: [
        {
          slot: 1,
          varieties: ["Touriga Nacional"],
          region: "Douro",
          country: "Portugal",
          style: "Vintage Port",
          style_tokens: ["vintage", "port"],
        },
      ],
      plausible: [],
    };
    const g = only(
      [
        {
          grapes: ["Vintage Port", "Tawny Port"],
          grapeMode: "blend",
          leadGrapeIndex: 0,
          countries: ["Portugal"],
        },
      ],
      port
    );
    expect(g.grapeCredit).toBe(0.75); // hedge ladder, not the blend path
  });
});

describe("Hedge & Blend — assignment and totals", () => {
  it("still assigns strongest-first, so a hedge cannot steal a wine from a committed answer", () => {
    const key: AnswerKey = {
      ground_truth: [
        { slot: 1, varieties: ["Shiraz"], region: "Barossa Valley", country: "Australia" },
        { slot: 2, varieties: ["Grenache"], region: "Barossa Valley", country: "Australia" },
      ],
      plausible: [],
    };
    const r = scoreStemSniper(
      [
        { grapes: ["Shiraz", "Grenache"], countries: ["Australia"] }, // hedged, could claim either
        { grape: "Shiraz", country: "Australia" }, // committed
      ],
      key
    );
    const wine1 = r.grades.find((g) => g.slot === 1)!;
    expect(wine1.grapeCredit).toBe(1); // the committed guess claimed Shiraz
    expect(r.summary.hits).toBe(2);
  });

  it("round score reflects the hedge, not just the percentage", () => {
    const r = scoreStemSniper([{ grapes: ["Shiraz", "Grenache"], countries: ["Australia"] }], shiraz);
    expect(r.roundPoints).toBe(0.88); // (0.75 + 1) / 2, rounded to two places
    expect(r.roundMax).toBe(1);
    expect(r.summary.hits).toBe(1);
  });

  it("reports a wine no prediction claimed as a blank MISS", () => {
    const key: AnswerKey = {
      ground_truth: [
        { slot: 1, varieties: ["Shiraz"], region: "Barossa Valley", country: "Australia" },
        { slot: 2, varieties: ["Riesling"], region: "Mosel", country: "Germany" },
      ],
      plausible: [],
    };
    const r = scoreStemSniper([{ grape: "Shiraz", country: "Australia" }], key);
    const wine2 = r.grades.find((g) => g.slot === 2)!;
    expect(wine2.verdict).toBe("MISS");
    expect(wine2.grapeGuesses).toEqual([]);
    expect(wine2.points).toBe(0);
  });
});

describe("over-cap detection (the submit route's 400 gate)", () => {
  it("flags an axis carrying more than MAX_HEDGE answers", () => {
    expect(overCapAxes({ grapes: ["a", "b", "c", "d"], countries: ["France"] })).toEqual(["grape"]);
    expect(overCapAxes({ grapes: ["a"], countries: ["a", "b", "c", "d"] })).toEqual(["country"]);
    expect(
      overCapAxes({ grapes: ["a", "b", "c", "d"], countries: ["a", "b", "c", "d"] })
    ).toEqual(["grape", "country"]);
  });

  it("passes anything the card can actually produce", () => {
    expect(overCapAxes({ grape: "Shiraz", country: "Australia" })).toEqual([]);
    expect(overCapAxes({ grapes: ["a", "b", "c"], countries: ["x", "y", "z"] })).toEqual([]);
    expect(overCapAxes({})).toEqual([]);
  });

  it("counts distinct answers, so duplicates and blanks never trip the gate", () => {
    // Four entries, two real — the scorer would read this as a two-way hedge, so rejecting it
    // would refuse a legitimate answer.
    expect(overCapAxes({ grapes: ["Shiraz", "shiraz ", "  ", "Grenache"] })).toEqual([]);
  });

  it("leaves a legacy comma-containing scalar alone — it is one answer, not four", () => {
    expect(overCapAxes({ country: "Barossa Valley, South Australia, Australia, Oz" })).toEqual([]);
  });
});
