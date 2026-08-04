// question-engine.ts — the shared question-generation engine.
//
// This is the single source of truth for how the system generates questions: the same
// `generateFreshQuestion` + validator suite + parser the study page has always used, now
// extracted so EVERY study tool (study page, Stem Sniper, Reverse Tasting, future drills)
// generates through the IDENTICAL path. Improve generation here once → every tool improves.
// The thin route handler lives in app/api/get-question/route.ts and just calls into this.

import {
  getQuestionsByFilter,
  getRecentGeneratedQuestions,
  type GeneratedQuestion,
} from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { saveGeneratedQuestion, getTastingLexicon, type BankTargeting } from "@/lib/db";
import { logGenerationAttempt } from "@/lib/generation-telemetry";
import { buildQuestionGenerationPrompt } from "@/lib/prompts/question-generation-prompt";
import { enrichWineProfiles } from "@/lib/wine-enrichment";
import { neon } from "@neondatabase/serverless";
import { selectModel } from "@/lib/model-selector";
import { buildModelAnswerPrompt } from "@/lib/prompts/model-answer-prompt";
import { getKnowledgeContext, buildCitationBlock } from "@/lib/knowledge/context";
import { buildTastingLexiconGuidance } from "@/lib/prompts/tasting-lexicon";
import { logClaudeUsage } from "@/lib/usage-log";
import { stemSniperScoringModel } from "@/lib/question-validator";
// Shared rule layer (single source of truth). The engine delegates the cleanly-separable
// contradiction rules here and feeds them via the text adapter; its entangled text-only extras
// (undetectable-variety, name-cross-check, blend-hard, P3 fullText scope, banker, flight-size,
// novelty, generation-consistency) stay inline below.
import { applyQuestionRules, winesFromText } from "@/lib/question-rules.mjs";
// Paper 3 style-family classifier + the invisible weighted-sampling math (see narrowToWeightedP3Category).
import { classifyP3Category, chooseP3Category } from "@/lib/p3-category.mjs";
import { streamWithThinking, resolveThinking, type ProgressEmitter } from "@/lib/thinking-stream";

// Usage-tracking context threaded from the request through the background helpers so
// each Claude call is attributed to the right source (server key = we pay) and user.
export type UsageMeta = { source: "user" | "server"; userId: number | null };

// Optional live-progress channel. When a caller (the Stem Sniper SSE route) supplies one, the
// generation phases and the model's own reasoning are streamed to the browser. When it's absent
// every call below takes the identical non-streaming path it always has.
export type { ProgressEmitter } from "@/lib/thinking-stream";

const FAMILY_LABELS: Record<string, string> = {
  F1: "Same Variety",
  F2: "Same Origin",
  F3: "Blend Logic",
  F4: "Mixed Breadth",
  F5: "Method / Production",
  F6: "Style Mechanism",
  F7: "Quality Hierarchy",
};

// Bank Health targeting → question family. A "Generate more like this" run whose slice pins a
// question TYPE (from bank-health/derive.ts) maps onto the corpus family whose shape matches, so the
// whole batch stays on-aim. Types that span several families (compare & contrast, mixed grab-bag,
// "other") return null and fall back to the worker's thinnest-first diversity rotation.
const QUESTION_TYPE_TO_FAMILY: Record<string, string> = {
  same_variety: "F1",
  same_country: "F2",
  different_countries: "F4",
  focus_style_quality_commercial: "F6",
};

export function familyForQuestionType(questionType: string | null | undefined): string | null {
  if (!questionType) return null;
  return QUESTION_TYPE_TO_FAMILY[questionType] ?? null;
}

// Turn a Bank Health targeting aim into a SOFT-preference prompt block. Every line is phrased as a
// preference, never a hard rule: it nudges wine / style / framing choices toward the under-served
// slice without ever overriding the paper's scope or the flight-size validators. Returns null when
// there is nothing to steer, so the normal generation path is untouched.
function buildTargetingConstraints(targeting: BankTargeting | null | undefined): string | null {
  if (!targeting) return null;
  const prefs: string[] = [];
  if (targeting.questionType) {
    const label = QUESTION_TYPE_LABELS_FOR_PROMPT[targeting.questionType];
    if (label) prefs.push(`Frame the question as a "${label}" style flight where the wine choices allow it.`);
  }
  if (targeting.curveball) prefs.push(`Aim for a ${targeting.curveball} curveball / difficulty level.`);
  if (targeting.flightSize) prefs.push(`Prefer a flight of ${targeting.flightSize} wines if it fits the paper's scope.`);
  if (targeting.grape) prefs.push(`Feature the ${targeting.grape} grape variety where it is credible for this paper.`);
  if (targeting.region) prefs.push(`Draw on the ${targeting.region} region where it is credible for this paper.`);
  if (targeting.priceBand) prefs.push(`Lean toward the ${targeting.priceBand.replace(/_/g, " ")} price band where appropriate.`);
  if (prefs.length === 0) return null;
  return (
    "\n\nSOFT PREFERENCES (nudge only — never break the paper scope, flight-size or mark rules above):\n" +
    prefs.map((p) => `- ${p}`).join("\n")
  );
}

// Human labels for the targeting question types, used only inside the soft-preference prompt block.
const QUESTION_TYPE_LABELS_FOR_PROMPT: Record<string, string> = {
  same_variety: "same variety",
  same_country: "same country / region",
  different_countries: "different countries",
  compare_contrast: "compare and contrast",
  mixed_grab_bag: "mixed grab-bag",
  focus_style_quality_commercial: "style / quality / commercial focus",
  other: "other framing",
};

type QuestionCandidate = {
  family: string;
  familyLabel: string;
  subcategory: string;
  questionText: string;
  wines: { slot: number; fullText: string; appearance?: string }[];
  totalMarks: number;
  generationReasoning: string | null;
};

type NormalizedGeneratedQuestion = Omit<GeneratedQuestion, "wines"> & {
  wines: { slot: number; fullText: string; appearance?: string }[];
};

