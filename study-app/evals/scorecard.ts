// evals/scorecard.ts — THE SCOREBOARD.
//
// Turns a run into (a) a human-readable card and (b) a machine verdict against a baseline. This is
// the thing a self-improving loop ratchets on: without it, "we made a foundational fix" is a story.
//
// ── Three rules this file exists to enforce ─────────────────────────────────────────────────────
//
// 1. NOTHING IS A WIN INSIDE THE NOISE. Every comparison is against the baseline's own run-to-run
//    spread (≥3 runs, 2σ). A pipeline whose first-pass rate wanders 20%→26%→19% between identical
//    runs has not improved when it lands on 26%. This is the single most common way an eval loop
//    fools the person running it, and the reason `baseline.runs` is required rather than optional.
//
// 2. CORPUS FIDELITY OUTRANKS THE JUDGE. Judge score is advisory; fidelity to the real corpus and
//    the deterministic metrics are the gates. An LLM judge scoring LLM output is a closed loop, and
//    a "fix" that raises the judge while degrading fidelity is overfitting to the judge. The
//    verdict below reports them separately and never blends them into one number.
//
// 3. A REGRESSION MUST NAME ITSELF. No aggregate score. Every metric is compared and reported on
//    its own row with its own direction, so "it got worse" always comes with "at what".

import type { FidelityReport } from "./corpus-anchor";
import { mean, significanceThreshold, stdDev } from "./metrics";

export type Direction = "higher_is_better" | "lower_is_better";

export interface MetricValue {
  key: string;
  label: string;
  value: number;
  direction: Direction;
  /** Rendered suffix, e.g. "%" or " tok". */
  unit?: string;
  /** Advisory metrics are reported and diffed but can never produce a REGRESS verdict. */
  advisory?: boolean;
  /**
   * Smallest change worth reacting to, in the metric's own units. REQUIRED, and load-bearing.
   *
   * Statistical significance is not practical significance. A deterministic metric can have zero
   * baseline spread, and then ANY movement — 0.800 → 0.801 — divides by a zero standard deviation
   * and reads as infinitely significant, so the scorecard would confidently report IMPROVED for
   * floating-point jitter. A change must clear BOTH this and the significance threshold.
   */
  minRelevantDelta: number;
  /** Shown under the row when it moves. */
  note?: string;
}

export interface Scorecard {
  config: string;
  /** ISO timestamp, injected by the caller — nothing in here calls Date.now() itself. */
  createdAt: string;
  n: number;
  promptVersion?: string;
  specVersion?: string;
  /** Corpus fidelity, per paper (null key = pooled). The primary signal. */
  fidelity: FidelityReport[];
  metrics: MetricValue[];
  /** Set when the judge ran. Advisory unless it has cleared calibration. */
  judge?: {
    provider: string;
    model: string;
    /** False until the judge clears the §4.2 bars; keeps it out of the verdict. */
    calibrated: boolean;
    kappa?: number;
    binRecall?: number;
    binRecallLo?: number;
    syntheticFloorHits?: number;
    syntheticFloorTotal?: number;
  };
}

export interface Baseline {
  config: string;
  /** ≥3 runs. Mean and spread come from these; a 1-run baseline cannot gate. */
  runs: Scorecard[];
}

export type Verdict = "PASS" | "REGRESS" | "IMPROVED" | "NOISE" | "NO_BASELINE";

export interface MetricComparison {
  key: string;
  label: string;
  current: number;
  baselineMean: number;
  baselineSd: number;
  delta: number;
  /** Distance from the baseline mean in baseline standard deviations. */
  sigmas: number;
  /** t-based prediction threshold this run had to clear, given the baseline's size. */
  threshold: number;
  /** True when |delta| cleared `minRelevantDelta` — practical, as distinct from statistical. */
  practicallySignificant: boolean;
  verdict: Verdict;
  advisory: boolean;
  unit?: string;
}

export interface RunVerdict {
  overall: Verdict;
  metrics: MetricComparison[];
  /** Axes that drifted outside their noise floor, per paper. Blocking. */
  fidelityDrift: { paper: number | null; axes: string[] }[];
  /** Human-readable reasons the overall verdict is what it is. */
  reasons: string[];
}

/**
 * Below this many baseline runs the spread is not estimable and nothing may gate.
 *
 * Raised from 3 to 5 on review. At n=3 the sample standard deviation is itself so noisy that the
 * t-threshold balloons to ~4.97σ — technically correct, but it means a 3-run baseline can barely
 * detect anything, so a run that "PASSes" against it has been told almost nothing. Five runs bring
 * the threshold to ~3.04σ, which is a test that can actually fail.
 */
