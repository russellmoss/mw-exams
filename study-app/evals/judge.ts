// evals/judge.ts — the LLM judge, and the calibration that decides whether it may gate anything.
//
// ── Read this before trusting a judge score ─────────────────────────────────────────────────────
//
// The generator is Claude. If the judge is also Claude, the loop is CLOSED: two instances of the
// same model family share failure modes, so the judge will ratify exactly the mistakes the
// generator is prone to. The existing `bin_reason_check` demonstrates the pathology — 67 of 69
// human bins "upheld", 0 overturned. A 0% disagreement rate is not agreement, it is an instrument
// reading its own reflection.
//
// The app has no non-Anthropic provider today (no GEMINI_API_KEY / OPENAI_API_KEY anywhere in
// src/). So this module is built provider-pluggable and ships with Claude as a LOUDLY FLAGGED
// default: `crossFamily` is false, the scorecard prints a warning, and the corpus anchor stays the
// primary signal. Add a key, register a provider, and the flag flips — nothing else changes.
//
// ── What the judge is and is not allowed to see ────────────────────────────────────────────────
//
// It sees: the question, its wines, the model answer, the paper, and real corpus exemplars.
// It never sees: the reviewer's verdict, their reason tags, or their free-text note. Those are the
// answer key. A judge shown the note would score brilliantly and measure nothing.

import Anthropic from "@anthropic-ai/sdk";
import type { GoldenItem } from "./golden";
import { cohensKappa, wilsonInterval } from "./metrics";

export const JUDGE_DIMENSIONS = [
  "exam_realism",
  "wine_plausibility",
  "obscurity_calibration",
  "stem_quality",
  "factual_accuracy",
  "answer_fidelity",
] as const;

export type JudgeDimension = (typeof JUDGE_DIMENSIONS)[number];

export interface JudgeVerdict {
  questionId: string;
  scores: Record<JudgeDimension, number>;
  verdict: "keep" | "bin";
  /** One sentence naming the deciding fault. Read these when κ is poor — they say why. */
  rationale: string;
}

export interface JudgeProvider {
  name: string;
  model: string;
  /** False when the judge shares the generator's model family — keeps it out of the verdict. */
  crossFamily: boolean;
  score(prompt: { system: string; user: string }): Promise<string>;
}

/**
 * Gemini judge — the CROSS-FAMILY one, and the one whose verdict can actually gate.
 *
 * Independence is the entire point: it does not share the generator's training, tokenizer or
 * stylistic priors, so when it and the human agree the agreement means something. Where it and a
 * Claude judge disagree is the most informative signal the eval produces — that pair of rows is
 * where self-preference bias lives, and it should go to the reviewer rather than be averaged away.
 *
 * Uses the REST endpoint directly rather than a client library: one POST, no dependency added to
 * the app's bundle, and the eval harness is the only caller.
 */
export function geminiJudge(model = "gemini-3.1-pro-preview"): JudgeProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  return {
    name: "gemini",
    model,
    crossFamily: true,
    async score(prompt) {
      if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: prompt.system }] },
            contents: [{ role: "user", parts: [{ text: prompt.user }] }],
            // Temperature 0: a judge that scores the same question differently on re-run cannot
            // support a κ, because half the disagreement with the human would be its own variance.
            generationConfig: { temperature: 0, maxOutputTokens: 2048, responseMimeType: "application/json" },
          }),
        }
      );
      if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      return (body.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
    },
  };
}

/**
 * Claude judge. Cross-family is FALSE by construction — see the header. Usable for development and
 * for a directional signal; not sufficient on its own to gate a pipeline it shares a family with.
 */
export function anthropicJudge(model = "claude-sonnet-4-6"): JudgeProvider {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return {
    name: "anthropic",
    model,
    crossFamily: false,
    async score(prompt) {
      const msg = await client.messages.create({
        model,
        max_tokens: 1024,
        system: [
          {
            type: "text" as const,
            text: prompt.system,
            // The rubric is identical on every call; caching it is the difference between a $5 eval
            // and a $40 one at 150 calibration items.
            cache_control: { type: "ephemeral" as const },
          },
        ],
        messages: [{ role: "user", content: prompt.user }],
      });
      return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    },
  };
}

