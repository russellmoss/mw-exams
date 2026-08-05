// length-check.ts — Length Check (feature): keep generated bank questions at real MW paper
// length/complexity.
//
// Real MW sub-bullets are terse and ask one or two things; a generator left to itself tends to bundle
// oak + yeast + maturity + quality + origin into a single 60-word bullet that no candidate could
// answer in the eight minutes the exam allows. This module audits a freshly generated question with a
// single LLM classification call (an "ask" is a distinct interrogative demand — detected by the model,
// NOT by regex, since "quality" + "method of production" reads as one clause but is two asks), and if
// it runs long, makes exactly ONE repair call that splits over-crowded bullets and trims wordy ones —
// preserving meaning, every printed mark number, and the 25-marks-per-wine total (EK-0041).
//
// It runs in the bank-generation path only (a batchId is present); the interactive study path is
// untouched. Token cost is logged to the existing model_usage tracking under task 'length-check'.

import Anthropic from "@anthropic-ai/sdk";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import type { UsageMeta } from "@/lib/question-engine";

// ── RULES (constants) ────────────────────────────────────────────────────────────────────────────

// An 'ask' = a distinct interrogative demand within one sub-bullet ("quality" + "method of
// production" = 2). More than three in one bullet is an automatic reject; two is the sweet spot.
export const MAX_ASKS_PER_BULLET = 3;
export const PREFERRED_ASKS = 2;

// Sub-bullet word budget scales with the marks the bullet is worth: a 5-mark ask is one line, a
// 25-mark compare/contrast earns room to breathe. Returns the max words allowed for `marks`.
export function wordBudgetForMarks(marks: number): number {
  if (marks <= 5) return 25;
  if (marks <= 12) return 35;
  if (marks <= 24) return 45;
  return 60; // >=25 marks
}

// Numerical "state RS / ABV" bullets (2-mark, EK-0018) are one line and exactly one ask.
export const NUMERICAL_MAX_WORDS = 15;
export const NUMERICAL_ASKS = 1;

// The whole question — preamble + every bullet, EXCLUDING the wine list — must stay under this.
export const MAX_TOTAL_WORDS = 140;

// ── Types ────────────────────────────────────────────────────────────────────────────────────────

// One sub-bullet as classified by the validator LLM. `asks` is the model's list of the distinct
// demands it found; `violations` is the human-readable list of which budgets this bullet broke.
export interface LengthPerBullet {
  index: number;
  marks: number;
  wordCount: number;
  askCount: number;
  asks: string[];
  violations: string[];
}

// The raw runLengthCheck verdict.
export interface LengthCheckResult {
  perBullet: LengthPerBullet[];
  totalWords: number;
  pass: boolean;
}

// A single repaired bullet, kept for the admin before/after diff panel.
export interface LengthChange {
  bulletIndex: number;
  before: string;
  after: string;
}

// The JSONB stored on the question (length_check column). Drops the transient `asks` list; keeps the
// per-bullet metrics, the changed-bullet diffs, and a one-line human summary.
export interface StoredLengthCheck {
  totalWords: number;
  bullets: { index: number; marks: number; wordCount: number; askCount: number; violations: string[] }[];
  changes: LengthChange[];
  summary: string;
}

export type LengthCheckStatus = "clean" | "trimmed" | "over";

// What the pipeline gets back: the (possibly rewritten) stem, the status to stamp, and the JSONB to
// persist. `questionText` is unchanged when status is 'clean' or 'over'.
export interface LengthCheckOutcome {
  status: LengthCheckStatus;
  questionText: string;
  lengthCheck: StoredLengthCheck | null;
}

// ── The budgets, as a prompt block (shared by the validator and the repair call) ──────────────────

