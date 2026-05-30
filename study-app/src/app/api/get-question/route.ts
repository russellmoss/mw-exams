import {
  getQuestionsByFilter,
  getRecentAttempts,
  getRecentGeneratedQuestions,
  getUnansweredQuestions,
  type GeneratedQuestion,
} from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { saveGeneratedQuestion } from "@/lib/db";
import { buildQuestionGenerationPrompt } from "@/lib/prompts/question-generation-prompt";
import { enrichWineProfiles } from "@/lib/wine-enrichment";
import { neon } from "@neondatabase/serverless";
import { selectModel } from "@/lib/model-selector";
import { buildModelAnswerPrompt } from "@/lib/prompts/model-answer-prompt";
import { requireApiKey } from "@/lib/api-key";
import { logClaudeUsage } from "@/lib/usage-log";
import { stemSniperScoringModel } from "@/lib/question-validator";

export const runtime = "nodejs";
export const maxDuration = 300;

// Usage-tracking context threaded from the request through the background helpers so
// each Claude call is attributed to the right source (server key = we pay) and user.
type UsageMeta = { source: "user" | "server"; userId: number | null };

const FAMILY_LABELS: Record<string, string> = {
  F1: "Same Variety",
  F2: "Same Origin",
  F3: "Blend Logic",
  F4: "Mixed Breadth",
  F5: "Method / Production",
  F6: "Style Mechanism",
  F7: "Quality Hierarchy",
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

// Fire-and-forget background model answer generation
function generateModelAnswerInBackground(
  questionId: string,
  questionText: string,
  wines: { slot: number; fullText: string }[],
  paper: number,
  family: string,
  apiKey: string,
  meta?: UsageMeta
) {
  (async () => {
    try {
      const client = new Anthropic({ apiKey });
      const { model, abGroup } = await selectModel("model_answer", apiKey, "opus");
      const prompt = buildModelAnswerPrompt(questionText, wines, paper);

      const t0 = Date.now();
      const message = await client.messages.create({
        model,
        max_tokens: 4000,
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

      const modelAnswer = extractSection(text, "Model Answer", "Proposed Annotation") || text;
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
    } catch (err) {
      console.error(`Background model answer failed for ${questionId}:`, err);
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

async function ensureP3Appearances(question: GeneratedQuestion, apiKey: string, meta?: UsageMeta): Promise<GeneratedQuestion> {
  if (question.paper !== 3) return question;
  const wines = typeof question.wines === "string" ? JSON.parse(question.wines) : question.wines;
  const hasAppearances = wines.some((w: { appearance?: string }) => w.appearance);
  if (hasAppearances) return question;

  try {
    const client = new Anthropic({ apiKey });
    const { model, abGroup } = await selectModel("question_appearance", apiKey, "sonnet");
    const wineList = wines.map((w: { slot: number; fullText: string }) => `${w.slot}. ${w.fullText}`).join("\n");
    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 500,
      system: `For each wine, describe ONLY what a candidate would see in the glass — color, clarity, bubbles if present, viscosity. No aromas, no tastes, no wine-type labels. Be accurate for the specific wine. One line per wine, 10-20 words. Output as JSON array: [{"slot":1,"appearance":"..."},...]`,
      messages: [{ role: "user", content: `Generate visual appearance notes:\n${wineList}` }],
    });
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

export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;
    const userApiKey = keyResult.apiKey;
    const meta: UsageMeta = { source: keyResult.source, userId: keyResult.user.id };

    const { paper, family, forceFresh } = await request.json();

    if (!paper) {
      return Response.json({ error: "Missing paper" }, { status: 400 });
    }

    // Skip bank and generate fresh if requested
    if (forceFresh) {
      console.log(`Force fresh question requested for P${paper} ${family || "any"}`);
      return generateFreshQuestion(paper, family, userApiKey, meta);
    }

    // Per-user "recently served" set. The banked pools key on COMPLETED attempts, so a question
    // the user only opened/revealed (never submitted) still counts as "unanswered" and would be
    // re-served — the exact "same question twice today" repeat users reported. Treat anything this
    // user recently STARTED as already served and exclude it from every banked path below (incl. the
    // generation-failure fallback). User-scoped so one user's history can't pollute another's.
    const recentAttempts = await getRecentAttempts(100, meta.userId);
    const RECENT_SERVED_WINDOW = 40;
    const recentlyServedIds = new Set(
      recentAttempts.slice(0, RECENT_SERVED_WINDOW).map((a) => a.question_id)
    );

    // PRIORITY 1: Unanswered (by THIS user) banked questions with model answers ready (instant UX).
    // Filter through current validators — catches legacy questions that predate new rules.
    const unanswered = filterValidBanked(await getUnansweredQuestions(paper, family, meta.userId))
      .filter((q) => !recentlyServedIds.has(q.question_id));
    if (unanswered.length > 0) {
      let picked = pickFlightSizeAware(unanswered, family);
      picked = await ensureP3Appearances(picked, userApiKey, meta);
      console.log(`Serving unanswered banked question: ${picked.question_id} (${getWineCount(picked)} wines)`);
      return Response.json({
        source: "pre-populated",
        question: sanitizeQuestionMetadata(picked),
        hasModelAnswer: true,
      });
    }

    // PRIORITY 2: Previously answered but stale (this user has seen 7+ others since last attempt)
    const available = await getQuestionsByFilter(paper, family);

    const categoryAttempts = recentAttempts
      .filter((a) => a.paper === paper && (family === "any" || !family || a.family === family))
      .map((a) => a.question_id);

    const validAvailable = filterValidBanked(available)
      .filter((q) => !recentlyServedIds.has(q.question_id));
    const staleWithAnswers = validAvailable.filter((q) => {
      if (!q.model_answer || q.model_answer.length < 100) return false;
      const lastSeenIdx = categoryAttempts.indexOf(q.question_id);
      if (lastSeenIdx === -1) return false;
      return lastSeenIdx >= 7;
    });

    if (staleWithAnswers.length > 0) {
      let picked = pickFlightSizeAware(staleWithAnswers, family);
      picked = await ensureP3Appearances(picked, userApiKey, meta);
      console.log(`Serving stale banked question: ${picked.question_id} (${getWineCount(picked)} wines)`);
      return Response.json({
        source: "pre-populated",
        question: sanitizeQuestionMetadata(picked),
        hasModelAnswer: true,
      });
    }

    // PRIORITY 3: Generate fresh on the fly (passes the per-user seen set so the fallback can't repeat)
    return generateFreshQuestion(paper, family, userApiKey, meta, recentlyServedIds);
  } catch (err) {
    console.error("get-question error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

async function generateFreshQuestion(
  paper: number,
  family: string | undefined,
  apiKey: string,
  meta?: UsageMeta,
  recentlyServedIds?: Set<string>
) {
  const client = new Anthropic({ apiKey });

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
      : null
  );

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

  // Wall-clock budget. A slow or throttled model (the Anthropic SDK retries 429/529/5xx with
  // backoff, so one "call" can take a minute) must never push this request past Vercel's
  // function limit and trigger a 504. When the budget is spent we stop generating and serve a
  // banked fallback below — the user always gets a real question instead of a timeout error.
  const startedAt = Date.now();
  const BUDGET_MS = Number(process.env.GENERATION_BUDGET_MS) || 75_000;
  const CALL_TIMEOUT_MS = Number(process.env.GENERATION_CALL_TIMEOUT_MS) || 35_000;

  const MAX_ATTEMPTS = 8;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    // Stop before we risk a platform timeout; the banked fallback below serves instead.
    if (Date.now() - startedAt > BUDGET_MS) {
      console.warn(
        `Generation budget ${BUDGET_MS}ms exhausted after ${attempt - 1} attempt(s); serving banked fallback`
      );
      break;
    }
    const model = attempt === 1 ? gen.model : "claude-sonnet-4-6";
    const attemptAb = attempt === 1 ? gen.abGroup : null;
    const callOpts = { timeout: CALL_TIMEOUT_MS, maxRetries: 1 } as const;
    let message;
    let producedModel = model;
    let producedAb = attemptAb;
    const t0 = Date.now();
    try {
      message = await client.messages.create(
        {
          model,
          max_tokens: 2000,
          system: prompt.system,
          messages: [{ role: "user", content: prompt.user }],
        },
        callOpts
      );
      logClaudeUsage(
        { taskType: "question_generation", model, source: meta?.source, userId: meta?.userId, abGroup: attemptAb },
        message.usage,
        { latencyMs: Date.now() - t0 }
      );
    } catch (modelErr: unknown) {
      const msg = modelErr instanceof Error ? modelErr.message : String(modelErr);
      if (model !== "claude-sonnet-4-6" && msg.includes("404")) {
        // Configured Opus id unavailable — retry this attempt on Sonnet.
        console.warn(`${model} not available, falling back to claude-sonnet-4-6`);
        const tRetry = Date.now();
        try {
          message = await client.messages.create(
            {
              model: "claude-sonnet-4-6",
              max_tokens: 2000,
              system: prompt.system,
              messages: [{ role: "user", content: prompt.user }],
            },
            callOpts
          );
          producedModel = "claude-sonnet-4-6";
          producedAb = null;
          logClaudeUsage(
            { taskType: "question_generation", model: "claude-sonnet-4-6", source: meta?.source, userId: meta?.userId, abGroup: null },
            message.usage,
            { latencyMs: Date.now() - tRetry }
          );
        } catch (retryErr: unknown) {
          lastViolations = [`Model call failed: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`];
          console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS} model error (sonnet fallback):`, lastViolations[0]);
          continue;
        }
      } else {
        // Timeout / overload / transient API error: never fail the whole request — move to the
        // next attempt, or to the banked fallback once the budget is spent.
        lastViolations = [`Model call failed: ${msg}`];
        console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS} model error:`, msg);
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
      continue;
    }

    // Critical validators (always run)
    const paperScopeCheck = validatePaperScope(paper, candidate.wines);
    const varietyCheck = validateVarietyConsistency(candidate.questionText, candidate.wines);
    const markCheck = validateMarkAllocation(candidate.questionText, candidate.wines.length);
    const consistencyCheck = validateGenerationConsistency(candidate.generationReasoning, candidate.wines);

    // Important validators (relax on attempt 6+)
    const relaxImportant = attempt >= 6;
    const originDiversityCheck = relaxImportant
      ? { valid: true, violations: [] }
      : validateOriginDiversity(candidate.questionText, candidate.wines, candidate.family, candidate.subcategory);
    const countryDiversityCheck = validateCountryDiversity(candidate.questionText, candidate.wines);

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

    lastViolations = [
      ...paperScopeCheck.violations,
      ...varietyCheck.violations,
      ...markCheck.violations,
      ...consistencyCheck.violations,
      ...originDiversityCheck.violations,
      ...countryDiversityCheck.violations,
      ...bankerCheck.violations,
      ...flightSizeCheck.violations,
      ...noveltyCheck.violations,
    ];

    if (lastViolations.length === 0) {
      parsed = candidate;
      validation = { paperScopeCheck, varietyCheck, markCheck, originDiversityCheck, countryDiversityCheck, bankerCheck, flightSizeCheck, noveltyCheck };
      genModelUsed = producedModel;
      genAbGroup = producedAb;
      if (attempt > 1) console.log(`Generation retry ${attempt} succeeded (relaxed=${relaxNiceToHave ? "nice-to-have" : relaxImportant ? "important" : "none"})`);
      break;
    }

    console.error(`Generation attempt ${attempt}/${MAX_ATTEMPTS} failed:`, JSON.stringify(lastViolations));
  }

  // Fallback: if generation failed, serve a banked question rather than showing an error — but
  // never one this user was just served (that was a silent repeat vector). Only drop the per-user
  // filter as an absolute last resort below, when excluding seen questions would leave nothing.
  if (!parsed || !validation) {
    console.error("All generation attempts failed, falling back to a banked question");
    const allFallback = filterValidBanked(await getQuestionsByFilter(paper));
    const unseen = recentlyServedIds
      ? allFallback.filter((q) => !recentlyServedIds.has(q.question_id))
      : allFallback;
    const fallback = unseen.length > 0 ? unseen : allFallback;
    const withAnswers = fallback.filter((q) => q.model_answer && q.model_answer.length > 100);
    if (withAnswers.length > 0) {
      const picked = withAnswers[Math.floor(Math.random() * withAnswers.length)];
      return Response.json({
        source: "pre-populated",
        question: sanitizeQuestionMetadata(picked),
        hasModelAnswer: true,
      });
    }
    // Absolute last resort: serve without model answer
    if (fallback.length > 0) {
      const picked = fallback[Math.floor(Math.random() * fallback.length)];
      return Response.json({
        source: "pre-populated",
        question: sanitizeQuestionMetadata(picked),
        hasModelAnswer: false,
      });
    }
    return Response.json({ error: "No questions available. Please try again." }, { status: 500 });
  }

  const questionId = `gen_p${paper}_${family || "any"}_${Date.now()}`;
  const saved = await saveGeneratedQuestion({
    questionId,
    paper,
    family: parsed.family,
    familyLabel: parsed.familyLabel,
    subcategory: parsed.subcategory,
    questionText: parsed.questionText,
    wines: parsed.wines,
    totalMarks: parsed.totalMarks,
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

  // Fire-and-forget: enrich wine profiles in background
  enrichWineProfiles(questionId, parsed.wines, apiKey, meta).catch((err) =>
    console.error("Wine enrichment background error:", err)
  );

  generateModelAnswerInBackground(
    questionId,
    parsed.questionText,
    parsed.wines,
    paper,
    parsed.family,
    apiKey,
    meta
  );

  return Response.json({
    source: "generated",
    question: sanitizeQuestionMetadata(saved),
    hasModelAnswer: false,
  });
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

// Words that appear in almost any wine label and so carry no power to TIE an image to a specific
// keyed wine (region/producer/variety are what matter). Excluded from the served allow-list so a
// generic "vineyard"/"estate" token can't make an unrelated region's image look "in-set".
const IMAGE_SUBJECT_STOPWORDS = new Set([
  "wine", "wines", "vineyard", "vineyards", "estate", "winery", "wineries", "region",
  "grape", "grapes", "bottle", "glass", "blanc", "blanco", "bianco", "white", "rouge",
  "red", "rose", "rosé", "dry", "sec", "brut", "cuvee", "cuvée", "vintage", "reserva",
  "reserve", "domaine", "chateau", "château", "weingut", "tenuta", "the", "and", "from",
]);

// The set of image subjects that legitimately belong to a served question: the regions/appellations,
// producers, grape varieties and countries named by the KEYED wines. The display/asset-selection
// layer constrains question imagery to these subjects and DROPS any image whose region/wine tag is
// not a member — so a candidate is never shown a region or bottle that is not part of the answer
// (user feedback: attached pictures depicted regions/wines outside the keyed answer set). If nothing
// matches, the layer shows no image rather than an unrelated one.
function deriveImageAllowList(wines: { slot: number; fullText: string }[] | null | undefined): string[] {
  if (!Array.isArray(wines)) return [];
  const subjects = new Set<string>();
  for (const wine of wines) {
    if (!wine?.fullText) continue;
    const variety = detectPrimaryVariety(wine.fullText);
    if (variety && variety !== "unknown") subjects.add(variety);
    const country = detectCountryName(wine.fullText);
    if (country && country !== "unknown") subjects.add(country);
    // Region/appellation/producer tokens from the wine's own text — the discriminating identity.
    for (const token of wine.fullText.toLowerCase().split(/[^a-zà-ÿ0-9]+/)) {
      if (token.length >= 4 && !IMAGE_SUBJECT_STOPWORDS.has(token)) subjects.add(token);
    }
  }
  return [...subjects];
}

// Display-time guard: true when an image's subject (its search query or region/wine tag) maps to a
// wine in the served set, i.e. shares at least one identifying token with the allow-list. The asset
// layer uses this to keep matching images and drop/flag mismatches.
export function imageSubjectInWineSet(subject: string, allowList: string[]): boolean {
  if (!subject || allowList.length === 0) return false;
  const allow = new Set(allowList.map((s) => s.toLowerCase()));
  return subject
    .toLowerCase()
    .split(/[^a-zà-ÿ0-9]+/)
    .some((token) => token.length >= 4 && allow.has(token));
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

    if (uniqueVarieties.length > 1) {
      violations.push(`Stem says "same single grape variety" but wines contain multiple varieties: ${uniqueVarieties.join(", ")}`);
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

function parseWordNumber(word: string): number | null {
  const map: Record<string, number> = {
    two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const n = parseInt(word);
  if (!isNaN(n)) return n;
  return map[word.toLowerCase()] ?? null;
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

  return { valid: violations.length === 0, violations };
}

function validateCountryDiversity(
  questionText: string,
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const text = questionText.toLowerCase();

  const numberedMatch = text.match(/\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+) different countries\b/);
  const bareMatch = /\bdifferent countries\b/.test(text) && !numberedMatch;

  let expectedUniqueCountries: number | null = null;

  if (bareMatch) {
    expectedUniqueCountries = wines.length;
  } else if (numberedMatch) {
    expectedUniqueCountries = parseWordNumber(numberedMatch[1]);
  }

  if (expectedUniqueCountries !== null && expectedUniqueCountries >= wines.length) {
    const countries = wines.map((w) => detectCountryName(w.fullText));
    const knownCountries = countries.filter((c) => c !== "unknown");
    const uniqueCountries = new Set(knownCountries);

    if (knownCountries.length === wines.length && uniqueCountries.size < expectedUniqueCountries) {
      const repeated = [...uniqueCountries].filter(
        (c) => knownCountries.filter((k) => k === c).length > 1
      );
      violations.push(
        `Stem says "different countries" implying ${expectedUniqueCountries} unique countries, but wines share country: ${repeated.join(", ")}. Each wine must be from a genuinely different country.`
      );
    }
  }

  return { valid: violations.length === 0, violations };
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

    // Extract marks
    let totalMarks = 0;
    const mult = [...questionText.matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)];
    for (const m of mult) totalMarks += parseInt(m[1]) * parseInt(m[2]);
    const single = [...questionText.matchAll(/\((\d+)\s*marks?\)/gi)];
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
      questionText,
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
>(question: T): T & { stem_sniper_scoring: "per-wine" | "set"; image_allow_list: string[] } {
  // Tell the Stem Sniper drill how to score origin predictions for this flight. Same-variety flights
  // are scored as a SET (origin pool) rather than per-wine binary, because the stem gives no clue
  // which origin maps to which wine number — see stemSniperScoringModel.
  const wines = typeof question.wines === "string" ? safeParseWines(question.wines) : question.wines;
  const wineCount = Array.isArray(wines) ? wines.length : 0;
  return {
    ...question,
    family_label: FAMILY_LABELS[question.family] || question.family_label || "Unknown",
    subcategory: sanitizeSubcategory(question.subcategory || ""),
    stem_sniper_scoring: stemSniperScoringModel(question.question_text, wineCount),
    // Image subjects allowed for this served question — the regions/producers/varieties/countries of
    // the KEYED wines. The display/asset layer must restrict question imagery to these (and drop any
    // image that maps to none of them) so a candidate never sees a region or wine outside the answer.
    image_allow_list: deriveImageAllowList(wines as { slot: number; fullText: string }[] | null),
  };
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