const RUBRIC = `You are an examiner for the Institute of Masters of Wine practical (blind tasting) exam.
You are reviewing a GENERATED practice question to decide whether it is fit to put in front of a
candidate preparing for the real exam.

Score each dimension 1–5 (5 = indistinguishable from a real IMW question, 1 = unusable):

- exam_realism: does the stem read like a real IMW paper — terse, premise-then-asks, no coaching?
- wine_plausibility: could an IMW panel realistically source and pour these wines together?
- obscurity_calibration: is the difficulty right? Score LOW both for wines no candidate could
  reasonably place (too obscure) AND for wines that give themselves away (too easy).
- stem_quality: does the stem carry real information that narrows the field, as real stems do?
- factual_accuracy: are the appellations, varieties, ABVs and production claims correct and mutually
  consistent? A wine that cannot exist as described scores 1.
- answer_fidelity: does the model answer address every sub-part, in order, at the right mark weight?

Then give an overall verdict: "keep" or "bin".

Bin it if a careful MW examiner would refuse to use it. The most common real reasons for binning,
in observed order of frequency: the wines are too obscure; a wine is duplicated or near-duplicated;
it is too easy; the flight is not realistic; the stem is weak and carries no information; something
stated is factually wrong.

Be decisive. Roughly a third of generated questions are genuinely not fit for use — a judge that
keeps almost everything is useless. But do not bin a sound question for being merely unexciting.

Respond with ONLY a JSON object:
{"scores":{"exam_realism":N,"wine_plausibility":N,"obscurity_calibration":N,"stem_quality":N,
"factual_accuracy":N,"answer_fidelity":N},"verdict":"keep"|"bin","rationale":"one sentence"}`;

export function buildJudgePrompt(
  item: Pick<GoldenItem, "paper" | "questionText" | "wines" | "totalMarks" | "modelAnswer">,
  exemplars: string[]
): { system: string; user: string } {
  const system =
    RUBRIC +
    (exemplars.length
      ? `\n\n## REAL IMW QUESTIONS (the standard — match this voice and density)\n\n${exemplars.join("\n\n---\n\n")}`
      : "");
  const wines = item.wines.map((w) => `${w.slot}. ${w.fullText}`).join("\n");
  const answer = item.modelAnswer
    ? `\n\n## MODEL ANSWER\n${item.modelAnswer.slice(0, 6000)}`
    : "\n\n## MODEL ANSWER\n(none supplied — score answer_fidelity 3)";
  return {
    system,
    user: `## QUESTION UNDER REVIEW — Paper ${item.paper}${item.totalMarks ? ` (${item.totalMarks} marks)` : ""}

${item.questionText}

## WINES
${wines}${answer}`,
  };
}

export function parseJudgeResponse(raw: string, questionId: string): JudgeVerdict | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Partial<JudgeVerdict> & { scores?: Record<string, number> };
    if (parsed.verdict !== "keep" && parsed.verdict !== "bin") return null;
    const scores = {} as Record<JudgeDimension, number>;
    for (const d of JUDGE_DIMENSIONS) {
      const v = Number(parsed.scores?.[d]);
      // A missing dimension is a malformed response, not a 3 — silently defaulting would let a
      // judge that ignores half the rubric look calibrated.
      if (!Number.isFinite(v) || v < 1 || v > 5) return null;
      scores[d] = v;
    }
    return { questionId, scores, verdict: parsed.verdict, rationale: String(parsed.rationale ?? "") };
  } catch {
    return null;
  }
}

// ── Calibration ─────────────────────────────────────────────────────────────────────────────────

/** The bars a judge must clear before it may gate anything. See plan §4.2. */
export const CALIBRATION_BARS = {
  minKappa: 0.6,
  /** Gate on the LOWER 95% bound, not the point estimate — ~51 negatives is a wide interval. */
  minBinRecallLowerBound: 0.7,
  /** Objectively-wrong questions. Anything less than perfect is disqualifying. */
  requiredSyntheticFloor: 1.0,
  /**
   * Ceiling on wrongly-binned GOOD questions.
   *
   * Without this, recall is trivially gameable: a judge that bins everything scores 100% recall and
   * a perfect synthetic floor. κ catches the degenerate case, but not a judge merely tuned
   * over-strict — and an over-strict pre-bank gate is expensive in a different direction, throwing
   * away sound questions and starving the pool. Recall and precision have to be bounded together.
   */
  maxFalseBinRate: 0.25,
} as const;