// Background model answer generation. Returns the in-flight promise — resolving true once the answer
// is persisted, false if the call failed; it never rejects — so a caller that CANNOT let the work
// outlive it, i.e. the Fill-the-Bank worker, can await completion and know whether it landed. The
// interactive study path ignores the return value and stays fire-and-forget, because the candidate
// should get the question without waiting ~30s for its answer.
function generateModelAnswerInBackground(
  questionId: string,
  questionText: string,
  wines: { slot: number; fullText: string }[],
  paper: number,
  family: string,
  apiKey: string,
  meta?: UsageMeta
): Promise<boolean> {
  return (async () => {
    try {
      const client = new Anthropic({ apiKey });
      const { model, abGroup } = await selectModel("model_answer", apiKey, "opus");
      // Steer register with the same tasting lexicon the standalone generate-model-answer route uses,
      // so both model-answer paths share one voice (and the new prefer/avoid wording guidance).
      const lexiconGuidance = buildTastingLexiconGuidance(await getTastingLexicon());
      // Same gated production references as the standalone generate-model-answer route, so the two
      // model-answer paths stay in step (they already share the lexicon for the same reason).
      const { block: knowledgeBlock, passages: kbPassages } = await getKnowledgeContext({ questionText, family });
      const prompt = buildModelAnswerPrompt(questionText, wines, paper, lexiconGuidance, knowledgeBlock);

      const t0 = Date.now();
      const message = await client.messages.create({
        model,
        // 8000 — see the note on the same call in generate-model-answer/route.ts. Four sections in
        // one response; 4000 cut the tail often enough to leave a fifth of the banked corpus with a
        // missing annotation, reasoning trace or diagram assist.
        max_tokens: 8000,
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      logClaudeUsage(
        { taskType: "model_answer", model, source: meta?.source, userId: meta?.userId, questionId, abGroup },
        message.usage,
        { latencyMs: Date.now() - t0 }
      );

      const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      // Same as the standalone route: append the source list after section extraction.
      const modelAnswer =
        (extractSection(text, "Model Answer", "Proposed Annotation") || text) + buildCitationBlock(kbPassages);
      const proposedAnnotation = extractSection(text, "Proposed Annotation", "Reasoning Trace");
      const reasoningTrace = extractSection(text, "Reasoning Trace", "Study Diagram");
      const studyDiagramAssist = extractSection(text, "Study Diagram", null);

      await saveGeneratedQuestion({
        questionId,
        paper,
        family,
        familyLabel: "",
        questionText,
        wines,
        totalMarks: 100,
        modelAnswer,
        proposedAnnotation: proposedAnnotation || undefined,
        reasoningTrace: reasoningTrace || undefined,
        studyDiagramAssist: studyDiagramAssist || undefined,
      });

      console.log(`Background model answer generated for ${questionId}`);
      return true;
    } catch (err) {
      console.error(`Background model answer failed for ${questionId}:`, err);
      return false;
    }
  })();
}

function extractSection(
  text: string,
  startHeader: string,
  endHeader: string | null
): string | null {
  const startPattern = new RegExp(
    `#+\\s*\\d*\\.?\\s*${startHeader}[\\s\\S]*?\\n`,
    "i"
  );
  const startMatch = text.match(startPattern);
  if (!startMatch) return null;

  const startIdx = text.indexOf(startMatch[0]) + startMatch[0].length;

  if (endHeader) {
    const endPattern = new RegExp(`#+\\s*\\d*\\.?\\s*${endHeader}`, "i");
    const remaining = text.slice(startIdx);
    const endMatch = remaining.match(endPattern);
    if (endMatch) {
      return remaining.slice(0, remaining.indexOf(endMatch[0])).trim();
    }
  }

  return text.slice(startIdx).trim();
}

async function ensureP3Appearances(
  question: GeneratedQuestion,
  apiKey: string,
  meta?: UsageMeta,
  emit?: ProgressEmitter
): Promise<GeneratedQuestion> {
  if (question.paper !== 3) return question;
  const wines = typeof question.wines === "string" ? JSON.parse(question.wines) : question.wines;
  const hasAppearances = wines.some((w: { appearance?: string }) => w.appearance);
  if (hasAppearances) return question;

  try {
    emit?.({ type: "status", label: "Describing what's in the glass (Paper 3)…" });
    const client = new Anthropic({ apiKey });
    const { model, abGroup } = await selectModel("question_appearance", apiKey, "sonnet");
    const wineList = wines.map((w: { slot: number; fullText: string }) => `${w.slot}. ${w.fullText}`).join("\n");
    const t0 = Date.now();
    // This runs on the otherwise-instant BANKED serve path, so it must be tightly bounded: without
    // explicit opts the SDK would wait out its 10-minute default timeout and retry twice. On failure
    // the catch below simply serves the question without appearance notes.
    const message = await client.messages.create(
      {
        model,
        max_tokens: 500,
        system: `For each wine, describe ONLY what a candidate would see in the glass — color, clarity, bubbles if present, viscosity. No aromas, no tastes, no wine-type labels. Be accurate for the specific wine. One line per wine, 10-20 words. Output as JSON array: [{"slot":1,"appearance":"..."},...]`,
        messages: [{ role: "user", content: `Generate visual appearance notes:\n${wineList}` }],
      },
      { timeout: Number(process.env.APPEARANCE_TIMEOUT_MS) || 20_000, maxRetries: 0 }
    );
    logClaudeUsage(
      { taskType: "question_appearance", model, source: meta?.source, userId: meta?.userId, questionId: question.question_id, abGroup },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );
    const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const appearances = JSON.parse(match[0]) as { slot: number; appearance: string }[];
      for (const a of appearances) {
        const wine = wines.find((w: { slot: number }) => w.slot === a.slot);
        if (wine) wine.appearance = a.appearance;
      }
      // Save back to DB
      const sql = neon(process.env.DATABASE_URL!);
      await sql`UPDATE generated_questions SET wines = ${JSON.stringify(wines)} WHERE question_id = ${question.question_id}`;
      return { ...question, wines };
    }
  } catch (err) {
    console.error("Failed to generate P3 appearances:", err);
  }
  return question;
}

function getWineCount(q: GeneratedQuestion): number {
  const wines = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
  return Array.isArray(wines) ? wines.length : 0;
}

function validateBankedQuestion(q: GeneratedQuestion): boolean {
  const wines = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
  const wineCount = Array.isArray(wines) ? wines.length : 0;
  if (wineCount === 0) return false;

  const questionText = q.question_text || "";

  // Run critical validators against banked questions
  const markCheck = validateMarkAllocation(questionText, wineCount);
  if (!markCheck.valid) {
    console.log(`Bank filter: ${q.question_id} failed mark check: ${markCheck.violations[0]}`);
    return false;
  }

  const varietyCheck = validateVarietyConsistency(questionText, wines);
  if (!varietyCheck.valid) {
    console.log(`Bank filter: ${q.question_id} failed variety check: ${varietyCheck.violations[0]}`);
    return false;
  }

  const paperScopeCheck = validatePaperScope(q.paper, wines);
  if (!paperScopeCheck.valid) {
    console.log(`Bank filter: ${q.question_id} failed paper scope: ${paperScopeCheck.violations[0]}`);
    return false;
  }

  // Country diversity was previously NOT re-checked at serve time, so a banked question whose stem
  // promises "N different countries" but whose wines repeat a country (e.g. two USA wines under a
  // "four different countries" stem) could still be served. Re-run it on every banked question.
  const countryCheck = validateCountryDiversity(questionText, wines);
  if (!countryCheck.valid) {
    console.log(`Bank filter: ${q.question_id} failed country diversity: ${countryCheck.violations[0]}`);
    return false;
  }

  return true;
}

function filterValidBanked(questions: GeneratedQuestion[]): GeneratedQuestion[] {
  return questions.filter(validateBankedQuestion);
}

/**
 * PAPER 3 ONLY — narrow a candidate pool to one weighted style family.
 *
 * Pure and synchronous: it takes a pool the producer has ALREADY fetched and filtered, and returns
 * the subset belonging to the style family the weighted sampler chose. The producer then applies its
 * usual `pickFlightSizeAware` to that subset, so flight-size preference, the recently-served filter
 * and the unseen-before-stale tier order all behave exactly as they do for Papers 1 and 2 — this
 * only changes WHICH question within a tier gets served.
 *
 * The steering rule itself lives in lib/p3-category.mjs (chooseP3Category): count the user's last 8
 * P3 attempts by style family, deficit-weight every family toward P3_TARGET_MIX (a Focus override
 * reshapes the target; streak suppression still applies), weighted-random draw a family, then walk
 * the remaining families in descending weight as a fallback chain. Nothing is candidate-facing.
 *
 * Returns the original pool untouched if it is empty or nothing classifies — never starves a tier.
 */
function narrowToWeightedP3Category(
  pool: GeneratedQuestion[],
  recentCategories: (string | null | undefined)[],
  focus?: string
): GeneratedQuestion[] {
  if (pool.length <= 1) return pool;

  // Prefer the stored tag; classify on the fly for any legacy row not yet backfilled.
  const byCategory = new Map<string, GeneratedQuestion[]>();
  for (const q of pool) {
    let cat = q.p3_category;
    if (!cat) {
      const wines = typeof q.wines === "string" ? safeParseWines(q.wines) : q.wines;
      cat = classifyP3Category(Array.isArray(wines) ? wines : []);
    }
    const bucket = byCategory.get(cat);
    if (bucket) bucket.push(q);
    else byCategory.set(cat, [q]);
  }

  const chosen = chooseP3Category(byCategory.keys(), recentCategories, focus);
  return (chosen && byCategory.get(chosen)) || pool;
}

function pickFlightSizeAware(questions: GeneratedQuestion[], family?: string): GeneratedQuestion {
  if (questions.length <= 1) return questions[0];

  // For families where 4-wine is over-represented, prefer non-4-wine options
  const preferSmaller = !family || family === "any" || ["F1", "F2", "F5", "F7"].includes(family);

  if (preferSmaller) {
    const nonFour = questions.filter((q) => getWineCount(q) !== 4);
    if (nonFour.length > 0) {
      return nonFour[Math.floor(Math.random() * nonFour.length)];
    }
  }

  return questions[Math.floor(Math.random() * questions.length)];
}

/**
 * One generation call, with the model's reasoning surfaced when someone is watching.
 *
 * Without an emitter this is byte-for-byte the request the engine has always sent. With one, the
 * call is made in streaming mode and adaptive thinking is turned on so the reasoning can be piped
 * to the browser. Two knock-on details matter:
 *   • `max_tokens` caps thinking + JSON together, so the 4000 sized for the JSON alone would now
 *     truncate mid-object. Doubled when thinking is on (kept at low effort, so the headroom is
 *     ample rather than speculative).
 *   • the model may not support adaptive thinking (Haiku, older Opus). `thinkingParams` returns
 *     `{}` there and the call still streams — status events alone keep the UI alive.
 */
async function callGenerationModel(
  client: Anthropic,
  model: string,
  prompt: { system: string; user: string },
  callOpts: { timeout: number; maxRetries: number },
  emit?: ProgressEmitter
) {
  // 2000 was too tight for the reasoning-heavy arm: EVERY Opus generation in production
  // stopped at exactly 2000 output tokens, i.e. truncated mid-JSON, so attempt 1 could
  // never parse and simply burned ~30s before falling through to Sonnet. Sonnet averages
  // ~950 tokens here, so 4000 is comfortably above both arms' real output.
  // `{}` when the model can't take adaptive thinking, or when an admin has switched reasoning off.
  const extra = emit ? await resolveThinking(model) : {};
  const thinkingOn = Object.keys(extra).length > 0;
  const params = {
    model,
    max_tokens: thinkingOn ? 8000 : 4000,
    system: prompt.system,
    messages: [{ role: "user" as const, content: prompt.user }],
    ...extra,
  } as Parameters<typeof client.messages.create>[0] & { stream?: never };

  if (!emit) return client.messages.create(params, callOpts);
  return streamWithThinking(client, params, callOpts, emit);
}

export async function generateFreshQuestion(
  paper: number,
  family: string | undefined,
  apiKey: string,
  meta?: UsageMeta,
  recentlyServedIds?: Set<string>,
  emit?: ProgressEmitter,
  // Fill-the-Bank hook: when the bulk worker calls, it persists the validated question as
  // status='pending' under a batch_id so it is held out of every candidate-facing read until an
  // admin approves it. Absent (the normal study path) → the row saves 'approved' and is servable.
  // `awaitBackgroundWork` is the bulk worker's other requirement: block until the model answer and
  // wine enrichment have actually landed. Both are normally detached promises, which is safe only
  // while something else keeps the invocation alive. The worker persists the question and returns
  // within ~50ms, so on serverless the invocation froze mid-call and the question was banked with
  // model_answer NULL — unusable for study, and invisible because the batch still read 'complete'.
  saveOpts?: { status?: string; batchId?: string | null; awaitBackgroundWork?: boolean },
  // Stem Sniper's variety drill filter (see produceDrill). Undefined for every other caller.
  variety?: string | null,
  // Bank Health "Generate more like this" soft-constraint aim. Threaded into the prompt as
  // preferences (never as scope-breaking rules); undefined on every normal generation path.
  targeting?: BankTargeting | null
) {
  const client = new Anthropic({ apiKey });

  emit?.({ type: "status", label: "Reading the wine bank for duplicates…" });

  // Pull existing wines from the bank for deduplication
  const allQuestions = await getQuestionsByFilter(paper);
  const existingWines: string[] = [];
  for (const q of allQuestions) {
    const wines = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
    for (const w of wines) {
      existingWines.push(w.fullText);
    }
  }

  // Pull a deeper window of recent questions so the novelty check can catch a STRUCTURAL repeat
  // (same stem template + same pedagogical contrast) that happened several questions ago, not just
  // an exact repeat of the immediately-previous one. (Feedback: a user was served the same sweet-wine
  // "different countries / different single variety / sweetness mechanism" template they'd already seen.)
  emit?.({ type: "status", label: "Checking the last 30 questions for repeats…" });
  const recentGenerated = await getRecentGeneratedQuestions(30);
  const latestQuestion = recentGenerated[0] ? normalizeGeneratedQuestionWines(recentGenerated[0]) : null;
  const prompt = await buildQuestionGenerationPrompt(
    paper,
    family || "any",
    existingWines,
    latestQuestion
      ? {
          questionText: latestQuestion.question_text,
          wines: latestQuestion.wines,
          paper: latestQuestion.paper,
          family: latestQuestion.family,
        }
      : null,
    variety
  );

  // Bank Health targeting: append the aim as SOFT preferences. Deliberately after the hard scope /
  // flight-size rules so it can nudge wine/style/framing choices without ever overriding paper scope.
  const targetingBlock = buildTargetingConstraints(targeting);
  if (targetingBlock) prompt.system += targetingBlock;

  let parsed: ReturnType<typeof parseGeneratedQuestion> = null;
  let validation:
    | {
        paperScopeCheck: ReturnType<typeof validatePaperScope>;
        varietyCheck: ReturnType<typeof validateVarietyConsistency>;
        markCheck: ReturnType<typeof validateMarkAllocation>;
        originDiversityCheck: ReturnType<typeof validateOriginDiversity>;
        countryDiversityCheck: ReturnType<typeof validateCountryDiversity>;
        bankerCheck: ReturnType<typeof validateBankerMinimum>;
        flightSizeCheck: ReturnType<typeof validateFlightSize>;
        noveltyCheck: ReturnType<typeof validateNoveltyAgainstLatest>;
      }
    | null = null;
  let lastViolations: string[] = [];

  // A/B model arm for question generation. Picked once: attempt 1 uses the selected arm
  // (Opus by default); retries always fall back to Sonnet (not part of the experiment).
  // The arm that produced the served question is stamped into metadata for the Phase 3
  // accuracy join (generated_questions → feedback outcome).
  const gen = await selectModel("question_generation", apiKey, "opus");
  let genModelUsed: string | null = null;
  let genAbGroup: string | null = null;

  // Wall-clock budget — a HARD ceiling on the whole generation phase, not a soft hint.
  //
  // The browser aborts /api/get-question at 120s (see app/page.tsx), so everything here plus the
  // banked-fallback query and JSON serialisation must land well inside that. The old code checked
  // the budget only BEFORE starting an attempt, which let a call begin at 74.9s and then run for
  // `timeout` x (1 + maxRetries) = 70s more — observed in production as a single 64s "call" that
  // pushed a request to ~128s and tripped the browser abort. Two rules prevent that now:
  //   1. never start an attempt we cannot finish inside the budget (MIN_CALL_MS), and
  //   2. clamp each call's timeout to the time actually remaining, with the SDK's own silent
  //      retry disabled (maxRetries: 0) so one attempt costs at most one timeout.
  // The attempt loop below is itself the retry mechanism, and it is deadline-aware — so transient
  // 429/529s are still retried, just never past the deadline.
  //
  // Sizing: production Sonnet generations average ~24s but the tail reaches 60s+, so a 35s per-call
  // cap threw away otherwise-good slow calls and dropped the request to the banked fallback. 45s
  // covers the observed tail; 95s of budget still fits ~4 typical attempts and leaves ~25s of
  // headroom under the browser's 120s abort. MIN_CALL_MS sits above a typical call so the loop never
  // burns the tail of the budget on an attempt that cannot finish.
  const startedAt = Date.now();
  const BUDGET_MS = Number(process.env.GENERATION_BUDGET_MS) || 95_000;
  const CALL_TIMEOUT_MS = Number(process.env.GENERATION_CALL_TIMEOUT_MS) || 45_000;
  const MIN_CALL_MS = Number(process.env.GENERATION_MIN_CALL_MS) || 25_000;
  const remainingMs = () => BUDGET_MS - (Date.now() - startedAt);

  // Minted BEFORE the first model call so every question_generation usage row can carry it. The id
  // depends only on the requested paper/family, never on what comes back, so hoisting it changes
  // nothing but the timestamp. It matters because the generation call is the DOMINANT spend: logged
  // with question_id NULL it was unattributable to any question or batch, which is why
  // getBatchActualCost reported $0.00 for a batch that really cost $0.14, and why ~$152 of
  // historical generation spend can never be tied to what it produced.
  //
  // If generation never converges the row is never saved and these usage rows point at an id that
  // does not exist. That is deliberate: model_usage.question_id carries no FK, and the money was
  // genuinely spent. Only the converged attempt's id reaches generated_questions, so the cost of
  // discarded attempts stays outside a batch's reconciled total.
  const questionId = `gen_p${paper}_${family || "any"}_${Date.now()}`;

  // Every attempt is recorded, passed or failed. questionId is stamped on ALL of them, including
  // ones that never produce a question: it is the same id the model_usage rows carry, so the cost
  // of a redraft loop joins straight to the violations that caused it.
  const recordAttempt = (
    attempt: number,
    f: {
      model?: string | null;
      abGroup?: string | null;
      passed: boolean;
      rulesFired?: string[];
      violations?: Record<string, string[]> | null;
      latencyMs?: number | null;
      parseFailed?: boolean;
      modelError?: string | null;
    }
  ) =>
    logGenerationAttempt({
      paper,
      family,
      source: meta?.source ?? null,
      userId: meta?.userId ?? null,
      questionId,
      attempt,
      isRepair: false,
      callTimeoutMs: CALL_TIMEOUT_MS,
      budgetMs: BUDGET_MS,
      model: f.model ?? null,
      abGroup: f.abGroup ?? null,
      passed: f.passed,
      rulesFired: f.rulesFired ?? [],
      violations: f.violations ?? null,
      latencyMs: f.latencyMs ?? null,
      parseFailed: f.parseFailed ?? false,
      modelError: f.modelError ?? null,
    });

  const MAX_ATTEMPTS = 8;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Stop before we risk a platform timeout; the banked fallback below serves instead. A call
    // needs MIN_CALL_MS to have any chance of returning, so anything less is dead time.
    const remaining = remainingMs();
    if (remaining < MIN_CALL_MS) {
      console.warn(
        `Generation budget ${BUDGET_MS}ms exhausted after ${attempt - 1} attempt(s); serving banked fallback`
      );
      break;
    }
    const model = attempt === 1 ? gen.model : "claude-sonnet-4-6";
    const attemptAb = attempt === 1 ? gen.abGroup : null;
    const callOpts = { timeout: Math.min(CALL_TIMEOUT_MS, remaining), maxRetries: 0 } as const;
    let message;
    let producedModel = model;
    let producedAb = attemptAb;
    const t0 = Date.now();
    // Latency of the call that actually produced `message`, so a parse/validator record reports the
    // draft's own cost rather than the whole attempt including a failed Opus call.
    let callMs = 0;
    emit?.({
      type: "status",
      label: attempt === 1 ? "Drafting the flight…" : `Redrafting the flight (attempt ${attempt})…`,
    });
    try {
      message = await callGenerationModel(client, model, prompt, callOpts, emit);
      callMs = Date.now() - t0;
      logClaudeUsage(
        { taskType: "question_generation", model, source: meta?.source, userId: meta?.userId, questionId, abGroup: attemptAb },
        message.usage,
        { latencyMs: callMs }
      );
    } catch (modelErr: unknown) {
      const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
      if (model !== "claude-sonnet-4-6" && msg.includes("404")) {
        // Configured Opus id unavailable — retry this attempt on Sonnet. This is a SECOND call
        // inside the same attempt, so re-clamp against the deadline (reusing callOpts would let
        // one attempt spend two full timeouts).
        console.warn(`${model} not available, falling back to claude-sonnet-4-6`);
        const fallbackRemaining = remainingMs();
        if (fallbackRemaining < MIN_CALL_MS) {
          lastViolations = [`${model} unavailable and no budget left for a Sonnet retry`];
          console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS}: ${lastViolations[0]}`);
          recordAttempt(attempt, {
            model,
            abGroup: attemptAb,
            passed: false,
            modelError: lastViolations[0],
            latencyMs: Date.now() - t0,
          });
          break;
        }
        const fallbackOpts = { timeout: Math.min(CALL_TIMEOUT_MS, fallbackRemaining), maxRetries: 0 } as const;
        const tRetry = Date.now();
        try {
          message = await callGenerationModel(client, "claude-sonnet-4-6", prompt, fallbackOpts, emit);
          producedModel = "claude-sonnet-4-6";
          producedAb = null;
          callMs = Date.now() - tRetry;
          logClaudeUsage(
            { taskType: "question_generation", model: "claude-sonnet-4-6", source: meta?.source, userId: meta?.userId, questionId, abGroup: null },
            message.usage,
            { latencyMs: callMs }
          );
        } catch (retryErr: unknown) {
          lastViolations = [`Model call failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`];
          console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS} model error (sonnet fallback):`, lastViolations[0]);
          recordAttempt(attempt, {
            model: "claude-sonnet-4-6",
            passed: false,
            modelError: lastViolations[0],
            latencyMs: Date.now() - tRetry,
          });
          continue;
        }
      } else {
        // Timeout / overload / transient API error: never fail the whole request — move to the
        // next attempt, or to the banked fallback once the budget is spent.
        lastViolations = [`Model call failed: ${msg}`];
        console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS} model error:`, msg);
        recordAttempt(attempt, {
          model,
          abGroup: attemptAb,
          passed: false,
          modelError: msg,
          latencyMs: Date.now() - t0,
        });
        continue;
      }
    }

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const candidate = parseGeneratedQuestion(text, paper, family || "F4");

    if (!candidate) {
      lastViolations = ["Failed to parse generated question"];
      console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS} failed: parse error`);
      emit?.({ type: "status", label: "Draft came back malformed — retrying…" });
      recordAttempt(attempt, {
        model: producedModel,
        abGroup: producedAb,
        passed: false,
        parseFailed: true,
        latencyMs: callMs,
      });
      continue;
    }

    emit?.({ type: "status", label: "Running the examiner validators…" });

    // Critical validators (always run)
    const paperScopeCheck = validatePaperScope(paper, candidate.wines);
    const varietyCheck = validateVarietyConsistency(candidate.questionText, candidate.wines);
    const markCheck = validateMarkAllocation(candidate.questionText, candidate.wines.length);
    const consistencyCheck = validateGenerationConsistency(candidate.generationReasoning, candidate.wines);
    // Critical and never relaxed: the candidate explicitly asked for this grape. It only fires on a
    // positively-identified wrong variety, so it cannot stall generation on undetectable wines.
    const varietyFilterCheck = validateVarietyFilter(variety, candidate.wines);

    // Important validators (relax on attempt 6+)
    const relaxImportant = attempt >= 6;
    const originDiversityCheck = relaxImportant
      ? { valid: true, violations: [] }
      : validateOriginDiversity(candidate.questionText, candidate.wines, candidate.family, candidate.subcategory);
    const countryDiversityCheck = validateCountryDiversity(candidate.questionText, candidate.wines);
    // Phase 2 soft composition rules (also "important" tier): modern mark-mix cap, OW/NW balance,
    // coarse price proxy. Composition and price relax at attempt 6 alongside originDiversity.
    //
    // markMix relaxes EARLIER, at attempt 3. It is documented below as a nudge that "trips ~40% of
    // even REAL last-10 questions" — a rule that rejects two in five genuine MW questions cannot be
    // a hard gate. Telemetry showed it firing on 4 of 5 consecutive drafts as the ONLY violation,
    // and since the 95s budget fits ~2-5 attempts, its attempt-6 relaxation was effectively
    // unreachable: slow calls meant generation fell back to a banked question having never once
    // been allowed to skip it. Two drafts of pressure toward the corpus mix, then let it through.
    const relaxMarkMix = attempt >= 3;
    const markMixCheck = relaxMarkMix
      ? { valid: true, violations: [] }
      : validateMarkTypeMix(candidate.questionText);
    const compositionCheck = relaxImportant
      ? { valid: true, violations: [] }
      : validateCompositionBalance(candidate.family, paper, candidate.wines);
    const priceCheck = relaxImportant
      ? { valid: true, violations: [] }
      : validatePriceSpread(candidate.questionText, candidate.family, candidate.wines);

    // Nice-to-have validators (relax on attempt 4+)
    const relaxNiceToHave = attempt >= 4;
    const bankerCheck = relaxNiceToHave
      ? { valid: true, violations: [] }
      : validateBankerMinimum(candidate.wines);
    const flightSizeCheck = relaxNiceToHave
      ? { valid: true, violations: [] }
      : validateFlightSize(candidate.family, paper, candidate.wines.length);
    // Novelty NEVER fully relaxes: serving a user a question whose shape they've already seen defeats
    // the practice system. On relaxed attempts it runs in "lenient" mode — still blocks exact AND
    // structural/thematic repeats (same template + contrast axis), but drops the fuzzier
    // family/country/variety heuristic so generation can still converge.
    const noveltyCheck = validateNoveltyAgainstLatest(
      candidate,
      latestQuestion,
      recentGenerated.map(normalizeGeneratedQuestionWines),
      { lenient: relaxNiceToHave }
    );

    // Declared in the order the violations used to be concatenated, so `lastViolations` below is
    // byte-identical to the old flat list while the telemetry gets the rule NAME behind each one —
    // the whole point of the table: "which validator is costing us the redrafts?"
    const checks: Record<string, { violations: string[] }> = {
      paperScope: paperScopeCheck,
      variety: varietyCheck,
      varietyFilter: varietyFilterCheck,
      marks: markCheck,
      consistency: consistencyCheck,
      originDiversity: originDiversityCheck,
      countryDiversity: countryDiversityCheck,
      markMix: markMixCheck,
      composition: compositionCheck,
      price: priceCheck,
      banker: bankerCheck,
      flightSize: flightSizeCheck,
      novelty: noveltyCheck,
    };
    const violationsByRule: Record<string, string[]> = {};
    for (const [name, check] of Object.entries(checks)) {
      if (check.violations.length > 0) violationsByRule[name] = check.violations;
    }
    lastViolations = Object.values(violationsByRule).flat();

    recordAttempt(attempt, {
      model: producedModel,
      abGroup: producedAb,
      passed: lastViolations.length === 0,
      rulesFired: Object.keys(violationsByRule),
      violations: violationsByRule,
      latencyMs: callMs,
    });

    if (lastViolations.length === 0) {
      parsed = candidate;
      validation = { paperScopeCheck, varietyCheck, markCheck, originDiversityCheck, countryDiversityCheck, bankerCheck, flightSizeCheck, noveltyCheck };
      genModelUsed = producedModel;
      genAbGroup = producedAb;
      if (attempt > 1) console.log(`Generation retry ${attempt} succeeded (relaxed=${relaxNiceToHave ? "nice-to-have" : relaxImportant ? "important" : "none"})`);
      emit?.({ type: "status", label: "All validators passed." });
      break;
    }

    console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS} failed:`, JSON.stringify(lastViolations));
    // Only the COUNT, never the violation text: violations quote wine names and varieties, and
    // status labels are shown un-gated (the spoiler gate covers thinking, not status).
    emit?.({
      type: "status",
      label: `${lastViolations.length} validator issue${lastViolations.length === 1 ? "" : "s"} — redrafting…`,
    });
  }

  // Fallback: if generation failed, serve a banked question rather than showing an error — but
  // never one this user was just served (that was a silent repeat vector). Only drop the per-user
  // filter as an absolute last resort below, when excluding seen questions would leave nothing.
  if (!parsed || !validation) {
    console.error("All generation attempts failed, falling back to a banked question");
    emit?.({ type: "status", label: "Generation didn't converge — serving a validated banked question…" });
    const allFallback = filterValidBanked(await getQuestionsByFilter(paper));
    const unseen = recentlyServedIds
      ? allFallback.filter((q) => !recentlyServedIds.has(q.question_id))
      : allFallback;
    const fallback = unseen.length > 0 ? unseen : allFallback;
    const withAnswers = fallback.filter((q) => q.model_answer && q.model_answer.length > 100);
    if (withAnswers.length > 0) {
      const picked = withAnswers[Math.floor(Math.random() * withAnswers.length)];
      return {
        source: "pre-populated" as const,
        question: sanitizeQuestionMetadata(picked),
        hasModelAnswer: true,
      };
    }
    // Absolute last resort: serve without model answer
    if (fallback.length > 0) {
      const picked = fallback[Math.floor(Math.random() * fallback.length)];
      return {
        source: "pre-populated" as const,
        question: sanitizeQuestionMetadata(picked),
        hasModelAnswer: false,
      };
    }
    return { error: "No questions available. Please try again." };
  }

  emit?.({ type: "status", label: "Saving the question…" });
  const saved = await saveGeneratedQuestion({
    questionId,
    paper,
    family: parsed.family,
    familyLabel: parsed.familyLabel,
    subcategory: parsed.subcategory,
    questionText: parsed.questionText,
    wines: parsed.wines,
    totalMarks: parsed.totalMarks,
    // Provenance for the bank (migration 020). The pool is global regardless of whose key generated
    // it — this is recorded, never used to scope who a question is served to.
    createdByUserId: meta?.userId ?? null,
    // Fill-the-Bank review gate (migration 022): 'pending' + batchId when the bulk worker calls,
    // otherwise the DB default 'approved' via saveGeneratedQuestion.
    status: saveOpts?.status,
    batchId: saveOpts?.batchId ?? null,
    metadata: {
      generatedOnTheFly: true,
      generationReasoning: parsed.generationReasoning,
      paperScopeCheck: validation.paperScopeCheck,
      varietyCheck: validation.varietyCheck,
      markCheck: validation.markCheck,
      originDiversityCheck: validation.originDiversityCheck,
      countryDiversityCheck: validation.countryDiversityCheck,
      bankerCheck: validation.bankerCheck,
      flightSizeCheck: validation.flightSizeCheck,
      noveltyCheck: validation.noveltyCheck,
      genModel: genModelUsed,
      genAbGroup,
    },
  });

  // Detached by default (the study path never waits); awaited below when the caller requires it.
  const enrichment = enrichWineProfiles(questionId, parsed.wines, apiKey, meta).catch((err) =>
    console.error("Wine enrichment background error:", err)
  );

  const modelAnswer = generateModelAnswerInBackground(
    questionId,
    parsed.questionText,
    parsed.wines,
    paper,
    parsed.family,
    apiKey,
    meta
  );

  // The bulk worker asks for these to be finished, not merely started (see awaitBackgroundWork).
  // Neither promise rejects, so this cannot turn a banked question into a thrown error.
  let modelAnswerSaved = false;
  if (saveOpts?.awaitBackgroundWork) {
    [, modelAnswerSaved] = await Promise.all([enrichment, modelAnswer]);
  }

  return {
    source: "generated" as const,
    // `saved` was read before the answer existed, so this reports the awaited outcome rather than
    // the row — false on the study path, where the answer is still in flight by design.
    question: sanitizeQuestionMetadata(saved),
    hasModelAnswer: modelAnswerSaved,
  };
}

const WHITE_GRAPE_INDICATORS = /\b(chardonnay|sauvignon\s*blanc|riesling|pinot\s*gri[gs]|gewurz|muscat|moscato|viognier|chenin|semillon|albarino|gruner|verdejo|vermentino|soave|garganega|torrontes|fiano|greco|arneis|cortese|marsanne|roussanne|picpoul|muscadet|melon\s*de\s*bourgogne|blanc\s*de\s*blancs|prosecco|glera|palomino|pedro\s*xim[eé]nez|furmint|sercial|verdelho|malvasia|bual|assyrtiko|welschriesling|vidal)\b/i;
const RED_GRAPE_INDICATORS = /\b(cabernet\s*sauvignon|merlot|pinot\s*noir|syrah|shiraz|grenache|garnacha|tempranillo|sangiovese|nebbiolo|malbec|zinfandel|primitivo|mourvedre|carignan|barbera|dolcetto|touriga|tannat|carmenere|pinotage|gamay|blaufr[aä]nkisch|lemberger|zweigelt|aglianico|nero\s*d.avola|nerello|lagrein|cannonau|xinomavro|cabernet\s*franc|cinsault|monastrell|tinta\s*negra|tinta\s*roriz|touriga\s*nacional|touriga\s*franca|baga)\b/i;

const APPELLATION_TO_PRIMARY_VARIETY: { pattern: RegExp; variety: string }[] = [
  { pattern: /\b(barolo|barbaresco|gattinara|ghemme|carema|valtellina|sforzato)\b/i, variety: "nebbiolo" },
  { pattern: /\b(chianti|brunello|vino\s+nobile|morellino|montepulciano)\b/i, variety: "sangiovese" },
  { pattern: /\b(etna\s+rosso)\b/i, variety: "nerello mascalese" },
  { pattern: /\b(taurasi)\b/i, variety: "aglianico" },
  { pattern: /\b(valpolicella|amarone|ripasso|bardolino)\b/i, variety: "corvina blend" },
  { pattern: /\b(barbera)\b/i, variety: "barbera" },
  { pattern: /\b(dolcetto)\b/i, variety: "dolcetto" },
  { pattern: /\b(beaujolais|fleurie|morgon|moulin-a-vent|brouilly)\b/i, variety: "gamay" },
  { pattern: /\b(sherry|fino|manzanilla|amontillado|oloroso|palo\s*cortado)\b/i, variety: "palomino" },
  { pattern: /\b(madeira|malmsey|rainwater)\b/i, variety: "tinta negra" },
  { pattern: /\b(tokaj|tokaji|aszu|szamorodni)\b/i, variety: "furmint" },
  { pattern: /\b(sauternes|barsac)\b/i, variety: "semillon blend" },
  { pattern: /\b(port\b|vintage\s*port|lbv|tawny\s*\d+|ruby\s*port|vintage\s*port|colheita)\b/i, variety: "touriga nacional blend" },
  { pattern: /\b(banyuls|maury|rivesaltes)\b/i, variety: "grenache" },
  { pattern: /\b(rutherglen)\b/i, variety: "muscat" },
  { pattern: /\b(muscadet)\b/i, variety: "melon de bourgogne" },
  { pattern: /\b(burgundy|bourgogne|gevrey|chambolle|vosne|pommard|volnay)\b/i, variety: "pinot noir" },
  { pattern: /\b(rioja|ribera\s+del\s+duero)\b/i, variety: "tempranillo" },
  { pattern: /\b(cote-rotie|cornas|hermitage|crozes-hermitage|saint-joseph)\b/i, variety: "syrah" },
  { pattern: /\b(chateauneuf-du-pape|gigalondas|vacqueyras)\b/i, variety: "grenache blend" },
];

function detectPrimaryVariety(fullText: string): string {
  const text = fullText.toLowerCase();
  const whiteMatch = text.match(WHITE_GRAPE_INDICATORS);
  const redMatch = text.match(RED_GRAPE_INDICATORS);
  const direct = (whiteMatch?.[0] || redMatch?.[0])?.toLowerCase().trim();
  if (direct) return normalizeVariety(direct);

  const appellationMatch = APPELLATION_TO_PRIMARY_VARIETY.find((entry) => entry.pattern.test(text));
  return appellationMatch ? appellationMatch.variety : "unknown";
}

function normalizeVariety(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace("shiraz", "syrah")
    .replace("garnacha", "grenache")
    .replace("pinot gris", "pinot grigio")
    .replace("nerello", "nerello mascalese")
    .trim();
}

// Fold accents so a requested "Sémillon" matches the unaccented token the grape regexes detect.
function foldVariety(value: string): string {
  return normalizeVariety(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * Enforce Stem Sniper's variety drill filter: if the candidate asked to drill one grape, every wine
 * has to be that grape.
 *
 * Deliberately one-sided. `detectPrimaryVariety` reads the grape out of the wine name or its
 * appellation, and plenty of legitimate wines defeat it (an estate name with no grape token and no
 * appellation entry returns "unknown"). Failing those would make the filter unusable, so only a
 * CONFIDENT mismatch — a variety we positively identified as something else — is a violation.
 * A blend entry ("semillon blend") counts as a match for its base grape, since the flight is still
 * centred on the requested variety.
 */
export function validateVarietyFilter(
  variety: string | null | undefined,
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  if (!variety || !variety.trim()) return { valid: true, violations: [] };
  const want = foldVariety(variety);
  const violations: string[] = [];
  for (const wine of wines) {
    const got = foldVariety(detectPrimaryVariety(wine.fullText));
    if (got === "unknown") continue; // undetectable — trust the generator rather than block
    if (got === want || got.startsWith(`${want} `) || want.startsWith(`${got} `)) continue;
    violations.push(
      `Wine ${wine.slot}: "${wine.fullText}" reads as ${got}, but this flight was filtered to ${variety}`
    );
  }
  return { valid: violations.length === 0, violations };
}

function validatePaperScope(paper: number, wines: { slot: number; fullText: string }[]): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  for (const wine of wines) {
    const text = wine.fullText.toLowerCase();
    if (paper === 1) {
      if (RED_GRAPE_INDICATORS.test(text)) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be a red wine in Paper 1 (whites only)`);
      }
      const hasNonStillIndicator = /\b(sparkling|champagne|cava|prosecco|cremant|sekt|brut|pétillant|mousseux|spumante|méthode\s*traditionnelle|blanc\s*de\s*blancs|blanc\s*de\s*noirs|fortified|sherry|port|madeira|marsala|vin\s*santo)\b/i.test(text);
      if (hasNonStillIndicator) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be sparkling/fortified in Paper 1 (still wines only)`);
      }
    } else if (paper === 2) {
      if (WHITE_GRAPE_INDICATORS.test(text)) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be a white wine in Paper 2 (reds only)`);
      }
      const hasNonStillIndicator = /\b(sparkling|champagne|cava|prosecco|cremant|sekt|brut|pétillant|mousseux|spumante|méthode\s*traditionnelle|fortified|sherry|port|madeira|marsala)\b/i.test(text);
      if (hasNonStillIndicator) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be sparkling/fortified in Paper 2 (still wines only)`);
      }
    } else if (paper === 3) {
      const isWhiteGrape = WHITE_GRAPE_INDICATORS.test(text);
      const isRedGrape = RED_GRAPE_INDICATORS.test(text);
      const hasSpecialIndicator = /\b(sparkling|champagne|cava|prosecco|cremant|sekt|brut|blanc\s*de|rose|rosé|fortified|sherry|port|madeira|marsala|vin\s*santo|tokaj|aszu|sauternes|barsac|beerenauslese|trockenbeerenauslese|auslese|spätlese|kabinett|ice\s*wine|eiswein|passito|recioto|amarone|brachetto|moscato|muscat|rutherglen|maury|banyuls|rivesaltes|pedro\s*ximenez|oloroso|amontillado|manzanilla|fino|palo\s*cortado|VDN|vin\s*doux|late\s*harvest|botrytis|noble\s*rot|vendange\s*tardive|SGN|szamorodni|tawny|rimage|ruby|vintage|colheita|cream|dry\s*sack)\b/i.test(text);
      const abvMatch = text.match(/\((\d+(?:\.\d+)?)%(?:\s*abv)?\)/);
      const abv = abvMatch ? parseFloat(abvMatch[1]) : null;
      const isLikelySweet = abv !== null && abv <= 10;
      const isLikelyFortified = abv !== null && abv >= 15;
      if ((isWhiteGrape || isRedGrape) && !hasSpecialIndicator && !isLikelySweet && !isLikelyFortified) {
        violations.push(`Wine ${wine.slot}: "${wine.fullText}" appears to be a standard still wine in Paper 3 (sparkling/fortified/sweet/rosé/oxidative only)`);
      }
    }
  }

  // Paper 3 oxidative still-white sub-rule (flight-level). P3 admits a STILL white only when its
  // oxidation is flor/sous voile-driven (Jura Vin Jaune / Savagnin sous voile) OR it is paired with
  // a fortified/biologically-aged wine that supplies a genuine P3 contrast. Conventionally
  // cask-oxidized still whites (oxidative white Rioja, oxidative aged Hunter Semillon) are Paper 1
  // wines (corpus: 2018/2025 P1) and must NOT be the basis of a P3 question. The plain "standard
  // still wine" check above misses these because the producer/cuvée name carries no grape token.
  if (paper === 3) {
    const FLOR_SOUS_VOILE = /\b(vin\s*jaune|sous\s*voile|ch[aâ]teau[\s-]*chalon|l['’`]?\s*[ée]toile|[ée]toile|savagnin|arbois|jura|flor)\b/i;
    const FORTIFIED_OR_FLOR = /\b(fortified|sherry|jerez|fino|manzanilla|amontillado|oloroso|palo\s*cortado|cream|pedro\s*xim[eé]nez|port|madeira|marsala|banyuls|rivesaltes|maury|rutherglen|vin\s*doux|vdn|vin\s*jaune|sous\s*voile|ch[aâ]teau[\s-]*chalon|flor)\b/i;
    const CONVENTIONAL_OX_WHITE_NAME = /\b(rioja[\s-]*blanc[oa]|blanc[oa][\s-]*(?:gran[\s-]*)?reserva|gran[\s-]*reserva[\s-]*blanc[oa]|viura|tondonia|gravonia|castillo[\s-]*ygay|lopez[\s-]*de[\s-]*heredia|marqu[eé]s[\s-]*de[\s-]*murrieta)\b/i;
    const hasAnchor = wines.some((w) => FORTIFIED_OR_FLOR.test(w.fullText));
    for (const wine of wines) {
      const text = wine.fullText;
      if (FLOR_SOUS_VOILE.test(text) || FORTIFIED_OR_FLOR.test(text)) continue; // legitimately P3
      const isConvOxWhite =
        CONVENTIONAL_OX_WHITE_NAME.test(text) ||
        (/oxidativ/i.test(text) && WHITE_GRAPE_INDICATORS.test(text)) ||
        (/\bhunter\b/i.test(text) && /\bs[eé]millon\b/i.test(text));
      if (isConvOxWhite && !hasAnchor) {
        violations.push(
          `Wine ${wine.slot}: "${wine.fullText}" is a conventionally cask-oxidized still white (a Paper 1 style). Paper 3 still whites must be flor/sous voile-driven (e.g. Jura Vin Jaune) OR paired with a fortified/biologically-aged wine for a genuine oxidative-vs-biological contrast.`
        );
      }
    }
  }
  return { valid: violations.length === 0, violations };
}