const BUDGET_RULES = `RULES (MW paper length / complexity):
- An "ask" is a distinct interrogative demand inside ONE sub-bullet. "assess the quality and the method of production" = 2 asks. "identify the grape variety and the region" = 2 asks. Count the SEPARATE things a candidate must answer, not the clauses.
- At most ${MAX_ASKS_PER_BULLET} asks per sub-bullet (aim for 1-2). More than ${MAX_ASKS_PER_BULLET} is a hard violation.
- Sub-bullet word budget by the marks that bullet is worth: <=5 marks -> max 25 words; 6-12 marks -> max 35 words; 13-24 marks -> max 45 words; >=25 marks -> max 60 words.
- A numerical "state the residual sugar / alcohol" bullet (2 marks) -> max ${NUMERICAL_MAX_WORDS} words and EXACTLY 1 ask.
- The WHOLE question (preamble + all sub-bullets, EXCLUDING the wine list) -> max ${MAX_TOTAL_WORDS} words.`;

// ── The LLM call helper ───────────────────────────────────────────────────────────────────────────

function textOf(message: Anthropic.Message): string {
  return message.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
}

function extractJson(text: string): unknown {
  // The models wrap JSON in prose / code fences often enough that a bare JSON.parse is unsafe; slice
  // the outermost object.
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(start, end + 1));
}

// ── runLengthCheck — the single classification call ──────────────────────────────────────────────

/**
 * Audit a question's sub-bullets for ask-density and length against the MW budgets. One LLM call, same
 * provider/model tier as generation. Returns the per-bullet counts + the list of
 * asks the model found + which budgets each bullet broke, plus the whole-question word count and a
 * pass flag. Token cost is logged under task 'length-check'.
 */
export async function runLengthCheck(
  questionText: string,
  apiKey: string,
  meta?: UsageMeta,
  questionId?: string
): Promise<LengthCheckResult> {
  const client = new Anthropic({ apiKey });
  const { model, abGroup } = await selectModel("question_generation", apiKey, "sonnet");

  const system = `You are a strict MW exam length auditor. You are given ONE tasting question: a short preamble followed by lettered sub-bullets (a), (b), (c)... each ending in a printed mark value like "(2 x 8 marks)" or "(10 marks)".

${BUDGET_RULES}

For EACH sub-bullet, in order, determine:
- index: 0-based position among the sub-bullets.
- marks: the total marks that bullet is worth (for "N x M marks" use M, the per-wine value, since the budget is per candidate answer).
- wordCount: number of words in the bullet's instruction text (exclude the "(… marks)" token).
- asks: the list of distinct interrogative demands in that bullet (short phrases).
- askCount: asks.length.
- violations: human-readable strings for EACH budget this bullet breaks (too many asks, over its word budget, numerical bullet with >1 ask, etc). Empty if the bullet is fine.

Also compute totalWords = words in the whole question (preamble + all sub-bullets) EXCLUDING the wine list, and set pass = true only if NO bullet has any violation AND totalWords <= ${MAX_TOTAL_WORDS}.

Respond with ONLY this JSON, no prose:
{"perBullet":[{"index":0,"marks":10,"wordCount":12,"askCount":2,"asks":["identify variety","identify region"],"violations":[]}],"totalWords":95,"pass":true}`;

  const t0 = Date.now();
  const message = await client.messages.create(
    {
      model,
      max_tokens: 1500,
      // NO `temperature` — see the note on the same omission in repairQuestion below.
      system,
      messages: [{ role: "user", content: `QUESTION:\n${questionText}` }],
    },
    { timeout: Number(process.env.LENGTH_CHECK_TIMEOUT_MS) || 45_000, maxRetries: 1 }
  );
  logClaudeUsage(
    { taskType: "length-check", model, source: meta?.source, userId: meta?.userId, batchId: meta?.batchId, questionId, abGroup },
    message.usage,
    { latencyMs: Date.now() - t0 }
  );

  const raw = extractJson(textOf(message)) as Partial<LengthCheckResult>;
  const perBullet: LengthPerBullet[] = Array.isArray(raw.perBullet)
    ? raw.perBullet.map((b, i) => ({
        index: typeof b.index === "number" ? b.index : i,
        marks: Number(b.marks) || 0,
        wordCount: Number(b.wordCount) || 0,
        askCount: Number(b.askCount) || (Array.isArray(b.asks) ? b.asks.length : 0),
        asks: Array.isArray(b.asks) ? b.asks.map(String) : [],
        violations: Array.isArray(b.violations) ? b.violations.map(String) : [],
      }))
    : [];
  const totalWords = Number(raw.totalWords) || 0;
  // Trust the model's per-bullet violations + total for the pass flag, but recompute defensively so a
  // model that forgets to set `pass` can't sneak an over-long question through as clean.
  const pass =
    perBullet.every((b) => b.violations.length === 0) && totalWords <= MAX_TOTAL_WORDS;
  return { perBullet, totalWords, pass };
}

