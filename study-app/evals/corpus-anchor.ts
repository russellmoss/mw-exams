// evals/corpus-anchor.ts — THE TRUTH ANCHOR.
//
// Everything else in the eval can be argued with. A judge's rubric is an opinion; a human reviewer
// is one expert on one day; an LLM grading LLM output is a closed loop that will happily converge on
// its own taste. This file is the one part of the scoreboard that cannot be talked into anything:
// the 162 real IMW practical questions, 2011–2026, as published.
//
// The anchor answers exactly one question — "do our generated questions LOOK LIKE the real exam?" —
// on axes that can be measured mechanically. It deliberately does NOT try to answer "is this a good
// question", because that is the judgement the corpus cannot supply and the reviewer must.
//
// ── Why this is the anchor a self-improving loop needs ──────────────────────────────────────────
//
// A generate → judge → bin → fix loop with an LLM at both ends has no external referent: it
// optimises toward whatever the judge likes, and both models share biases. Anchoring the loop's
// PRIMARY metric here makes that failure mode visible, because the corpus distribution does not
// move when the models drift. If a "foundational fix" improves the judge score while corpus
// fidelity degrades, the fix is overfitting to the judge and the loop should reject it.
//
// ── The same lens on both sides ────────────────────────────────────────────────────────────────
//
// Features are extracted with the SAME functions the app uses on generated questions
// (`deriveMarkFocus`, `deriveQuestionType`, `deriveQuestion`), never a parallel implementation. A
// second parser would drift, and a fidelity score computed through two different lenses measures
// the lenses.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveMarkFocus, deriveQuestionType, type MarkCategory } from "@/lib/bank-health/derive";
import { deriveQuestion } from "@/lib/question-sections";
import {
  bucketise,
  countBy,
  noiseFloorFor,
  normalise,
  totalVariationDistance,
  type Distribution,
  type NoiseFloor,
} from "./metrics";

/** One question reduced to the axes the anchor measures. Real and generated share this shape. */
export interface QuestionFeatures {
  paper: number;
  flightSize: number;
  /** Mark categories weighted by marks, e.g. { identification: 30, quality: 15 }. */
  markFocus: Partial<Record<MarkCategory, number>>;
  questionType: string;
  /** Sub-part count — real papers are terse; a generated stem with 9 asks is not exam-shaped. */
  subPartCount: number;
  stemWords: number;
  totalMarks: number | null;
}

interface RawExam {
  year: number;
  papers: { paper: number; questions: { n: number; wines: number[]; text: string }[] }[];
}

/**
 * Load the published corpus. Path is resolved from the repo root (this file lives in study-app/,
 * the corpus in data/ at the root) so the anchor works from a test, a script or the runner alike.
 */
export function loadRealCorpus(repoRoot = join(process.cwd(), "..")): QuestionFeatures[] {
  const raw = JSON.parse(
    readFileSync(join(repoRoot, "data", "exams.json"), "utf-8")
  ) as RawExam[];
  const out: QuestionFeatures[] = [];
  for (const exam of raw) {
    for (const paper of exam.papers) {
      for (const q of paper.questions) {
        out.push(featuresFromStem(paper.paper, q.wines.length, q.text));
      }
    }
  }
  return out;
}

/**
 * Reduce a stem to anchor features.
 *
 * `totalMarks` is left null for real questions: the published papers state marks inline
 * ("3 x 15 marks") rather than as a header total, and deriving one would mean re-implementing the
 * arithmetic the app already owns. The mark MIX is what the anchor compares, and that is derived
 * from the stem text directly, so nothing depends on the total.
 */
export function featuresFromStem(
  paper: number,
  flightSize: number,
  stem: string,
  totalMarks: number | null = null
): QuestionFeatures {
  const derived = deriveQuestion(stem, flightSize);
  const marks = totalMarks ?? derived.totalMarks ?? flightSize * 25;
  return {
    paper,
    flightSize,
    markFocus: deriveMarkFocus(stem, marks),
    questionType: deriveQuestionType(stem),
    subPartCount: derived.subParts.length,
    stemWords: stem.trim().split(/\s+/).filter(Boolean).length,
    totalMarks,
  };
}