// Generation-reasoning ↔ wine-list consistency. Root-cause guard for intent/output drift: the
// generator can *reason* it is building a P3-legitimate still-vs-fortified contrast (e.g. naming a
// "biological-flor Fino" as a flight wine) while the wine selection collapses into two still wines,
// losing the fortified/biological half that justified P3 scope. If the reasoning names a fortified
// or flor wine that appears in NO actual wine, flag for regeneration.
function validateGenerationConsistency(
  reasoning: string | null | undefined,
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  if (!reasoning) return { valid: true, violations };
  const r = reasoning.toLowerCase();
  const allWineText = wines.map((w) => w.fullText.toLowerCase()).join(" | ");
  // Each family: a style the reasoning may claim to have built the flight around, and the tokens
  // that prove at least one wine actually delivers it. Kept to high-signal, wine-identifying styles
  // to avoid false positives from wines merely mentioned for contrast.
  const FAMILIES: { name: string; reason: RegExp; wine: RegExp }[] = [
    {
      name: "biological/flor Sherry (Fino/Manzanilla) or sous-voile wine",
      reason: /\b(biological[\s-]*flor|flor[\s-]*fino|fino\s*sherry|fino\b|manzanilla)\b/i,
      wine: /\b(fino|manzanilla|amontillado|oloroso|palo\s*cortado|sherry|jerez|sous\s*voile|vin\s*jaune|ch[aâ]teau[\s-]*chalon|flor|savagnin)\b/i,
    },
  ];
  for (const fam of FAMILIES) {
    if (fam.reason.test(r) && !fam.wine.test(allWineText)) {
      violations.push(
        `Generation reasoning references a ${fam.name} as part of the flight, but no wine in the list matches that style — intent/output drift. Regenerate restoring the named wine.`
      );
    }
  }
  return { valid: violations.length === 0, violations };
}

