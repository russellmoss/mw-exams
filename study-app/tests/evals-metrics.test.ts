import { describe, it, expect } from "vitest";
import {
  bucketise,
  cohensKappa,
  correctedQuantile,
  countBy,
  noiseFloorFor,
  normalise,
  quantile,
  seededRandom,
  shuffled,
  significanceThreshold,
  stdDev,
  tCritical95,
  totalVariationDistance,
  wilsonInterval,
} from "../evals/metrics";

/**
 * The scoreboard's arithmetic. Every gating decision in the eval loop is made on these functions,
 * so a silent error here would not produce a visibly wrong answer — it would produce a confidently
 * wrong one, which is worse. Hence: known-value tests, not smoke tests.
 */

describe("totalVariationDistance", () => {
  it("is 0 for identical distributions", () => {
    const d = normalise({ a: 3, b: 1 });
    expect(totalVariationDistance(d, d)).toBe(0);
  });

  it("is 1 for disjoint support — the maximum", () => {
    expect(totalVariationDistance({ a: 1 }, { b: 1 })).toBe(1);
  });

  it("reads as 'share of mass in the wrong bucket'", () => {
    // 60/40 vs 50/50 — 10 points of mass sit in the wrong bucket.
    expect(totalVariationDistance({ a: 0.6, b: 0.4 }, { a: 0.5, b: 0.5 })).toBeCloseTo(0.1, 10);
  });

  it("charges full mass for a bucket the generated batch never produces", () => {
    // Corpus has 5-wine flights at 20%; generation never makes one. That must cost, not smooth away.
    const ref = normalise({ "2": 4, "5": 1 });
    const gen = normalise({ "2": 10 });
    expect(totalVariationDistance(gen, ref)).toBeCloseTo(0.2, 10);
  });

  it("is symmetric", () => {
    const a = normalise({ x: 2, y: 5, z: 1 });
    const b = normalise({ x: 6, y: 1 });
    expect(totalVariationDistance(a, b)).toBeCloseTo(totalVariationDistance(b, a), 12);
  });
});

