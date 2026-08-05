import { getUser } from "@/lib/auth";
import { getReviewableBatches, getFlagNotifications } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/bank/notifications — admin-only.
 *
 * Ready batches that still hold unreviewed questions, plus candidate flags awaiting a Delete/Keep
 * decision (Flag Question, migration 037). The NotificationBell polls this and surfaces both a
 * "N questions ready to review" item linking to /admin/bank AND a "Question flagged by <name>" item
 * linking to the flag review queue. Non-admins get empty lists (the bell renders nothing).
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ batches: [], flags: [] });
  }

  const [batches, flags] = await Promise.all([getReviewableBatches(), getFlagNotifications()]);
  return Response.json({
    batches: batches.map((b) => ({
      batchId: b.id,
      paper: b.paper,
      pending: b.pending_count,
      completedAt: b.completed_at,
    })),
    flags: flags.map((f) => ({
      id: f.id,
      questionId: f.questionId,
      flaggedBy: f.flaggedBy,
      paper: f.paper,
      createdAt: f.createdAt,
    })),
  });
}