export interface CalibrationResult {
  n: number;
  parsed: number;
  kappa: number;
  binRecall: number;
  binRecallLo: number;
  binRecallHi: number;
  /**
   * Share of KEPT questions the judge binned WITHOUT citing a checkable fault — the cost side of a
   * strict judge. Excludes `disputed` (see below), because counting those against the judge would
   * penalise it for being right.
   */
  falseBinRate: number;
  /**
   * Human said keep; judge said bin AND scored `factual_accuracy` ≤ 2.
   *
   * These are NOT judge errors until a person says they are. Measured on the first cross-family run
   * (Gemini, 2026-08-07): of 6 human-kept questions the judge binned, at least two were binned for
   * verifiable factual errors that every validator and the reviewer had passed —
   * "Thierry Germain, Saumur Blanc Les Memoires" (Les Mémoires is a Saumur-Champigny RED) and
   * "Felton Road Block 1 Riesling (13.0%)" (Block 1 is 8.5% ABV, 67 g/L RS). Both verified against
   * independent sources.
   *
   * A reviewer scanning dozens of questions cannot check every ABV and appellation, so the human
   * labels are a strong reference for exam CRAFT and a weak one for FACT. Folding these into
   * `falseBinRate` would have disqualified a judge for out-performing its reference — and tuning
   * the rubric until they went away would have destroyed the most valuable signal the eval produces.
   */
  disputed: { questionId: string; rationale: string }[];
  syntheticFloorHits: number;
  syntheticFloorTotal: number;
  syntheticFloorRate: number;
  /** True only when every bar is cleared. */
  qualified: boolean;
  failures: string[];
  /** Per-corruption misses — diagnoses WHAT the judge is blind to, not just that it failed. */
  missedCorruptions: string[];
}

export function assessCalibration(
  verdicts: JudgeVerdict[],
  truth: GoldenItem[]
): CalibrationResult {
  const byId = new Map(truth.map((t) => [t.questionId, t]));
  const paired = verdicts
    .map((v) => ({ v, t: byId.get(v.questionId) }))
    .filter((p): p is { v: JudgeVerdict; t: GoldenItem } => p.t !== undefined);

  const real = paired.filter((p) => p.t.split !== "synthetic_floor");
  const synth = paired.filter((p) => p.t.split === "synthetic_floor");

  const humanBin = real.map((p) => p.t.verdict === "bin");
  const judgeBin = real.map((p) => p.v.verdict === "bin");
  const kappa = cohensKappa(humanBin, judgeBin);

  const negatives = real.filter((p) => p.t.verdict === "bin");
  const caught = negatives.filter((p) => p.v.verdict === "bin").length;
  const recall = negatives.length === 0 ? 0 : caught / negatives.length;
  const ci = wilsonInterval(caught, negatives.length);

  const positives = real.filter((p) => p.t.verdict === "keep");
  const binnedPositives = positives.filter((p) => p.v.verdict === "bin");
  // Split "you binned a good question" from "you binned a question you say contains a factual
  // error". Only the former is evidence the judge is too strict; the latter is a claim to check.
  const disputedPairs = binnedPositives.filter((p) => p.v.scores.factual_accuracy <= 2);
  const falseBins = binnedPositives.length - disputedPairs.length;

  const synthHits = synth.filter((p) => p.v.verdict === "bin").length;
  const missedCorruptions = synth
    .filter((p) => p.v.verdict !== "bin")
    .map((p) => p.t.reasonTags[0] ?? p.t.questionId);

  const falseBinRate = positives.length === 0 ? 0 : falseBins / positives.length;

  const failures: string[] = [];
  if (kappa < CALIBRATION_BARS.minKappa)
    failures.push(`κ ${kappa.toFixed(3)} < ${CALIBRATION_BARS.minKappa}`);
  if (falseBinRate > CALIBRATION_BARS.maxFalseBinRate)
    failures.push(
      `false-bin rate ${(falseBinRate * 100).toFixed(1)}% > ` +
        `${(CALIBRATION_BARS.maxFalseBinRate * 100).toFixed(0)}% — too strict; it would discard sound questions`
    );
  if (ci.lo < CALIBRATION_BARS.minBinRecallLowerBound)
    failures.push(
      `bin-recall 95% lower bound ${ci.lo.toFixed(3)} < ${CALIBRATION_BARS.minBinRecallLowerBound} ` +
        `(point estimate ${recall.toFixed(3)} on only ${negatives.length} negatives)`
    );
  if (synth.length > 0 && synthHits / synth.length < CALIBRATION_BARS.requiredSyntheticFloor)
    failures.push(
      `synthetic floor ${synthHits}/${synth.length} — missed: ${[...new Set(missedCorruptions)].join(", ")}`
    );
  if (synth.length === 0) failures.push("synthetic floor was not scored — cannot qualify without it");

  return {
    n: paired.length,
    parsed: verdicts.length,
    kappa,
    binRecall: recall,
    binRecallLo: ci.lo,
    binRecallHi: ci.hi,
    falseBinRate,
    disputed: disputedPairs.map((p) => ({ questionId: p.t.questionId, rationale: p.v.rationale })),
    syntheticFloorHits: synthHits,
    syntheticFloorTotal: synth.length,
    syntheticFloorRate: synth.length === 0 ? 0 : synthHits / synth.length,
    qualified: failures.length === 0,
    failures,
    missedCorruptions: [...new Set(missedCorruptions)],
  };
}
