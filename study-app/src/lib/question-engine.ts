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
  getRecentBinReasons,
  getProducerNudge,
  getOverusedProducers,
  getRecentWineIds,
  getRecentFlightSignatures,
  flightSignature,
  wineCooldownId,
  RECENT_WINE_WINDOW,
  RECENT_FLIGHT_WINDOW,
  getProducerTally,
  getRecentProducerKeys,
  getPaperWineTextsByQuestion,
  type GeneratedQuestion,
} from "@/lib/db";
import {
  PRODUCER_NUDGE_MIN_WINES,
  PRODUCER_NUDGE_TOP,
  PRODUCER_EXCLUDE_TOP,
  extractProducerDisplay,
  normaliseProducer,
  producerKeyIsExcluded,
  buildExclusionList,
  REVIEWER_EXCLUDED_PRODUCERS,
  type ProducerStatus,
} from "@/lib/bank-health/producer";
import { buildBinReasonDigest } from "@/lib/prompts/bin-reason-digest";
import { getBinLessonsBlock } from "@/lib/bin-lessons";
import Anthropic from "@anthropic-ai/sdk";
import { saveGeneratedQuestion, applyLengthCheck, applyAnswerLength, getTastingLexicon, type BankTargeting } from "@/lib/db";
import { logGenerationAttempt } from "@/lib/generation-telemetry";
import {
  buildQuestionGenerationPrompt,
  buildProducerExclusionBlock,
  buildStyleExclusionBlock,
} from "@/lib/prompts/question-generation-prompt";
import { enrichWineProfiles } from "@/lib/wine-enrichment";
import { varietyLabel, substyleSpreadFor } from "@/lib/bank-health/variety-targets";
import type { WineProfile } from "@/lib/wine-bank-lookup";
import { buildStemKeyForQuestion } from "@/lib/stem-answer-key";
import { auditAndQuarantineQuestion } from "@/lib/question-audit";
import { validatePinnedFlight, validateBlindSafety, validateMarkRealism } from "@/lib/live-tasting-validators";
// Side-effect import: registers the 220-entry appellation resolver with the shared rule layer, so
// the TEXT stage stops missing grapes named only by appellation. Server-only by construction.
import "@/lib/appellation-resolver";
import { neon } from "@neondatabase/serverless";
import { selectModel } from "@/lib/model-selector";
import {
  buildModelAnswerPrompt,
  parseModelAnswerSections,
  modelAnswerMaxTokens,
  modelAnswerEffort,
} from "@/lib/prompts/model-answer-prompt";
import { getKnowledgeContext, buildCitationBlock } from "@/lib/knowledge/context";
import { buildTastingLexiconGuidance } from "@/lib/prompts/tasting-lexicon";
import { logClaudeUsage } from "@/lib/usage-log";
import { enforceLengthCheck } from "@/lib/length-check";
import { marksForWineCount } from "@/lib/answer-length";
import { enforceAnswerLength } from "@/lib/answer-length-gate";
// Key-stage audit rules, ALSO run here at generation time on text-derived wine records — the same
// rules the post-save audit (question-audit.ts) quarantines on. Before this, generation validated
// with its own divergent heuristics (e.g. validateBankerMinimum's regex vs the audit's isBanker),
// so drafts passed generation and were then quarantined minutes later at ~85% per bank batch.
// Running the audit's own functions inside the redraft loop lets the model fix the violation
// BEFORE the row is banked. Text-derived records resolve slightly less than the answer key
// (fail-safe: unknown wines read as curveballs), so this is strictly more conservative.
import {
  stemSniperScoringModel,
  flightCompositionViolations,
  idMarkAllocationViolations,
  crossCheckStemFacts,
  stemPreannouncesDiscriminator,
  contrastIntegrityViolations,
} from "@/lib/question-validator";
// Shared rule layer (single source of truth). The engine delegates the cleanly-separable
// contradiction rules here and feeds them via the text adapter; its entangled text-only extras
// (undetectable-variety, name-cross-check, blend-hard, P3 fullText scope, banker, flight-size,
// novelty, generation-consistency) stay inline below.
import {
  applyQuestionRules,
  winesFromText,
  detectPrimaryVariety,
  canonVariety,
  stemDisclosureViolations,
  WHITE_GRAPE_INDICATORS,
  RED_GRAPE_INDICATORS,
} from "@/lib/question-rules.mjs";
// Paper 3 style-family classifier + the invisible weighted-sampling math (see narrowToWeightedP3Category).
import { classifyP3Category, chooseP3Category } from "@/lib/p3-category.mjs";
import {
  validateP3Composition,
  validateCurveballMix,
  classifyFlightCategory,
  type WineCategory,
  type CurveballLevel,
} from "@/lib/bank/examMix";
import {
  streamWithThinking,
  resolveThinking,
  supportsAdaptiveThinking,
  type ProgressEmitter,
} from "@/lib/thinking-stream";
import { reasonsByDefault } from "@/lib/model-capabilities";

// Usage-tracking context threaded from the request through the background helpers so
// each Claude call is attributed to the right source (server key = we pay) and user.
export type UsageMeta = {
  source: "user" | "server";
  userId: number | null;
  // Set by the Fill-the-Bank worker so every call in a bulk run is attributable to its batch —
  // including failed attempts, which save no question and were otherwise invisible to cost
  // accounting (migration 029).
  batchId?: string | null;
};

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
  // Grape Balance "Fill the gap": the wines should be DOMINANTLY the named variety, spread across its
  // classic sub-styles / appellations / price bands and across producer tiers (not twelve of the same
  // appellation). Still a soft steer — the existing validators (country diversity, same-variety, the
  // 25-marks-per-wine rule) and the paper scope always take precedence.
  if (targeting.varietyFocus) {
    const label = varietyLabel(targeting.varietyFocus);
    prefs.push(
      `Build the flight so its wines are DOMINANTLY ${label}. Spread the choices across ${substyleSpreadFor(
        targeting.varietyFocus
      )}, and across producer tiers (commercial → specialist → fine). Prefer producers not already dense in the bank, and never violate the country-diversity, same-variety or 25-marks-per-wine rules.`
    );
  }
  if (prefs.length === 0) return null;
  return (
    "\n\nSOFT PREFERENCES (nudge only — never break the paper scope, flight-size or mark rules above):\n" +
    prefs.map((p) => `- ${p}`).join("\n")
  );
}