const KNOWN_BLEND_INDICATORS = /\b(tawny\s*(port|\d+\s*year)|ruby\s*port|lbv|vintage\s*port|champagne\s*(brut|nv|vintage|rose)|cremant|cava|franciacorta|prosecco|chateauneuf|cdp|gigondas|vacqueyras|bordeaux|medoc|haut-medoc|pauillac|margaux|saint-julien|saint-estephe|saint-emilion|pomerol|pessac|graves|cotes\s*du\s*rhone|gsm|meritage|ripasso|amarone|valpolicella)\b/i;

function isLikelyBlend(fullText: string): boolean {
  const text = fullText.toLowerCase();
  if (KNOWN_BLEND_INDICATORS.test(text)) return true;
  const variety = detectPrimaryVariety(fullText);
  if (variety.includes("blend")) return true;
  return false;
}

function validateVarietyConsistency(questionText: string, wines: { slot: number; fullText: string }[]): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const stemSaysOneVariety = /same single grape variety/i.test(questionText);

  if (stemSaysOneVariety) {
    const wineVarieties = wines.map((wine) => ({
      slot: wine.slot,
      variety: detectPrimaryVariety(wine.fullText),
      text: wine.fullText,
    }));
    const detected = wineVarieties.filter((w) => w.variety !== "unknown");
    const undetected = wineVarieties.filter((w) => w.variety === "unknown");
    const uniqueVarieties = [...new Set(detected.map((w) => w.variety))];

    // Delegated to the shared rule layer (single source of truth) for the same-variety contradiction.
    for (const det of applyQuestionRules({ paper: 0, questionText, wines: winesFromText(wines) }, {}).filter(
      (v) => v.rule === "same-variety"
    )) {
      violations.push(det.detail);
    }

    // Flag wines where variety cannot be detected — suspicious in a same-variety flight
    for (const w of undetected) {
      violations.push(
        `Wine ${w.slot} ("${w.text}") — variety undetectable in a same-variety flight. Every wine's name or appellation must clearly map to the declared variety.`
      );
    }

    // Name-label cross-check: scan each wine's text for ANY grape name that contradicts the flight variety
    const flightVariety = uniqueVarieties[0] || null;
    if (flightVariety) {
      const allGrapePatterns = [WHITE_GRAPE_INDICATORS, RED_GRAPE_INDICATORS];
      for (const wine of wines) {
        const text = wine.fullText.toLowerCase();
        for (const pattern of allGrapePatterns) {
          const matches = text.match(new RegExp(pattern.source, "gi"));
          if (matches) {
            for (const match of matches) {
              const normalized = normalizeVariety(match.trim());
              if (normalized !== flightVariety && normalized !== "unknown") {
                violations.push(
                  `Wine ${wine.slot} name contains "${match.trim()}" which is a different variety than the flight variety "${flightVariety}". Wine labels must not contradict the same-variety constraint.`
                );
              }
            }
          }
        }
      }
    }
  }

  const stemSaysEachSingleVariety = /\beach\b.*\b(single|one)\s*(grape\s*)?variet/i.test(questionText)
    || /\bdifferent[,]?\s*(single|predominant)\s*(grape\s*)?variet/i.test(questionText);

  if (stemSaysEachSingleVariety) {
    for (const wine of wines) {
      if (isLikelyBlend(wine.fullText)) {
        violations.push(
          `Stem says each wine is a single grape variety, but Wine ${wine.slot} ("${wine.fullText}") is a known blend category. Single-variety stems require every wine to be genuinely single-varietal.`
        );
      }
    }

    // Check for variety duplicates in "each different variety" flights
    const perWineVarieties = wines.map((w) => ({
      slot: w.slot,
      variety: detectPrimaryVariety(w.fullText),
    }));
    const knownPerWine = perWineVarieties.filter((w) => w.variety !== "unknown");
    const uniquePerWine = new Set(knownPerWine.map((w) => w.variety));
    if (knownPerWine.length >= 2 && uniquePerWine.size < knownPerWine.length) {
      const dupes = [...uniquePerWine].filter(
        (v) => knownPerWine.filter((w) => w.variety === v).length > 1
      );
      violations.push(
        `Stem says each wine is a different variety, but detected duplicates: ${dupes.join(", ")}. Each wine must be a distinct variety.`
      );
    }
  }

  return { valid: violations.length === 0, violations };
}

