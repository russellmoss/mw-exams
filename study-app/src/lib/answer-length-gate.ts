// answer-length-gate.ts — the enforcement half of Answer Length (budget + measurement live in the
// dependency-free answer-length.ts).
//
// Shape deliberately mirrors enforceLengthCheck() in lib/length-check.ts, which does the same job for
// question STEMS: measure, attempt a bounded repair, persist the verdict either way, and degrade to
// 'clean' on an outage so a checker failure can never lose a generated artifact.
//
// ── Why REWRITE rather than trim-and-flag ────────────────────────────────────────────────────────
//
// The stem checker can trim mechanically because a stem is a list — you can split an over-crowded
// bullet and the marks still add up. A model answer is an ARGUMENT. Mechanically cutting it to length
// would remove exactly the things the exemplar exists to model: the funnelling (the alternatives
// weighed and ruled out), the per-wine differentiation AT-1 demands, and the single "under the skin"
// insight AT-2 reserves the top band for. Those are the last things a naive trimmer keeps and the
// first thing the candidate needs to see. So an off-budget answer is REWRITTEN to budget by the model,
// with the real measured count fed back — the same corrections-fed-back loop lib/tasting.ts uses for
// tasting notes.
//
// ── Why it rewrites section 1 only ───────────────────────────────────────────────────────────────
//
// Generation emits four sections in one call. Only the Model Answer has a word budget; re-running the
// whole package to fix its length would burn ~4x the tokens AND churn three sections that were fine,
// including the annotation and reasoning trace an admin may already have reviewed. The rewrite call
// takes the answer body alone and returns the answer body alone.

import Anthropic from "@anthropic-ai/sdk";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import {
  answerWordBudget,
  buildStoredAnswerLength,
  classifyAnswerLength,
  countAnswerBodyWords,
  distanceOutsideBand,
  type AnswerLengthAttempt,
  type AnswerLengthStatus,
  type AnswerWordBudget,
  type StoredAnswerLength,
} from "@/lib/answer-length";
import type { UsageMeta } from "@/lib/question-engine";

// Two rewrite attempts. The first fixes the ordinary case; a second catches an overcorrection (a
// shorten pass that undershoots the floor). Past that the model is not converging and a reviewer
// should see the answer as generated rather than have it rewritten a third time toward blandness.
const MAX_REWRITES = 2;

export interface AnswerLengthOutcome {
  status: AnswerLengthStatus;
  /** The answer body to store — rewritten when a rewrite landed closer to budget, else the original. */
  modelAnswer: string;
  /** Measured body words of `modelAnswer`. Stored on its own column so queries need no re-parsing. */
  wordCount: number;
  /** JSONB for the admin panel. NULL when the answer was in band first time. */
  answerLength: StoredAnswerLength | null;
}

function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
}

// ── The rewrite call ─────────────────────────────────────────────────────────────────────────────

function buildRewriteSystem(budget: AnswerWordBudget): string {
  return `You are an MW exam editor. You are given ONE model answer to an MW practical tasting question and a word budget it misses. Rewrite it to fit the budget WITHOUT changing what it argues.

THE BUDGET
- This question is worth ${budget.totalMarks} marks. The answer body must land between ${budget.min} and ${budget.max} words, ideally about ${budget.target}.
- The budget is mark-proportional because expected depth scales with the marks on offer, not with a flat page count. Spend words where the marks are: a 20-mark variety call earns a full paragraph; a 6-mark commercial note earns two sentences.
- Words counted are the PROSE only — YAML frontmatter, markdown headers and any source list are excluded from the count, so do not try to buy room by cutting or adding headers.

WHEN CUTTING, remove in this order — and stop as soon as you are inside the band:
1. Restatement of the question and of the wine list.
2. Adjective pile-ups: keep the two descriptors that discriminate, drop the rest.
3. Generic commercial and maturity filler that would be true of any wine at that price.
4. Consistent-but-not-diagnostic evidence (medium ruby, dry, 13% alcohol) that proves nothing on its own.
NEVER cut: the variety/origin call itself, the alternatives weighed and the structural evidence that ruled them out (the funnelling), what distinguishes each wine from the others in the flight, the official quality tier with its price anchor, or the one higher-order "under the skin" insight. Those are what earns the marks.

WHEN EXPANDING, add only load-bearing material — and nothing that reads as padding:
1. The alternative each call was weighed against, and the structural reason it was ruled out.
2. What separates each wine from the others in the flight (never the same technique or sentence shape twice).
3. The missing elements of a maturity call: current age, whether it improves, for how long, what changes.
4. Concrete commercial specifics: channel, price band, target consumer, competitive set, export market.
NEVER pad with: restatement, more adjectives on the same note, or a general lecture about the region.

HARD CONSTRAINTS
- Every sub-question that was answered stays answered. Do not drop a wine or a lettered part.
- Keep the existing structure: the YAML frontmatter (if present), the headers, and the order of parts.
- Do NOT report a word count anywhere. It is computed from your output; a self-reported number is ignored and will be treated as noise.
- Reason from PERCEIVED alcohol ("warm, medium-plus body, ~14%"), never a bare stated ABV lifted from a label.
- Never name a producer, cuvée or wine label. Geographic names and grape varieties only.

Respond with ONLY the rewritten answer body. No preamble, no explanation, no code fence.`;
}

