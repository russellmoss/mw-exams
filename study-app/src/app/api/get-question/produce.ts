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
  type ProgressEmitter,
} from "@/lib/question-engine";

/**
 * The study-question producer, shared by both routes that serve one:
 *   • `route.ts`        — plain JSON (kept so anything posting to /api/get-question still works)
 *   • `stream/route.ts` — SSE, what the landing page uses so the wait is visible
 *
 * Owns the banked-serve priority logic; ALL generation, validation, and question parsing live in
 * the engine (src/lib/question-engine.ts) so the study page and the drill tools share one path.
 *
 * NOTE ON STEM DETAIL: this producer deliberately does NO LLM work for the three stem variants.
 *
 * It used to `await ensureStemVariants(...)` before responding, which added a 5-8s model call to
 * EVERY question served — and because the variants were never persisted (see lib/stem-detail.ts)
 * that cost was paid again on every single serve. Stacked on top of a slow generation chain it
 * pushed requests past the browser's abort and users saw "Question generation timed out".
 *
 * Whatever variants are already stored ride along on the row; any that are missing are simply
 * absent, and the client falls back to the canonical `question_text` for that level (see
 * stemForLevel in components/StemDetailControl.tsx), so the question is always fully usable.
 * Backfill happens out-of-band via POST /api/stem-detail/ensure, which the setup screen fires
 * without blocking. The serving path must stay free of model calls it does not strictly need.
 */
export async function produceQuestion(opts: {
  paper: number;
  family: string | undefined;
  forceFresh?: boolean;
  apiKey: string;
  meta: UsageMeta;
  emit?: ProgressEmitter;
}): Promise<GenerationOutcome> {
  const { paper, family, forceFresh, apiKey, meta, emit } = opts;

  // Skip bank and generate fresh if requested
  if (forceFresh) {
    console.log(`Force fresh question requested for P${paper} ${family || "any"}`);
    emit?.({ type: "status", label: "Generating a fresh question…" });
    return generateFreshQuestion(paper, family, apiKey, meta, undefined, emit);
  }

  // Per-user "recently served" set. The banked pools key on COMPLETED attempts, so a question
  // the user only opened/revealed (never submitted) still counts as "unanswered" and would be
  // re-served — the exact "same question twice today" repeat users reported. Treat anything this
  // user recently STARTED as already served and exclude it from every banked path below (incl. the
  // generation-failure fallback). User-scoped so one user's history can't pollute another's.
  emit?.({ type: "status", label: "Checking what you've already seen…" });
  const recentAttempts = await getRecentAttempts(100, meta.userId);
  const RECENT_SERVED_WINDOW = 40;
  const recentlyServedIds = new Set(
    recentAttempts.slice(0, RECENT_SERVED_WINDOW).map((a) => a.question_id)
  );

  // PRIORITY 1: Unanswered (by THIS user) banked questions with model answers ready (instant UX).
  // Filter through current validators — catches legacy questions that predate new rules.
  emit?.({ type: "status", label: "Looking for an unseen question in the bank…" });
  const unanswered = filterValidBanked(await getUnansweredQuestions(paper, family, meta.userId))
    .filter((q) => !recentlyServedIds.has(q.question_id));
  if (unanswered.length > 0) {
    let picked = pickFlightSizeAware(unanswered, family);
    picked = await ensureP3Appearances(picked, apiKey, meta, emit);
    console.log(`Serving unanswered banked question: ${picked.question_id} (${getWineCount(picked)} wines)`);
    emit?.({ type: "status", label: "Found one — serving from the bank." });
    return {
      source: "pre-populated" as const,
      question: sanitizeQuestionMetadata(picked),
      hasModelAnswer: true,
    };
  }

  // PRIORITY 2: Previously answered but stale (this user has seen 7+ others since last attempt)
  emit?.({ type: "status", label: "No unseen questions — checking for a stale one to revisit…" });
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
    picked = await ensureP3Appearances(picked, apiKey, meta, emit);
    console.log(`Serving stale banked question: ${picked.question_id} (${getWineCount(picked)} wines)`);
    emit?.({ type: "status", label: "Serving one you last saw a while ago." });
    return {
      source: "pre-populated" as const,
      question: sanitizeQuestionMetadata(picked),
      hasModelAnswer: true,
    };
  }

  // PRIORITY 3: Generate fresh on the fly (passes the per-user seen set so the fallback can't repeat)
  emit?.({ type: "status", label: "Nothing suitable banked — writing you a new question…" });
  return generateFreshQuestion(paper, family, apiKey, meta, recentlyServedIds, emit);
}
