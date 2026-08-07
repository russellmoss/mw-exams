// flight-size-policy.test.ts — flight-size sampler + single-wine curveball ID suppression.
//
// Two cross-paper reviewer fault clusters (fb_73, fb_98, fb_354, fb_355):
//   1. The generator over-used 4-wine flights. selectFlightSize now draws from an explicit,
//      per-paper-tunable weight table (HISTORIC_FLIGHT_SIZE_WEIGHTS) and applies a rolling cap so
//      4-wine flights can never dominate a paper's recent output.
//   2. It set ID-focused single-wine "curveball" flights — which the exam never does. A single
//      curveball must suppress identification (shouldSuppressIdentification) and the engine rejects
//      any single-wine curveball question that still carries an identify-variety/origin sub-part
//      (validateSingleWineIdentification). A single BANKER may keep its ID parts.
import { describe, it, expect } from "vitest";
import {
  selectFlightSize,
  shouldSuppressIdentification,
  validateSingleWineIdentification,
  questionAsksIdentification,
  HISTORIC_FLIGHT_SIZE_WEIGHTS,
  FOUR_WINE_ROLLING_CAP,
} from "../src/lib/question-engine";
import type { AuditWine } from "../src/lib/question-validator";

// Deterministic RNG (mulberry32) so the sampler test is seeded and reproducible.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("selectFlightSize — seeded sampler over the historic weight table", () => {
  it("produces a 4-wine share within +/- 7pts of the configured weight (paper 3)", () => {
    const weights = HISTORIC_FLIGHT_SIZE_WEIGHTS["3"];
    const total = Object.values(weights).reduce((s, w) => s + w, 0);
    const configuredFourShare = weights[4] / total; // 0.40

    const rng = mulberry32(0xc0ffee);
    const N = 200;
    const recent: number[] = []; // rolling window, most-recent first
    let fours = 0;
    for (let i = 0; i < N; i++) {
      const size = selectFlightSize(3, { rng, recentSizes: recent });
      if (size === 4) fours++;
      recent.unshift(size);
      recent.length = Math.min(recent.length, 20);
    }
    const share = fours / N;
    expect(Math.abs(share - configuredFourShare)).toBeLessThanOrEqual(0.07);
  });

  it("never lets 4-wine flights exceed the rolling cap of the recent window", () => {
    // A window already at the cap must not accept another 4.
    const rng = () => 0.99; // always lands on the top (4-wine) weight without the cap
    const cappedWindow = Array.from({ length: 20 }, (_, i) => (i < 10 ? 4 : 2)); // 50% fours
    const size = selectFlightSize(3, { rng, recentSizes: cappedWindow });
    expect(size).not.toBe(4);
  });

  it("honours a paper's tunable weights (papers 1 & 2 never draw a single wine)", () => {
    const rng = mulberry32(42);
    for (const paper of [1, 2]) {
      for (let i = 0; i < 100; i++) {
        expect(selectFlightSize(paper, { rng })).not.toBe(1);
      }
    }
  });

  it("can draw a single-wine flight on paper 3", () => {
    const rng = mulberry32(7);
    let sawSingle = false;
    for (let i = 0; i < 500 && !sawSingle; i++) {
      if (selectFlightSize(3, { rng }) === 1) sawSingle = true;
    }
    expect(sawSingle).toBe(true);
  });

  it("exposes a 50% rolling cap constant", () => {
    expect(FOUR_WINE_ROLLING_CAP).toBe(0.5);
  });
});

const CURVEBALL_WINE: AuditWine = {
  slot: 1,
  varieties: ["Furmint"],
  region: "Somló",
  country: "Hungary",
  fullText: "Somló Furmint, Hungary",
};
const BANKER_WINE: AuditWine = {
  slot: 1,
  varieties: ["Riesling"],
  region: "Mosel",
  country: "Germany",
  fullText: "Mosel Riesling Kabinett, Germany",
};

const ID_STEM =
  "Wine 1 is made from a single grape variety.\na) Identify the grape variety and region of origin as closely as possible. (8 marks)\nb) Comment on the method of production. (17 marks)";
const NO_ID_STEM =
  "Wine 1 is an unusual wine.\na) Comment on the style of the wine. (6 marks)\nb) Discuss the method of production. (7 marks)\nc) Assess the quality and commercial positioning. (12 marks)";

describe("shouldSuppressIdentification — single-wine curveball vs banker", () => {
  it("suppresses ID for a single curveball wine", () => {
    expect(shouldSuppressIdentification(1, { curveball: "high" })).toBe(true);
    expect(shouldSuppressIdentification(1, { curveball: "medium" })).toBe(true);
    expect(shouldSuppressIdentification(1, { isBanker: false })).toBe(true);
    expect(shouldSuppressIdentification(1)).toBe(true); // unknown fails safe to suppress
  });

  it("does NOT suppress ID for a single banker wine", () => {
    expect(shouldSuppressIdentification(1, { isBanker: true })).toBe(false);
    expect(shouldSuppressIdentification(1, { curveball: "low" })).toBe(false);
  });

  it("never applies to multi-wine flights", () => {
    expect(shouldSuppressIdentification(2, { curveball: "high" })).toBe(false);
    expect(shouldSuppressIdentification(4, {})).toBe(false);
  });
});

describe("validateSingleWineIdentification — engine backstop", () => {
  it("rejects a single-wine curveball flight that keeps an identify-variety/origin sub-part", () => {
    expect(questionAsksIdentification(ID_STEM)).toBe(true);
    const check = validateSingleWineIdentification(ID_STEM, [CURVEBALL_WINE]);
    expect(check.valid).toBe(false);
    expect(check.violations.length).toBeGreaterThan(0);
  });

  it("accepts a single-wine curveball flight that suppresses identification", () => {
    const check = validateSingleWineIdentification(NO_ID_STEM, [CURVEBALL_WINE]);
    expect(check.valid).toBe(true);
  });

  it("accepts a single-wine BANKER flight that keeps its ID parts", () => {
    const check = validateSingleWineIdentification(ID_STEM, [BANKER_WINE]);
    expect(check.valid).toBe(true);
  });

  it("does not fire on flights of two or more wines", () => {
    const check = validateSingleWineIdentification(ID_STEM, [CURVEBALL_WINE, CURVEBALL_WINE]);
    expect(check.valid).toBe(true);
  });
});
