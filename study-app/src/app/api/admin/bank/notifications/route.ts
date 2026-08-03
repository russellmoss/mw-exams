import { getUser } from "@/lib/auth";
import { getReviewableBatches } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/bank/notifications — admin-only.
 *
 * Ready batches that still hold unreviewed questions. The NotificationBell polls this and surfaces a
 * "N questions ready to review" item linking to /admin/bank when a run flips to 'ready'. Non-admins
 * get an empty list (the bell renders nothing).
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ batches: [] });
  }

  const batches = await getReviewableBatches();
  return Response.json({
    batches: batches.map((b) => ({
      batchId: b.id,
      paper: b.paper,
      pending: b.pending_count,
      completedAt: b.completed_at,
    })),
  });
}
