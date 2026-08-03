import { getQuestionCounts, getRecentAttempts, getBankCount } from "@/lib/db";
import { getUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * GET /api/question-counts
 *
 *   • No query params → the bank totals per paper/family + recent attempts, as the landing page has
 *     always loaded them once on mount.
 *   • ?paper=N[&family=F][&mode=M] and signed in → additionally returns `bankCount`: how many banked
 *     questions THIS user has never seen for that paper (+ family). The setup card re-queries this
 *     whenever the paper/family/mode selection changes so the "Banked Question" count stays live.
 *     `mode` is accepted for completeness but does not partition the pool (banked questions are
 *     mode-agnostic — see src/lib/db.ts).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const paperParam = url.searchParams.get("paper");

    let bankCount: number | undefined;
    if (paperParam) {
      const user = await getUser(request);
      if (user) {
        const paper = parseInt(paperParam, 10);
        const family = url.searchParams.get("family") || undefined;
        if (!Number.isNaN(paper)) {
          bankCount = await getBankCount(user.id, paper, family);
        }
      }
    }

    const counts = await getQuestionCounts();
    const attempts = await getRecentAttempts(20);
    return Response.json({ counts, recentAttempts: attempts, bankCount });
  } catch (err) {
    console.error("question-counts error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
