import { requireApiKey } from "@/lib/api-key";
import {
  getRecentAttempts,
  getUnansweredQuestions,
  getQuestionsByFilter,
} from "@/lib/db";
import {
  generateFreshQuestion,
  sanitizeQuestionMetadata,
  filterValidBanked,
  pickFlightSizeAware,
  getWineCount,
  ensureP3Appearances,
  type UsageMeta,
  type GenerationOutcome,
} from "@/lib/question-engine";
import { ensureStemVariants } from "@/lib/stem-detail";

export const runtime = "nodejs";
export const maxDuration = 300;

// Backfill (or read) the three Stem Detail variants for a served question and attach them to the
// payload so the setup screen can preview any level and the study screen can escalate client-side.
// Best-effort: if derivation fails the canonical stem is used for every level (grading is unchanged).
async function attachStemVariants<
  Q extends {
    question_id: string;
    question_text: string;
    stem_guided?: string | null;
    stem_exam_real?: string | null;
    stem_blind?: string | null;
  }
>(question: Q, apiKey: string, meta: UsageMeta): Promise<Q> {
  try {
    const variants = await ensureStemVariants(
      {
        question_id: question.question_id,
        question_text: question.question_text,
        stem_guided: question.stem_guided ?? null,
        stem_exam_real: question.stem_exam_real ?? null,
        stem_blind: question.stem_blind ?? null,
      },
      apiKey,
      meta
    );
    return { ...question, stem_guided: variants.guided, stem_exam_real: variants.exam_real, stem_blind: variants.blind };
  } catch (err) {
    console.error("attachStemVariants failed:", err);
    return question;
  }
}

// The engine returns DATA; this route maps it to HTTP (error → 500, otherwise the question payload).
// Enriches the payload with the three Stem Detail variants before sending.
async function asResponse(outcome: GenerationOutcome, apiKey: string, meta: UsageMeta): Promise<Response> {
  if ("error" in outcome) return Response.json({ error: outcome.error }, { status: 500 });
  const question = await attachStemVariants(outcome.question, apiKey, meta);
  return Response.json({ ...outcome, question });
}

// Thin route handler over the shared question engine (src/lib/question-engine.ts). This route
// owns request/response + the banked-serve priority logic; ALL generation, validation, and
// question parsing live in the engine so the study page and the drill tools share one path.
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
      return asResponse(await generateFreshQuestion(paper, family, userApiKey, meta), userApiKey, meta);
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
        question: await attachStemVariants(sanitizeQuestionMetadata(picked), userApiKey, meta),
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
        question: await attachStemVariants(sanitizeQuestionMetadata(picked), userApiKey, meta),
        hasModelAnswer: true,
      });
    }

    // PRIORITY 3: Generate fresh on the fly (passes the per-user seen set so the fallback can't repeat)
    return asResponse(await generateFreshQuestion(paper, family, userApiKey, meta, recentlyServedIds), userApiKey, meta);
  } catch (err) {
    console.error("get-question error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