// ── Axes ────────────────────────────────────────────────────────────────────────────────────────
//
// Each axis projects a question onto one categorical bucket. Adding an axis is cheap and safe;
// every axis is reported and compared independently, so a regression always NAMES its axis rather
// than moving one opaque aggregate score.

export interface Axis {
  key: string;
  label: string;
  /** Bucket for one question, or null to exclude it from this axis. */
  bucket: (f: QuestionFeatures) => string | null;
  /**
   * Optional: contribute a WEIGHTED distribution instead of a single bucket.
   *
   * Some axes lose their meaning when collapsed to one winner. A question splitting its marks
   * 40/30/30 across identification, quality and winemaking is a very different exam problem from
   * one that puts 100% on identification, but argmax scores them identically — so a generator that
   * only ever produced monolithic single-focus questions would show perfect fidelity. Where a
   * weight function exists, the axis compares the batch's AVERAGE mark distribution against the
   * corpus's, and `bucket` is used only for the "biggest gap" display.
   */
  weights?: (f: QuestionFeatures) => Record<string, number> | null;
  /** Why a candidate should care that this axis drifted. Rendered on the scorecard. */
  why: string;
}

const STEM_WORD_EDGES = [40, 70, 100, 140];
const SUBPART_EDGES = [2, 3, 4, 5];

export const AXES: Axis[] = [
  {
    key: "flightSize",
    label: "Flight size",
    bucket: (f) => (f.flightSize > 0 ? String(Math.min(f.flightSize, 6)) : null),
    why: "The real papers have a characteristic mix of pairs, threes and larger flights. Drift here means candidates practise the wrong shape of problem.",
  },
  {
    key: "markFocus",
    label: "Mark-category mix",
    bucket: (f) => {
      const entries = Object.entries(f.markFocus) as [MarkCategory, number][];
      if (entries.length === 0) return null;
      return entries.sort((a, b) => b[1] - a[1])[0][0];
    },
    // Compared as a full weighted mix, not just the winner — see Axis.weights.
    weights: (f) => {
      const entries = Object.entries(f.markFocus) as [MarkCategory, number][];
      if (entries.length === 0) return null;
      const total = entries.reduce((a, [, v]) => a + v, 0);
      if (total <= 0) return null;
      return Object.fromEntries(entries.map(([k, v]) => [k, v / total]));
    },
    why: "What the marks REWARD — identification vs quality vs winemaking vs commercial. The single most examinable axis, and the one EK-0098 shows differs sharply by paper.",
  },
  {
    key: "questionType",
    label: "Question type",
    bucket: (f) => f.questionType || null,
    why: "The structural family of the question. Over-producing one type narrows what the candidate is trained on.",
  },
  {
    key: "subPartCount",
    label: "Sub-parts per question",
    bucket: (f) => (f.subPartCount > 0 ? bucketise(f.subPartCount, SUBPART_EDGES) : null),
    why: "Real MW stems are terse. Ask density is the clearest tell of a generated question — more asks than the time budget allows.",
  },
  {
    key: "stemWords",
    label: "Stem length (words)",
    bucket: (f) => bucketise(f.stemWords, STEM_WORD_EDGES),
    why: "Generated stems drift long and explanatory. The real papers state the premise and stop.",
  },
];

// ── Fidelity scoring ────────────────────────────────────────────────────────────────────────────

export interface AxisResult {
  key: string;
  label: string;
  why: string;
  /** Total variation distance from the real corpus on this axis. Lower is better. */
  tvd: number;
  /** What TVD looks like for a REAL sample of this size — the null. */
  noiseFloor: NoiseFloor;
  /** True when tvd <= noiseFloor.p95: statistically indistinguishable from a real sample. */
  withinNoise: boolean;
  generated: Distribution;
  reference: Distribution;
  /** Buckets contributing most of the distance, worst first — the actionable part. */
  worstBuckets: { bucket: string; generated: number; reference: number; delta: number }[];
}