export const MIN_BASELINE_RUNS = 5;

function metricByKey(card: Scorecard, key: string): MetricValue | undefined {
  return card.metrics.find((m) => m.key === key);
}

/**
 * Compare a run against a baseline.
 *
 * Deliberately conservative: with no baseline, or too few baseline runs to estimate spread, the
 * verdict is NO_BASELINE and nothing is called an improvement. An eval that reports wins it cannot
 * support is worse than one that reports nothing, because it will be believed.
 */
export function compareToBaseline(current: Scorecard, baseline: Baseline | null): RunVerdict {
  const fidelityDrift = current.fidelity
    .filter((f) => f.driftedAxes.length > 0)
    .map((f) => ({ paper: f.paper, axes: f.driftedAxes }));

  if (!baseline || baseline.runs.length < MIN_BASELINE_RUNS) {
    return {
      overall: "NO_BASELINE",
      metrics: [],
      fidelityDrift,
      reasons: [
        baseline
          ? `Baseline has ${baseline.runs.length} run(s); ${MIN_BASELINE_RUNS} are needed to estimate run-to-run spread. Nothing can be called a win or a regression yet.`
          : "No baseline recorded for this config. Run it ≥3 times to establish one.",
      ],
    };
  }

  const metrics: MetricComparison[] = [];
  for (const m of current.metrics) {
    const history = baseline.runs
      .map((r) => metricByKey(r, m.key)?.value)
      .filter((v): v is number => typeof v === "number");
    if (history.length < MIN_BASELINE_RUNS) continue;

    const bMean = mean(history);
    const bSd = stdDev(history);
    const delta = m.value - bMean;
    // A zero-spread baseline (common for deterministic metrics) has no noise to divide by. Reporting
    // Infinity here is what made 0.800 → 0.801 read as a confident IMPROVED; the practical-
    // significance gate below is what actually stops it, so Infinity is now merely honest.
    const sigmas = bSd === 0 ? (delta === 0 ? 0 : Infinity) : delta / bSd;
    const threshold = significanceThreshold(history.length);
    const practicallySignificant = Math.abs(delta) >= m.minRelevantDelta;
    const better = m.direction === "higher_is_better" ? delta > 0 : delta < 0;

    // BOTH bars. Statistical significance without practical significance is jitter dressed up as a
    // result; practical significance without statistical significance is one lucky run.
    let verdict: Verdict;
    if (!practicallySignificant || Math.abs(sigmas) < threshold) verdict = "NOISE";
    else if (better) verdict = "IMPROVED";
    else verdict = m.advisory ? "NOISE" : "REGRESS";

    metrics.push({
      key: m.key,
      label: m.label,
      current: m.value,
      baselineMean: bMean,
      baselineSd: bSd,
      delta,
      sigmas,
      threshold,
      practicallySignificant,
      verdict,
      advisory: m.advisory ?? false,
      unit: m.unit,
    });
  }

  const reasons: string[] = [];
  const regressed = metrics.filter((m) => m.verdict === "REGRESS");
  for (const m of regressed) {
    reasons.push(
      `${m.label} moved ${m.delta > 0 ? "+" : ""}${fmt(m.delta)}${m.unit ?? ""} ` +
        `(${Number.isFinite(m.sigmas) ? m.sigmas.toFixed(1) : "∞"}σ vs a ${m.threshold.toFixed(1)}σ ` +
        `threshold, from a baseline of ${fmt(m.baselineMean)}${m.unit ?? ""}).`
    );
  }
  for (const d of fidelityDrift) {
    reasons.push(
      `Corpus fidelity drifted on ${d.axes.join(", ")}${d.paper ? ` (Paper ${d.paper})` : ""} — ` +
        `outside the noise floor for a real sample of this size.`
    );
  }

  let overall: Verdict;
  if (regressed.length > 0 || fidelityDrift.length > 0) overall = "REGRESS";
  else if (metrics.some((m) => m.verdict === "IMPROVED")) overall = "IMPROVED";
  else overall = "PASS";

  if (reasons.length === 0) {
    reasons.push(
      overall === "IMPROVED"
        ? "At least one metric improved beyond 2σ and nothing regressed."
        : "Every metric is within 2σ of baseline and no fidelity axis drifted."
    );
  }

  return { overall, metrics, fidelityDrift, reasons };
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "∞";
  return Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(1) : n.toFixed(3);
}

const VERDICT_MARK: Record<Verdict, string> = {
  PASS: "✅",
  IMPROVED: "🟢",
  REGRESS: "🔴",
  NOISE: "·",
  NO_BASELINE: "—",
};

