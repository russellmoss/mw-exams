// evals/metrics.ts — distribution math for the generation scoreboard.
//
// Pure, dependency-free, deterministic. Everything here is unit-testable without a model call, a
// database or a network, because this is the half of the eval that must NEVER be in question: when
// the judge's verdict is disputable, these numbers still are not.
//
// WHY TOTAL VARIATION DISTANCE. We compare a batch of generated questions against the real IMW
// corpus on several categorical axes (flight size, mark-category mix, …). TVD is
//
//     TVD(P, Q) = ½ · Σ |P(x) − Q(x)|
//
// which is bounded [0, 1], symmetric, needs no smoothing (unlike KL, which is infinite the moment
// the generated batch omits a category the corpus has — which happens constantly at n=60), and has
// a plain-English reading: "the share of probability mass you would have to move to turn one
// distribution into the other". 0.12 means 12% of the questions are in the wrong bucket. That is a
// number you can put in front of a person and have them act on it.
//
// WHY A NOISE FLOOR. A TVD of 0.15 against the corpus sounds bad and may be perfect: two samples
// drawn from the SAME distribution differ too, and at n=60 they differ a lot. So every axis carries
// a `noiseFloor` measured by repeatedly splitting the real corpus in half and taking the TVD
// between the halves. That is what "indistinguishable from real" actually looks like on this axis
// at this sample size. Scoring against a fixed threshold instead would be measuring sample size.

/** A categorical distribution as raw counts, keyed by bucket. */
export type Counts = Record<string, number>;

/** A normalised categorical distribution. Values sum to 1 (or the input was empty). */
export type Distribution = Record<string, number>;

export function countBy<T>(items: T[], key: (item: T) => string | null): Counts {
  const out: Counts = {};
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

export function normalise(counts: Counts): Distribution {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total === 0) return {};
  const out: Distribution = {};
  for (const [k, v] of Object.entries(counts)) out[k] = v / total;
  return out;
}

/**
 * Total variation distance between two categorical distributions, over the UNION of their support.
 * A bucket present in one and absent from the other contributes its full mass — which is the
 * behaviour we want: never generating a 5-wine flight when the corpus has them is a real deviation,
 * not a missing data point to be smoothed away.
 */
export function totalVariationDistance(a: Distribution, b: Distribution): number {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  for (const k of keys) sum += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return sum / 2;
}

/** Deterministic PRNG (mulberry32). Math.random() would make the noise floor unreproducible. */
export function seededRandom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates, seeded. Returns a new array. */
export function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export interface NoiseFloor {
  /** Median TVD — the typical distance between a same-size sample and the true distribution. */
  median: number;
  /** The drift cut, at the family-wise-corrected quantile. Above this is unlikely to be noise. */
  cut: number;
  /** Uncorrected p95, reported for context only. Never gate on this — see `cut`. */
  p95: number;
  /** Sample size the floor was measured at. Only comparable to a batch of this size. */
  sampleSize: number;
  /** The per-test quantile actually used for `cut`, after multiple-comparison correction. */
  quantile: number;
  /** How many simultaneous tests the correction assumed. */
  comparisons: number;
}

/**
 * Bonferroni-corrected per-test quantile.
 *
 * The scorecard runs one drift test per axis per paper — 5 × 3 = 15. At an uncorrected p95 cut each
 * test false-alarms 5% of the time, so the FAMILY-WISE false-drift rate is 1 − 0.95¹⁵ = **53.7%**:
 * over half of perfectly healthy runs would be reported as REGRESS. A gate that cries wolf on every
 * second clean run is worse than no gate, because people learn to re-run it until it goes green.
 *
 * Correcting to α/K per test restores ~5% family-wise. The cost is sensitivity — a genuinely
 * drifted axis needs to drift harder to trip — which is the right trade for a gate that blocks
 * merges, and is why the judge and the deterministic metrics exist alongside it rather than under it.
 */
export function correctedQuantile(familyWiseAlpha: number, comparisons: number): number {
  const k = Math.max(1, comparisons);
  return 1 - familyWiseAlpha / k;
}

/**
 * Noise floor calibrated to the size of the batch being judged — what TVD looks like when nothing
 * is wrong.
 *
 * ── Why this is a PARAMETRIC bootstrap, not a subsample ────────────────────────────────────────
 *
 * The obvious construction — draw `sampleSize` items out of the corpus and score them against the
 * corpus — is biased, and biased in the dangerous direction. At n=60 from a 162-question corpus the
 * draw IS 37% of the thing it is being compared to, so sample and reference are strongly positively
 * correlated and the measured TVD comes out too LOW. A too-low floor means healthy batches get
 * flagged as drifted: false REGRESS, on top of the multiple-comparisons problem above.
 *
 * Instead we resample i.i.d. WITH REPLACEMENT from the corpus's estimated categorical distribution.
 * Each synthetic batch is an independent realisation of "what a real sample of this size looks
 * like", which is exactly the null the generated batch is being tested against.
 *
 * `trials` defaults high because the corrected quantile is far out in the tail (p99.67 at 15
 * comparisons); at 200 trials that quantile would be estimated from a handful of points and would
 * itself be noise.
 */