export interface FidelityReport {
  n: number;
  referenceN: number;
  paper: number | null;
  axes: AxisResult[];
  /** Mean TVD across axes. A headline only — always act on the per-axis rows. */
  meanTvd: number;
  /** Axes outside their noise floor. Empty = indistinguishable from the real corpus. */
  driftedAxes: string[];
}

/**
 * Score a batch of generated questions against the real corpus.
 *
 * `paper` scopes both sides to one paper when given — essential, because P1/P2/P3 have genuinely
 * different mark shapes (EK-0098) and pooling them would let a P2-shaped P3 batch hide inside the
 * blended average.
 */
export function scoreFidelity(
  generated: QuestionFeatures[],
  real: QuestionFeatures[],
  paper: number | null = null,
  opts: { comparisons?: number; familyWiseAlpha?: number } = {}
): FidelityReport {
  const gen = paper === null ? generated : generated.filter((f) => f.paper === paper);
  const ref = paper === null ? real : real.filter((f) => f.paper === paper);
  // Default assumes this report is the only family being tested. The runner passes the true count
  // (axes × papers) so the correction covers every simultaneous test, not just these five.
  const comparisons = opts.comparisons ?? AXES.length;
  const familyWiseAlpha = opts.familyWiseAlpha ?? 0.05;

  const axes = AXES.map((axis): AxisResult => {
    const g = axis.weights ? averageWeights(gen, axis.weights) : normalise(countBy(gen, axis.bucket));
    const r = axis.weights ? averageWeights(ref, axis.weights) : normalise(countBy(ref, axis.bucket));
    const tvd = totalVariationDistance(g, r);
    // The floor is always built from the single-bucket projection: a closed-form null for the mean
    // of a batch of continuous weight vectors would need its own bootstrap over the vectors
    // themselves. Single-bucket sampling noise is the LARGER of the two (averaging weights across a
    // batch is smoother than counting winners), so the floor is conservative for weighted axes —
    // it errs toward missing drift rather than inventing it, which is the safe direction for a gate.
    const noiseFloor = noiseFloorFor(ref.map(axis.bucket), gen.length, {
      comparisons,
      familyWiseAlpha,
    });
    const worstBuckets = [...new Set([...Object.keys(g), ...Object.keys(r)])]
      .map((bucket) => ({
        bucket,
        generated: g[bucket] ?? 0,
        reference: r[bucket] ?? 0,
        delta: (g[bucket] ?? 0) - (r[bucket] ?? 0),
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 3);
    return {
      key: axis.key,
      label: axis.label,
      why: axis.why,
      tvd,
      noiseFloor,
      withinNoise: tvd <= noiseFloor.cut,
      generated: g,
      reference: r,
      worstBuckets,
    };
  });

  return {
    n: gen.length,
    referenceN: ref.length,
    paper,
    axes,
    meanTvd: axes.length === 0 ? 0 : axes.reduce((a, x) => a + x.tvd, 0) / axes.length,
    driftedAxes: axes.filter((a) => !a.withinNoise).map((a) => a.key),
  };
}

/**
 * Mean of the per-question weight vectors — the batch's average mark mix.
 *
 * Averaging the normalised per-question distributions (rather than pooling raw marks) keeps every
 * question equally weighted, so one 8-wine flight with 200 marks cannot drag the batch's apparent
 * mix toward its own shape.
 */
function averageWeights(
  items: QuestionFeatures[],
  weights: (f: QuestionFeatures) => Record<string, number> | null
): Distribution {
  const totals: Record<string, number> = {};
  let n = 0;
  for (const item of items) {
    const w = weights(item);
    if (!w) continue;
    n++;
    for (const [k, v] of Object.entries(w)) totals[k] = (totals[k] ?? 0) + v;
  }
  if (n === 0) return {};
  return Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, v / n]));
}

/** Total simultaneous drift tests the runner performs — axes × papers. Drives the correction. */
export function totalComparisons(papers: number): number {
  return AXES.length * Math.max(1, papers);
}
