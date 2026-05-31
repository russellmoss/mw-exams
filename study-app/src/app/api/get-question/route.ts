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

export const runtime = "nodejs";
export const maxDuration = 300;

// The engine returns DATA; this route maps it to HTTP (error → 500, otherwise the question payload).
// Byte-identical to the responses get-question has always sent.
function asResponse(outcome: GenerationOutcome): Response {
  if ("error" in outcome) return Response.json({ error: outcome.error }, { status: 500 });
  return Response.json(outcome);
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
      return asResponse(await generateFreshQuestion(paper, family, userApiKey, meta));
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
    return asResponse(await generateFreshQuestion(paper, family, userApiKey, meta, recentlyServedIds));
  } catch (err) {
    console.error("get-question error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