export function noiseFloorFor(
  values: (string | null)[],
  sampleSize: number,
  opts: { trials?: number; seed?: number; familyWiseAlpha?: number; comparisons?: number } = {}
): NoiseFloor {
  const { trials = 4000, seed = 20260807, familyWiseAlpha = 0.05, comparisons = 1 } = opts;
  const q = correctedQuantile(familyWiseAlpha, comparisons);
  const present = values.filter((v): v is string => v !== null);
  if (present.length < 2 || sampleSize < 1) {
    return { median: 0, cut: 0, p95: 0, sampleSize, quantile: q, comparisons };
  }

  const reference = normalise(countBy(present, (x) => x));
  // Cumulative distribution for inverse-transform sampling.
  const buckets = Object.keys(reference).sort();
  const cum: number[] = [];
  let acc = 0;
  for (const b of buckets) {
    acc += reference[b];
    cum.push(acc);
  }

  const rand = seededRandom(seed);
  const dists: number[] = [];
  for (let i = 0; i < trials; i++) {
    const draw: Counts = {};
    for (let j = 0; j < sampleSize; j++) {
      const u = rand();
      let k = 0;
      while (k < cum.length - 1 && u > cum[k]) k++;
      const b = buckets[k];
      draw[b] = (draw[b] ?? 0) + 1;
    }
    dists.push(totalVariationDistance(normalise(draw), reference));
  }
  dists.sort((x, y) => x - y);
  return {
    median: quantile(dists, 0.5),
    cut: quantile(dists, q),
    p95: quantile(dists, 0.95),
    sampleSize,
    quantile: q,
    comparisons,
  };
}

// ── Student's t ─────────────────────────────────────────────────────────────────────────────────

/**
 * Two-sided 95% critical values of Student's t by degrees of freedom.
 *
 * A hard-coded table rather than an incomplete-beta inversion: the eval only ever needs 95%, the
 * values are auditable against any statistics table, and a subtly wrong numerical routine here
 * would silently mis-gate every run.
 */
const T_CRIT_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306,
  9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179, 13: 2.16, 14: 2.145, 15: 2.131,
  16: 2.12, 17: 2.11, 18: 2.101, 19: 2.093, 20: 2.086, 25: 2.06, 30: 2.042,
};

export function tCritical95(df: number): number {
  if (df < 1) return T_CRIT_95[1];
  if (T_CRIT_95[df] !== undefined) return T_CRIT_95[df];
  if (df > 30) return 1.96;
  const keys = Object.keys(T_CRIT_95).map(Number).sort((a, b) => a - b);
  const hi = keys.find((k) => k > df)!;
  const lo = [...keys].reverse().find((k) => k < df)!;
  return T_CRIT_95[lo] + ((T_CRIT_95[hi] - T_CRIT_95[lo]) * (df - lo)) / (hi - lo);
}

/**
 * How far a single new observation may sit from a baseline of `n` runs before it is a real change,
 * expressed in baseline standard deviations.
 *
 * This is a PREDICTION interval, not a confidence interval: we are asking whether one new run is
 * consistent with the baseline, not whether the baseline's mean has moved. Hence the √(1 + 1/n)
 * term — a new observation carries its own sampling variance on top of the uncertainty in the mean.
 *
 * The naive "2σ" this replaces was badly wrong at small n. At n=3 (df=2) the true two-sided 95%
 * critical value is 4.303, and with the prediction term the threshold is 4.303·√(4/3) ≈ 4.97 — so
 * "2σ" was really about an 82% test, firing IMPROVED and REGRESS on noise several times more often
 * than it claimed.
 */
export function significanceThreshold(baselineRuns: number): number {
  if (baselineRuns < 2) return Infinity;
  return tCritical95(baselineRuns - 1) * Math.sqrt(1 + 1 / baselineRuns);
}

/** Linear-interpolated quantile over a PRE-SORTED ascending array. */
export function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (n−1). Returns 0 for n < 2 — one run has no measurable spread. */
export function stdDev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
}

/**
 * Wilson score interval for a binomial proportion.
 *
 * Used for every rate the scoreboard reports (judge bin-recall, first-pass rate, …). The normal
 * approximation is wrong at the sample sizes and extreme proportions this eval lives at — at 50
 * negatives and a recall of 0.9 it produces an upper bound above 1. Wilson stays inside [0, 1] and
 * behaves at the edges, which is exactly where the gating decisions sit.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n === 0) return { lo: 0, hi: 1 };
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return { lo: Math.max(0, (centre - spread) / d), hi: Math.min(1, (centre + spread) / d) };
}

/**
 * Cohen's κ for two binary raters — agreement corrected for the agreement you would get by chance.
 * Raw accuracy is misleading here: with a 33% bin rate a judge that keeps EVERYTHING scores 67%.
 * κ scores that at 0.
 */
export function cohensKappa(a: boolean[], b: boolean[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  let agree = 0;
  let aTrue = 0;
  let bTrue = 0;
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) agree++;
    if (a[i]) aTrue++;
    if (b[i]) bTrue++;
  }
  const po = agree / n;
  const pe = (aTrue / n) * (bTrue / n) + (1 - aTrue / n) * (1 - bTrue / n);
  if (pe === 1) return po === 1 ? 1 : 0;
  return (po - pe) / (1 - pe);
}

/** Histogram bucket for a continuous value — turns stem length etc. into a categorical axis. */
export function bucketise(value: number, edges: number[]): string {
  for (let i = 0; i < edges.length; i++) {
    if (value < edges[i]) return i === 0 ? `<${edges[0]}` : `${edges[i - 1]}–${edges[i]}`;
  }
  return `${edges[edges.length - 1]}+`;
}
