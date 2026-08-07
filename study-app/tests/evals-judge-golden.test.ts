import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  assessCalibration,
  buildJudgePrompt,
  parseJudgeResponse,
  CALIBRATION_BARS,
  JUDGE_DIMENSIONS,
  type JudgeVerdict,
} from "../evals/judge";
import {
  checkGoldenHealth,
  hashItems,
  parseGolden,
  serialiseGolden,
  assignSplits,
  MIN_HOLDOUT_NEGATIVES,
  SYNTHETIC_FLOOR_SIZE,
  type GoldenItem,
} from "../evals/golden";
import { seededRandom } from "../evals/metrics";
import { compareToBaseline, renderScorecard, type Scorecard, type Baseline } from "../evals/scorecard";

/**
 * The judge's calibration arithmetic and the golden set's integrity.
 *
 * The live calibration run needs an API key; this file proves the machinery it feeds is correct, so
 * that when the real numbers arrive they are being judged by something that works. Every case here
 * is a scenario that would otherwise only be discovered by trusting a bad judge in production.
 */

const item = (over: Partial<GoldenItem> = {}): GoldenItem => ({
  questionId: over.questionId ?? "q1",
  split: over.split ?? "holdout",
  paper: over.paper ?? 1,
  family: over.family ?? "F1",
  verdict: over.verdict ?? "keep",
  reasonTags: over.reasonTags ?? [],
  reasonNote: over.reasonNote ?? null,
  questionText: over.questionText ?? "Wines 1 and 2 are Chardonnay.\na) Identify the origin (25 marks)",
  wines: over.wines ?? [{ slot: 1, fullText: "Producer, Cuvée, 2019. Chablis, France. (12.5%)" }],
  totalMarks: over.totalMarks ?? 50,
  // `??` would swallow an explicit null, and "no model answer" is a case under test.
  modelAnswer: "modelAnswer" in over ? over.modelAnswer! : "An answer.",
  corruption: over.corruption,
});

const verdict = (id: string, v: "keep" | "bin"): JudgeVerdict => ({
  questionId: id,
  verdict: v,
  scores: Object.fromEntries(JUDGE_DIMENSIONS.map((d) => [d, 3])) as JudgeVerdict["scores"],
  rationale: "",
});

describe("parseJudgeResponse", () => {
  const good = JSON.stringify({
    scores: Object.fromEntries(JUDGE_DIMENSIONS.map((d) => [d, 4])),
    verdict: "bin",
    rationale: "Wines are too obscure.",
  });

  it("parses a well-formed response", () => {
    const out = parseJudgeResponse(good, "q1");
    expect(out?.verdict).toBe("bin");
    expect(out?.scores.exam_realism).toBe(4);
  });

  it("tolerates prose around the JSON", () => {
    expect(parseJudgeResponse(`Here you go:\n${good}\nHope that helps.`, "q1")?.verdict).toBe("bin");
  });

  it("REJECTS a response missing a dimension rather than defaulting it", () => {
    // Defaulting to 3 would let a judge that ignores half the rubric look calibrated.
    const partial = JSON.stringify({
      scores: { exam_realism: 4 },
      verdict: "keep",
      rationale: "",
    });
    expect(parseJudgeResponse(partial, "q1")).toBeNull();
  });

  it("rejects out-of-range scores and bad verdicts", () => {
    const bad = JSON.stringify({
      scores: Object.fromEntries(JUDGE_DIMENSIONS.map((d) => [d, 9])),
      verdict: "bin",
      rationale: "",
    });
    expect(parseJudgeResponse(bad, "q1")).toBeNull();
    expect(parseJudgeResponse(good.replace('"bin"', '"maybe"'), "q1")).toBeNull();
  });

  it("returns null on junk instead of throwing mid-run", () => {
    expect(parseJudgeResponse("total nonsense", "q1")).toBeNull();
    expect(parseJudgeResponse("{ not json", "q1")).toBeNull();
  });
});