function validateOriginDiversity(
  questionText: string,
  wines: { slot: number; fullText: string }[],
  family: string,
  subcategory: string
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const combinedText = `${questionText}\n${subcategory}`.toLowerCase();
  const isSameOriginFrame = family === "F2" || /\bsame (country|region|origin)\b/.test(combinedText);
  const explicitlySameVariety = /\bsame (single )?grape variety\b|\bsame variety\b/.test(combinedText);
  const explicitlyLimitedVarietyCount = /\bthere (?:are|is) (?:two|three|four|\d+) (?:single |predominant )?grape variet/.test(combinedText);
  const explicitlyDifferentVarieties = /\bdifferent (?:single |predominant )?grape variet/.test(combinedText);

  if (!isSameOriginFrame || explicitlySameVariety || explicitlyLimitedVarietyCount || wines.length < 3) {
    return { valid: true, violations };
  }

  const knownVarieties = wines
    .map((wine) => ({ slot: wine.slot, variety: detectPrimaryVariety(wine.fullText) }))
    .filter((wine) => wine.variety !== "unknown");
  const uniqueVarieties = new Set(knownVarieties.map((wine) => wine.variety));

  if (knownVarieties.length >= 2 && uniqueVarieties.size < knownVarieties.length) {
    const repeated = [...uniqueVarieties].filter(
      (variety) => knownVarieties.filter((wine) => wine.variety === variety).length > 1
    );
    violations.push(
      `Same-origin question has primary variety overlap (${repeated.join(", ")}). Each wine must represent a distinctly different primary variety — this includes blends whose dominant grape matches another wine's solo variety.`
    );
  }

  if (explicitlyDifferentVarieties && knownVarieties.length === wines.length && uniqueVarieties.size !== wines.length) {
    violations.push("Stem/subcategory says different grape varieties, but detected varieties are not all distinct.");
  }

  return { valid: violations.length === 0, violations };
}