describe("normalise / countBy", () => {
  it("normalises to 1", () => {
    const d = normalise(countBy([1, 2, 2, 3], (n) => String(n)));
    expect(Object.values(d).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(d["2"]).toBeCloseTo(0.5, 12);
  });

  it("drops nulls rather than bucketing them", () => {
    expect(countBy([1, 2, 3], (n) => (n === 2 ? null : "k"))).toEqual({ k: 2 });
  });

  it("returns {} for an empty input instead of dividing by zero", () => {
    expect(normalise({})).toEqual({});
  });
});

describe("seeded randomness", () => {
  it("is reproducible — the noise floor must not move between runs", () => {
    const a = Array.from({ length: 5 }, seededRandom(42));
    const b = Array.from({ length: 5 }, seededRandom(42));
    expect(a).toEqual(b);
  });

  it("differs across seeds", () => {
    expect(Array.from({ length: 5 }, seededRandom(1))).not.toEqual(
      Array.from({ length: 5 }, seededRandom(2))
    );
  });

  it("shuffles without losing or duplicating elements", () => {
    const src = Array.from({ length: 50 }, (_, i) => i);
    const out = shuffled(src, seededRandom(7));
    expect(out.slice().sort((a, b) => a - b)).toEqual(src);
    expect(out).not.toEqual(src); // vanishingly unlikely to be identity at n=50
  });
});

describe("noise floor", () => {
  it("is ~0 when every value is identical — no spread, nothing to mistake for drift", () => {
    expect(noiseFloorFor(Array(100).fill("same"), 30).cut).toBe(0);
  });

  it("is > 0 for a genuinely varied corpus — identical distributions still differ when sampled", () => {
    const floor = noiseFloorFor(Array.from({ length: 160 }, (_, i) => `b${i % 5}`), 40);
    expect(floor.cut).toBeGreaterThan(0);
    expect(floor.median).toBeLessThanOrEqual(floor.cut);
  });

  it("GROWS as the batch shrinks — the whole point of calibrating to sample size", () => {
    const values = Array.from({ length: 200 }, (_, i) => `b${i % 6}`);
    expect(noiseFloorFor(values, 10).cut).toBeGreaterThan(noiseFloorFor(values, 100).cut);
  });

  it("the corrected cut is ABOVE the raw p95 once several tests run together", () => {
    const values = Array.from({ length: 200 }, (_, i) => `b${i % 6}`);
    const floor = noiseFloorFor(values, 40, { comparisons: 15 });
    expect(floor.cut).toBeGreaterThan(floor.p95);
    expect(floor.quantile).toBeCloseTo(1 - 0.05 / 15, 6);
  });

  it("holds the FAMILY-WISE false-drift rate near 5% across 15 simultaneous tests", () => {
    // The defect this replaces: 15 axes each cut at p95 gives 1 − 0.95^15 = 53.7% — over half of
    // healthy runs reported as REGRESS. A gate that cries wolf that often gets re-run until green.
    const COMPARISONS = 15;
    const values = Array.from({ length: 162 }, (_, i) => `b${i % 5}`);
    const reference = normalise(countBy(values, (v) => v));
    const floor = noiseFloorFor(values, 40, { comparisons: COMPARISONS, seed: 4242 });

    // Draw honest batches the same way the floor models them (i.i.d. from the corpus distribution).
    const rand = seededRandom(31337);
    const runs = 400;
    let familyFalseAlarms = 0;
    for (let r = 0; r < runs; r++) {
      let anyTripped = false;
      for (let c = 0; c < COMPARISONS; c++) {
        const draw: Record<string, number> = {};
        for (let j = 0; j < 40; j++) {
          const v = values[Math.floor(rand() * values.length)];
          draw[v] = (draw[v] ?? 0) + 1;
        }
        if (totalVariationDistance(normalise(draw), reference) > floor.cut) anyTripped = true;
      }
      if (anyTripped) familyFalseAlarms++;
    }
    expect(familyFalseAlarms / runs).toBeLessThan(0.15);
  });

  it("does NOT use a subsample of the reference — that bias pulls the floor too low", () => {
    // Drawing 60 of 162 and scoring against the same 162 makes sample and reference ~37% shared,
    // correlating them and shrinking the measured TVD. A too-low floor means false REGRESS.
    const values = Array.from({ length: 162 }, (_, i) => `b${i % 5}`);
    const reference = normalise(countBy(values, (v) => v));
    const rand = seededRandom(77);
    const subsampleDists: number[] = [];
    for (let i = 0; i < 400; i++) {
      const s = shuffled(values, rand).slice(0, 60);
      subsampleDists.push(totalVariationDistance(normalise(countBy(s, (v) => v)), reference));
    }
    subsampleDists.sort((a, b) => a - b);
    const biasedP95 = quantile(subsampleDists, 0.95);
    const honest = noiseFloorFor(values, 60, { seed: 77 });
    expect(honest.p95).toBeGreaterThan(biasedP95);
  });
});

describe("significance thresholds", () => {
  it("matches published t critical values", () => {
    expect(tCritical95(2)).toBeCloseTo(4.303, 3);
    expect(tCritical95(4)).toBeCloseTo(2.776, 3);
    expect(tCritical95(100)).toBeCloseTo(1.96, 3);
  });

  it("is far above the naive 2σ at small baselines — the defect this replaces", () => {
    // At n=3 the true threshold is ~4.97σ; calling 2σ significant there is really an ~82% test.
    expect(significanceThreshold(3)).toBeGreaterThan(4.9);
    expect(significanceThreshold(5)).toBeGreaterThan(3);
    expect(significanceThreshold(5)).toBeLessThan(3.1);
  });

  it("relaxes toward ~2 as the baseline grows", () => {
    expect(significanceThreshold(30)).toBeLessThan(2.2);
    expect(significanceThreshold(3)).toBeGreaterThan(significanceThreshold(10));
  });

  it("is Infinity below 2 runs — nothing can be significant against a single number", () => {
    expect(significanceThreshold(1)).toBe(Infinity);
  });
});

describe("correctedQuantile", () => {
  it("is the raw quantile for a single test", () => {
    expect(correctedQuantile(0.05, 1)).toBeCloseTo(0.95, 10);
  });

  it("tightens per-test alpha as tests multiply", () => {
    expect(correctedQuantile(0.05, 15)).toBeCloseTo(1 - 0.05 / 15, 10);
    expect(correctedQuantile(0.05, 15)).toBeGreaterThan(correctedQuantile(0.05, 5));
  });
});

describe("wilsonInterval", () => {
  it("brackets the point estimate", () => {
    const { lo, hi } = wilsonInterval(40, 50);
    expect(lo).toBeLessThan(0.8);
    expect(hi).toBeGreaterThan(0.8);
  });

  it("stays inside [0,1] where the normal approximation would not", () => {
    // 49/50 = 0.98; normal approx gives an upper bound > 1.
    const { lo, hi } = wilsonInterval(49, 50);
    expect(hi).toBeLessThanOrEqual(1);
    expect(lo).toBeGreaterThan(0);
  });

  it("is wide at the sample size the judge gate actually runs at (~50 negatives)", () => {
    // The plan gates on the LOWER bound precisely because this interval is this wide.
    const { lo, hi } = wilsonInterval(40, 50);
    expect(hi - lo).toBeGreaterThan(0.2);
    expect(lo).toBeLessThan(0.72);
  });

  it("returns the full interval for n=0 rather than dividing by zero", () => {
    expect(wilsonInterval(0, 0)).toEqual({ lo: 0, hi: 1 });
  });
});

describe("cohensKappa", () => {
  it("is 1 for perfect agreement", () => {
    expect(cohensKappa([true, false, true], [true, false, true])).toBe(1);
  });

  it("is ~0 for a judge that keeps EVERYTHING — the failure raw accuracy hides", () => {
    // 33% bin rate; a judge that never bins scores 67% "accuracy" and kappa 0.
    const human = Array.from({ length: 99 }, (_, i) => i % 3 === 0);
    const judge = Array(99).fill(false);
    expect(cohensKappa(human, judge)).toBeCloseTo(0, 12);
  });

  it("goes negative for systematic disagreement", () => {
    expect(cohensKappa([true, false, true, false], [false, true, false, true])).toBeLessThan(0);
  });

  it("returns 0 on length mismatch rather than throwing mid-eval", () => {
    expect(cohensKappa([true], [true, false])).toBe(0);
  });
});

describe("quantile / stdDev / bucketise", () => {
  it("interpolates quantiles", () => {
    expect(quantile([0, 10], 0.5)).toBe(5);
    expect(quantile([0, 1, 2, 3, 4], 0.95)).toBeCloseTo(3.8, 10);
  });

  it("stdDev is 0 for a single run — one baseline run has no measurable spread", () => {
    expect(stdDev([5])).toBe(0);
  });

  it("stdDev uses n-1", () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
  });

  it("bucketise covers below-first, middle and above-last", () => {
    expect(bucketise(5, [10, 20])).toBe("<10");
    expect(bucketise(15, [10, 20])).toBe("10–20");
    expect(bucketise(25, [10, 20])).toBe("20+");
  });
});