describe("buildJudgePrompt", () => {
  it("never leaks the reviewer's verdict, tags or note — those are the answer key", () => {
    const it0 = item({ verdict: "bin", reasonTags: ["too_obscure"], reasonNote: "Nobody could place this." });
    const { system, user } = buildJudgePrompt(it0, []);
    const blob = `${system}\n${user}`;
    expect(blob).not.toContain("too_obscure");
    expect(blob).not.toContain("Nobody could place this");
    expect(blob).not.toMatch(/reviewer|verdict"\s*:\s*"bin"/i);
  });

  it("includes the wines and the model answer", () => {
    const { user } = buildJudgePrompt(item(), []);
    expect(user).toContain("Chablis");
    expect(user).toContain("An answer.");
  });

  it("tells the judge to neutralise answer_fidelity when there is no answer", () => {
    const { user } = buildJudgePrompt(item({ modelAnswer: null }), []);
    expect(user).toMatch(/score answer_fidelity 3/);
  });

  it("puts corpus exemplars in the cacheable system block, not the per-question message", () => {
    const { system, user } = buildJudgePrompt(item(), ["REAL QUESTION TEXT"]);
    expect(system).toContain("REAL QUESTION TEXT");
    expect(user).not.toContain("REAL QUESTION TEXT");
  });
});

describe("assessCalibration", () => {
  const truth = [
    ...Array.from({ length: 50 }, (_, i) => item({ questionId: `bin${i}`, verdict: "bin" })),
    ...Array.from({ length: 100 }, (_, i) => item({ questionId: `keep${i}`, verdict: "keep" })),
    ...Array.from({ length: 20 }, (_, i) =>
      item({ questionId: `syn${i}`, split: "synthetic_floor", verdict: "bin", reasonTags: ["marks_do_not_sum"] })
    ),
  ];

  it("disqualifies a judge that keeps everything — the failure raw accuracy hides", () => {
    const verdicts = truth.map((t) => verdict(t.questionId, "keep"));
    const r = assessCalibration(verdicts, truth);
    expect(r.kappa).toBeCloseTo(0, 6);
    expect(r.binRecall).toBe(0);
    expect(r.qualified).toBe(false);
    expect(r.syntheticFloorHits).toBe(0);
  });

  it("disqualifies a perfect-on-humans judge that misses the synthetic floor", () => {
    // The floor exists exactly for this: a judge can learn one reviewer's taste and still not know
    // that marks must sum. Matching the human is not the same as being right.
    const verdicts = truth.map((t) =>
      verdict(t.questionId, t.split === "synthetic_floor" ? "keep" : t.verdict)
    );
    const r = assessCalibration(verdicts, truth);
    expect(r.kappa).toBe(1);
    expect(r.binRecall).toBe(1);
    expect(r.qualified).toBe(false);
    expect(r.failures.join(" ")).toMatch(/synthetic floor 0\/20/);
    expect(r.missedCorruptions).toEqual(["marks_do_not_sum"]);
  });

  it("qualifies a judge that clears every bar", () => {
    const verdicts = truth.map((t) => verdict(t.questionId, t.verdict));
    const r = assessCalibration(verdicts, truth);
    expect(r.qualified).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("gates on the LOWER CI bound, so a lucky point estimate cannot qualify a judge", () => {
    // 39/50 negatives = 78% recall, comfortably over 70% as a point estimate...
    const verdicts = truth.map((t, i) =>
      verdict(t.questionId, t.verdict === "bin" && i < 11 ? "keep" : t.verdict)
    );
    const r = assessCalibration(verdicts, truth);
    expect(r.binRecall).toBeGreaterThan(CALIBRATION_BARS.minBinRecallLowerBound);
    // ...but the interval's lower bound is not, because 50 negatives is a small sample.
    expect(r.binRecallLo).toBeLessThan(CALIBRATION_BARS.minBinRecallLowerBound);
    expect(r.qualified).toBe(false);
    expect(r.failures.join(" ")).toMatch(/lower bound/);
  });

  it("cannot qualify without the synthetic floor being scored at all", () => {
    const realOnly = truth.filter((t) => t.split !== "synthetic_floor");
    const r = assessCalibration(realOnly.map((t) => verdict(t.questionId, t.verdict)), realOnly);
    expect(r.qualified).toBe(false);
    expect(r.failures.join(" ")).toMatch(/synthetic floor was not scored/);
  });

  it("reports the cost of a trigger-happy judge separately from its recall", () => {
    const verdicts = truth.map((t) => verdict(t.questionId, "bin"));
    const r = assessCalibration(verdicts, truth);
    expect(r.binRecall).toBe(1);
    expect(r.falseBinRate).toBe(1); // bins every good question too
    expect(r.qualified).toBe(false);
    expect(r.failures.join(" ")).toMatch(/false-bin rate/);
  });

  it("disqualifies a merely OVER-STRICT judge that recall alone would wave through", () => {
    // Catches every bad question AND bins 40% of the good ones. Perfect recall, perfect floor, κ
    // still respectable — but as a pre-bank gate it would throw away two of every five sound
    // questions and starve the pool. Recall has to be bounded together with precision.
    const verdicts = truth.map((t, i) =>
      verdict(t.questionId, t.verdict === "keep" && i % 5 < 2 ? "bin" : t.verdict)
    );
    const r = assessCalibration(verdicts, truth);
    expect(r.binRecall).toBe(1);
    expect(r.syntheticFloorHits).toBe(20);
    expect(r.falseBinRate).toBeGreaterThan(0.25);
    expect(r.qualified).toBe(false);
    expect(r.failures.join(" ")).toMatch(/too strict/);
  });
});

describe("golden set integrity", () => {
  it("hashes content, not formatting — reordering must not invalidate a baseline", () => {
    const a = [item({ questionId: "a" }), item({ questionId: "b" })];
    expect(hashItems(a)).toBe(hashItems([a[1], a[0]]));
  });

  it("hash CHANGES when a label changes — that must invalidate a baseline", () => {
    const a = [item({ questionId: "a", verdict: "keep" })];
    const b = [item({ questionId: "a", verdict: "bin" })];
    expect(hashItems(a)).not.toBe(hashItems(b));
  });

  it("round-trips through jsonl", () => {
    const items = [item({ questionId: "a" }), item({ questionId: "b", verdict: "bin" })];
    const set = parseGolden(serialiseGolden(items));
    expect(set.items).toHaveLength(2);
    expect(set.hash).toBe(hashItems(items));
  });

  it("warns on a thin holdout rather than silently gating on it", () => {
    const items = [
      ...Array.from({ length: 10 }, (_, i) => item({ questionId: `h${i}`, split: "holdout", verdict: "bin" })),
      ...Array.from({ length: SYNTHETIC_FLOOR_SIZE }, (_, i) =>
        item({ questionId: `s${i}`, split: "synthetic_floor", verdict: "bin" })
      ),
    ];
    const health = checkGoldenHealth({ hash: "x", builtAt: "", items });
    expect(health.ok).toBe(false);
    expect(health.warnings.join(" ")).toMatch(/negatives/);
  });

  it("catches a floor item mislabelled 'keep' — every floor item is deliberately broken", () => {
    const items = Array.from({ length: SYNTHETIC_FLOOR_SIZE }, (_, i) =>
      item({ questionId: `s${i}`, split: "synthetic_floor", verdict: i === 0 ? "keep" : "bin" })
    );
    const health = checkGoldenHealth({ hash: "x", builtAt: "", items });
    expect(health.warnings.join(" ")).toMatch(/labelled 'keep'/);
  });

  it("catches a duplicate id — the same question in two splits leaks the holdout", () => {
    const items = [item({ questionId: "dup", split: "calibration" }), item({ questionId: "dup", split: "holdout" })];
    const health = checkGoldenHealth({ hash: "x", builtAt: "", items });
    expect(health.warnings.join(" ")).toMatch(/Duplicate questionIds/);
  });

  it("stratifies so each split keeps the paper/verdict mix", () => {
    const src = [
      ...Array.from({ length: 60 }, () => ({ paper: 1, family: "F1", verdict: "bin" as const })),
      ...Array.from({ length: 60 }, () => ({ paper: 3, family: "F2", verdict: "keep" as const })),
    ];
    const out = assignSplits(src, { calibration: 1, holdout: 1, regression: 1 }, seededRandom(1));
    for (const split of ["calibration", "holdout", "regression"] as const) {
      const s = out.filter((o) => o.split === split);
      expect(s.filter((o) => o.verdict === "bin").length).toBe(20);
      expect(s.filter((o) => o.paper === 3).length).toBe(20);
    }
  });

  it("is deterministic for a given seed — an unchanged bank rebuilds identically", () => {
    const src = Array.from({ length: 30 }, (_, i) => ({
      paper: (i % 3) + 1,
      family: "F1",
      verdict: (i % 2 ? "bin" : "keep") as "bin" | "keep",
    }));
    const a = assignSplits(src, { calibration: 1, holdout: 1, regression: 1 }, seededRandom(5));
    const b = assignSplits(src, { calibration: 1, holdout: 1, regression: 1 }, seededRandom(5));
    expect(a.map((x) => x.split)).toEqual(b.map((x) => x.split));
  });
});

describe("the committed golden set", () => {
  const path = join(process.cwd(), "evals", "golden", "questions.jsonl");

  it.skipIf(!existsSync(path))("is healthy and has enough holdout negatives to gate", () => {
    const set = parseGolden(readFileSync(path, "utf-8"));
    const health = checkGoldenHealth(set);
    expect(health.counts.synthetic_floor.total).toBe(SYNTHETIC_FLOOR_SIZE);
    expect(health.counts.holdout.bin).toBeGreaterThanOrEqual(MIN_HOLDOUT_NEGATIVES);
    expect(health.warnings).toEqual([]);
  });

  it.skipIf(!existsSync(path))("matches the hash recorded in meta.json", () => {
    const set = parseGolden(readFileSync(path, "utf-8"));
    const meta = JSON.parse(readFileSync(join(process.cwd(), "evals", "golden", "meta.json"), "utf-8"));
    expect(set.hash).toBe(meta.hash);
  });
});

describe("scorecard verdicts", () => {
  const card = (firstPass: number): Scorecard => ({
    config: "prod",
    createdAt: "2026-08-07T00:00:00Z",
    n: 60,
    fidelity: [],
    metrics: [
      {
        key: "firstPass",
        label: "First-pass rate",
        value: firstPass,
        direction: "higher_is_better",
        unit: "%",
        minRelevantDelta: 2,
      },
    ],
  });
  /** A baseline of MIN_BASELINE_RUNS runs with the given values, repeated to length. */
  const baselineOf = (...values: number[]): Baseline => ({
    config: "prod",
    runs: Array.from({ length: Math.max(5, values.length) }, (_, i) => card(values[i % values.length])),
  });

  it("refuses to judge anything without enough baseline runs", () => {
    expect(compareToBaseline(card(25), null).overall).toBe("NO_BASELINE");
    const thin: Baseline = { config: "prod", runs: [card(20), card(21), card(19)] };
    expect(compareToBaseline(card(40), thin).overall).toBe("NO_BASELINE");
  });

  it("calls a within-noise move NOISE, not a win — the loop's main self-deception", () => {
    const v = compareToBaseline(card(25), baselineOf(20, 26, 19, 23, 21));
    expect(v.metrics[0].verdict).toBe("NOISE");
    expect(v.overall).toBe("PASS");
  });

  it("calls a large, tightly-baselined gain IMPROVED", () => {
    expect(compareToBaseline(card(40), baselineOf(20, 21, 19, 20, 21)).overall).toBe("IMPROVED");
  });

  it("calls a large, tightly-baselined loss REGRESS", () => {
    const v = compareToBaseline(card(5), baselineOf(20, 21, 19, 20, 21));
    expect(v.overall).toBe("REGRESS");
    expect(v.reasons.join(" ")).toMatch(/First-pass rate moved/);
  });

  it("uses a t-based threshold, so a small baseline demands a BIGGER move", () => {
    // Same delta, same spread — only the baseline size differs. The 5-run baseline must be harder
    // to trip than the 12-run one, because sd from 5 points is itself unreliable.
    const five = compareToBaseline(card(24), baselineOf(20, 21, 19, 20, 21));
    const twelve: Baseline = {
      config: "prod",
      runs: Array.from({ length: 12 }, (_, i) => card([20, 21, 19, 20, 21][i % 5])),
    };
    expect(five.metrics[0].threshold).toBeGreaterThan(twelve.runs.length ? 2.4 : 0);
    expect(compareToBaseline(card(24), twelve).metrics[0].threshold).toBeLessThan(
      five.metrics[0].threshold
    );
  });

  it("never reports IMPROVED for jitter against a zero-spread baseline", () => {
    // 0.800 → 0.801 on an identical-every-run metric divides by sd=0 → ∞σ. Without a practical-
    // significance floor the scorecard would confidently call that an improvement.
    const flat = (v: number): Scorecard => ({
      ...card(20),
      metrics: [
        {
          key: "ratio",
          label: "Deterministic ratio",
          value: v,
          direction: "higher_is_better",
          minRelevantDelta: 0.01,
        },
      ],
    });
    const base: Baseline = { config: "prod", runs: Array.from({ length: 5 }, () => flat(0.8)) };
    const v = compareToBaseline(flat(0.801), base);
    expect(v.metrics[0].sigmas).toBe(Infinity);
    expect(v.metrics[0].practicallySignificant).toBe(false);
    expect(v.metrics[0].verdict).toBe("NOISE");
    expect(v.overall).toBe("PASS");
  });

  it("still catches a REAL move against a zero-spread baseline", () => {
    const flat = (v: number): Scorecard => ({
      ...card(20),
      metrics: [
        { key: "ratio", label: "Ratio", value: v, direction: "higher_is_better", minRelevantDelta: 0.01 },
      ],
    });
    const base: Baseline = { config: "prod", runs: Array.from({ length: 5 }, () => flat(0.8)) };
    expect(compareToBaseline(flat(0.5), base).overall).toBe("REGRESS");
  });

  it("never lets an advisory metric produce a REGRESS", () => {
    const advisoryCard = (v: number): Scorecard => ({
      ...card(20),
      metrics: [
        {
          key: "judge",
          label: "Judge score",
          value: v,
          direction: "higher_is_better",
          advisory: true,
          minRelevantDelta: 0.1,
        },
      ],
    });
    const base: Baseline = {
      config: "prod",
      runs: [4, 4.1, 3.9, 4, 4.05].map((v) => advisoryCard(v)),
    };
    const v = compareToBaseline(advisoryCard(1), base);
    expect(v.metrics[0].verdict).toBe("NOISE");
    expect(v.overall).toBe("PASS");
  });

  it("REGRESSES on corpus-fidelity drift even when every metric is flat", () => {
    const drifted: Scorecard = {
      ...card(20),
      fidelity: [
        {
          n: 60, referenceN: 162, paper: 1, axes: [], meanTvd: 0.4, driftedAxes: ["flightSize", "markFocus"],
        },
      ],
    };
    const v = compareToBaseline(drifted, baselineOf(20));
    expect(v.overall).toBe("REGRESS");
    expect(v.reasons.join(" ")).toMatch(/Corpus fidelity drifted on flightSize, markFocus/);
  });

  it("renders the closed-loop warning whenever the judge is the generator's own family", () => {
    const withJudge: Scorecard = {
      ...card(20),
      judge: { provider: "anthropic", model: "claude-sonnet-4-6", calibrated: false, kappa: 0.5 },
    };
    const md = renderScorecard(withJudge, compareToBaseline(withJudge, null));
    expect(md).toMatch(/SAME MODEL FAMILY|Same model family/i);
    expect(md).toMatch(/Not calibrated/i);
  });
});
