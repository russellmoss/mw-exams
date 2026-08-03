import { getUser } from "@/lib/auth";
import {
  getEligibleBankedQuestions,
  recordQuestionView,
  incrementTimesServed,
} from "@/lib/db";
import { sanitizeQuestionMetadata } from "@/lib/question-engine";

export const runtime = "nodejs";

/**
 * POST /api/get-question/banked — body { paper, family, mode }.
 *
 * Serves one previously-generated question this user has NEVER seen (question_views, migration 020).
 * No model call, no cost — just a pool read — so it authenticates on the session alone (a valid
 * question is already banked; serving it needs no Anthropic key). The response shape is identical to
 * /api/get-question so the setup card and every downstream mode component treat it exactly like a
 * fresh serve — no "banked" marker ever reaches the candidate.
 *
 * Selection weights toward recency: the DB hands back the 20 newest eligible rows (or all of them,
 * if fewer), and we pick one uniformly at random from that window. On serve we burn it for this user
 * and bump times_served. Zero eligible → 409 { reason: 'empty' } so the client can disable the
 * button and nudge toward New Question (handles the race where someone took the last one).
 *
 * `mode` is the practice mode the question will be run in; it does NOT partition the pool — a banked
 * question is mode-agnostic and is graded per whichever mode the session uses (see db.ts).
 */
export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Authentication required" }, { status: 401 });

    const { paper, family } = await request.json();
    if (!paper) return Response.json({ error: "Missing paper" }, { status: 400 });

    const eligible = await getEligibleBankedQuestions(user.id, paper, family);
    if (eligible.length === 0) {
      return Response.json({ reason: "empty" }, { status: 409 });
    }

    const picked = eligible[Math.floor(Math.random() * eligible.length)];

    // Burn it for this user and count the serve. View first so a double-tap can't hand out the same
    // row twice; times_served is a soft stat and rides along.
    await recordQuestionView(user.id, picked.question_id);
    await incrementTimesServed(picked.question_id);

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