// ── repairQuestion — the single auto-repair call ─────────────────────────────────────────────────

// The repair LLM returns the rewritten stem plus the changed bullets (for the diff) and a one-line
// summary of what it did.
interface RepairResult {
  questionText: string;
  changes: LengthChange[];
  summary: string;
}

/**
 * One repair pass: split over-crowded sub-bullets and trim wordy ones while preserving meaning,
 * every printed mark number, and the mark total. When a bullet is split, the split bullets' marks
 * MUST sum to the original — no other mark number may change, and the whole-question total (25 marks
 * per wine) is invariant. Returns the rewritten stem + the before/after for each changed bullet.
 */
async function repairQuestion(
  questionText: string,
  check: LengthCheckResult,
  apiKey: string,
  meta?: UsageMeta,
  questionId?: string
): Promise<RepairResult> {
  const client = new Anthropic({ apiKey });
  const { model, abGroup } = await selectModel("question_generation", apiKey, "sonnet");

  const problems = check.perBullet
    .filter((b) => b.violations.length > 0)
    .map((b) => `- bullet ${b.index} (${b.marks} marks, ${b.wordCount} words, ${b.askCount} asks): ${b.violations.join("; ")}`)
    .join("\n");

  const system = `You are an MW exam editor. Rewrite ONE tasting question so every sub-bullet fits the MW length / ask-density budgets, WITHOUT changing its meaning or its marks.

${BUDGET_RULES}

HARD CONSTRAINTS:
- Do NOT change any printed mark number, and do NOT change the whole-question mark total. The exam is exactly 25 marks per wine.
- You MAY split one over-crowded sub-bullet into two — but the split bullets' marks MUST sum to the original bullet's marks (e.g. "(2 x 10 marks)" -> "(2 x 6 marks)" + "(2 x 4 marks)"). Never invent new marks.
- Trim wordy bullets by removing filler, not by dropping any distinct ask. Every ask a candidate must answer stays answerable.
- Keep the same lettering style ((a), (b), ...) and re-letter cleanly if you split.
- Never bundle oak, yeast, maturity, quality, and origin into one bullet.

Bullets that failed:
${problems}

Respond with ONLY this JSON:
{"questionText":"<the full rewritten question>","summary":"<one sentence, e.g. 'Bullet 2 asked 4 things — split into two bullets. Marks unchanged.'>","changes":[{"bulletIndex":1,"before":"<original bullet text incl marks>","after":"<rewritten, may be the two new bullets joined by a newline>"}]}`;

  const t0 = Date.now();
  const message = await client.messages.create(
    {
      model,
      max_tokens: 2000,
      // NO `temperature`. Opus 5 rejects it outright — HTTP 400, "`temperature` is deprecated for this
      // model". This module selects the 'question_generation' tier with an "opus" default, so the day
      // that tier resolves to Opus 5 both calls here start 400ing. And because enforceLengthCheck
      // swallows every error and returns { status: 'clean' } so a checker outage can't fail a batch,
      // the failure would be COMPLETELY silent: every stem stamped clean, no badge, nothing in the
      // logs a reviewer reads. Caught when the identical parameter broke the new model-answer gate on
      // the 'model_answer' tier, which already resolves to Opus 5.
      //
      // Losing temperature:0 costs the audit call its determinism — two runs on the same stem may now
      // differ at the margin. That is the right trade: the check is advisory, one repair pass is
      // bounded, and a non-deterministic check that RUNS beats a deterministic one that silently
      // doesn't.
      system,
      messages: [{ role: "user", content: `QUESTION:\n${questionText}` }],
    },
    { timeout: Number(process.env.LENGTH_CHECK_TIMEOUT_MS) || 45_000, maxRetries: 1 }
  );
  logClaudeUsage(
    { taskType: "length-check", model, source: meta?.source, userId: meta?.userId, batchId: meta?.batchId, questionId, abGroup },
    message.usage,
    { latencyMs: Date.now() - t0 }
  );

  const raw = extractJson(textOf(message)) as Partial<RepairResult>;
  const rewritten = typeof raw.questionText === "string" && raw.questionText.trim() ? raw.questionText.trim() : questionText;
  const changes: LengthChange[] = Array.isArray(raw.changes)
    ? raw.changes
        .filter((c) => c && typeof c.before === "string" && typeof c.after === "string")
        .map((c) => ({ bulletIndex: Number(c.bulletIndex) || 0, before: String(c.before), after: String(c.after) }))
    : [];
  const summary = typeof raw.summary === "string" && raw.summary.trim() ? raw.summary.trim() : "Trimmed over-long sub-bullets. Marks unchanged.";
  return { questionText: rewritten, changes, summary };
}