async function rewriteToBudget(
  answerBody: string,
  budget: AnswerWordBudget,
  actualWords: number,
  apiKey: string,
  meta?: UsageMeta,
  questionId?: string,
  questionText?: string
): Promise<string> {
  const client = new Anthropic({ apiKey });
  const { model, abGroup } = await selectModel("model_answer", apiKey, "opus");

  const over = actualWords > budget.max;
  const delta = over ? actualWords - budget.target : budget.target - actualWords;
  const instruction = over
    ? `This answer is ${actualWords} words — ${actualWords - budget.max} over the ${budget.max}-word ceiling. Cut about ${delta} words.`
    : `This answer is ${actualWords} words — ${budget.min - actualWords} under the ${budget.min}-word floor, which is too thin for ${budget.totalMarks} marks. Add about ${delta} words of load-bearing content.`;

  const t0 = Date.now();
  const message = await client.messages.create(
    {
      model,
      // The answer body itself is the output. Generous enough for the top of the band (a 150-mark
      // flight budgets 1,275 words) with room for the model's own framing.
      max_tokens: 4000,
      // NO `temperature`. Opus 5 rejects it outright — "`temperature` is deprecated for this model",
      // HTTP 400 — and because this gate fails soft, that 400 surfaces as nothing at all: every
      // rewrite silently no-ops and every off-budget answer is stored exactly as generated. Caught on
      // the first real run, where the 'model_answer' tier resolved to claude-opus-5. lib/length-check.ts
      // had the same latent bug on the 'question_generation' tier and was fixed in the same change.
      system: buildRewriteSystem(budget),
      messages: [
        {
          role: "user",
          content: `${instruction}\n\n${questionText ? `## The question being answered\n${questionText}\n\n` : ""}## The answer to rewrite\n${answerBody}`,
        },
      ],
    },
    { timeout: Number(process.env.ANSWER_LENGTH_TIMEOUT_MS) || 120_000, maxRetries: 1 }
  );
  logClaudeUsage(
    {
      taskType: "answer-length",
      model,
      source: meta?.source,
      userId: meta?.userId,
      batchId: meta?.batchId,
      questionId,
      abGroup,
    },
    message.usage,
    { latencyMs: Date.now() - t0 }
  );

  return textOf(message).trim();
}

// ── enforceAnswerLength — the whole pipeline ─────────────────────────────────────────────────────

/**
 * Measure a freshly parsed model-answer body, rewrite it toward budget up to MAX_REWRITES times, and
 * return the version to store plus the verdict to stamp.
 *
 *   in band first time            -> { status:'clean',     answerLength: null }
 *   off budget -> rewrite -> in    -> { status:'corrected', rewritten body + attempt trail }
 *   off budget -> rewrite -> still -> { status:'over'|'under', the CLOSEST attempt + attempt trail }
 *
 * Call this on the answer body BEFORE buildCitationBlock() is appended: the citation block is
 * retrieval provenance that must not be handed to a rewriter (it would edit or invent sources), and
 * countAnswerBodyWords excludes it either way.
 *
 * Never throws and never drops an answer — a rewrite outage returns the original body as 'clean',
 * exactly as enforceLengthCheck does, because the answer is already generated and valid.
 */
export async function enforceAnswerLength(
  answerBody: string,
  totalMarks: number | null | undefined,
  apiKey: string,
  ctx?: { meta?: UsageMeta; questionId?: string; questionText?: string }
): Promise<AnswerLengthOutcome> {
  const budget = answerWordBudget(totalMarks);
  const firstCount = countAnswerBodyWords(answerBody);
  const firstVerdict = classifyAnswerLength(firstCount, budget);

  if (firstVerdict === "ok") {
    return { status: "clean", modelAnswer: answerBody, wordCount: firstCount, answerLength: null };
  }

  const attempts: AnswerLengthAttempt[] = [{ attempt: 1, wordCount: firstCount, verdict: firstVerdict }];
  // Keep the attempt that lands closest to the band, so a failed rewrite can never make things worse
  // than what generation produced.
  let best = { body: answerBody, count: firstCount, distance: distanceOutsideBand(firstCount, budget) };

  try {
    for (let i = 0; i < MAX_REWRITES; i++) {
      const rewritten = await rewriteToBudget(
        best.body,
        budget,
        best.count,
        apiKey,
        ctx?.meta,
        ctx?.questionId,
        ctx?.questionText
      );
      // A rewrite that came back empty or truncated to a stub is a failed call, not a short answer.
      if (!rewritten || rewritten.length < 200) {
        console.warn(`[answer-length] rewrite ${i + 1} for ${ctx?.questionId ?? "?"} returned too little — keeping previous`);
        break;
      }

      const count = countAnswerBodyWords(rewritten);
      const verdict = classifyAnswerLength(count, budget);
      attempts.push({ attempt: attempts.length + 1, wordCount: count, verdict });

      const distance = distanceOutsideBand(count, budget);
      if (distance < best.distance) best = { body: rewritten, count, distance };

      if (verdict === "ok") {
        return {
          status: "corrected",
          modelAnswer: rewritten,
          wordCount: count,
          answerLength: buildStoredAnswerLength(count, budget, attempts),
        };
      }
    }
  } catch (err) {
    // Non-fatal by design: report what we measured and store the best body we have.
    console.error(`[answer-length] rewrite failed for ${ctx?.questionId ?? "?"} (non-fatal):`, err);
  }

  const finalVerdict = classifyAnswerLength(best.count, budget);
  if (finalVerdict === "ok") {
    // Only reachable when a rewrite landed in band on the LAST allowed attempt after an error broke
    // the loop; treat it as corrected.
    return {
      status: "corrected",
      modelAnswer: best.body,
      wordCount: best.count,
      answerLength: buildStoredAnswerLength(best.count, budget, attempts),
    };
  }
  return {
    status: finalVerdict,
    modelAnswer: best.body,
    wordCount: best.count,
    answerLength: buildStoredAnswerLength(best.count, budget, attempts),
  };
}
