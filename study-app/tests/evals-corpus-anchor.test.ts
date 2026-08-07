import { describe, it, expect } from "vitest";
import { loadRealCorpus, featuresFromStem, scoreFidelity, AXES } from "../evals/corpus-anchor";

/**
 * The truth anchor, tested against the real published corpus rather than fixtures.
 *
 * These tests are deliberately coupled to `data/exams.json`. If the corpus is re-parsed and the
 * question count or a distribution moves, this SHOULD fail — the anchor's whole value is that it
 * does not change quietly underneath the scoreboard.
 */

const real = loadRealCorpus();

describe("the corpus loads", () => {
  it("has the published question count across the 15-year corpus", () => {
    expect(real.length).toBe(162);
  });

  it("covers all three papers", () => {
    expect(new Set(real.map((f) => f.paper))).toEqual(new Set([1, 2, 3]));
  });

  it("extracts a usable flight size for every question", () => {
    expect(real.every((f) => f.flightSize >= 1)).toBe(true);
  });

  it("extracts sub-parts for the overwhelming majority of stems", () => {
    // The shared parser is imperfect on older stem formats; the anchor tolerates that as long as
    // coverage stays high. A sharp drop here means the parser regressed, not the corpus.
    const parsed = real.filter((f) => f.subPartCount > 0).length;
    expect(parsed / real.length).toBeGreaterThan(0.85);
  });
});

describe("every axis buckets the real corpus", () => {
  it.each(AXES.map((a) => a.key))("%s assigns buckets to most real questions", (key) => {
    const axis = AXES.find((a) => a.key === key)!;
    const bucketed = real.filter((f) => axis.bucket(f) !== null).length;
    expect(bucketed / real.length).toBeGreaterThan(0.85);
  });

  it("no axis collapses the corpus into a single bucket", () => {
    // An axis with one bucket has no discriminating power and would always score TVD 0 — a metric
    // that can never fail is worse than no metric, because it reads as passing.
    for (const axis of AXES) {
      const buckets = new Set(real.map(axis.bucket).filter((b) => b !== null));
      expect(buckets.size, `axis '${axis.key}' has only ${buckets.size} bucket(s)`).toBeGreaterThan(1);
    }
  });
});

describe("scoreFidelity", () => {
  it("scores the corpus against ITSELF at zero distance on every axis", () => {
    const report = scoreFidelity(real, real);
    expect(report.meanTvd).toBeCloseTo(0, 12);
    expect(report.driftedAxes).toEqual([]);
  });

  it("scopes to one paper on both sides", () => {
    const report = scoreFidelity(real, real, 3);
    expect(report.paper).toBe(3);
    expect(report.n).toBe(real.filter((f) => f.paper === 3).length);
    expect(report.referenceN).toBe(report.n);
  });

  it("flags an obviously wrong batch as drifted", () => {
    // Every question a 2-wine flight with a bloated stem — the shape a lazy generator produces.
    const fake = Array.from({ length: 40 }, () =>
      featuresFromStem(
        1,
        2,
        `Wines 1 and 2 are from the same country. ${"Discuss the origin and quality in detail. ".repeat(12)}
a) Identify the country of origin (10 marks)
b) Comment on quality (2 x 20 marks)`
      )
    );
    const report = scoreFidelity(fake, real, 1);
    expect(report.driftedAxes).toContain("flightSize");
    expect(report.meanTvd).toBeGreaterThan(0.2);
  });

  it("does NOT flag a genuine sample of the real corpus — the false-positive guard", () => {
    // The anchor's credibility rests on this: real questions must score as real. If a true sample
    // trips the drift flag, every scorecard is noise and the loop would chase phantoms.
    const p2 = real.filter((f) => f.paper === 2);
    const sample = p2.filter((_, i) => i % 3 === 0); // deterministic ~1/3 slice
    const report = scoreFidelity(sample, real, 2);
    expect(report.driftedAxes).toEqual([]);
  });

  it("reports the worst buckets so a regression names its cause", () => {
    const fake = Array.from({ length: 30 }, () =>
      featuresFromStem(1, 2, "Wines 1 and 2 are Chardonnay.\na) Identify the origin (25 marks)")
    );
    const flight = scoreFidelity(fake, real, 1).axes.find((a) => a.key === "flightSize")!;
    expect(flight.worstBuckets[0].bucket).toBe("2");
    expect(flight.worstBuckets[0].delta).toBeGreaterThan(0);
  });

  it("carries a noise floor sized to the batch, not to the corpus", () => {
    const small = scoreFidelity(real.slice(0, 10), real);
    const big = scoreFidelity(real, real);
    const smallFloor = small.axes.find((a) => a.key === "flightSize")!.noiseFloor.cut;
    const bigFloor = big.axes.find((a) => a.key === "flightSize")!.noiseFloor.cut;
    expect(smallFloor).toBeGreaterThan(bigFloor);
  });

  it("corrects the drift cut for the number of simultaneous tests", () => {
    const one = scoreFidelity(real.slice(0, 40), real, null, { comparisons: 1 });
    const fifteen = scoreFidelity(real.slice(0, 40), real, null, { comparisons: 15 });
    const cut = (r: typeof one) => r.axes.find((a) => a.key === "flightSize")!.noiseFloor.cut;
    expect(cut(fifteen)).toBeGreaterThan(cut(one));
  });
});

describe("markFocus compares the MIX, not just the winner", () => {
  // Argmax would score a batch of monolithic single-focus questions as perfectly faithful so long
  // as the winners lined up — which is exactly the degenerate output a lazy generator produces.
  const monolithic = (paper: number) =>
    featuresFromStem(
      paper,
      2,
      `Wines 1 and 2 are from the same country.
a) Identify the grape variety and the region of origin as precisely as possible (2 x 25 marks)`
    );

  it("flags an all-identification batch even though identification also leads the real corpus", () => {
    const fake = Array.from({ length: 40 }, () => monolithic(2));
    const markAxis = scoreFidelity(fake, real, 2).axes.find((a) => a.key === "markFocus")!;
    // The claim under test is strictly comparative: the weighted mix must see a deviation the
    // argmax projection understates. Asserting an absolute magnitude here would just be pinning
    // whatever number this particular synthetic stem happens to produce.
    const argmaxDist = totalVariationDistanceOfArgmax(fake, real.filter((f) => f.paper === 2));
    expect(markAxis.tvd).toBeGreaterThan(argmaxDist);
    expect(markAxis.tvd).toBeGreaterThan(0.05);
  });

  it("still scores the real corpus against itself at zero", () => {
    const markAxis = scoreFidelity(real, real).axes.find((a) => a.key === "markFocus")!;
    expect(markAxis.tvd).toBeCloseTo(0, 12);
  });
});

/** Reference implementation of the OLD argmax behaviour, kept only to prove the new one is better. */
function totalVariationDistanceOfArgmax(
  gen: ReturnType<typeof featuresFromStem>[],
  ref: ReturnType<typeof featuresFromStem>[]
): number {
  const top = (f: ReturnType<typeof featuresFromStem>) => {
    const e = Object.entries(f.markFocus);
    return e.length ? e.sort((a, b) => b[1] - a[1])[0][0] : null;
  };
  const dist = (xs: typeof gen) => {
    const c: Record<string, number> = {};
    let n = 0;
    for (const x of xs) {
      const k = top(x);
      if (!k) continue;
      c[k] = (c[k] ?? 0) + 1;
      n++;
    }
    return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / n]));
  };
  const a = dist(gen);
  const b = dist(ref);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let s = 0;
  for (const k of keys) s += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return s / 2;
}