// ── Helpers to shape the stored JSONB ────────────────────────────────────────────────────────────

function toStoredBullets(result: LengthCheckResult): StoredLengthCheck["bullets"] {
  return result.perBullet.map((b) => ({
    index: b.index,
    marks: b.marks,
    wordCount: b.wordCount,
    askCount: b.askCount,
    violations: b.violations,
  }));
}

function violationSummary(result: LengthCheckResult): string {
  const offenders = result.perBullet.filter((b) => b.violations.length > 0);
  const parts: string[] = [];
  if (result.totalWords > MAX_TOTAL_WORDS) {
    parts.push(`Whole question runs to ${result.totalWords} words (max ${MAX_TOTAL_WORDS}).`);
  }
  for (const b of offenders) {
    parts.push(`Bullet ${b.index} (${b.marks} marks): ${b.violations.join("; ")}.`);
  }
  return parts.join(" ") || "Length budgets exceeded.";
}

// ── enforceLengthCheck — the whole pipeline (§2) ─────────────────────────────────────────────────

/**
 * Run the length check, auto-repair ONCE if it fails, and return the status + stored JSONB the caller
 * persists.
 *
 *   pass first time            -> { status:'clean' }  (no badge)
 *   fail -> repair -> pass      -> { status:'trimmed', questionText: rewritten, changes + summary }
 *   fail -> repair -> still fail -> { status:'over',  original questionText, violation summary }
 *
 * The question is NEVER dropped — an 'over' item is still stored for the admin to decide. Exactly one
 * repair attempt. A thrown LLM error is swallowed and reported as { status:'clean', null } so a
 * length-check outage can never fail a batch generation (the question is already validated + saved).
 */
export async function enforceLengthCheck(
  questionText: string,
  apiKey: string,
  meta?: UsageMeta,
  questionId?: string
): Promise<LengthCheckOutcome> {
  try {
    const first = await runLengthCheck(questionText, apiKey, meta, questionId);
    if (first.pass) {
      return { status: "clean", questionText, lengthCheck: null };
    }

    // One — and only one — repair attempt.
    const repair = await repairQuestion(questionText, first, apiKey, meta, questionId);
    const second = await runLengthCheck(repair.questionText, apiKey, meta, questionId);

    if (second.pass) {
      return {
        status: "trimmed",
        questionText: repair.questionText,
        lengthCheck: {
          totalWords: second.totalWords,
          bullets: toStoredBullets(second),
          changes: repair.changes,
          summary: repair.summary,
        },
      };
    }

    // Repaired output still runs long — keep the ORIGINAL question (the repair didn't help) and
    // record the unresolved violations for the reviewer.
    return {
      status: "over",
      questionText,
      lengthCheck: {
        totalWords: first.totalWords,
        bullets: toStoredBullets(first),
        changes: [],
        summary: violationSummary(first),
      },
    };
  } catch (err) {
    console.error(`[length-check] failed for ${questionId ?? "?"} (non-fatal):`, err);
    return { status: "clean", questionText, lengthCheck: null };
  }
}
