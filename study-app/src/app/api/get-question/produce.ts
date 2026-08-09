import {
  getRecentAttempts,
  getUnansweredQuestions,
  getQuestionsByFilter,
  getUserExcludedFlightSignatures,
  recordQuestionView,
  incrementTimesServed,
  type GeneratedQuestion,
} from "@/lib/db";
import {
  generateFreshQuestion,
  sanitizeQuestionMetadata,
  filterValidBanked,
  filterExcludedFlightSignatures,
  pickFlightSizeAware,
  narrowToWeightedP3Category,
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
 *
 * NOTE ON PAPER 3 WEIGHTING: `focus` and the invisible target-mix steering only ever narrow the
 * pool INSIDE a priority tier — they never reorder the tiers themselves. Unseen still beats stale,
 * and the fall-through to fresh generation is untouched, so the P3 bank grows at exactly the rate it
 * did before. Papers 1 and 2 never touch that code path.
 */
type ProduceOpts = {
  paper: number;
  family: string | undefined;
  forceFresh?: boolean;
  /** Paper 3 only: candidate-chosen style bias ('balanced' | sparkling | sweet | …). Ignored elsewhere. */
  focus?: string;
  apiKey: string;
  meta: UsageMeta;
  emit?: ProgressEmitter;
};

/**
 * Serve a study question and burn it for this user. Whichever tier resolves — unseen banked, stale
 * banked, fresh generation, or the generation-failure fallback — the served question is recorded in
 * question_views (migration 020) so the "Banked Question" path never offers it again. Per the
 * feature spec, being SERVED is the "seen" event: abandoning the attempt still burns it. Recording
 * is best-effort — a view-log failure must never sink an otherwise-good serve.
 *
 * SERVE COUNTER (fixed 2026-08-07). This path recorded the view but never incremented
 * `served_count`, while the sibling banked route (api/get-question/banked) and the Live Tasting
 * grade route both did. Since this is the main study path, the counter under-reported by ~7.5x:
 * `served_count` claimed 14 all-time serves where `user_attempts` showed 126 distinct questions
 * attempted, and only 10 of the 75 questions attempted in the preceding 30 days carried a non-zero
 * count. That was not a cosmetic drift — `served_count` is the reopen safety rail (a question that
 * has reached a candidate must not be yanked back into the review queue by a batch undo), and it
 * was the number every supply-sizing decision in
 * docs/plans/2026-08-07-generation-quality-and-cost.md was originally reasoned from. Both writes
 * now happen here, together and best-effort.
 */
export async function produceQuestion(opts: ProduceOpts): Promise<GenerationOutcome> {
  const outcome = await selectOrGenerate(opts);

  if (!("error" in outcome) && opts.meta.userId != null) {
    const questionId = outcome.question.question_id;
    await Promise.all([
      recordQuestionView(opts.meta.userId, questionId).catch((err) =>
        console.error("recordQuestionView failed:", err)
      ),
      incrementTimesServed(questionId).catch((err) =>
        console.error("incrementTimesServed failed:", err)
      ),
    ]);
  }
  return outcome;
}

async function selectOrGenerate(opts: ProduceOpts): Promise<GenerationOutcome> {
  const { paper, family, forceFresh, focus, apiKey, meta, emit } = opts;

  // Per-user FLIGHT-level exclusion set (feedback cluster: identical flights re-served, including ones
  // the user already rejected). The (paper, family, wine-set) signatures this user was served in the
  // last 90 days or has ever rejected/left accepted-negative feedback on. Used to (a) drop banked
  // questions that key a duplicate flight, and (b) stop a fresh generation recreating one. Best-effort
  // — a lookup outage degrades to no exclusion rather than failing the serve. No user → empty.
  const excludedFlightSignatures =
    meta.userId != null
      ? await getUserExcludedFlightSignatures(meta.userId, paper).catch((err) => {
          console.error("getUserExcludedFlightSignatures failed (non-fatal):", err);
          return new Set<string>();
        })
      : new Set<string>();

  // Skip bank and generate fresh if requested
  if (forceFresh) {
    console.log(`Force fresh question requested for P${paper} ${family || "any"}`);
    emit?.({ type: "status", label: "Generating a fresh question…" });
    return generateFreshQuestion(
      paper, family, apiKey, meta, undefined, emit,
      undefined, undefined, undefined, excludedFlightSignatures
    );
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

  // Paper 3 only: the style families this user was most recently served (most-recent-first), which
  // drive the deficit weighting and streak suppression. Free — it rides along on recentAttempts.
  const recentP3Categories =
    paper === 3 ? recentAttempts.filter((a) => a.paper === 3).map((a) => a.p3_category) : [];
  // Narrow a tier's pool to the weighted style family. Identity for Papers 1/2.
  const steerP3 = (pool: GeneratedQuestion[]): GeneratedQuestion[] =>
    paper === 3 ? narrowToWeightedP3Category(pool, recentP3Categories, focus) : pool;

  // PRIORITY 1: Unanswered (by THIS user) banked questions with model answers ready (instant UX).
  // Filter through current validators — catches legacy questions that predate new rules.
  emit?.({ type: "status", label: "Looking for an unseen question in the bank…" });
  const unanswered = filterExcludedFlightSignatures(
    filterValidBanked(await getUnansweredQuestions(paper, family, meta.userId)),
    excludedFlightSignatures
  ).filter((q) => !recentlyServedIds.has(q.question_id));
  if (unanswered.length > 0) {
    let picked = pickFlightSizeAware(steerP3(unanswered), family);
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

  const validAvailable = filterExcludedFlightSignatures(
    filterValidBanked(available),
    excludedFlightSignatures
  ).filter((q) => !recentlyServedIds.has(q.question_id));
  const staleWithAnswers = validAvailable.filter((q) => {
    if (!q.model_answer || q.model_answer.length < 100) return false;
    const lastSeenIdx = categoryAttempts.indexOf(q.question_id);
    if (lastSeenIdx === -1) return false;
    return lastSeenIdx >= 7;
  });

  if (staleWithAnswers.length > 0) {
    let picked = pickFlightSizeAware(steerP3(staleWithAnswers), family);
    picked = await ensureP3Appearances(picked, apiKey, meta, emit);
    console.log(`Serving stale banked question: ${picked.question_id} (${getWineCount(picked)} wines)`);
    emit?.({ type: "status", label: "Serving one you last saw a while ago." });
    return {
      source: "pre-populated" as const,
      question: sanitizeQuestionMetadata(picked),
      hasModelAnswer: true,
    };
  }

  // PRIORITY 3: Generate fresh on the fly (passes the per-user seen set so the fallback can't repeat,
  // and the per-user flight-signature exclusion so a fresh draw can't recreate a rejected/just-seen
  // flight). If the banked tiers were emptied by the exclusion, this is the "generate rather than
  // replay the oldest" fall-through the feature requires.
  emit?.({ type: "status", label: "Nothing suitable banked — writing you a new question…" });
  return generateFreshQuestion(
    paper, family, apiKey, meta, recentlyServedIds, emit,
    undefined, undefined, undefined, excludedFlightSignatures
  );
}