const BENCHMARK_APPELLATIONS = /\b(premier\s*cru|1er\s*cru|grand\s*cru|cru\s*class[eé]|pauillac|margaux|saint[- ]julien|saint[- ]estephe|saint[- ]emilion|pomerol|pessac[- ]leognan|sauternes|barsac|meursault|puligny[- ]montrachet|chassagne[- ]montrachet|chablis|corton|gevrey[- ]chambertin|chambolle[- ]musigny|vosne[- ]roman[eé]e|nuits[- ]saint|pommard|volnay|barolo|barbaresco|brunello|chianti\s*classico|vino\s*nobile|taurasi|hermitage|cote[- ]rotie|cornas|chateauneuf[- ]du[- ]pape|marlborough|sancerre|pouilly[- ]fum[eé]|vouvray|savennieres|clos\s*ste\s*hune|alsace\s*grand\s*cru|rioja\s*(gran\s*)?reserva|ribera\s*del\s*duero|priorat|vintage\s*port|lbv|tawny\s*\d+|fino|manzanilla|amontillado|oloroso|palo\s*cortado|madeira|tokaj|rutherford|oakville|stags\s*leap|napa\s*valley|sonoma\s*coast|willamette|stellenbosch|hawkes?\s*bay|waipara|clare\s*valley|eden\s*valley|barossa|margaret\s*river|yarra\s*valley|wachau|kamptal)\b/i;

function validateBankerMinimum(
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  if (wines.length < 3) return { valid: true, violations };

  let bankerCount = 0;
  for (const wine of wines) {
    if (BENCHMARK_APPELLATIONS.test(wine.fullText)) {
      bankerCount++;
    }
  }

  if (bankerCount === 0) {
    violations.push(
      `Flight of ${wines.length} wines has no recognizable benchmark appellation. ` +
      `Every flight of 3+ wines must include at least one banker — a wine from a benchmark ` +
      `appellation (e.g., Premier Cru Burgundy, classified Bordeaux, Barolo, Marlborough, Sancerre) ` +
      `that any MW candidate should identify confidently.`
    );
  }

  return { valid: violations.length === 0, violations };
}

function validateMarkAllocation(questionText: string, wineCount?: number): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Check 25-marks-per-wine rule
  if (wineCount && wineCount > 0) {
    let totalMarks = 0;
    const mult = [...questionText.matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)];
    for (const m of mult) totalMarks += parseInt(m[1]) * parseInt(m[2]);
    const single = [...questionText.matchAll(/\((\d+)\s*marks?\)/gi)];
    for (const m of single) totalMarks += parseInt(m[1]);

    if (totalMarks > 0) {
      const expectedTotal = wineCount * 25;
      // Exactly 25/wine — no tolerance. Marks parse as clean integers, so any deviation is a real
      // mis-allocation (e.g. 8+7+8+7 = 30/wine), not parse noise. (EK-0001/EK-0041.)
      if (totalMarks !== expectedTotal) {
        violations.push(
          `Total marks (${totalMarks}) does not equal 25 × ${wineCount} wines (${expectedTotal}). The MW exam allocates exactly 25 marks per wine — no exceptions.`
        );
      }
    }
  }

  // Find per-wine mark allocations like (4 x 2 marks) or (3 x 3 marks)
  const perWineMarks = [...questionText.matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)];
  for (const m of perWineMarks) {
    const perWine = parseInt(m[2]);
    if (perWine <= 4) {
      // Check if the sub-question is a "state RS/ABV" type (allowed at 2-3 marks)
      const idx = questionText.indexOf(m[0]);
      const preceding = questionText.slice(Math.max(0, idx - 150), idx).toLowerCase();
      const isStateQuestion = /\b(state|indicate|estimate)\b.*\b(residual sugar|alcohol|rs|abv|sugar level|alcohol level)\b/.test(preceding)
        || /\b(residual sugar|alcohol level|alcohol %|rs level)\b/.test(preceding);
      if (!isStateQuestion) {
        violations.push(
          `Sub-question "${m[0]}" allocates only ${perWine} marks per wine for a written answer. The MW exam only uses 2-4 marks for numerical "state RS/ABV" answers. Written sub-questions must be at least 5 marks.`
        );
      }
    }
  }
  // Also check single mark allocations
  const singleMarks = [...questionText.matchAll(/\((\d+)\s*marks?\)/gi)];
  for (const m of singleMarks) {
    const marks = parseInt(m[1]);
    if (marks <= 4 && marks >= 1) {
      const idx = questionText.indexOf(m[0]);
      const preceding = questionText.slice(Math.max(0, idx - 150), idx).toLowerCase();
      const isStateQuestion = /\b(state|indicate|estimate)\b.*\b(residual sugar|alcohol|rs|abv|sugar level|alcohol level)\b/.test(preceding)
        || /\b(residual sugar|alcohol level|alcohol %|rs level)\b/.test(preceding);
      if (!isStateQuestion) {
        violations.push(
          `Sub-question "${m[0]}" allocates only ${marks} marks for a written answer. Written sub-questions must be at least 5 marks.`
        );
      }
    }
  }
  return { valid: violations.length === 0, violations };
}

const FAMILY_FLIGHT_RANGES: Record<string, { min: number; max: number; typical: number[] }> = {
  F1: { min: 2, max: 6, typical: [2, 3] },
  F2: { min: 2, max: 4, typical: [2, 3] },
  F3: { min: 2, max: 4, typical: [2, 4] },
  F4: { min: 2, max: 6, typical: [3, 4] },
  F5: { min: 1, max: 5, typical: [2, 3, 4] },
  F6: { min: 2, max: 5, typical: [2, 4, 5] },
  F7: { min: 2, max: 6, typical: [2, 6] },
};

function validateFlightSize(
  family: string,
  paper: number,
  wineCount: number
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const range = FAMILY_FLIGHT_RANGES[family];
  if (!range) return { valid: true, violations };

  if (wineCount < range.min || wineCount > range.max) {
    violations.push(
      `Flight of ${wineCount} wines is outside historical range for ${family} (${range.min}-${range.max} wines). Regenerate with a different flight size.`
    );
  }

  // P1 never uses 5-wine flights
  if (paper === 1 && wineCount === 5) {
    violations.push("Paper 1 has never used a 5-wine flight in the corpus. Use 2, 3, 4, or 6.");
  }

  // Single-wine flights only occur on Paper 3, and only as an origin-suppressed curveball — the
  // sole corpus instance is 2017 P3 Q2 (Cullen "Amber" orange wine, "consider it of unknown origin").
  // There is NO single-wine question on Paper 1 or Paper 2 anywhere in the 10-year corpus, so a lone
  // banker (e.g. a 1er Cru Meursault) on P1 is unsupported — force a 2+ wine flight instead.
  if (wineCount === 1 && paper !== 3) {
    violations.push(
      `Single-wine flights only appear on Paper 3 (one corpus instance: 2017 P3 Q2, an origin-suppressed curveball). Paper ${paper} has never used a single-wine question — use 2 or more wines.`
    );
  }

  return { valid: violations.length === 0, violations };
}

// ── Phase 2 soft composition rules (run in the "important" tier; relax at attempt 6) ─────────────
// Goal: nudge generated single questions toward the modern (2018–2025) shape on the axes that ARE
// derivable from question text + wine labels. Per the Round-2 review (findings/08): R8 keeps only the
// robust ID-composite cap (per-question commercial/style PRESENCE false-warns on the majority of real
// questions → enforced at whole-paper level in Phase 3); R10's curveball axis is telemetry-only (the
// benchmark proxy mislabels ~63% of anchors); price (R9) is a coarse proxy only — real price lives in
// Phase 3 where wines are sourced with known tiers.

// Sub-question type classifier, ported verbatim from scripts/build_structured_corpus.py TYPE_RULES (the
// validated classifier behind data/structured/corpus_subquestions.json). Word-START stems, no trailing
// \b, so inflected forms (winemaking/maturity/acidity) still match. Multi-label.
const SUBQ_TYPE_RULES: [string, RegExp][] = [
  ["variety_id", /\bgrape\b|\bvariet(y|ies)|\bgrapes\b/i],
  ["vintage_id", /\bvintage/i],
  ["origin_id", /\borigin|\bregion|\bcountr|\bappellation|\bprovenance|\bgeograph/i],
  ["maturity", /\bmaturit|\bageing|\baging|\bcellar|\bdrink|\bdevelopmen|\bevolv|\bhow (much )?longer|\bhold\b|\bready\b/i],
  ["commercial", /\bcommercial|\bmarket|\bprice|\bsell|\bpositioning|\bconsumer|\bretail|\bwho would buy|\bbuy this|\bbuy these|\bsales\b/i],
  ["quality", /\bquality|\bstandard|\bfinesse|\bmerit/i],
  ["winemaking", /\bwinemak|\bvinif|\bproduction\b|\bproduced\b|\bmade\b|\bmethod|\boak\b|\bmaturation|\bfermentat|\belevage|\blees\b|\bmalolactic|\btechnique/i],
  ["style", /\bstyle|\btypicity/i],
  ["sweetness_rs", /\bresidual sugar|\bsweetness|\brs\b|\bsugar/i],
  ["structure", /\bstructure|\btannin|\bacidit|\balcohol|\bbody\b|\bbalance/i],
  ["comparative", /\bcompare|\bcontrast|\bdiffer|\bsimilar/i],
];
const MARK_TOKEN_RE = /\(\s*(?:(\d+)\s*[x×]\s*)?(\d+)\s*marks?\s*\)/gi;
const SUBQ_SPLIT_RE = /^\s*([a-h])\)\s*/gim;