/** Render the card as markdown — for a PR comment, the admin UI, or a terminal. */
export function renderScorecard(card: Scorecard, verdict: RunVerdict): string {
  const L: string[] = [];
  L.push(`# Generation scorecard — \`${card.config}\``);
  L.push("");
  L.push(
    `**${VERDICT_MARK[verdict.overall]} ${verdict.overall}** · n=${card.n} · ${card.createdAt}` +
      (card.promptVersion ? ` · prompt \`${card.promptVersion}\`` : "")
  );
  L.push("");
  for (const r of verdict.reasons) L.push(`- ${r}`);
  L.push("");

  L.push("## Corpus fidelity (the truth anchor)");
  L.push("");
  L.push("Distance from the 162 real IMW questions. `within noise` = indistinguishable from a real");
  L.push("sample of this size. This outranks the judge: it cannot be gamed by a model.");
  L.push("");
  for (const f of card.fidelity) {
    L.push(`### ${f.paper === null ? "All papers" : `Paper ${f.paper}`} (n=${f.n} vs ${f.referenceN} real)`);
    L.push("");
    L.push("| Axis | TVD | Noise floor (p95) | Verdict | Biggest gap |");
    L.push("|---|---:|---:|:--:|---|");
    for (const a of f.axes) {
      const w = a.worstBuckets[0];
      const gap = w
        ? `\`${w.bucket}\` ${(w.generated * 100).toFixed(0)}% vs ${(w.reference * 100).toFixed(0)}% real`
        : "—";
      L.push(
        `| ${a.label} | ${a.tvd.toFixed(3)} | ${a.noiseFloor.p95.toFixed(3)} | ` +
          `${a.withinNoise ? "✅" : "🔴"} | ${gap} |`
      );
    }
    L.push("");
    for (const a of f.axes.filter((x) => !x.withinNoise)) L.push(`> **${a.label} drifted.** ${a.why}`);
    L.push("");
  }

  L.push("## Metrics");
  L.push("");
  if (verdict.metrics.length === 0) {
    L.push("_No baseline to compare against — values only._");
    L.push("");
    L.push("| Metric | Value |");
    L.push("|---|---:|");
    for (const m of card.metrics) L.push(`| ${m.label} | ${fmt(m.value)}${m.unit ?? ""} |`);
  } else {
    L.push("| Metric | Current | Baseline | Δ | σ | |");
    L.push("|---|---:|---:|---:|---:|:--:|");
    for (const m of verdict.metrics) {
      L.push(
        `| ${m.label}${m.advisory ? " _(advisory)_" : ""} | ${fmt(m.current)}${m.unit ?? ""} | ` +
          `${fmt(m.baselineMean)}${m.unit ?? ""} | ${m.delta > 0 ? "+" : ""}${fmt(m.delta)} | ` +
          `${Number.isFinite(m.sigmas) ? m.sigmas.toFixed(1) : "∞"} | ${VERDICT_MARK[m.verdict]} |`
      );
    }
  }
  L.push("");

  if (card.judge) {
    L.push("## Judge (advisory unless calibrated)");
    L.push("");
    L.push(`Provider: \`${card.judge.provider}\` · model \`${card.judge.model}\``);
    if (!card.judge.calibrated) {
      L.push("");
      L.push(
        "> ⚠️ **Not calibrated — advisory only.** This judge has not cleared the calibration bars " +
          "(κ ≥ 0.6, lower bound of bin-recall CI ≥ 0.70, 20/20 on the synthetic floor), so its " +
          "scores never gate. See the plan §4.2."
      );
    }
    if (card.judge.provider === "anthropic") {
      L.push("");
      L.push(
        "> ⚠️ **Same model family as the generator.** Claude grading Claude is a closed loop with " +
          "correlated biases; treat agreement as weak evidence. Corpus fidelity above is the " +
          "independent signal."
      );
    }
    L.push("");
    L.push("| | value |");
    L.push("|---|---:|");
    if (card.judge.kappa !== undefined) L.push(`| Cohen's κ vs human | ${card.judge.kappa.toFixed(3)} |`);
    if (card.judge.binRecall !== undefined)
      L.push(
        `| Bin-recall | ${(card.judge.binRecall * 100).toFixed(0)}% ` +
          `(95% CI lower ${((card.judge.binRecallLo ?? 0) * 100).toFixed(0)}%) |`
      );
    if (card.judge.syntheticFloorTotal)
      L.push(
        `| Synthetic floor | ${card.judge.syntheticFloorHits}/${card.judge.syntheticFloorTotal} |`
      );
    L.push("");
  }

  return L.join("\n");
}
