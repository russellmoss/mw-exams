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

// NOTE ON STEM DETAIL: this route deliberately does NO LLM work for the three stem variants.
//
// It used to `await ensureStemVariants(...)` before responding, which added a 5-8s model call to
// EVERY question served — and because the variants were never persisted (see lib/stem-detail.ts)
// that cost was paid again on every single serve. Stacked on top of a slow generation chain it
// pushed requests past the browser's 120s abort and users saw "Question generation timed out".
//
// Whatever variants are already stored ride along on the row; any that are missing are simply
// absent, and the client falls back to the canonical `question_text` for that level (see
// stemForLevel in components/StemDetailControl.tsx), so the question is always fully usable.
// Backfill happens out-of-band via POST /api/stem-detail/ensure, which the setup screen fires
// without blocking. The serving path must stay free of model calls it does not strictly need.

// The engine returns DATA; this route maps it to HTTP (error → 500, otherwise the question payload).
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