// Full-credit-per-hit mark mix + ID-composite (union, counted once so "identify variety and region"
// isn't double-charged) over a question's sub-parts. Matches the corpus method.
function computeMarkTypeMix(questionText: string): { totalMarks: number; idCompositeShare: number } {
  const labels = [...questionText.matchAll(SUBQ_SPLIT_RE)];
  const parts: string[] = [];
  if (labels.length === 0) {
    parts.push(questionText);
  } else {
    for (let i = 0; i < labels.length; i++) {
      const start = (labels[i].index ?? 0) + labels[i][0].length;
      const end = i + 1 < labels.length ? (labels[i + 1].index ?? questionText.length) : questionText.length;
      parts.push(questionText.slice(start, end));
    }
  }
  let total = 0;
  let idMarks = 0;
  const ID_TYPES = new Set(["variety_id", "origin_id", "vintage_id"]);
  for (const part of parts) {
    let partMarks = 0;
    for (const m of part.matchAll(MARK_TOKEN_RE)) {
      partMarks += (m[1] ? parseInt(m[1], 10) : 1) * parseInt(m[2], 10);
    }
    if (partMarks === 0) continue;
    total += partMarks;
    const low = part.toLowerCase();
    const hitsId = SUBQ_TYPE_RULES.some(([type, re]) => ID_TYPES.has(type) && re.test(low));
    if (hitsId) idMarks += partMarks;
  }
  return { totalMarks: total, idCompositeShare: total > 0 ? idMarks / total : 0 };
}

// R8 (soft): modern papers cap identification at ~46% of marks; flag a question only when ID dominates
// (>55%). Calibrated against the corpus — trips ~40% of even REAL last-10 questions (median 44%), so it
// nudges rather than blocks. Commercial/style presence is a whole-paper concern (Phase 3), not here.
export function validateMarkTypeMix(questionText: string): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const { totalMarks, idCompositeShare } = computeMarkTypeMix(questionText);
  if (totalMarks === 0) return { valid: true, violations };
  if (idCompositeShare > 0.55) {
    violations.push(
      `Mark type-mix: identification is ${Math.round(idCompositeShare * 100)}% of marks (> 55% cap). Modern papers run ~46% ID (EK-0098) — shift marks toward quality/style/commercial/maturity/winemaking.`
    );
  }
  return { valid: violations.length === 0, violations };
}

const OLD_WORLD_COUNTRIES = new Set([
  "france", "italy", "spain", "portugal", "germany", "austria", "greece",
  "hungary", "england", "georgia", "switzerland", "croatia", "slovenia", "israel", "lebanon",
]);
const NEW_WORLD_COUNTRIES = new Set([
  "south africa", "new zealand", "usa", "australia", "argentina", "chile",
  "canada", "uruguay", "brazil", "japan", "mexico", "china",
]);
function worldOf(fullText: string): "old" | "new" | "unknown" {
  const c = detectCountryName(fullText); // returns lowercased name or "unknown"
  if (OLD_WORLD_COUNTRIES.has(c)) return "old";
  if (NEW_WORLD_COUNTRIES.has(c)) return "new";
  return "unknown";
}

// R10 (mixed): OW/NW balance is ROBUST and gated; the curveball-count axis is TELEMETRY ONLY.
function validateCompositionBalance(
  family: string,
  paper: number,
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  // Curveball density — telemetry only. The "non-benchmark ≈ harder" proxy mislabels ~63% of real
  // anchors (findings/08), so we log it for monitoring and never gate generation on it.
  const nonBenchmark = wines.filter((w) => !BENCHMARK_APPELLATIONS.test(w.fullText)).length;
  console.log(`[composition] ${family} P${paper} ${wines.length}-wine: ${nonBenchmark} non-benchmark (curveball telemetry, not gated)`);
  // OW/NW — robust. Non-same-origin families (exclude F2 same-country, F7 same-region) should not be
  // single-world in a 3+ flight: real F1/F4/F6 mix Old+New World ~60%+ (EK-0099). Only act when worlds
  // are detectable for most wines, to avoid false positives from undetected origins.
  if (family !== "F2" && family !== "F7" && wines.length >= 3) {
    const worlds = wines.map((w) => worldOf(w.fullText)).filter((x) => x !== "unknown");
    if (worlds.length >= 3 && new Set(worlds).size === 1) {
      violations.push(
        `Composition: this non-same-origin ${family} flight is entirely ${worlds[0] === "old" ? "Old-World" : "New-World"}. Real ${family} flights mix Old + New World ~60%+ of the time (EK-0099) — reach for an inter-world contrast.`
      );
    }
  }
  return { valid: violations.length === 0, violations };
}

// R9 (soft, coarse proxy): a wine label carries no price, so this only catches the EK-0028 failure mode
// — a quality flight that is ALL top-tier/iconic with no legal-ladder signal (ranking would then turn on
// reputation, not the glass). Real price-spread enforcement lives in Phase 3 (whole-test, known tiers).
const ICONIC_HIGH_TIER = /grand\s*cru|premier\s*cru|1er\s*cru|cru\s*class|classed\s*growth|vintage\s*port|sauternes|barsac|montrachet|romanee|chambertin|musigny|lafite|latour|margaux|p[eé]trus|haut[- ]brion|yquem|grange|vega\s*sicilia|brunello|barolo|barbaresco|hermitage|cote[- ]rotie/i;
const LEGAL_LADDER_SIGNAL = /\bcru\b|class[eé]|classico|docg|pr[äa]dikat|kabinett|sp[äa]tlese|auslese|reserva|gran\s*reserva|1855|premier|grand|village|grosses?\s*gew/i;
function validatePriceSpread(
  questionText: string,
  family: string,
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const isQuality = family === "F7" || /\bquality\b/i.test(questionText);
  if (!isQuality || wines.length < 2) return { valid: true, violations };
  const allHigh = wines.every((w) => ICONIC_HIGH_TIER.test(w.fullText));
  const hasLadder =
    LEGAL_LADDER_SIGNAL.test(questionText) || wines.some((w) => LEGAL_LADDER_SIGNAL.test(w.fullText));
  if (allHigh && !hasLadder) {
    violations.push(
      "Quality flight is all top-tier/iconic wines with no legal-ladder signal — ranking would turn on reputation, not observable evidence (EK-0028). Add a value/mid tier, or a stem/label that names a legal hierarchy. (Coarse price proxy; real price enforced in Phase 3.)"
    );
  }
  return { valid: violations.length === 0, violations };
}

function validateCountryDiversity(
  questionText: string,
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  // Delegated to the shared rule layer (question-rules.mjs) — the single source of truth for the
  // "N different countries" contradiction (the EK 'four countries / two USA' complaint). Text stage,
  // so countryRequireAllKnown skips when a country couldn't be detected (avoids false positives).
  const violations = applyQuestionRules(
    { paper: 0, questionText, wines: winesFromText(wines) },
    { countryRequireAllKnown: true }
  )
    .filter((v) => v.rule === "country-diversity")
    .map((v) => v.detail);
  return { valid: violations.length === 0, violations };
}

// Deterministically repair a generated question's mark allocation so the printed sub-question marks sum
// to exactly 25×N (the MW's hard rule, EK-0041). The LLM frequently miscounts — especially when it mixes
// a shared part with per-wine parts — which was the single biggest cause of question quarantine (~half of
// raw drafts). This nudges ONE token (a genuine per-wine multiplier whose count === N, else a single
// written part) by the exact shortfall/surplus, keeps every value ≥ 5, then RE-VERIFIES the new sum. If
// it cannot produce a verified-correct split it returns the text UNCHANGED, so a genuinely broken question
// is still caught by the validator (validateMarkAllocation) — this can never ship a half-fixed question.
export function normalizeMarkAllocation(text: string, wineCount: number): string {
  if (!wineCount || wineCount < 1) return text;
  const expected = wineCount * 25;
  const re = /\((\d+)\s*[x×]\s*(\d+)\s*marks?\)|\((\d+)\s*marks?\)/gi;
  type Tok = { kind: "mult" | "single"; n?: number; mark: number; start: number; raw: string };
  const tokens: Tok[] = [];
  for (const m of text.matchAll(re)) {
    if (m[1] !== undefined) tokens.push({ kind: "mult", n: +m[1], mark: +m[2], start: m.index ?? 0, raw: m[0] });
    else tokens.push({ kind: "single", mark: +m[3], start: m.index ?? 0, raw: m[0] });
  }
  if (!tokens.length) return text; // no marks → engine defaults to 100; leave
  const total = tokens.reduce((s, t) => s + (t.kind === "mult" ? (t.n as number) * t.mark : t.mark), 0);
  if (total === expected) return text;
  const delta = expected - total;

  let target: Tok | null = null;
  let newRaw: string | null = null;
  // Preferred: nudge a genuine per-wine multiplier (count === N) by delta/N — preserves structure.
  if (delta % wineCount === 0) {
    const perWine = tokens.filter((t) => t.kind === "mult" && t.n === wineCount);
    if (perWine.length) {
      const t = perWine.reduce((a, b) => (b.mark > a.mark ? b : a)); // largest M = most headroom
      const newM = t.mark + delta / wineCount;
      if (newM >= 5) { target = t; newRaw = `(${t.n} x ${newM} marks)`; }
    }
  }
  // Fallback: adjust a single written part (≥5) by the whole delta.
  if (!target) {
    const singles = tokens.filter((t) => t.kind === "single" && t.mark >= 5);
    if (singles.length) {
      const t = singles.reduce((a, b) => (b.mark > a.mark ? b : a));
      const newX = t.mark + delta;
      if (newX >= 5) { target = t; newRaw = `(${newX} marks)`; }
    }
  }
  if (!target || !newRaw) return text; // can't fix cleanly → leave for the validator (no regression)

  const out = text.slice(0, target.start) + newRaw + text.slice(target.start + target.raw.length);
  let chk = 0; // re-verify; never ship a half-fixed text
  for (const m of out.matchAll(re)) chk += m[1] !== undefined ? +m[1] * +m[2] : +m[3];
  return chk === expected ? out : text;
}

function parseGeneratedQuestion(
  text: string,
  paper: number,
  family: string
): QuestionCandidate | null {
  try {
    // Extract question text (between ## Question and ## Wines)
    const questionMatch = text.match(
      /## Question\s*\n([\s\S]*?)(?=\n## Wines|\n## Metadata)/i
    );
    const questionText = questionMatch ? questionMatch[1].trim() : "";

    // Extract wines
    const winesMatch = text.match(
      /## Wines\s*\n([\s\S]*?)(?=\n## Wine Appearance|\n## Metadata|\n## |$)/i
    );
    const wines: { slot: number; fullText: string; appearance?: string }[] = [];
    if (winesMatch) {
      const lines = winesMatch[1].split("\n").filter((l) => /^\d+\./.test(l.trim()));
      for (const line of lines) {
        const m = line.trim().match(/^(\d+)\.\s+(.*)/);
        if (m) wines.push({ slot: parseInt(m[1]), fullText: m[2].trim() });
      }
    }

    // Extract wine appearance notes (Paper 3 only)
    const appearanceMatch = text.match(
      /## Wine Appearance\s*\n([\s\S]*?)(?=\n## Metadata|\n## |$)/i
    );
    if (appearanceMatch) {
      const lines = appearanceMatch[1].split("\n").filter((l) => /^\d+\./.test(l.trim()));
      for (const line of lines) {
        const m = line.trim().match(/^(\d+)\.\s+(.*)/);
        if (m) {
          const slot = parseInt(m[1]);
          const wine = wines.find((w) => w.slot === slot);
          if (wine) wine.appearance = m[2].trim();
        }
      }
    }

    // Extract metadata
    const familyMatch = text.match(/Family:\s*(F\d)/i);
    const subcatMatch = text.match(/Subcategory:\s*(.*)/i);

    // Extract generation reasoning
    const reasoningMatch = text.match(
      /## Generation Reasoning\s*\n([\s\S]*?)(?=\n## Paper Scope|\n## |$)/i
    );
    const generationReasoning = reasoningMatch ? reasoningMatch[1].trim() : null;

    const parsedFamily = familyMatch ? familyMatch[1] : family;
    const parsedLabel = FAMILY_LABELS[parsedFamily] || "Unknown";

    // Repair the mark allocation BEFORE extracting the total (EK-0041): the LLM often prints
    // sub-question marks that don't sum to 25×N. This nudges them to sum exactly when it safely can;
    // otherwise it returns the text unchanged for validateMarkAllocation to quarantine.
    const repairedText = normalizeMarkAllocation(questionText, wines.length);

    // Extract marks (from the repaired text, so totalMarks reflects the corrected allocation)
    let totalMarks = 0;
    const mult = [...repairedText.matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)];
    for (const m of mult) totalMarks += parseInt(m[1]) * parseInt(m[2]);
    const single = [...repairedText.matchAll(/\((\d+)\s*marks?\)/gi)];
    for (const m of single) totalMarks += parseInt(m[1]);
    if (!totalMarks) totalMarks = 100;

    if (!questionText || wines.length === 0) return null;

    // Stem says "Wines 1 to N" — parsed wines must match
    const stemCountMatch = questionText.match(/wines\s+1\s+(?:to|–|-)\s+(\d+)/i);
    if (stemCountMatch) {
      const expected = parseInt(stemCountMatch[1]);
      if (wines.length < expected) {
        console.error(`Parse mismatch: stem expects ${expected} wines but parsed ${wines.length}`);
        return null;
      }
    }

    return {
      family: parsedFamily,
      familyLabel: parsedLabel,
      subcategory: sanitizeSubcategory(subcatMatch ? subcatMatch[1].trim() : ""),
      questionText: repairedText,
      wines,
      totalMarks,
      generationReasoning,
    };
  } catch {
    return null;
  }
}

