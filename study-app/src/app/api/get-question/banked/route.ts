import { getUser } from "@/lib/auth";
import {
  getEligibleBankedQuestions,
  getReplayableBankedQuestions,
  getUserExcludedFlightSignatures,
  recordQuestionView,
  incrementTimesServed,
  type GeneratedQuestion,
} from "@/lib/db";
import {
  filterValidBanked,
  filterExcludedFlightSignatures,
  sanitizeQuestionMetadata,
} from "@/lib/question-engine";

export const runtime = "nodejs";

/**
 * POST /api/get-question/banked — body { paper, family, mode, replay? }.
 *
 * Serves one previously-generated question this user has NEVER seen (question_views, migration 020).
 * No model call, no cost — just a pool read — so it authenticates on the session alone (a valid
 * question is already banked; serving it needs no Anthropic key). The response shape is identical to
 * /api/get-question so the setup card and every downstream mode component treat it exactly like a
 * fresh serve — no "banked" marker ever reaches the candidate.
 *
 * `replay: true` (2026-08-09) flips the pool to questions this user HAS already been served — the
 * acquire card offers it once the unseen pool runs dry, so a candidate can work back through the
 * bank instead of paying for generation. Replay skips the per-user flight-signature exclusion (its
 * 90-day serve window would exclude the entire replay pool by construction) but the DB query keeps
 * the rejection half of that policy: anything this user down-voted or left accepted negative
 * feedback on never comes back.
 *
 * Selection: the DB hands back a window of ~20 eligible rows with expert-approved-and-never-rejected
 * questions (question_reviews, migration 066) sorted first, and the random pick below is confined to
 * that approved tier while it lasts — the reviewed bank is served before anything unvetted. On serve
 * we burn it for this user (idempotent on replay) and bump times_served. Zero eligible → 409
 * { reason: 'empty' } so the client can fall through to its empty-bank options (handles the race
 * where someone took the last one).
 *
 * `mode` is the practice mode the question will be run in; it does NOT partition the pool — a banked
 * question is mode-agnostic and is graded per whichever mode the session uses (see db.ts).
 */
export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

    const { paper, family, replay } = await request.json();
    if (!paper) return Response.json({ error: "Missing paper" }, { status: 400 });

    // filterValidBanked is the same serve-time gate produce.ts applies to both of its banked tiers.
    // This route used to skip it entirely, relying only on the SQL `invalid_reasons IS NULL` filter —
    // so a question whose violation had never been recorded (R-COLOUR did not run in the audit, so
    // wrong-colour rows were never marked) was served straight to the candidate. It is the reason a
    // Hermitage could appear in a Paper 1 flight even after the audit was fixed.
    // Per-user FLIGHT-level exclusion (feedback cluster: identical flights re-served, incl. rejected):
    // drop any banked question whose (paper, family, wine-set) signature this user was served in the
    // last 90 days or has ever rejected. Empty pool → 409, so the client nudges toward New Question —
    // i.e. it generates a fresh flight rather than replaying a duplicate. Best-effort lookup.
    let eligible: GeneratedQuestion[];
    if (replay === true) {
      // Replay pool: seen-before rows, rejection-excluded in SQL. The signature exclusion is
      // deliberately not applied — see the route comment.
      eligible = filterValidBanked(await getReplayableBankedQuestions(user.id, paper, family));
    } else {
      const excludedFlightSignatures = await getUserExcludedFlightSignatures(user.id, paper).catch(
        (err) => {
          console.error("getUserExcludedFlightSignatures failed (non-fatal):", err);
          return new Set<string>();
        }
      );
      eligible = filterExcludedFlightSignatures(
        filterValidBanked(await getEligibleBankedQuestions(user.id, paper, family)),
        excludedFlightSignatures
      );
    }
    if (eligible.length === 0) {
      return Response.json({ reason: "empty" }, { status: 409 });
    }

    // Serve the expert-approved tier first: while any question in the window carries an 'up' review
    // and no 'down', the pick never leaves that tier. Unvetted rows are the fallback, not peers.
    const approved = eligible.filter((q) => q.approved_clean === true);
    const pool = approved.length > 0 ? approved : eligible;
    const picked = pool[Math.floor(Math.random() * pool.length)];
    // Computed review marker, server-side only — never let it reach the candidate payload.
    delete picked.approved_clean;

    // Burn it for this user and count the serve. The VIEW is load-bearing and stays awaited
    // un-caught: if it fails the user must not be handed a row the "never seen" filter will offer
    // again, so failing the request is the correct outcome.
    await recordQuestionView(user.id, picked.question_id);
    // The COUNT is a soft stat. It was awaited un-caught too, which meant a counter write failing
    // would 500 an otherwise-good serve — the candidate loses their question so a statistic can be
    // recorded. Best-effort, matching produce.ts and the Live Tasting grade route.
    await incrementTimesServed(picked.question_id).catch((err) =>
      console.error("incrementTimesServed failed:", err)
    );

    return Response.json({
      source: "pre-populated" as const,
      question: sanitizeQuestionMetadata(picked),
      hasModelAnswer: !!(picked.model_answer && picked.model_answer.length > 100),
    });
  } catch (err) {
    console.error("get-question/banked error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
