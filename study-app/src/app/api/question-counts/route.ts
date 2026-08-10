import { getQuestionCounts, getRecentAttempts, getBankCount, getReplayBankCount } from "@/lib/db";
import { getUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/question-counts
 *
 *   • No query params → per paper/family counts of SERVABLE banked questions (kept, not retired,
 *     not quarantined, pool scope, no failed answer key — and, when signed in, not yet seen by this
 *     user) + recent attempts. Same eligibility predicate as `bankCount`, so the family cards never
 *     advertise questions the acquire screen can't serve.
 *   • ?paper=N[&family=F][&mode=M] and signed in → additionally returns `bankCount` (how many banked
 *     questions THIS user has never seen for that paper (+ family)) and `replayCount` (how many
 *     they HAVE done and could replay — seen, still servable, never rejected by them). The setup
 *     card re-queries these whenever the paper/family/mode selection changes so the Start / Replay
 *     counts stay live. `mode` is accepted for completeness but does not partition the pool (banked
 *     questions are mode-agnostic — see src/lib/db.ts).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const paperParam = url.searchParams.get("paper");
    const user = await getUser(request);

    let bankCount: number | undefined;
    let replayCount: number | undefined;
    if (paperParam && user) {
      const paper = parseInt(paperParam, 10);
      const family = url.searchParams.get("family") || undefined;
      if (!Number.isNaN(paper)) {
        bankCount = await getBankCount(user.id, paper, family);
        replayCount = await getReplayBankCount(user.id, paper, family);
      }
    }

    const counts = await getQuestionCounts(user?.id);
    const attempts = await getRecentAttempts(20);
    return Response.json({ counts, recentAttempts: attempts, bankCount, replayCount });
  } catch (err) {
    console.error("question-counts error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