function sanitizeQuestionMetadata<
  T extends { family: string; family_label: string; subcategory: string | null; question_text?: string; wines?: unknown }
>(question: T): T & { stem_sniper_scoring: "per-wine" | "set" } {
  // Tell the Stem Sniper drill how to score origin predictions for this flight. Same-variety flights
  // are scored as a SET (origin pool) rather than per-wine binary, because the stem gives no clue
  // which origin maps to which wine number — see stemSniperScoringModel.
  const wines = typeof question.wines === "string" ? safeParseWines(question.wines) : question.wines;
  const wineCount = Array.isArray(wines) ? wines.length : 0;
  const sanitized = {
    ...question,
    family_label: FAMILY_LABELS[question.family] || question.family_label || "Unknown",
    subcategory: sanitizeSubcategory(question.subcategory || ""),
    stem_sniper_scoring: stemSniperScoringModel(question.question_text, wineCount),
  };
  // The P3 style tag is a server-side sampling concept. Never expose it to the candidate — knowing
  // a flight is tagged "fortified" before tasting would hand them the answer. Strip it from every
  // served payload (`delete` is a no-op on the Papers 1/2 rows that never carry one).
  delete (sanitized as { p3_category?: unknown }).p3_category;
  return sanitized;
}

function safeParseWines(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sanitizeSubcategory(value: string): string {
  return value
    .replace(/^Subcategory:\s*/i, "")
    .replace(/\s*\((?:[^)]*(?:Italy|France|Spain|Portugal|Germany|Austria|Greece|Hungary|Australia|Argentina|Chile|Canada|California|United States|USA|South Africa|New Zealand)[^)]*)\)/gi, "")
    .replace(/\b(?:Italy|Italian|France|French|Spain|Spanish|Portugal|Portuguese|Germany|German|Austria|Austrian|Greece|Greek|Hungary|Hungarian|Australia|Australian|Argentina|Argentinian|Chile|Chilean|Canada|Canadian|California|Californian|United States|USA|South Africa|South African|New Zealand)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;:])/g, "$1")
    .replace(/[,\s]+$/g, "")
    .trim();
}

function normalizeGeneratedQuestionWines(
  question: GeneratedQuestion
): NormalizedGeneratedQuestion {
  return {
    ...question,
    wines:
      typeof question.wines === "string"
        ? JSON.parse(question.wines)
        : question.wines,
  };
}

// A structural/thematic "fingerprint" of a stem: the recurring MW phrase patterns and sub-question
// topics, with all wine-specific content (producers, regions, varieties, vintages) ignored. Two
// questions sharing this fingerprint test the SAME skill in the SAME shape — e.g. "sweet wines from
// different countries, each a different single variety, comment on the sweetness mechanism and state
// the RS" — even when the specific wines differ. Catching that is the gap that let a user be
// re-served the same template they'd already nailed without analysis.
const STEM_CONCEPT_PATTERNS: { token: string; re: RegExp }[] = [
  { token: "style:sweet", re: /\bsweet wines?\b/ },
  { token: "style:sparkling", re: /\bsparkling\b/ },
  { token: "style:fortified", re: /\bfortified\b/ },
  { token: "style:rose", re: /\bros[eé]\b/ },
  { token: "style:oxidative", re: /\boxidative\b|\bvin jaune\b|\borange wine\b/ },
  { token: "origin:diff-country", re: /\bdifferent countr/ },
  { token: "origin:same-country", re: /\bsame countr/ },
  { token: "origin:diff-region", re: /\bdifferent region/ },
  { token: "origin:same-region", re: /\bsame region\b/ },
  { token: "variety:diff-single", re: /\bdifferent,?\s*(single|predominant)\b[^.]*\bvariet/ },
  { token: "variety:same-single", re: /\bsame (single )?grape variet/ },
  { token: "ask:identify-region", re: /\bidentif[a-z]+\b[^.]*\bregion\b|\b(country|region) of origin\b/ },
  { token: "ask:identify-variety", re: /\bidentif[a-z]+\b[^.]*\bvariet/ },
  { token: "ask:production", re: /\bmethod of production\b|\bwinemaking\b|\bhow [a-z ]+ (made|produced)\b/ },
  { token: "ask:sweetness-mechanism", re: /\bmechanism\b[^.]*\bsweet|\bsweetness (was|is) achiev/ },
  { token: "ask:residual-sugar", re: /\bresidual sugar\b|\brs level\b/ },
  { token: "ask:quality", re: /\bquality\b/ },
  { token: "ask:commercial", re: /\bcommercial (appeal|position|success)\b|\bconsumer appeal\b/ },
  { token: "ask:style", re: /\bstyle\b/ },
  { token: "ask:maturity", re: /\bmaturit|\bageing potential\b|\bage(?:ing)? worthiness\b/ },
  { token: "ask:climate", re: /\bclimate\b/ },
];

function stemStructureSignature(text: string): Set<string> {
  const t = (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(\d+\s*[x×]?\s*\d*\s*marks?\)/g, " ")
    .replace(/\s+/g, " ");
  const sig = new Set<string>();
  for (const { token, re } of STEM_CONCEPT_PATTERNS) {
    if (re.test(t)) sig.add(token);
  }
  return sig;
}

function validateNoveltyAgainstLatest(
  candidate: QuestionCandidate,
  latestQuestion: NormalizedGeneratedQuestion | null,
  recentQuestions?: NormalizedGeneratedQuestion[],
  opts?: { lenient?: boolean }
): { valid: boolean; violations: string[] } {
  const lenient = opts?.lenient ?? false;
  const violations: string[] = [];
  const questionsToCheck = recentQuestions?.length
    ? recentQuestions
    : latestQuestion ? [latestQuestion] : [];

  if (questionsToCheck.length === 0) return { valid: true, violations };

  const candidateWines = candidate.wines.map((w) => w.fullText).join("\n");
  const candidateVarieties = new Set(candidate.wines.map((w) => detectPrimaryVariety(w.fullText)).filter((v) => v !== "unknown"));
  const candidateCountries = new Set(candidate.wines.map((w) => detectCountryName(w.fullText)).filter((v) => v !== "unknown"));
  const candidateSig = stemStructureSignature(candidate.questionText);

  for (let i = 0; i < questionsToCheck.length; i++) {
    const recent = questionsToCheck[i];
    const recentWines = recent.wines.map((w) => w.fullText).join("\n");

    if (candidate.questionText.trim() === recent.question_text.trim()) {
      violations.push("Generated question repeats a recent question stem");
      break;
    }
    if (candidateWines === recentWines) {
      violations.push("Generated question repeats a recent wine set");
      break;
    }

    // Structural/thematic repeat: same family, same flight size, and a near-identical concept
    // fingerprint (same stem template + same pedagogical contrast axis). Fires even when the
    // specific wines, countries, and varieties all differ — the case the original heuristic missed.
    const sameFamily = candidate.family === recent.family;
    const sameFlightSize = candidate.wines.length === recent.wines.length;
    const recentSig = stemStructureSignature(recent.question_text);
    const sigOverlap = jaccard(candidateSig, recentSig);
    if (sameFamily && sameFlightSize && candidateSig.size >= 4 && recentSig.size >= 4 && sigOverlap >= 0.7) {
      violations.push(
        "Generated question reuses the same structural template and pedagogical contrast as a recent question (same family, flight size, stem shape, and tested concepts). Change the contrast axis or the wine archetypes so this is a genuinely new exam problem."
      );
      break;
    }

    // Fuzzier family/country/variety-pattern heuristic. Skipped in lenient mode, and only checked
    // against the most-recent few questions (deeper history is only scanned for exact/structural
    // repeats above) so generation can still converge without false positives.
    if (!lenient && i < 5) {
      const recentVarieties = new Set(recent.wines.map((w) => detectPrimaryVariety(w.fullText)).filter((v) => v !== "unknown"));
      const recentCountries = new Set(recent.wines.map((w) => detectCountryName(w.fullText)).filter((v) => v !== "unknown"));
      const sameCountryPattern = jaccard(candidateCountries, recentCountries) >= 0.8;
      const similarVarietyPattern = jaccard(candidateVarieties, recentVarieties) >= 0.6;

      if (sameFamily && sameCountryPattern && similarVarietyPattern) {
        violations.push("Generated question is too similar to a recent question's family/country/variety pattern");
        break;
      }
    }
  }

  return { valid: violations.length === 0, violations };
}

function detectCountryName(fullText: string): string {
  const text = fullText.toLowerCase();
  const countries = [
    "south africa",
    "new zealand",
    "united states",
    "france",
    "italy",
    "spain",
    "portugal",
    "germany",
    "austria",
    "greece",
    "hungary",
    "australia",
    "argentina",
    "chile",
    "canada",
    "usa",
    "england",
    "georgia",
    "uruguay",
    "brazil",
    "lebanon",
    "japan",
    "switzerland",
    "croatia",
    "slovenia",
    "israel",
    "mexico",
    "china",
  ];
  const match = countries.find((country) => text.includes(country));
  return match?.replace("united states", "usa") || "unknown";
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  const intersection = [...a].filter((item) => b.has(item)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

// Public surface used by the thin route handler (and, going forward, the drill routes).
// generateFreshQuestion and UsageMeta are exported inline above.
export {
  sanitizeQuestionMetadata,
  filterValidBanked,
  pickFlightSizeAware,
  narrowToWeightedP3Category,
  getWineCount,
  ensureP3Appearances,
};

// generateFreshQuestion returns DATA, not a Response, so any tool (study route, Stem Sniper,
// Reverse Tasting) can call it as a plain function and decide its own response shape. Inside it,
// the answer + profile generators (generateModelAnswerInBackground, enrichWineProfiles) fire on
// the SAME path for every caller — there are no per-tool copies. Discriminate with `"error" in x`.
export type GenerationOutcome = Awaited<ReturnType<typeof generateFreshQuestion>>;