// PRODUCER SPREAD nudge (spec §2) — the quiet fix. Reads the paper's live producer tally and, when the
// bank is deep enough to judge, injects a short SOFT block naming the already-heavily-used producers
// with counts and asking the model to prefer other credible producers from the same region and price
// band. It is a steer, never a gate: classic houses may recur, they just should not dominate. Returns
// null (no injection) below PRODUCER_NUDGE_MIN_WINES wines for the paper, or when nothing is banked.
async function buildProducerSpreadBlock(paper: number): Promise<string | null> {
  let nudge: { totalWines: number; top: { display: string; count: number }[] };
  try {
    nudge = await getProducerNudge(paper, PRODUCER_NUDGE_TOP);
  } catch (err) {
    console.error("[producer-spread] nudge fetch failed (non-fatal):", err);
    return null;
  }
  if (nudge.totalWines < PRODUCER_NUDGE_MIN_WINES || nudge.top.length === 0) return null;
  // Kept compact (<~150 tokens): the heaviest producers only, one short list line.
  const list = nudge.top
    .filter((p) => p.count > 1)
    .map((p) => `${p.display} (${p.count})`)
    .join(", ");
  if (!list) return null;
  return (
    "\n\nPRODUCER SPREAD (soft steer — never a hard rule): these producers are already well represented" +
    ` in this paper's bank: ${list}. Prefer OTHER credible producers from the same region and price band` +
    " so the bank stays varied. Classic, benchmark houses may recur occasionally, but should not dominate" +
    " — reach for a different estate where an equally representative one exists."
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
  // Exam Mix (migration 034): the generator-emitted category + curveball tags and the cross-category
  // flag validateP3Composition keys on. Null when the model omitted them (a non-bank generation).
  wineCategory: string | null;
  curveballLevel: string | null;
  crossCategoryIntentional: boolean;
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
  meta?: UsageMeta,
  // Researched reference profiles from enrichWineProfiles. The caller must have AWAITED enrichment
  // before calling this — see the sequencing note at the call site.
  wineProfiles?: Record<string, WineProfile> | null,
  // Marks the question is worth. The answer's word budget is mark-proportional (lib/answer-length.ts),
  // so this drives both the target given to the generator and the band it is gated against. Falls back
  // to 25 marks per wine (EK-0001) — which is what the hardcoded 100 below silently assumed.
  totalMarks?: number
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
      const marks = totalMarks && totalMarks > 0 ? totalMarks : marksForWineCount(wines.length);
      const prompt = buildModelAnswerPrompt(questionText, wines, paper, lexiconGuidance, knowledgeBlock, wineProfiles, marks);

      const t0 = Date.now();
      const message = await client.messages.create({
        model,
        // Sizing + evidence: modelAnswerMaxTokens in prompts/model-answer-prompt.ts. Shared with the
        // live route and both offline scripts so this path can no longer drift from them.
        max_tokens: modelAnswerMaxTokens(model),
        ...modelAnswerEffort(model),
        system: prompt.system,
        messages: [{ role: "user", content: prompt.user }],
      });
      // Truncation here is SILENT — a cut response still parses, it just loses the tail sections — so
      // say so. This is the signal that told us 8000 was still too small.
      if (message.stop_reason === "max_tokens") {
        console.warn(
          `[model-answer] ${questionId}: hit max_tokens (${modelAnswerMaxTokens(model)}) on ${model} — tail sections may be missing`
        );
      }
      logClaudeUsage(
        { taskType: "model_answer", model, source: meta?.source, userId: meta?.userId,
          batchId: meta?.batchId, questionId, abGroup },
        message.usage,
        { latencyMs: Date.now() - t0 }
      );

      const text = message.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      // Use the SHARED parser rather than hand-rolled extraction. The old code here was
      // `extractSection(text, "Model Answer", "Proposed Annotation") || text`, and that `|| text`
      // silently stored the ENTIRE raw response — every section, plus any preamble — whenever the
      // heading did not match. That is how answers reached 11,000-29,000 characters against a ~430
      // word target: 51 of 62 pending questions were over 8,000 chars.
      //
      // parseModelAnswerSections recovers the answer by slicing at the Proposed Annotation heading
      // first, so a missing or differently-formatted "Model Answer" label no longer dumps the blob.
      // scripts/regen-model-answers.mjs already used it — the offline path was the correct one and
      // production had drifted from it, which is the drift that script's header says it exists to
      // prevent.
      const sections = parseModelAnswerSections(text);
      // Mark-proportional word budget, enforced before the citations go on — same ordering and same
      // reasoning as the standalone generate-model-answer route.
      const lengthOutcome = await enforceAnswerLength(sections.modelAnswer, marks, apiKey, {
        meta,
        questionId,
        questionText,
      });
      // Same as the standalone route: append the source list after section extraction. The stem +
      // wine labels are the relevance context — the citation gate drops docs about other wines.
      const modelAnswer =
        lengthOutcome.modelAnswer +
        buildCitationBlock(kbPassages, `${questionText} ${wines.map((w) => w.fullText).join(" ")}`);
      const proposedAnnotation = sections.proposedAnnotation;
      const reasoningTrace = sections.reasoningTrace;
      const studyDiagramAssist = sections.studyDiagramAssist;

      await saveGeneratedQuestion({
        questionId,
        paper,
        family,
        familyLabel: "",
        questionText,
        wines,
        totalMarks: marks,
        modelAnswer,
        proposedAnnotation: proposedAnnotation || undefined,
        reasoningTrace: reasoningTrace || undefined,
        studyDiagramAssist: studyDiagramAssist || undefined,
      });

      // Best-effort verdict stamp — never fail a saved answer over its bookkeeping.
      try {
        await applyAnswerLength(questionId, {
          status: lengthOutcome.status,
          wordCount: lengthOutcome.wordCount,
          answerLength: lengthOutcome.answerLength as Record<string, unknown> | null,
        });
      } catch (err) {
        console.error(`[answer-length] failed to stamp ${questionId} (non-fatal):`, err);
      }

      console.log(
        `Background model answer generated for ${questionId} — ${lengthOutcome.wordCount} words (${lengthOutcome.status})`
      );
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
      { taskType: "question_appearance", model, source: meta?.source, userId: meta?.userId,
          batchId: meta?.batchId, questionId: question.question_id, abGroup },
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

  // Run critical validators against banked questions.
  // Shape first: 12 banked questions hold slots containing the generator's reasoning rather than a
  // wine ("Chambers Rosewood — wait, excluded. Let me correct.", a 601-char paragraph weighing up
  // Amontillados, a truncated "The Sadie Family Wines, Pof"). They predate the generation-stage gate,
  // so the serve path has to refuse them until remediate-questions.mjs regenerates them.
  const wineShapeCheck = validateWineReferenceShape(wines);
  if (!wineShapeCheck.valid) {
    console.log(`Bank filter: ${q.question_id} failed wine-reference shape: ${wineShapeCheck.violations[0]}`);
    return false;
  }

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

// `max_tokens` caps thinking + visible response TOGETHER, so a reasoning model needs headroom for
// both. These two constants are that budget.
//
// The sizing must key on whether the MODEL reasons, not on whether WE asked it to. That distinction is
// the bug this replaced: the old code used `thinkingOn` — true only when an emitter was present and
// `resolveThinking` returned params — so the non-streaming path (the study page, the bank worker, every
// call without a live progress feed) sent a bare 4000. But every model on the adaptive-thinking list
// emits a thinking block whether or not one is requested; on Opus 4.7+/Sonnet 5 the default display is
// "omitted" (see thinkingParams), so those tokens are spent AND invisible. A probe of the real
// generation prompt at max_tokens 4000 came back `content: [["thinking", 0]]`, stop_reason
// "max_tokens" — the entire budget consumed by reasoning, not one character of question. Production
// telemetry over 14 days agrees: Opus attempt 1 parse-failed 174/349 = 49.9%, against 0.8% for Sonnet
// (generation_attempts.parse_failed). Half of every Opus attempt was a wasted call and ~30s of the
// budget, discarded before the loop fell through to Sonnet.
//
// generation_attempts.parse_failure_sample (migration 038) caught the same thing from the other end,
// and its samples are worth keeping — 8 failures in one Paper 2 batch, all attempt 1 on Opus at ~60s
// with no API error:
//     4x  (no text content) stop_reason=max_tokens output_tokens=4000 blocks=[thinking]
//     4x  a draft stopping after ~375 chars, before "## Wines" — thinking took ~3,900 of the 4,000
//         and the question died mid-sentence
// That evidence first drove an unconditional 8000, which fixes the emitter-keyed split but not the
// sizing: measured at the API default effort this prompt wants 11,696 tokens, so 8000 truncates it
// too. Keying on the model AND setting the effort (GENERATION_EFFORT) is what actually closes it.
//
// 16000 is ~2x the observed worst case: two probes of the live prompt spent 5,084 and 7,718 output
// tokens including thinking, which means the 8000 applied on the streaming path was itself marginal
// (one probe reached 96% of it). Unused headroom is free — billing is per token emitted, not per cap,
// and a cap is not a target: Sonnet still averages ~950 tokens on this prompt.
//
// supportsAdaptiveThinking is a deliberate SUPERSET of the models that reason by default (it also
// matches Opus 4.6 / Sonnet 4.6, which reason only on request). Over-sizing a model that stays quiet
// costs nothing; under-sizing one that reasons costs the whole call.
const GENERATION_MAX_TOKENS_REASONING = 16_000;
const GENERATION_MAX_TOKENS_PLAIN = 4_000;

/**
 * The output budget for one generation call. Exported so the sizing rule — key on the MODEL, never on
 * whether visible reasoning was requested — is pinned by a test rather than left to a call site.
 */
export function generationMaxTokens(model: string): number {
  return supportsAdaptiveThinking(model) ? GENERATION_MAX_TOKENS_REASONING : GENERATION_MAX_TOKENS_PLAIN;
}

/**
 * Wall-clock defaults for the generation phase, exported so the arithmetic BETWEEN them is pinned by
 * a test. Individually each looks arbitrary; together they encode one rule — a call must be given
 * enough time to produce what generationMaxTokens permits, and the budget must fit a slow first
 * attempt plus a retry. The pair drifted apart before: a 45s cap against a token budget that needed
 * ~59s produced 77 Opus attempts and 1 success. Callers override per-run (see bank-worker.ts).
 */
export const GENERATION_TIMING = {
  budgetMs: 180_000,
  callTimeoutMs: 130_000,
  minCallMs: 25_000,
  opusMinCallMs: 120_000,
  /** Measured Opus-5 output rate, flat across task types (model_usage, 14 days). */
  opusTokensPerSecond: 68,
} as const;

/**
 * Reasoning effort for a generation call — BOTH paths, streaming and not.
 *
 * The non-streaming path sent no `output_config` at all, which is not "no opinion" — it is the API
 * default, `high`, the deepest and slowest setting, on every call the study page and the bank worker
 * make. That is the direct cause of the latencies behind GENERATION_TIMING above: the model was being
 * asked to think as hard as it possibly could, on every draft, including the seven redrafts a
 * validator failure can trigger. Measured on the live prompt, `medium` cut a generation from 11,696
 * tokens / 164s to 5,710 / 83s, and both produced a clean, well-formed flight.
 *
 * `medium` is the recommended cost/latency lever here — on Opus 5, low and medium are unusually
 * strong, and effort is the control that actually moves generation latency (raising max_tokens only
 * removes a ceiling; it does not make the model stop deliberating).
 *
 * The streaming path previously inherited `low` from thinkingParams' default, chosen there because
 * reasoning doubles as a live progress feed. That coupled a UI concern to generation quality: a Stem
 * Sniper drill was generated at lower effort than the same question on the study page, for no reason
 * a candidate would recognise. Both paths now take this one constant, so how a question is produced
 * no longer depends on whether anyone happened to be watching it being produced.
 */
const GENERATION_EFFORT = "medium";

/**
 * One generation call, with the model's reasoning surfaced when someone is watching.
 *
 * Without an emitter this is a non-streaming request. With one, the call is made in streaming mode and
 * adaptive thinking is turned on so the reasoning can be piped to the browser. Three knock-on details
 * matter:
 *   • `max_tokens` covers thinking + JSON together — see the constants above for the sizing, and why
 *     it keys on the model rather than on whether we requested visible reasoning.
 *   • the model may not support adaptive thinking (Haiku, older Opus). `thinkingParams` returns
 *     `{}` there and the call still streams — status events alone keep the UI alive.
 *   • both branches run at GENERATION_EFFORT, delivered two ways — bundled with the thinking config
 *     when streaming, on its own when not — and never by spread-order accident. Both are gated on the
 *     same capability list, because `output_config.effort` is a 400 on models that don't take it.
 */
/**
 * Whether a generation call may REQUEST visible thinking for this model.
 *
 * supportsAdaptiveThinking is the wrong gate here: it also matches Opus 4.6 / Sonnet 4.6, which
 * reason ONLY when asked — and asking is what caused the 2026-08-05/06 incident. On this prompt,
 * Sonnet 4.6 with the thinking request would sometimes spiral: the entire 16,000-token output
 * budget spent on thinking, zero text, ~280s per call (11 generation_attempts rows, every one
 * `stop_reason=max_tokens blocks=[thinking]`). One such call outlived the whole generation budget,
 * so the user saw a 5-minute wait ending in a timeout instead of a question.
 *
 * On a model that reasons by default the request is free — it only makes visible what is already
 * happening. On a request-only reasoner it CHANGES the model's behaviour, and the observed change
 * is a spiral risk with no measured quality gain (Sonnet averages ~950 output tokens on this
 * prompt without it). So: ask only where asking is display-only. The study page still gets status
 * events either way, and GENERATION_EFFORT is still applied below via output_config.
 */
export function generationThinkingEligible(model: string): boolean {
  return reasonsByDefault(model);
}

async function callGenerationModel(
  client: Anthropic,
  model: string,
  prompt: { system: string; user: string },
  callOpts: { timeout: number; maxRetries: number },
  emit?: ProgressEmitter,
  userId?: number | null
) {
  // `{}` when the model reasons only on request (see generationThinkingEligible), when the model
  // can't take adaptive thinking at all, when an admin has switched reasoning off, or when THIS
  // user's reasoning default is off (their onboarding cost choice — those thinking tokens bill to
  // their own key). On a default reasoner this governs only whether the reasoning is VISIBLE; it
  // does not control whether it happens. When it does return params it carries GENERATION_EFFORT.
  const extra =
    emit && generationThinkingEligible(model)
      ? await resolveThinking(model, GENERATION_EFFORT, userId)
      : {};
  // Effort has to be applied whether or not the reasoning is VISIBLE, so this cannot key on `emit`:
  // resolveThinking returns `{}` when the admin reasoning toggle is off, and without this the
  // streaming path would silently fall back to the API default (`high`) — a measured 164s call — the
  // moment someone flipped a switch about UI. Keying on "did `extra` already bring an effort?"
  // covers all three states and can never double-apply. Gated on the same capability list:
  // output_config.effort is a 400 on a model that doesn't accept it (Haiku 4.5).
  const effort =
    supportsAdaptiveThinking(model) && !("output_config" in extra)
      ? { output_config: { effort: GENERATION_EFFORT } }
      : {};
  const params = {
    model,
    max_tokens: generationMaxTokens(model),
    system: prompt.system,
    messages: [{ role: "user" as const, content: prompt.user }],
    ...effort,
    ...extra,
  } as Parameters<typeof client.messages.create>[0] & { stream?: never };

  if (!emit) return client.messages.create(params, callOpts);
  return streamWithThinking(client, params, callOpts, emit);
}

// Duplicate-wine cooldown + flight-signature dedup (feedback: "same wine reused across recently
// generated questions"). On a collision the flight is REGENERATED up to this many times before the
// generation fails with a clear error rather than emitting a bottle / shape the candidate just saw.
export const MAX_DEDUP_REGENERATIONS = 3;

/**
 * Regenerate a flight until it is novel against BOTH dedup guards — the exact-wine cooldown and the
 * flight-signature dedup — or fail. Pure orchestration around a `generate` callback, so the dedup
 * policy is pinned by a unit test without a model call or a database, and it mirrors the inline
 * policy generateFreshQuestion runs: up to MAX_DEDUP_REGENERATIONS redraws on collision, then throw
 * rather than serve a duplicate. `regenerations` is how many redraws it took (0 = the first draft was
 * already novel).
 */
export function selectNovelFlight(
  generate: (attempt: number) => { fullText: string }[],
  recentWineIds: Set<string>,
  recentSignatures: Set<string>
): { wines: { fullText: string }[]; signature: string; regenerations: number } {
  let lastReason = "duplicate flight";
  for (let attempt = 0; attempt <= MAX_DEDUP_REGENERATIONS; attempt++) {
    const wines = generate(attempt);
    const reusedWine =
      wines.map((w) => wineCooldownId(w.fullText)).find((id) => id && recentWineIds.has(id)) || null;
    const signature = flightSignature(wines);
    const sigCollision = recentSignatures.has(signature);
    if (!reusedWine && !sigCollision) return { wines, signature, regenerations: attempt };
    lastReason = reusedWine ? "reuses a recently used wine" : "repeats a recent flight signature";
  }
  throw new Error(
    `Could not select a non-duplicate flight after ${MAX_DEDUP_REGENERATIONS} regenerations: ${lastReason}`
  );
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
  // familyTargeted: this run pins EVERY question to one family, so the novelty check must swap its
  // family-gated stem-template rules for the wine-overlap + framing-sentence pair (see
  // validateNoveltyAgainstLatest).
  // budgetMs / callTimeoutMs: per-caller overrides for the generation deadline. The defaults below
  // are sized for the INTERACTIVE route — 45s per call and 95s of budget, chosen to sit under the
  // browser's 120s abort with a user watching a spinner. A background bulk run has no browser and no
  // one waiting, so inheriting the interactive ceiling just discards near-complete work: measured
  // p90 latency sat at exactly 45,00Xms in every hour sampled (i.e. censored at the cap) and 33% of
  // attempts died there. See bank-worker.ts, which raises both and moves its own ITEM_WORST_CASE_MS
  // in lockstep so "never start work you cannot finish" still holds.
  saveOpts?: {
    status?: string;
    batchId?: string | null;
    awaitBackgroundWork?: boolean;
    familyTargeted?: boolean;
    budgetMs?: number;
    callTimeoutMs?: number;
    // Exam Mix (migration 034): the composition-balancing target for this generation, set by the bank
    // worker. flightCategory pins a required, coherent Paper 3 category; curveball pins the difficulty
    // level; curveballCounts is the batch's running tally so validateCurveballMix can project shares.
    // excludeFromCounters (the accept-anyway fallback) saves the item with NULL mix tags so it never
    // enters the counts. Absent on the interactive study path — that path is untouched.
    examMix?: {
      flightCategory?: string | null;
      curveball?: "low" | "medium" | "high" | null;
      curveballCounts?: Record<string, number>;
      excludeFromCounters?: boolean;
    } | null;
    // Country Balance (always-on): a soft, generation-time steer naming the countries the bank is
    // currently light on, so the model prefers comparable wines from those origins. Set only by the
    // bank-generation path (bank-worker); a pure preference block, never a validator rule.
    countryNudge?: string | null;
    // Live Tasting (migration 041): pin the flight to EXACTLY these wines — availability-confirmed
    // upstream by live-tasting-engine — and write the row with the given scope so it never enters
    // a serving pool. Pinned mode swaps the flight-choice validators (banker/novelty/diversity/
    // composition/flight-size — all controlled upstream) for two hard checks of its own:
    // validatePinnedFlight (no substitution) and validateBlindSafety (stem must not leak identity).
    // There is deliberately NO banked fallback in pinned mode — a random banked question is not
    // buyable, so failure surfaces as an error the caller handles by swapping a candidate.
    scope?: string;
    pinnedWines?: { slot: number; fullText: string }[] | null;
    // Paper flights: earlier questions' stems, so this flight VARIES its scaffold. The paper-QA
    // examiner judge failed identical a/b/c scaffolds repeated across a paper, and flagged the
    // absence of POOLED identification marks — both are stem-construction habits, steered here.
    paperStemsContext?: string | null;
    // Flight organizing fact (paper-QA round 5): the examiner judge failed stems that read as
    // stand-alone triplets with no shared-constraint framing — real stems OPEN by declaring the
    // flight's axis ("Wines 1–3 are made from the same grape variety…"). Each archetype IS such
    // an axis; the engine spells it out here so the stem can declare it.
    flightTheme?: string | null;
    // Live Tasting's lighter await: block on the enrichment→key chain only (the gradability
    // core), letting the model answer (Opus, ~60-90s) and audit finish in background. The first
    // E2E run proved the full awaitBackgroundWork chain can push session creation past the
    // route's 300s platform ceiling on a cold availability cache; the caller re-checks
    // quarantine at serve/grade time instead.
    awaitKeyOnly?: boolean;
    // With awaitKeyOnly the model answer + audit promises are DETACHED — on serverless they die
    // when the invocation freezes after the response (the exact failure E2E run 2 caught: session
    // B's model answer never landed). The route passes next/server's after() through this hook so
    // the platform keeps the invocation alive until the background chain settles.
    onBackgroundWork?: (work: Promise<unknown>) => void;
  },
  // Stem Sniper's variety drill filter (see produceDrill). Undefined for every other caller.
  variety?: string | null,
  // Bank Health "Generate more like this" soft-constraint aim. Threaded into the prompt as
  // preferences (never as scope-breaking rules); undefined on every normal generation path.
  targeting?: BankTargeting | null
) {
  const client = new Anthropic({ apiKey });

  const pinned =
    saveOpts?.pinnedWines && saveOpts.pinnedWines.length > 0 ? saveOpts.pinnedWines : null;

  emit?.({ type: "status", label: "Reading the wine bank for duplicates…" });

  // Pull existing wines from the bank for deduplication. Skipped in pinned mode: the dedup list
  // tells the model to AVOID those wines, which would directly contradict a pinned wine that
  // already exists in the bank — and novelty/dedup are meaningless for a single-user session.
  const allQuestions = pinned ? [] : await getQuestionsByFilter(paper);
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
  if (!pinned) emit?.({ type: "status", label: "Checking the last 30 questions for repeats…" });
  const recentGenerated = pinned ? [] : await getRecentGeneratedQuestions(30);
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
    variety,
    // Exam Mix (migration 034): the required category / curveball target for this flight, or undefined
    // on any non-bank generation.
    saveOpts?.examMix
      ? { flightCategory: saveOpts.examMix.flightCategory, curveball: saveOpts.examMix.curveball }
      : undefined
  );

  // PRODUCER & WINE-STYLE EXCLUSION (hard, every generation path): the reviewer's standing bans plus
  // three UNCONDITIONAL caps computed from the paper's live bank — (1) the hard 5% frequency cap with
  // NO floor count, (2) the last-PRODUCER_RECENT_WINDOW-questions window, and (3) the same caps at the
  // niche wine-STYLE level (vin jaune / sous voile Jura, Seppeltsfield-style aged tawny, Alsace
  // Gewurztraminer). The soft nudge below demonstrably did not stop the repeats — the reviewer binned
  // the same houses AND the same categories again and again ("I keep telling you this") — so offenders
  // are banned outright in the prompt AND (producers) rejected by validateProducerExclusion, which
  // never relaxes. Every fired cap is logged so the admin can see it. A data outage degrades to no
  // exclusion rather than a failed generation.
  let excludedProducers: ExcludedProducer[] = [];
  let excludedStyles: ExcludedStyle[] = [];
  try {
    const [tally, recentProducers, winesByQuestion] = await Promise.all([
      getProducerTally(paper, { includeRetiredEvidence: true }),
      getRecentProducerKeys(paper, PRODUCER_RECENT_WINDOW),
      getPaperWineTextsByQuestion(paper),
    ]);
    excludedProducers = buildGenerationProducerExclusion(tally.rows, recentProducers);
    excludedStyles = selectExcludedNicheStyles(winesByQuestion);
  } catch (err) {
    console.error("[producer-exclusion] fetch failed (non-fatal):", err);
  }
  if (excludedProducers.length > 0) {
    console.log(
      `[producer-exclusion] paper ${paper}: excluding ${excludedProducers.length} producer(s): ` +
        excludedProducers.map((p) => `${p.display} [${p.reasons.join(",")}]`).join("; ")
    );
    prompt.system += buildProducerExclusionBlock(excludedProducers.map((p) => p.display));
  }
  if (excludedStyles.length > 0) {
    console.log(
      `[producer-exclusion] paper ${paper}: excluding ${excludedStyles.length} niche style(s): ` +
        excludedStyles.map((s) => `${s.label} [${s.reasons.join(",")}]`).join("; ")
    );
    prompt.system += buildStyleExclusionBlock(excludedStyles.map((s) => s.label));
  }
  const excludedProducerKeys = new Set(excludedProducers.map((p) => p.key));

  // Bank Health targeting: append the aim as SOFT preferences. Deliberately after the hard scope /
  // flight-size rules so it can nudge wine/style/framing choices without ever overriding paper scope.
  const targetingBlock = buildTargetingConstraints(targeting);
  if (targetingBlock) prompt.system += targetingBlock;

  // Country Balance (always-on steer): a soft preference toward the countries the bank is currently
  // light on, computed by the bank worker before this call. Appended after the hard scope / flight
  // rules like every other soft block — it nudges wine choice only and never overrides a validator.
  if (saveOpts?.countryNudge) prompt.system += saveOpts.countryNudge;

  // Producer Spread nudge (spec §2): scoped to the bank-generation path (Fill-the-Bank / generate /
  // cron worker), identified by a batchId on saveOpts — the interactive study path has none and is
  // untouched. A soft steer away from producer over-concentration; appended after scope like the rest.
  if (saveOpts?.batchId) {
    const producerBlock = await buildProducerSpreadBlock(paper);
    if (producerBlock) prompt.system += producerBlock;
  }

  // Live Tasting pinned flight: asserted at BOTH ends of the system prompt. The base prompt's
  // flight-size guidance (3-5 wines) was reliably beating a tail-only pin block — E2E run 4
  // drafted 3 wines against a 2-wine pin — so the mode declaration now leads the prompt, where
  // it outranks everything below, and the full wine list still anchors the tail.
  if (pinned) {
    prompt.system = `## PINNED-FLIGHT MODE (LIVE TASTING) — READ FIRST
This task uses EXACTLY ${pinned.length} wine${pinned.length === 1 ? "" : "s"} (slots 1 through ${pinned.length}), already chosen and listed at the end of this prompt. Every instruction below about choosing wines, flight sizes, or wine counts is OVERRIDDEN by that list. Total marks = ${pinned.length * 25}.

` + prompt.system;
  }

  // Live Tasting pinned flight: a HARD block, appended last so nothing later can soften it. The
  // wines were availability-confirmed against the user's retail market; any substitution breaks
  // the session (the answer key would describe a bottle the user isn't buying). Enforced by
  // validatePinnedFlight below — this block is the instruction, that check is the guarantee.
  if (pinned) {
    prompt.system += `\n\n## PINNED FLIGHT (LIVE TASTING) — ABSOLUTE CONSTRAINT
The flight is EXACTLY ${pinned.length} wines — no more, no fewer. Your output MUST contain ${pinned.length} wine entries, slots 1 through ${pinned.length}, one per slot. Do not add, remove, merge, reorder, or substitute any wine. Reproduce each reference verbatim as the slot's wine:
${pinned.map((w) => `Wine ${w.slot}: ${w.fullText}`).join("\n")}
Do not invent vintages — write each wine reference without a vintage year, exactly as given.
The question stem must NEVER name or hint at any producer or cuvée above (the candidate tastes these wines blind at home). Frame the stem from what is inferable in the glass, exactly like a real MW paper.
The flight has ${pinned.length} wines, so total marks = ${pinned.length * 25}.${saveOpts?.flightTheme ? `
The flight's organizing fact: ${saveOpts.flightTheme}
REQUIRED: the stem MUST OPEN by declaring this shared fact to the candidate ("Wines 1–${pinned.length} are …") — real MW stems always state the flight's constraint up front, then set tasks against it. Declare only the fact itself; never leak producer, cuvée, or specific origin beyond what the fact states.` : ""}
Mark-structure realism (paper-QA examiner conventions, verified against the 2023-24 corpus):
- Identification is ONE BUNDLED sub-question — "identify the grape variety (or varieties) and origin as closely as possible" — never split variety and origin into separate sub-questions, and never omit origin. Weight it 13-18 marks per question.
- MIX pooled sub-questions ("For both wines: … (14 marks)") with per-wine ones — no rigidly symmetric allocations.
- Mark allocations must be IRREGULAR, as in real papers: never give every wine an identical split (an "8/9/8 for each wine" pattern is an automatic QA failure). Real allocations look like 13/10/2 per wine, a 15/20 two-parter, or pooled blocks of 15-30 marks. Vary both the split WITHIN each wine and the totals BETWEEN wines while keeping the question's overall total exact.
- HARD mark rules (validator-enforced, a violation forces a redraft): no single sub-question above 30 marks; never write multiplier shorthand ("4 x 9 marks") or "N marks each"; no mark value may appear 4+ times. A sub-question spanning several wines takes ONE pooled total ("(23 marks)"), not per-wine mark tags inside it.
- REQUIRED: at least ONE sub-question must be integrative across the whole flight ("With reference to both/all the wines, compare/discuss …" — quality, style, winemaking or commercial position). A question made only of stand-alone per-wine parts is NOT a real MW question.
- Paper 3 only: technical-state tasks (residual-sugar level, alcohol, method of production) belong EMBEDDED in the analysis sub-questions with real mark weight — a lone 2-3 mark micro-question is fine as a supplement, but must never be the only technical coverage.${saveOpts?.paperStemsContext ? `
This question is part of a FULL PAPER — its architecture must not clone any other question's. Follow the scaffold directive below; where earlier stems are listed, your sub-part count, mark split AND phrasing must all differ from every one of them (two near-identical a/b/c triplets fail QA).
${saveOpts.paperStemsContext}` : ""}`;
  }

  // SOFT feed-forward (spec §4): fold the most recent bin reasons for this paper into the prompt so
  // the model stops re-making faults a reviewer already rejected. Guidance only, appended after scope.
  try {
    const digest = buildBinReasonDigest(paper, await getRecentBinReasons(paper, 20));
    if (digest) prompt.system += digest;
  } catch (err) {
    console.error("[generateFreshQuestion] bin-reason digest failed (non-fatal):", err);
  }

  // Bin with Reason (spec §5): the distilled cross-paper "Lessons for new questions" summary, injected
  // as a short "Avoid these known failure patterns" block when admin_settings.use_bin_lessons is on.
  // Appended after the exam-knowledge context above so it nudges without ever overriding paper scope.
  try {
    prompt.system += await getBinLessonsBlock();
  } catch (err) {
    console.error("[generateFreshQuestion] bin-lessons block failed (non-fatal):", err);
  }

  let parsed: ReturnType<typeof parseGeneratedQuestion> = null;
  let validation:
    | {
        wineShapeCheck: ReturnType<typeof validateWineReferenceShape>;
        paperScopeCheck: ReturnType<typeof validatePaperScope>;
        varietyCheck: ReturnType<typeof validateVarietyConsistency>;
        markCheck: ReturnType<typeof validateMarkAllocation>;
        originDiversityCheck: ReturnType<typeof validateOriginDiversity>;
        countryDiversityCheck: ReturnType<typeof validateCountryDiversity>;
        bankerCheck: { valid: boolean; violations: string[] };
        flightSizeCheck: ReturnType<typeof validateFlightSize>;
        noveltyCheck: ReturnType<typeof validateNoveltyAgainstLatest>;
      }
    | null = null;
  let lastViolations: string[] = [];
  // Repair context for the next attempt: the last VALIDATOR-rejected draft plus its blocking
  // violations. When set, the next attempt gets a repair prompt (base prompt + rejected draft +
  // violations to fix) instead of a blind identical redraw — before this, every retry was an
  // independent draw with the same prompt, so the model happily repeated the same mark-allocation
  // mistake eight times. Set only on a validator failure (a parse failure has no usable draft, and
  // a dedup collision needs a genuinely FRESH flight, so both clear/skip it).
  let repairContext: { draft: string; violations: string[] } | null = null;

  // A/B model arm for question generation. Picked once: attempt 1 uses the selected arm
  // (Opus by default); retries always fall back to Sonnet (not part of the experiment).
  // The arm that produced the served question is stamped into metadata for the Phase 3
  // accuracy join (generated_questions → feedback outcome).
  const gen = await selectModel("question_generation", apiKey, "sonnet");
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
  // Sizing (measured over 14 days of generation_attempts, grouped by the call_timeout_ms each run
  // recorded — runs at the worker's higher cap give the UNCENSORED distribution):
  //
  //     model              cap    attempts  passed  p50     p90     p99     max
  //     claude-opus-5      45s          77       1  45.0s   45.0s   45.4s   45.9s   ← every call at the cap
  //     claude-opus-5      70s         285      32  59.0s   64.0s   66.3s   67.1s
  //     claude-sonnet-4-6  45s         387      22  24.3s   45.0s   45.0s   —
  //     claude-sonnet-4-6  70s        1094     156  28.5s   63.8s   70.0s   —
  //
  // The 45s rows are degenerate: the MEDIAN equals the cap, i.e. more than half of all calls were
  // killed by the timeout rather than by anything the model did. Opus went 1-for-77. At 70s the
  // timeouts essentially vanish (1 model error in 271) and Opus's real distribution appears — p50
  // 59s, max 67.1s. So 45s was not a tail-trimming cap, it was below the median of the work.
  //
  // Those numbers were all measured under the OLD 4000-token cap, and the cap is why they look the
  // way they do: question_generation's p90 output is exactly 4000, i.e. censored. The timeout cannot
  // be sized from them directly, because generationMaxTokens now allows 16000 and latency scales with
  // tokens. Opus-5's throughput is remarkably flat across task types (model_usage, 14 days):
  // question_generation 67.6 tok/s, model_answer 69.1, feature_request 65.9, full_debrief 69.8 — call
  // it ~68 tok/s. Two probes of the real prompt at the raised cap produced 5,084 and 7,718 output
  // tokens, which at 68 tok/s is 75s and 113s.
  //
  // So 130s, not 75s: a timeout has to cover what the token budget actually permits the model to
  // produce, or the two settings fight each other and every slow generation is thrown away after
  // paying for it. (The full 16000 would be ~235s; the cap is a truncation guard, not a target, so
  // the timeout is sized to the observed distribution and a genuinely pathological run is still cut.)
  // The budget has to fit one such call plus a retry, or raising the cap just converts the request
  // into a one-shot.
  //
  // Measured directly on the live prompt (P3/F4, Opus-5, max_tokens 16000), which is what these are
  // now sized against — both runs produced a clean, well-formed 4-wine flight:
  //     effort=medium (what GENERATION_EFFORT sets)   5,710 tokens   83s
  //     API default (high)                           11,696 tokens  164s
  // 130s sits comfortably above the medium-effort figure and deliberately below the default-effort
  // one: at `high` this prompt does not fit in ANY reasonable interactive budget, which is precisely
  // why the effort is now set explicitly rather than left to the API default.
  //
  // On the old ceiling: the previous sizing was justified as "~25s of headroom under the browser's
  // 120s abort". That abort does not exist. app/study/page.tsx fetches /api/get-question with no
  // AbortController and no signal, app/page.tsx fetches the (fast) /banked route, and the only
  // 120_000 left in the tree is a stale comment in bank-worker.ts. The real ceiling is this route's
  // own `maxDuration = 300`, so 180s of budget still leaves ~120s for the banked fallback query,
  // the model-answer kickoff and serialization.
  //
  // Latency should IMPROVE for the common case despite the larger budget: today attempt 1 burns a
  // guaranteed 45s timeout before Sonnet gets a turn, where now it can simply succeed at ~59s.
  const startedAt = Date.now();
  const BUDGET_MS =
    saveOpts?.budgetMs || Number(process.env.GENERATION_BUDGET_MS) || GENERATION_TIMING.budgetMs;
  const CALL_TIMEOUT_MS =
    saveOpts?.callTimeoutMs ||
    Number(process.env.GENERATION_CALL_TIMEOUT_MS) ||
    GENERATION_TIMING.callTimeoutMs;
  // Absolute floor: below this no arm can return, so the loop stops and serves a banked question.
  const MIN_CALL_MS = Number(process.env.GENERATION_MIN_CALL_MS) || GENERATION_TIMING.minCallMs;
  // Per-arm floor. Sonnet does not reason unless asked, so it still lands around its measured ~28s
  // p50; Opus reasons on every call and takes ~83s at medium effort. "Enough time left to bother
  // starting" is therefore not one number. Starting an Opus call with 40s left is the exact mistake
  // the 45s cap was making 77 times over; when the selected arm no longer fits, the loop drops to
  // Sonnet for that attempt instead of spending the remaining budget on a call that cannot land.
  // 120s leaves margin over the measured 83s without being so tight that a slow draft is refused.
  const OPUS_MIN_CALL_MS =
    Number(process.env.GENERATION_OPUS_MIN_CALL_MS) || GENERATION_TIMING.opusMinCallMs;
  const minCallMsFor = (m: string) => (/opus/i.test(m) ? OPUS_MIN_CALL_MS : MIN_CALL_MS);
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
      parseFailureSample?: string | null;
      modelError?: string | null;
      isRepair?: boolean;
    }
  ) =>
    logGenerationAttempt({
      paper,
      family,
      source: meta?.source ?? null,
      userId: meta?.userId ?? null,
      questionId,
      attempt,
      isRepair: f.isRepair ?? false,
      callTimeoutMs: CALL_TIMEOUT_MS,
      budgetMs: BUDGET_MS,
      model: f.model ?? null,
      abGroup: f.abGroup ?? null,
      passed: f.passed,
      rulesFired: f.rulesFired ?? [],
      violations: f.violations ?? null,
      latencyMs: f.latencyMs ?? null,
      parseFailed: f.parseFailed ?? false,
      parseFailureSample: f.parseFailureSample ?? null,
      modelError: f.modelError ?? null,
    });

  // Duplicate-wine cooldown + flight-signature dedup (feedback). Fetched ONCE before the attempt
  // loop: the exact-wine cooldown pool (bottles used in the last RECENT_WINE_WINDOW questions for
  // this paper) and the flight signatures of the last RECENT_FLIGHT_WINDOW. Skipped in pinned mode —
  // a Live Tasting flight is fixed upstream and deliberately reuses its bottles, and there is no
  // redraft to converge to. A lookup outage degrades to empty sets (no dedup) rather than failing
  // generation.
  let recentWineIds = new Set<string>();
  let recentFlightSignatures = new Set<string>();
  if (!pinned) {
    try {
      [recentWineIds, recentFlightSignatures] = await Promise.all([
        getRecentWineIds(paper, RECENT_WINE_WINDOW),
        getRecentFlightSignatures(paper, RECENT_FLIGHT_WINDOW),
      ]);
    } catch (err) {
      console.error("[dedup] recent wine/signature fetch failed (non-fatal):", err);
    }
  }
  // How many drafts have collided with a recent wine / flight signature, and the flag that fails the
  // whole generation once that exceeds MAX_DEDUP_REGENERATIONS (rather than emitting a duplicate).
  let dedupCollisions = 0;
  let dedupFailed = false;

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
    // Prefer the selected A/B arm, but never START an arm that cannot finish in the time left. The
    // budget above fits Opus + a retry from cold; once Opus has had its turn the remainder usually
    // suits Sonnet only, and spending it on a second Opus call would guarantee another timeout.
    // Downgrading keeps the attempt (and its retry value) rather than dropping straight to banked.
    let model = attempt === 1 ? gen.model : "claude-sonnet-4-6";
    let attemptAb = attempt === 1 ? gen.abGroup : null;
    if (remaining < minCallMsFor(model)) {
      console.warn(
        `Generation attempt ${attempt}: ${remaining}ms left is under ${model}'s ${minCallMsFor(model)}ms floor; using claude-sonnet-4-6`
      );
      model = "claude-sonnet-4-6";
      attemptAb = null;
    }
    const callOpts = { timeout: Math.min(CALL_TIMEOUT_MS, remaining), maxRetries: 0 } as const;
    // Repair attempt: append the rejected draft + its violations so the model FIXES rather than
    // re-rolls. Appended to the USER message only — the system prompt stays byte-identical as the
    // cacheable prefix.
    const usedRepair = repairContext !== null;
    const attemptPrompt = repairContext
      ? {
          system: prompt.system,
          user: `${prompt.user}

## YOUR PREVIOUS DRAFT WAS REJECTED — REPAIR IT
Your previous draft (below) failed the blocking validator rules listed. Output a corrected draft in
the SAME output format as instructed above. Keep everything that was valid; change ONLY what the
violations require. If a violation names mark values, re-do the arithmetic until it passes; if it
names a wine, replace that wine (keeping the flight coherent); if it names stem wording, reword the
stem. Do not introduce new violations while fixing these.

### Violations to fix
${repairContext.violations.map((v) => `- ${v}`).join("\n")}

### Previous draft
${repairContext.draft}`,
        }
      : prompt;
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
      message = await callGenerationModel(client, model, attemptPrompt, callOpts, emit, meta?.userId);
      callMs = Date.now() - t0;
      logClaudeUsage(
        { taskType: "question_generation", model, source: meta?.source, userId: meta?.userId,
          batchId: meta?.batchId, questionId, abGroup: attemptAb },
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
            isRepair: usedRepair,
          });
          break;
        }
        const fallbackOpts = { timeout: Math.min(CALL_TIMEOUT_MS, fallbackRemaining), maxRetries: 0 } as const;
        const tRetry = Date.now();
        try {
          message = await callGenerationModel(client, "claude-sonnet-4-6", attemptPrompt, fallbackOpts, emit, meta?.userId);
          producedModel = "claude-sonnet-4-6";
          producedAb = null;
          callMs = Date.now() - tRetry;
          logClaudeUsage(
            { taskType: "question_generation", model: "claude-sonnet-4-6", source: meta?.source, userId: meta?.userId,
          batchId: meta?.batchId, questionId, abGroup: null },
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
            isRepair: usedRepair,
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
          isRepair: usedRepair,
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
        // The draft itself. parse_failed alone says a draft was malformed but never HOW, so the
        // only way to chase the cause was comparing rates across deploys — which needs thousands
        // of attempts to resolve a couple of points. One stored sample answers it directly.
        //
        // When the response carried NO text at all, the draft is not the interesting part — the
        // reason the model produced none is. Every parse failure in the first batch after this
        // logging shipped was of exactly that shape: attempt 1, Opus, ~60s, no API error, and zero
        // text. Storing plain "" there would have recorded null and told us nothing, so record the
        // stop reason and token counts instead — that distinguishes "budget exhausted before any
        // text" from "model genuinely returned nothing".
        parseFailureSample: text
          ? text
          : `(no text content) stop_reason=${message.stop_reason ?? "unknown"} ` +
            `output_tokens=${message.usage?.output_tokens ?? "?"} ` +
            `input_tokens=${message.usage?.input_tokens ?? "?"} ` +
            `blocks=[${message.content.map((b) => b.type).join(",")}]`,
        latencyMs: callMs,
        isRepair: usedRepair,
      });
      continue;
    }

    // Duplicate-wine cooldown + flight-signature dedup (feedback). BEFORE the examiner validators —
    // a flight that reuses a bottle from the last RECENT_WINE_WINDOW questions, or repeats the
    // (region, variety, style) signature of the last RECENT_FLIGHT_WINDOW, is redrafted rather than
    // graded. This is what stops "same wine reused across recently generated questions" and the
    // admin's "rated vs non-rated white Burgundy again". Pinned mode skips it (see the fetch above).
    // After MAX_DEDUP_REGENERATIONS collisions we FAIL the generation with a clear error instead of
    // emitting a duplicate.
    if (!pinned) {
      const reusedWine =
        candidate.wines.map((w) => wineCooldownId(w.fullText)).find((id) => id && recentWineIds.has(id)) ||
        null;
      const candidateSignature = flightSignature(candidate.wines);
      const signatureCollision = recentFlightSignatures.has(candidateSignature);
      if (reusedWine || signatureCollision) {
        dedupCollisions++;
        const ruleName = reusedWine ? "dedupWine" : "dedupSignature";
        const reason = reusedWine
          ? `reuses a wine seen within the last ${RECENT_WINE_WINDOW} questions for paper ${paper}`
          : `repeats the region/variety/style signature of a question within the last ${RECENT_FLIGHT_WINDOW} for paper ${paper}`;
        lastViolations = [`Duplicate flight: ${reason}`];
        console.error(
          `Generation attempt ${attempt}/${MAX_ATTEMPTS} duplicate flight (${dedupCollisions}/${MAX_DEDUP_REGENERATIONS} regenerations): ${reason}`
        );
        recordAttempt(attempt, {
          model: producedModel,
          abGroup: producedAb,
          passed: false,
          rulesFired: [ruleName],
          violations: { [ruleName]: lastViolations },
          latencyMs: callMs,
          isRepair: usedRepair,
        });
        // A duplicated flight needs a genuinely FRESH draw — repairing the rejected draft would
        // anchor the model on the very flight the dedup just refused.
        repairContext = null;
        if (dedupCollisions > MAX_DEDUP_REGENERATIONS) {
          dedupFailed = true;
          break;
        }
        emit?.({ type: "status", label: "Flight duplicated a recent one — redrafting…" });
        continue;
      }
    }

    emit?.({ type: "status", label: "Running the examiner validators…" });

    // Audit-grade rules (question-validator.ts), run at generation on TEXT-derived wine records so
    // the redraft loop can fix what the post-save audit would otherwise quarantine. The audit later
    // re-runs the same functions against the resolved answer key (richer lexicon); these four rule
    // families were 84% of all quarantines (id-mark-allocation 422q, flight-composition 144q,
    // stem-fact 88q, stem-preannounce/contrast 38q — Neon, 2026-08-06).
    // AuditWine requires `region`; the text stage has no resolved region, but isBanker & friends
    // test region+country+fullText together, and fullText carries the appellation, so "" is safe.
    const auditWines = winesFromText(candidate.wines).map((w) => ({ ...w, region: "" }));
    const auditDraft = {
      questionId: "draft",
      paper,
      family: candidate.family,
      questionText: candidate.questionText,
      totalMarks: candidate.wines.length * 25,
      wines: auditWines,
    };
    // Pinned (Live Tasting) skips the mark-split cap, mirroring the audit's BANK_COMPOSITION_RULES
    // exemption for live-tasting scope — it is a pool-quality standard, not a home-flight one.
    const idMarkCheck = {
      violations: pinned ? [] : idMarkAllocationViolations(auditDraft).map((v) => v.detail),
    };
    const stemFactsCheck = {
      violations: [
        ...crossCheckStemFacts(auditDraft),
        ...stemPreannouncesDiscriminator(candidate.questionText),
      ].map((v) => v.detail),
    };
    const contrastCheck = {
      violations: contrastIntegrityViolations(auditDraft).map((v) => v.detail),
    };

    // Critical validators (always run)
    // Shape first: if a slot holds reasoning rather than a wine, every variety/country/scope check
    // below is reading a paragraph of deliberation and its verdict means nothing.
    const wineShapeCheck = validateWineReferenceShape(candidate.wines);
    const paperScopeCheck = validatePaperScope(paper, candidate.wines);
    const varietyCheck = validateVarietyConsistency(candidate.questionText, candidate.wines);
    const markCheck = validateMarkAllocation(candidate.questionText, candidate.wines.length);
    const consistencyCheck = validateGenerationConsistency(candidate.generationReasoning, candidate.wines);
    // Critical and never relaxed: the candidate explicitly asked for this grape. It only fires on a
    // positively-identified wrong variety, so it cannot stall generation on undetectable wines.
    const varietyFilterCheck = validateVarietyFilter(variety, candidate.wines);
    // Critical and never relaxed: the prompt bans these producers outright, so a draft naming one
    // has ignored a hard instruction. The list is capped at PRODUCER_EXCLUDE_TOP, so a compliant
    // redraft always exists.
    // Pinned mode (Live Tasting): the flight is fixed by retail availability — the over-used
    // producer ban is a bank-composition concern and must not reject a wine the user can buy
    // (E2E run 5: the ban fired on a pinned Jacques Carillon and killed the create).
    const producerExclusionCheck = pinned
      ? { valid: true, violations: [] }
      : validateProducerExclusion(excludedProducerKeys, candidate.wines);

    // Important validators (relax on attempt 6+). Pinned mode (Live Tasting) skips every
    // flight-CHOICE validator outright — diversity/composition/price/banker/size/novelty were all
    // decided upstream by the archetype picker; re-judging them here could only reject a flight
    // we are not allowed to change. Stem-coherence validators (shape/scope/variety/marks) still run.
    const relaxImportant = attempt >= 6;
    const originDiversityCheck = pinned || relaxImportant
      ? { valid: true, violations: [] }
      : validateOriginDiversity(candidate.questionText, candidate.wines, candidate.family, candidate.subcategory);
    const countryDiversityCheck = pinned
      ? { valid: true, violations: [] }
      : validateCountryDiversity(candidate.questionText, candidate.wines);
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
    // Pinned mode skips markMix outright: it is a bank-composition nudge that trips ~40% of REAL
    // MW questions (see its own relaxation note), and on a 2-wine home flight it cost the pilot a
    // whole 157s Opus attempt — the budget only fits two.
    const markMixCheck = pinned || relaxMarkMix
      ? { valid: true, violations: [] }
      : validateMarkTypeMix(candidate.questionText);
    const compositionCheck = pinned || relaxImportant
      ? { valid: true, violations: [] }
      : validateCompositionBalance(candidate.family, paper, candidate.wines);
    const priceCheck = pinned || relaxImportant
      ? { valid: true, violations: [] }
      : validatePriceSpread(candidate.questionText, candidate.family, candidate.wines);

    // Nice-to-have validators (relax on attempt 4+)
    const relaxNiceToHave = attempt >= 4;
    // Bank path (batchId present): banker never relaxes, and via BANK_BLOCKING_RULES it actually
    // blocks — a bankerless flight must not be BANKED, whereas the interactive path keeps both the
    // relaxation and the advisory demotion because a user is waiting on the spinner. Pinned mode
    // (Live Tasting) skips banker outright — the flight was chosen upstream by the archetype picker.
    const bankPath = Boolean(saveOpts?.batchId);
    // The banker verdict now comes from the AUDIT's own flight-composition rule (isBanker +
    // curveball cap) rather than validateBankerMinimum's divergent regex — the two heuristics
    // disagreeing is how 144 bankerless/curveball-heavy flights passed generation and were then
    // quarantined post-save. Same relaxation policy as before (advisory interactive, blocking on
    // the bank path via BANK_BLOCKING_RULES).
    const bankerViolations =
      pinned || shouldRelaxBanker(attempt, bankPath)
        ? []
        : flightCompositionViolations(auditWines).map((v) => v.detail);
    const bankerCheck = { valid: bankerViolations.length === 0, violations: bankerViolations };
    const flightSizeCheck = pinned || relaxNiceToHave
      ? { valid: true, violations: [] }
      : validateFlightSize(candidate.family, paper, candidate.wines.length);
    // Novelty NEVER fully relaxes: serving a user a question whose shape they've already seen defeats
    // the practice system. On relaxed attempts it runs in "lenient" mode — still blocks exact AND
    // structural/thematic repeats (same template + contrast axis), but drops the fuzzier
    // family/country/variety heuristic so generation can still converge.
    const noveltyCheck = pinned
      ? ({ valid: true, violations: [] } as ReturnType<typeof validateNoveltyAgainstLatest>)
      : validateNoveltyAgainstLatest(
          candidate,
          latestQuestion,
          recentGenerated.map(normalizeGeneratedQuestionWines),
          { lenient: relaxNiceToHave, targeted: saveOpts?.familyTargeted ?? false }
        );

    // Live Tasting pinned-mode HARD checks (see live-tasting-validators.ts): the draft must use
    // exactly the pinned wines, and the stem must not leak producer/cuvée identity.
    const pinnedFlightCheck = pinned
      ? validatePinnedFlight(pinned, candidate.wines)
      : { valid: true, violations: [] };
    const blindSafetyCheck = pinned
      ? validateBlindSafety(candidate.questionText, pinned)
      : { valid: true, violations: [] };
    // Mark-structure realism (paper-QA rounds 4-6): prompt guidance alone kept producing uniform
    // "4 x 9" splits and a 50-mark essay block; deterministic check + redraft is the reliable lever.
    const markRealismCheck = pinned
      ? validateMarkRealism(candidate.questionText, pinned.length * 25)
      : { valid: true, violations: [] };

    // Declared in the order the violations used to be concatenated, so the flat list below preserves
    // the original ordering while the telemetry gets the rule NAME behind each one — the whole point
    // of the table: "which validator is costing us the redrafts?" Every rule here is recorded;
    // ADVISORY_RULES below controls which of them can actually fail an attempt.
    const checks: Record<string, { violations: string[] }> = {
      wineShape: wineShapeCheck,
      paperScope: paperScopeCheck,
      variety: varietyCheck,
      varietyFilter: varietyFilterCheck,
      producerExclusion: producerExclusionCheck,
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
      // Stem-disclosure (rule R10, shared with the audit where it is a soft flag): a stem that
      // announces the discriminator ("made using contrasting approaches in the winery") BLOCKS here
      // and never relaxes — the model is rewording its own text, so convergence is not at risk, and
      // this was the largest stem-quality class in Mike's bin-reason corpus.
      stemDisclosure: { violations: stemDisclosureViolations(candidate.questionText).map((x) => x.detail) },
      // Audit-grade rules (see auditDraft above). All three BLOCK on every path and never relax:
      // they are exactly what auditAndQuarantineQuestion will quarantine on minutes after the save,
      // so letting a draft through on them just converts a redraft into a dead banked row. idMark
      // and stemFacts are deterministic text fixes the repair prompt converges on quickly;
      // contrastIntegrity fails safe (skips wines whose mechanism can't be resolved from text).
      idMarkAllocation: idMarkCheck,
      stemFacts: stemFactsCheck,
      contrastIntegrity: contrastCheck,
      pinnedFlight: pinnedFlightCheck,
      blindSafety: blindSafetyCheck,
      markRealism: markRealismCheck,
    };
    const violationsByRule: Record<string, string[]> = {};
    for (const [name, check] of Object.entries(checks)) {
      if (check.violations.length > 0) violationsByRule[name] = check.violations;
    }
    lastViolations = blockingViolations(violationsByRule, { bankPath });

    recordAttempt(attempt, {
      model: producedModel,
      abGroup: producedAb,
      passed: lastViolations.length === 0,
      rulesFired: Object.keys(violationsByRule),
      violations: violationsByRule,
      latencyMs: callMs,
      isRepair: usedRepair,
    });

    if (lastViolations.length === 0) {
      parsed = candidate;
      validation = { wineShapeCheck, paperScopeCheck, varietyCheck, markCheck, originDiversityCheck, countryDiversityCheck, bankerCheck, flightSizeCheck, noveltyCheck };
      genModelUsed = producedModel;
      genAbGroup = producedAb;
      if (attempt > 1) console.log(`Generation retry ${attempt} succeeded (relaxed=${relaxNiceToHave ? "nice-to-have" : relaxImportant ? "important" : "none"})`);
      emit?.({ type: "status", label: "All validators passed." });
      break;
    }

    console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS} failed:`, JSON.stringify(lastViolations));
    // Arm the next attempt as a REPAIR of this draft (see repairContext above).
    repairContext = { draft: text, violations: lastViolations };
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
    // Duplicate-wine cooldown / flight-signature dedup exhausted (feedback): the model kept redrawing
    // the same bottle or the same (region, variety, style) shape. Fail with a clear error rather than
    // fall through to a banked question — the whole point is to NOT put a just-seen flight in front of
    // the candidate, and a banked fallback here would risk exactly that.
    if (dedupFailed) {
      const msg =
        `Generation could not produce a non-duplicate flight after ${MAX_DEDUP_REGENERATIONS} regenerations ` +
        `for paper ${paper}: ${lastViolations[0] ?? "duplicate flight"}`;
      console.error(msg);
      emit?.({ type: "status", label: "Couldn't produce a fresh flight — please try again." });
      return { error: msg };
    }
    // Pinned mode: a banked question is NOT a substitute for the availability-confirmed flight —
    // the caller (live-tasting-engine) handles failure by swapping a candidate wine and retrying.
    if (pinned) {
      console.error("Pinned-flight generation did not converge:", JSON.stringify(lastViolations));
      return { error: `Live Tasting generation did not converge: ${lastViolations[0] ?? "unknown"}` };
    }
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
    // Live Tasting (migration 041): 'live-tasting' rows are session-private, excluded from pools.
    scope: saveOpts?.scope,
    metadata: {
      generatedOnTheFly: true,
      generationReasoning: parsed.generationReasoning,
      // Flight-signature dedup (feedback): persist the (region, variety, style) signature so the
      // recent-signatures lookup for the next generation is a stored read, not a re-derivation.
      flightSignature: flightSignature(parsed.wines),
      wineShapeCheck: validation.wineShapeCheck,
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

  // Length Check (feature): the bank-generation path (a batchId is present) audits every saved
  // question against the MW sub-bullet length / ask-density budgets, auto-repairs ONCE if it runs
  // long, and stamps the verdict so admin batch review can badge it. Runs AFTER the mark validator
  // above (parsed.markCheck already passed) and BEFORE the background model answer, so a trimmed stem
  // is the one the model answer is written for. The interactive study path (no batchId) is untouched.
  //
  // enforceLengthCheck never throws and never drops a question: a 'trimmed' result rewrites the stem
  // (marks + total invariant), an 'over' result keeps the original and records the violation summary,
  // and a length-check outage degrades to 'clean' (no badge). Only a non-clean verdict is persisted;
  // a clean item keeps its NULL columns.
  if (saveOpts?.batchId) {
    emit?.({ type: "status", label: "Checking length against real MW papers…" });
    const lengthOutcome = await enforceLengthCheck(parsed.questionText, apiKey, meta, questionId);
    if (lengthOutcome.status !== "clean") {
      parsed.questionText = lengthOutcome.questionText;
      saved.question_text = lengthOutcome.questionText;
      try {
        await applyLengthCheck(questionId, {
          status: lengthOutcome.status,
          lengthCheck: lengthOutcome.lengthCheck as Record<string, unknown> | null,
          // Persist the rewritten stem only when it actually changed ('trimmed').
          questionText: lengthOutcome.status === "trimmed" ? lengthOutcome.questionText : null,
        });
      } catch (err) {
        console.error(`[length-check] failed to persist verdict for ${questionId} (non-fatal):`, err);
      }
    }
  }

  // Detached by default (the study path never waits); awaited below when the caller requires it.
  //
  // The stem answer key is derived as soon as enrichment lands. The key is what the hard validator
  // audits against (scripts/audit-questions.mjs joins stem_answer_keys), so a question without one is
  // unverifiable — it can never be checked for the stem<->wine contradictions in question-rules.mjs.
  // The only writer used to be the Stem Sniper drill path, so questions from the study flow and the
  // bulk worker landed unkeyed and silently escaped the audit: coverage was 31 of 66 usable questions.
  // Chaining it here makes every generated question auditable by construction, and puts it inside the
  // promise awaitBackgroundWork already waits on. Ordering is load-bearing — buildStemKeyForQuestion
  // reads back the wine_profiles that enrichWineProfiles writes.
  // Resolves to the researched profiles, and never rejects — an enrichment outage degrades the two
  // consumers below rather than failing generation.
  const enrichment: Promise<Record<string, WineProfile>> = enrichWineProfiles(questionId, parsed.wines, apiKey, meta)
    .catch((err) => {
      console.error("Wine enrichment background error:", err);
      return {} as Record<string, WineProfile>;
    });

  const stemKey = enrichment
    .then(() => buildStemKeyForQuestion(questionId))
    .then((res) => {
      if ("error" in res) {
        // No key ⇒ no verdict; the daily corpus audit (question-audit-daily.yml) is the backstop.
        console.error(`Stem key for ${questionId} not built: ${res.error}`);
        return false;
      }
      if (!res.ok) console.warn(`Stem key for ${questionId} validated=false: ${res.problems.join("; ")}`);
      return true;
    })
    .catch((err) => {
      console.error("Stem key background error:", err);
      return false;
    });

  // CHAINED off enrichment, not fired alongside it. These two used to start on the same tick, so the
  // model answer could not have used the researched profiles even once the parameter existed — the
  // enrichment simply had not happened yet. The candidate got tasting notes anchored to real research
  // and an exemplar anchored to the model's recall of the producer, and the two were free to disagree
  // about the wine in the glass.
  //
  // The added latency is invisible on the study path: the answer is fire-and-forget and is not read
  // until the candidate submits, which is minutes away. The bulk worker awaits the whole chain below.
  const modelAnswer = enrichment.then((profiles) =>
    generateModelAnswerInBackground(
      questionId,
      parsed.questionText,
      parsed.wines,
      paper,
      parsed.family,
      apiKey,
      meta,
      profiles,
      parsed.totalMarks
    )
  );

  // Key-stage audit + auto-quarantine, sequenced after BOTH background writes. The text-stage
  // validators above ran on raw labels; this re-checks against the RESOLVED key (richer lexicon —
  // the stage that catches Cannonau = Garnacha) AND runs the answer-content rules over the saved
  // model answer (missing wines, wrong/absent identities, placeholders — answer-content-rules.mjs).
  // Hard violations set invalid_reasons so the question never serves from the bank. It must wait for
  // the model answer, not just the key: auditing before the answer lands would validate a NULL
  // answer and miss every answer defect on the generation path.
  // Whether the key-stage audit quarantined this question. Only meaningful to callers that await
  // the background work (the bank worker): on the detached study path it is still false at return
  // time by construction. The worker uses it to stop counting a quarantined row as a banked
  // success — before this, a batch reported "generated" for rows the audit had already killed.
  let quarantinedAtGeneration = false;
  const backgroundAudit = Promise.all([stemKey, modelAnswer])
    .then(async ([keyBuilt]) => {
      if (!keyBuilt) return; // no key ⇒ no verdict; the daily sweep audits it once the key exists
      const audit = await auditAndQuarantineQuestion(questionId);
      if (audit.audited && audit.hard.length > 0) {
        quarantinedAtGeneration = true;
        console.warn(
          `Question ${questionId} quarantined at generation: ${audit.hard.map((v) => `${v.rule}: ${v.detail}`).join(" | ")}`
        );
      }
    })
    .catch((err) => console.error("Question audit background error:", err));

  // The bulk worker asks for these to be finished, not merely started (see awaitBackgroundWork).
  // None of these promises reject, so this cannot turn a banked question into a thrown error.
  // backgroundAudit transitively awaits stemKey, so listing it covers all three chains.
  let modelAnswerSaved = false;
  if (saveOpts?.awaitBackgroundWork) {
    [, modelAnswerSaved] = await Promise.all([backgroundAudit, modelAnswer]);
  } else if (saveOpts?.awaitKeyOnly) {
    await stemKey;
    saveOpts.onBackgroundWork?.(Promise.all([backgroundAudit, modelAnswer]));
  }

  return {
    source: "generated" as const,
    // `saved` was read before the answer existed, so this reports the awaited outcome rather than
    // the row — false on the study path, where the answer is still in flight by design.
    question: sanitizeQuestionMetadata(saved),
    hasModelAnswer: modelAnswerSaved,
    // See quarantinedAtGeneration above — settled only when awaitBackgroundWork was requested.
    quarantined: quarantinedAtGeneration,
  };
}



// detectPrimaryVariety / normalizeVariety used to be duplicated here, byte-identical to the copies in
// question-rules.mjs apart from a divergent synonym list — which is how the generation stage came to
// disagree with the answer-key stage about Cannonau vs Garnacha (both Grenache). They now come from
// question-rules.mjs, the declared single source of truth for the stem<->wine rules.
const normalizeVariety = canonVariety;

// Fold accents so a requested "Sémillon" matches the unaccented token the grape regexes detect.
// canonVariety already strips diacritics, so this is now just the shared canonicalisation.
function foldVariety(value: string): string {
  return canonVariety(value);
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

// ── Generation-time producer & wine-style frequency caps ─────────────────────────────────────────
// The soft "spread" nudge and the over-used STATUS (which needs a floor count) both let recurring
// signatures slip through on a small or freshly-swept bank — the reviewer binned the same producers
// AND the same niche categories (Weinbach Gewurztraminer, Seppeltsfield tawny, Jura vin jaune) again
// and again ("I keep telling you this"). These caps are UNCONDITIONAL:
//   • hard frequency cap — any producer/style over PRODUCER_SHARE_CAP of the paper's live bank is
//     excluded, with NO floor count (unlike 'over-used'), so a tiny-but-dominant signature is caught.
//   • last-N window — any producer/style used in the last PRODUCER_RECENT_WINDOW questions for the
//     paper is excluded outright, independent of its share. This rule is NEVER relaxed.
// If exclusion would leave nothing buildable the prompt asks the model to widen by region/grape first,
// but the caps themselves are computed here and never softened at the call site.
export const PRODUCER_SHARE_CAP = 0.05;
export const PRODUCER_RECENT_WINDOW = 10;

export type ExclusionReason = "reviewer-ban" | "over-used" | "share-cap" | "recent-window";

export interface ExcludedProducer {
  key: string;
  display: string;
  reasons: ExclusionReason[];
}

// Assemble the full generation-time producer exclusion for a paper from the producer tally (rows sorted
// count-desc, each carrying its share of the paper's live bank) and the producer keys used in the last
// PRODUCER_RECENT_WINDOW questions. Pure so the caps are testable without a database. A producer caught
// by several rules lists every reason it fired (the log shows why): reviewer bans and tally over-use
// first (buildExclusionList), then the hard share cap, then the last-N window.
export function buildGenerationProducerExclusion(
  tallyRows: { producer_key: string; producer_display: string; share: number; status: ProducerStatus }[],
  recentProducers: { key: string; display: string }[],
  opts?: { cap?: number; overuseLimit?: number }
): ExcludedProducer[] {
  const cap = opts?.cap ?? PRODUCER_SHARE_CAP;
  const limit = opts?.overuseLimit ?? PRODUCER_EXCLUDE_TOP;
  const byKey = new Map<string, ExcludedProducer>();
  const add = (key: string, display: string, reason: ExclusionReason) => {
    if (!key) return;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    } else {
      byKey.set(key, { key, display: display || key, reasons: [reason] });
    }
  };

  const reviewerKeys = new Set(REVIEWER_EXCLUDED_PRODUCERS.map((d) => normaliseProducer(d)));
  for (const p of buildExclusionList(tallyRows, limit)) {
    add(p.key, p.display, reviewerKeys.has(p.key) ? "reviewer-ban" : "over-used");
  }
  for (const r of tallyRows) {
    if (r.share > cap) add(r.producer_key, r.producer_display, "share-cap");
  }
  for (const p of recentProducers) add(p.key, p.display, "recent-window");

  return [...byKey.values()];
}

// The signature niche wine STYLES the reviewer keeps flagging, keyed on region+style so the CATEGORY —
// not just the label — is capped. Each test runs against a single wine descriptor (its fullText).
export interface NicheStyle {
  id: string;
  label: string;
  test: (wineText: string) => boolean;
}

export const NICHE_WINE_STYLES: NicheStyle[] = [
  {
    id: "jura-sous-voile",
    label: "Jura vin jaune / sous voile Savagnin",
    test: (t) =>
      /\bvin\s*jaune\b/i.test(t) ||
      /ch[aâ]teau[-\s]?chalon/i.test(t) ||
      /sous[-\s]?voile/i.test(t) ||
      (/\bsavagnin\b/i.test(t) && /\bjura\b/i.test(t)),
  },
  {
    id: "aged-tawny",
    label: "Seppeltsfield-style aged tawny",
    test: (t) =>
      /\bseppeltsfield\b/i.test(t) ||
      (/\btawny\b/i.test(t) && /\b(rare|grand|aged|para|\d{2,3}\s*year)\b/i.test(t)),
  },
  {
    id: "alsace-gewurz",
    label: "Alsace Gewurztraminer",
    // Region + style: Gewurztraminer specifically from Alsace, since the complaint is Alsace Gewurz.
    test: (t) => /gew[uü]rztraminer/i.test(t) && /\balsace\b/i.test(t),
  },
];

// The niche style ids a single wine descriptor matches (usually 0 or 1).
export function detectNicheStyles(wineText: string): string[] {
  const out: string[] = [];
  for (const s of NICHE_WINE_STYLES) if (s.test(wineText)) out.push(s.id);
  return out;
}

export interface ExcludedStyle {
  id: string;
  label: string;
  reasons: ExclusionReason[];
}

// Niche styles to exclude for a paper, from its live wines grouped by question (newest first): a style
// over the share cap (its matching wines / all wines), or present anywhere in the last `recentWindow`
// questions. Pure and DB-free so the caps are testable. Only 'share-cap' / 'recent-window' apply here.
export function selectExcludedNicheStyles(
  winesByQuestion: string[][],
  recentWindow: number = PRODUCER_RECENT_WINDOW,
  cap: number = PRODUCER_SHARE_CAP
): ExcludedStyle[] {
  const labelById = new Map(NICHE_WINE_STYLES.map((s) => [s.id, s.label]));
  const byId = new Map<string, ExcludedStyle>();
  const add = (id: string, reason: ExclusionReason) => {
    const existing = byId.get(id);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
    } else {
      byId.set(id, { id, label: labelById.get(id) ?? id, reasons: [reason] });
    }
  };

  let totalWines = 0;
  const counts = new Map<string, number>();
  winesByQuestion.forEach((wines, qi) => {
    for (const text of wines) {
      totalWines += 1;
      for (const id of detectNicheStyles(text)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (qi < recentWindow) add(id, "recent-window");
      }
    }
  });
  if (totalWines > 0) {
    for (const [id, c] of counts) if (c / totalWines > cap) add(id, "share-cap");
  }
  return [...byId.values()];
}

/**
 * Enforce the generation-time producer ban: no wine may come from a producer the bank has already
 * over-used (the prompt's PRODUCER EXCLUSION block names the same list). Belt-and-suspenders with
 * that block — the reviewer's repeated Weinbach complaints prove the model does not reliably obey a
 * list it is merely shown. Matching runs through normaliseProducer, the same canonicalisation the
 * bank tally uses, so "Domaine Weinbach", "Weinbach" and accent variants all hit one key — and then
 * through producerKeyIsExcluded's word-boundary prefix check, because a comma-less label glues the
 * cuvée into the head ("Domaine Weinbach Cuvée Theo Riesling" → key "weinbach cuve theo riesling")
 * and exact equality would let every such variant through. Wines whose descriptor yields no producer
 * are skipped — a malformed line is validateWineReferenceShape's problem, not a phantom match.
 * CRITICAL tier, never relaxed.
 */
export function validateProducerExclusion(
  excludedKeys: ReadonlySet<string>,
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  if (excludedKeys.size === 0) return { valid: true, violations: [] };
  const violations: string[] = [];
  for (const wine of wines) {
    const display = extractProducerDisplay(wine.fullText);
    if (!display) continue;
    if (producerKeyIsExcluded(normaliseProducer(display), excludedKeys)) {
      violations.push(
        `Wine ${wine.slot}: producer "${display}" is on the over-used producer exclusion list for this paper — replace it with a different credible producer from the same region and price band`
      );
    }
  }
  return { valid: violations.length === 0, violations };
}

/**
 * Every wine slot must hold a wine REFERENCE, not the generator's reasoning about which wine to pick.
 *
 * Delegated to the shared rule layer (R8, wine-reference-shape) so the audit path catches the same
 * defect on already-banked rows. CRITICAL and never relaxed: an unparseable entry is not a lesser
 * question, it is a broken one. Twelve banked questions carried slots holding text like
 * "Chambers Rosewood — wait, excluded. Let me correct." or a 601-character paragraph weighing up
 * Amontillados. Nothing downstream noticed — wine enrichment ran a Tavily search on the paragraph, the
 * wine_bank gained a row whose producer was a sentence of deliberation, and the flight reached the
 * candidate as a real question.
 */
export function validateWineReferenceShape(
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  const violations = applyQuestionRules({ paper: 0, questionText: "", wines: winesFromText(wines) }, {})
    .filter((v) => v.rule === "wine-reference-shape")
    .map((v) => v.detail);
  return { valid: violations.length === 0, violations };
}

export function validatePaperScope(paper: number, wines: { slot: number; fullText: string }[]): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  // Paper 3 wines that give a flight its Paper-3 character (sparkling / fortified / sweet / rosé /
  // oxidative / orange). Judged together below, never individually.
  const p3Qualifying: { slot: number; fullText: string }[] = [];
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
      const hasSpecialIndicator = /\b(sparkling|champagne|cava|prosecco|cremant|sekt|brut|blanc\s*de|rose|rosé|fortified|sherry|port|madeira|marsala|vin\s*santo|tokaj|aszu|sauternes|barsac|beerenauslese|trockenbeerenauslese|auslese|spätlese|kabinett|ice\s*wine|eiswein|passito|recioto|amarone|brachetto|moscato|muscat|rutherglen|maury|banyuls|rivesaltes|pedro\s*ximenez|oloroso|amontillado|manzanilla|fino|palo\s*cortado|VDN|vin\s*doux|late\s*harvest|botrytis|noble\s*rot|noble\s+(?:one|riesling|semillon|s[ée]millon|blend)|vendange\s*tardive|SGN|szamorodni|tawny|rimage|ruby|vintage|colheita|cream|dry\s*sack)\b/i.test(text);
      // `noble <varietal>` sits alongside `noble rot` because that is how the southern hemisphere
      // labels botrytis: De Bortoli Noble One, Brown Brothers Patricia Noble Riesling, Vidal Noble
      // Riesling. Those never say "rot" or "botrytis", and at 10-12% they also clear the sweet ABV
      // floor below — so a genuine P3 sweet wine was being rejected as a standard still white.
      // Observed: "Brown Brothers, Patricia Noble Riesling, 2018. King Valley … (11%)".
      //
      // Deliberately NOT solved by raising the ABV threshold. 11% catches Patricia, but 12% would
      // start admitting dry Riesling and Vinho Verde onto Paper 3 — the exact error this rule exists
      // to prevent. A name token is the precise signal; ABV is the blunt fallback.
      const abvMatch = text.match(/\((\d+(?:\.\d+)?)%(?:\s*abv)?\)/);
      const abv = abvMatch ? parseFloat(abvMatch[1]) : null;
      const isLikelySweet = abv !== null && abv <= 10;
      const isLikelyFortified = abv !== null && abv >= 15;
      // Nothing is flagged per wine. A still dry wine is legitimate on Paper 3; the flight-level
      // check after this loop enforces the real rule. We record the CONVERSE — whether this wine is
      // one of the styles that make a flight Paper 3 — because that is detectable from the label
      // alone, whereas "is still dry" depends on recognising a grape and many real P3 wines name
      // none ("Nuits St Georges, 1er Cru Clos des Argillières" is a still red with no variety in the
      // text). Testing for the presence of a qualifying wine avoids that blind spot entirely.
      void isWhiteGrape;
      void isRedGrape;
      if (hasSpecialIndicator || isLikelySweet || isLikelyFortified) {
        p3Qualifying.push(wine);
      }
    }
  }

  // PAPER 3 STILL-DRY RULE (flight-level, and the whole rule).
  //
  // This used to reject any still dry wine on Paper 3 — "sparkling/fortified/sweet/rosé/oxidative
  // only". That is not what the IMW sets. Measured over the 51 real P3 questions in the corpus:
  //
  //     entirely still dry .... 0
  //     contains one or more .. 42  (82%)
  //     none .................. 9
  //
  // 32 of 180 real P3 wines (17.8%) are still dry, and they are not exotica: Nuits St Georges 1er
  // Cru, Bandol, Saint-Romain, Riesling Trocken and Alsace Pinot Gris Grand Cru all appear, tagged
  // curveball_level=low. So a still dry wine belongs on P3; what never happens is a flight made
  // ENTIRELY of them, because that is simply a Paper 1 or Paper 2 question.
  //
  // Rejecting them individually also created a loop that could not terminate. pickP3StyleCategory
  // draws the most under-represented style, still_dry sat at 2.8% banked against a 20% target, so it
  // was drawn repeatedly — and every such question was then rejected by this rule, which kept the
  // deficit at 2.8%. paperScope was joint-top blocker on P3 (16 of 40 attempts) while barely
  // registering on P1/P2.
  if (paper === 3 && wines.length > 0 && p3Qualifying.length === 0) {
    violations.push(
      `No wine in this flight is sparkling, fortified, sweet, rosé, oxidative or orange — that is a Paper 1 or Paper 2 flight, ` +
        `not Paper 3. Paper 3 mixes styles: still dry wines are welcome (82% of real P3 questions ` +
        `contain at least one) but must sit alongside sparkling, fortified, sweet, rosé, oxidative or orange.`
    );
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

// Appellations where a BLEND is the norm, so a "single grape variety" stem must not use them.
//
// Two fixes and four additions, all grounded in the corpus (148 multi-variety wines; this list
// previously missed 98 of them):
//   • `champagne` no longer requires a brut/nv/vintage/rose qualifier — bare "Champagne AOC" is how
//     12 corpus wines are written and none of them matched.
//   • porto / bare `port` added: the list had vintage/tawny/ruby port but not the plain form (8 wines).
//   • rioja (13 wines), tokaji (2), cotes de provence (2) added — blends by convention.
// Deliberately NOT added: Madeira (varietal Sercial/Verdelho/Bual/Malmsey are single-grape by
// definition), Stellenbosch and IGT Toscana (regions producing both), Chianti Classico (can be 100%
// Sangiovese). Listing those would reject correct single-variety flights.
//
// NOTE: duplicated verbatim in question-rules.mjs. Change both or they drift.
const KNOWN_BLEND_INDICATORS = /\b(tawny\s*(port|\d+\s*year)|ruby\s*port|lbv|vintage\s*port|porto|port\s*(doc|dop)|champagne|cremant|cava|franciacorta|prosecco|chateauneuf|cdp|gigondas|vacqueyras|bordeaux|medoc|haut-medoc|pauillac|margaux|saint-julien|saint-estephe|saint-emilion|pomerol|pessac|graves|cotes\s*du\s*rhone|cotes\s*de\s*provence|rioja|tokaji|gsm|meritage|ripasso|amarone|valpolicella)\b/i;

function isLikelyBlend(fullText: string): boolean {
  // Strip diacritics first. The pattern is ASCII but the labels are not — "Châteauneuf-du-Pape AOC"
  // never matched `chateauneuf`, so 5 corpus blends slipped through. Same bug class as the benchmark
  // appellations (matchesBenchmarkAppellation).
  const text = fullText
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (KNOWN_BLEND_INDICATORS.test(text)) return true;
  const variety = detectPrimaryVariety(fullText);
  if (variety.includes("blend")) return true;
  return false;
}

export function validateVarietyConsistency(questionText: string, wines: { slot: number; fullText: string }[]): { valid: boolean; violations: string[] } {
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

    // Flag wines where variety cannot be detected — suspicious in a same-variety flight.
    //
    // Both messages here are repair-loop instructions as much as they are diagnostics. The old single
    // "variety undetectable" message reported a blend-appellation wine (Pauillac resolves to no
    // single grape) identically to a merely-unmapped varietal wine, which told the repair loop
    // nothing about the actual defect — in bank batch c3276590 (2026-08-06) the model answered it by
    // swapping one Pauillac second wine for another, eight attempts in a row, until the failure
    // breaker killed the bucket. Only wines ALREADY undetected get the blend message: a detected
    // blend-normed label (Rioja → tempranillo) still passes, because real MW same-variety flights do
    // use Rioja in Tempranillo flights — rejecting those would trade one false-fire loop for another.
    for (const w of undetected) {
      if (isLikelyBlend(w.text)) {
        violations.push(
          `Stem says same single grape variety, but Wine ${w.slot} ("${w.text}") is from a blend-normed category (Bordeaux/Médoc communes, Châteauneuf, Gigondas, etc.). Variety-dominant is not single-varietal — replace it with a genuinely 100% varietal wine whose label or appellation names the grape.`
        );
      } else {
        violations.push(
          `Wine ${w.slot} ("${w.text}") — variety undetectable in a same-variety flight. Every wine's name or appellation must clearly map to the declared variety: write the variety into the wine name where the producer labels it that way (e.g. "Henschke, Hill of Grace Shiraz"), or use a varietal appellation (Barolo, Chablis, Sancerre).`
        );
      }
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

  // Same contradiction, delegated to the shared rule layer, and deliberately OUTSIDE every gate above
  // because applyQuestionRules self-gates on the stem wording — that gate is the whole point. The
  // local `stemSaysEachSingleVariety` regex requires "different[,] single|predominant ... variety", so
  // a stem reading "made predominantly from a different grape variety" — where "predominantly" sits
  // BEFORE "different" rather than between it and "variety" — matched neither branch and the whole
  // block was skipped. Three banked defects came through that gap (a Cannonau/Garnacha pair, a
  // triple-Syrah flight, a doubled Cabernet), each caught only afterwards by the key-stage audit.
  // Union with the check above rather than a replacement: strictly more catching, no regression.
  for (const det of applyQuestionRules(
    { paper: 0, questionText, wines: winesFromText(wines) },
    {}
  ).filter((v) => v.rule === "distinct-variety")) {
    if (!violations.includes(det.detail)) violations.push(det.detail);
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

export const BENCHMARK_APPELLATIONS = /\b(premier\s*cru|1er\s*cru|grand\s*cru|cru\s*class[eé]|pauillac|margaux|saint[- ]julien|saint[- ]estephe|saint[- ]emilion|pomerol|pessac[- ]leognan|sauternes|barsac|meursault|puligny[- ]montrachet|chassagne[- ]montrachet|chablis|corton|gevrey[- ]chambertin|chambolle[- ]musigny|vosne[- ]roman[eé]e|nuits[- ]saint|pommard|volnay|barolo|barbaresco|brunello|chianti\s*classico|vino\s*nobile|taurasi|hermitage|cote[- ]rotie|cornas|chateauneuf[- ]du[- ]pape|marlborough|sancerre|pouilly[- ]fum[eé]|vouvray|savennieres|clos\s*ste\s*hune|alsace\s*grand\s*cru|rioja\s*(gran\s*)?reserva|ribera\s*del\s*duero|priorat|vintage\s*port|lbv|tawny\s*\d+|fino|manzanilla|amontillado|oloroso|palo\s*cortado|madeira|tokaj|rutherford|oakville|stags\s*leap|napa\s*valley|sonoma\s*coast|willamette|stellenbosch|hawkes?\s*bay|waipara|clare\s*valley|eden\s*valley|barossa|margaret\s*river|yarra\s*valley|wachau|kamptal)\b/i;

// BENCHMARK_APPELLATIONS is written in ASCII, but real wine labels are not: the corpus contains
// "Châteauneuf du Pape", "Pessac Léognan", "St Julien", "St Estèphe". The pattern is also only
// inconsistently accent-aware — it spells out class[eé], roman[eé]e and fum[eé], but not châteauneuf
// or côte-rôtie — so which benchmarks it recognised came down to which alternates someone remembered
// to write. Normalise the text instead, the same way wine-bank-lookup already does (NFD + strip
// diacritics), plus the St/Ste abbreviation that appears on real labels.
//
// Worth 16 of the 204 corpus-tagged benchmarks the rule failed to recognise. The remaining 188 are
// genuine omissions from the list (Champagne, Mosel, Rioja, Alsace, California AVAs…), which is a
// wine-domain question, not a bug.
// Rules that are RECORDED in telemetry but must not fail a generation attempt.
//
// banker is advisory because its detector is not good enough to hard-reject on. It regex-matches
// BENCHMARK_APPELLATIONS against the wine text, and measured against the corpus's own
// benchmark_status tags on held-out years (2021+) it recognises just 44.3% of real benchmarks while
// also accepting 22.4% of non-benchmarks. It misses more real bankers than it catches.
//
// Widening it does not help, because benchmark-ness is not a property of the appellation: a cheap
// Rioja Joven and a López de Heredia Gran Reserva share the word "Rioja". Every widening trades
// false negatives for false positives roughly one for one — adding the major missing regions
// (Champagne, Mosel, Rioja, Alsace, Napa…) took recall to 63.4% but false positives to 40.8%, and a
// list derived from the corpus's own tags scored WORSE than the current one out of sample (29.8%).
//
// Rejecting a good question on a coin-flip signal is the wrong trade, and this was the top blocker
// in production: 16 rejections, 19.5% of attempts, in a measured Paper 1 batch. The pedagogy is not
// lost — the prompt still teaches the banker rule in far richer terms than a regex can express
// (classification level, noble varieties, EK-0131 on Alsace). It stays in generation_attempts.
// rules_fired, so if a better detector ever earns it a hard gate, the evidence is already accruing.
export const ADVISORY_RULES = new Set(["banker"]);

// Advisory rules that block anyway on the BANK path (batchId set — Fill-the-Bank / generate / cron
// worker). The advisory demotion above is an interactive-latency trade: with a user watching the
// spinner and ~2-5 attempts of budget, hard-rejecting on a coin-flip detector starved generation.
// The bank worker has no spinner and a long retry budget, and letting relaxed/advisory attempts
// through is how the bank accumulated bankerless flights — the single largest defect class in the
// reviewer bin corpus (18 of 67 reasoned bins tagged too_obscure; see
// outputs/feedback_analyses/mike_bin_reasons_2026-08-05.md, Class 2). The detector's poor recall
// (44.3% of real benchmarks) means it also rejects flights that DO carry a real banker the regex
// misses — on the bank path that costs retries, not quality, which is the right side to err on.
export const BANK_BLOCKING_RULES = new Set(["banker"]);

/**
 * Whether the banker check may be skipped on this attempt. Interactive generation relaxes it from
 * attempt 4 (latency matters, and the rule is advisory there anyway); the bank path never skips it,
 * so BANK_BLOCKING_RULES always has a real verdict to gate on.
 */
export function shouldRelaxBanker(attempt: number, bankPath: boolean): boolean {
  return attempt >= 4 && !bankPath;
}

/**
 * The violations that actually fail an attempt. Advisory rules are filtered out here and nowhere
 * else, so telemetry keeps seeing every rule that fired. On the bank path, rules in
 * BANK_BLOCKING_RULES escape the advisory filter and block like any other rule.
 */
export function blockingViolations(
  violationsByRule: Record<string, string[]>,
  opts?: { bankPath?: boolean }
): string[] {
  return Object.entries(violationsByRule)
    .filter(([name]) => !ADVISORY_RULES.has(name) || (opts?.bankPath === true && BANK_BLOCKING_RULES.has(name)))
    .flatMap(([, v]) => v);
}

export function matchesBenchmarkAppellation(fullText: string): boolean {
  const normalized = (fullText || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\bst\.?\s/gi, "saint ")
    .replace(/\bste\.?\s/gi, "sainte ");
  return BENCHMARK_APPELLATIONS.test(normalized);
}

// validateBankerMinimum used to live here — its own BENCHMARK_APPELLATIONS heuristic disagreed
// with the audit's isBanker/flightCompositionViolations (question-validator.ts), which is how
// bankerless flights passed generation and were quarantined post-save. The generation loop now
// calls flightCompositionViolations directly; matchesBenchmarkAppellation stays for the curveball
// counters below.

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
  const nonBenchmark = wines.filter((w) => !matchesBenchmarkAppellation(w.fullText)).length;
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

    // Exam Mix (migration 034): generator-emitted category + curveball tags and the cross-category flag.
    const wineCategoryMatch = text.match(/WineCategory:\s*([a-z_]+)/i);
    const curveballLevelMatch = text.match(/CurveballLevel:\s*(low|medium|high)/i);
    const crossCategoryMatch = text.match(/CrossCategoryIntentional:\s*(true|false)/i);
    const VALID_WINE_CATEGORIES = new Set([
      "sparkling", "rose", "fortified", "sweet", "oxidative", "orange", "still_white", "still_red",
    ]);
    const rawWineCategory = wineCategoryMatch ? wineCategoryMatch[1].toLowerCase() : null;
    const wineCategory = rawWineCategory && VALID_WINE_CATEGORIES.has(rawWineCategory) ? rawWineCategory : null;
    const curveballLevel = curveballLevelMatch ? curveballLevelMatch[1].toLowerCase() : null;
    const crossCategoryIntentional = crossCategoryMatch ? crossCategoryMatch[1].toLowerCase() === "true" : false;

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
      wineCategory,
      curveballLevel,
      crossCategoryIntentional,
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

export function stemStructureSignature(text: string): Set<string> {
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

// Reduce a wine descriptor to a comparable identity: drop the vintage, the ABV parenthetical and all
// punctuation, so "Torbreck RunRig, 2018. Barossa Valley, Australia. (15.5%)" and the 2019 of the
// same wine read as the same wine. Used by the targeted-mode overlap rule below.
function normalizeWineIdentity(fullText: string): string {
  return (fullText || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(\s*\d+(?:\.\d+)?\s*%\s*\)/g, " ") // ABV
    .replace(/\b(?:19|20)\d{2}\b/g, " ") // vintage
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Share of the candidate's wines that also appear in `recent`. 1.0 = the same flight rebuilt.
function wineOverlapRatio(
  candidate: { fullText: string }[],
  recent: { fullText: string }[]
): number {
  if (!candidate.length) return 0;
  const recentIds = new Set(recent.map((w) => normalizeWineIdentity(w.fullText)));
  const shared = candidate.filter((w) => recentIds.has(normalizeWineIdentity(w.fullText))).length;
  return shared / candidate.length;
}

// In a TARGETED run (every question pinned to one family — the Fill-the-Bank per-family top-up), at
// most this share of a flight may be wines a recent question already used.
const TARGETED_MAX_WINE_OVERLAP = 0.5;

const NUMBER_WORDS = "one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";

// The FRAMING SENTENCE — the opening line that states what the flight has in common ("Wines 1 to 4
// are from four different countries and are each made from a different, single grape variety"). Wine
// counts are folded to '#' so changing only the flight size does not read as a reworded stem.
export function stemOpenerTokens(text: string): Set<string> {
  const opener = (text || "")
    .split("\n")[0]
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(new RegExp(`\\b(${NUMBER_WORDS}|\\d+)\\b`, "g"), "#")
    .replace(/[^a-z# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return new Set(opener.split(" ").filter(Boolean));
}

// Reject a targeted candidate whose framing sentence is this similar (token Jaccard) to a recent
// one's. CALIBRATED against the 153 real questions in data/exams.json: comparing openers of real
// questions that share a framing CONCEPT gives median 0.50, p90 0.80, p95 0.89 — and 2.8% of those
// real pairs are verbatim identical after normalisation. So the IMW reuses its concepts constantly
// while rewriting the sentence almost every time, and a threshold much below this would reject
// authentic examiner behaviour. 0.90 blocks only near-verbatim reuse (3.6% of real same-concept
// pairs), which is what the pilot was doing — two of its six shared an opening sentence exactly.
//
// Deliberately NOT a constraint on the framing CONCEPT. That vocabulary is small and closed (same /
// different variety, country, region); forcing variation there would invent question shapes the IMW
// does not set, which is the opposite of what this system is for.
export const TARGETED_MAX_OPENER_SIMILARITY = 0.9;

// How many of the most recent questions the OPENER rule looks back over.
//
// The 0.9 threshold above is calibrated PAIRWISE — 3.6% of real same-concept pairs exceed it. But the
// rule was being applied against the full getRecentGeneratedQuestions(30) window, and a per-pair
// rejection rate compounds once you run it 30 times per candidate. Measured against the 153 real
// questions in data/exams.json, "does this opener match ANY of the previous N?" rejects:
//
//     N=1 → 3.3%   N=5 → 5.9%   N=10 → 9.8%   N=30 → 17.0%
//
// So as shipped the rule threw out roughly one in six AUTHENTIC IMW questions, and it was the single
// biggest generation blocker in production (98 rejections in 8 hours vs 40 for the next novelty rule).
// A window of 5 puts real-corpus rejection back near the 3.6% the threshold was designed for, and it
// matches the exam's own structure: a paper is ~6 questions, so "don't reuse framing within a paper's
// worth of questions" is the standard a candidate would actually notice.
//
// Deliberately scoped to the OPENER only. Exact-stem repeat, exact-wine-set repeat and wine-overlap
// keep the full window — those police genuine content repetition, which matters over a long horizon.
// Framing reuse is the one thing the real papers do constantly, so it is the one rule that should
// have a short memory.
export const TARGETED_OPENER_WINDOW = 5;

// How many of the most recent questions the STRUCTURAL-REPEAT rule looks back over.
//
// Same failure as the opener rule, one layer down. That rule fires on same family + same flight size
// + a stem-shape overlap of 0.7, and it ran against the full 30-question window. Measured against the
// 112 family-tagged real questions in the corpus, "does this structure match ANY of the previous N?"
// rejects:
//
//     N=1 → 2.7%   N=5 → 4.5%   N=10 → 5.4%   N=30 → 10.7%
//
// The collisions at N=30 are authentic examiner behaviour, not defects: 2018_p1_q3 vs 2017_p1_q2
// (F1, 2 wines) score a Jaccard of 1.00 — an IDENTICAL structural signature in consecutive years.
// The IMW reuses question architecture constantly.
//
// 10 rather than the opener's 5: structure is a coarser signal than a framing sentence, so a longer
// memory is defensible, and 5.4% is close enough to the 2.7% pairwise floor. This is deliberately NOT
// the bigger hammer of disabling the rule for bulk runs — the measurement says it is over-windowed,
// not wrong.
//
// It only explains part of the gap. In a measured Paper 1 batch this rule fired on 39% of attempts
// against 10.7% for real questions, so the generator also repeats itself more than real examiners do.
// That residual is a prompt problem, not a validator one.
export const STRUCTURAL_REPEAT_WINDOW = 10;

export function validateNoveltyAgainstLatest(
  candidate: QuestionCandidate,
  latestQuestion: NormalizedGeneratedQuestion | null,
  recentQuestions?: NormalizedGeneratedQuestion[],
  opts?: { lenient?: boolean; targeted?: boolean }
): { valid: boolean; violations: string[] } {
  const lenient = opts?.lenient ?? false;
  // Targeted mode: the caller has DELIBERATELY pinned the family, so "same family" carries no
  // information and the two rules that depend on it degenerate to always-true. See the loop below.
  const targeted = opts?.targeted ?? false;
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

    // ── TARGETED MODE ────────────────────────────────────────────────────────────────────────────
    // Both rules below gate on `sameFamily`. When the caller has pinned the family for the whole run,
    // that is true by construction for every candidate, so the structural rule reduces to "does this
    // stem look like a recent stem in the same family?" — which, within one family, is nearly always
    // yes. The 6-question P2/F4 pilot generated 0 of 6 for exactly this reason: 46 Opus calls, every
    // one rejected as a structural repeat.
    //
    // Reusing a stem template is not actually the defect. The real papers reuse stem shapes across
    // years — what must be new is the WINES. So in targeted mode the stem-template and the fuzzy
    // family/country/variety rules are replaced by a direct overlap rule on the flight itself. The
    // exact-stem and exact-wine-set repeats above stay hard in every mode.
    if (targeted) {
      const overlap = wineOverlapRatio(candidate.wines, recent.wines);
      if (overlap > TARGETED_MAX_WINE_OVERLAP) {
        violations.push(
          `Generated flight reuses ${Math.round(overlap * 100)}% of a recent question's wines (max ${Math.round(
            TARGETED_MAX_WINE_OVERLAP * 100
          )}% in a targeted run). Build the flight from different wines.`
        );
        break;
      }
      // The wines may be new while the framing sentence is word-for-word one we just used. Real
      // papers reuse the CONCEPT and rewrite the SENTENCE (see the calibration note above), so this
      // blocks only near-verbatim reuse — rephrase the framing, don't change what is being asked.
      //
      // Only against the most recent TARGETED_OPENER_WINDOW, and only within the SAME FAMILY.
      //
      // Two separate over-rejections, fixed together. The window: questionsToCheck is ordered
      // most-recent-first, and applying a PAIRWISE-calibrated threshold across all 30 compounds — on
      // the real corpus "matches ANY of the previous 30" rejects 17% of authentic questions, against
      // the 3.6% the threshold was designed for. The family scope: a fill walks family to family, and
      // F4/F5/F7 all legitimately open "Wines 1 to 4 are from four different countries", so a Paper 1
      // F5 draft was being rejected for resembling a Paper 1 F4 opener. Within a family the rule does
      // real work; across families it was only friction, and it was the largest single source of
      // redrafts in the on-grid fill.
      const openerSim =
        i < TARGETED_OPENER_WINDOW && candidate.family === recent.family
          ? jaccard(stemOpenerTokens(candidate.questionText), stemOpenerTokens(recent.question_text))
          : 0;
      if (openerSim >= TARGETED_MAX_OPENER_SIMILARITY) {
        violations.push(
          "Generated question opens with essentially the same framing sentence as a recent question in this family. Keep the same kind of comparison, but word the opening differently — the real papers restate a familiar premise in fresh language rather than repeating it verbatim."
        );
        break;
      }
      continue;
    }

    // Structural/thematic repeat: same family, same flight size, and a near-identical concept
    // fingerprint (same stem template + same pedagogical contrast axis). Fires even when the
    // specific wines, countries, and varieties all differ — the case the original heuristic missed.
    const sameFamily = candidate.family === recent.family;
    const sameFlightSize = candidate.wines.length === recent.wines.length;
    const recentSig = stemStructureSignature(recent.question_text);
    const sigOverlap = jaccard(candidateSig, recentSig);
    if (
      i < STRUCTURAL_REPEAT_WINDOW &&
      sameFamily && sameFlightSize && candidateSig.size >= 4 && recentSig.size >= 4 && sigOverlap >= 0.7
    ) {
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
