import { getUser } from "@/lib/auth";
import { sendBatchBackToReview, sendWindowBackToReview } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/admin/bank/batch/[id]/send-back — admin-only. "Send back to review".
 *
 * Reverts every auto-approved (auto_kept), still-kept item in the batch back to the normal review
 * queue: review_state='pending', status='pending', and all keep-decision fields cleared so they read
 * as never-reviewed. There is NO served-item safety rail (unlike Batch Undo's reopen) — attempt
 * history is left untouched regardless. Pending items are excluded from serving by the existing
 * review_state='kept' filter, so no serve-path change is needed.
 *
 * FALLBACK: historic items that predate batch bookkeeping have no batch_id. For those the strip sends
 * a pseudo-batch whose id is "window:<day>" plus a body { window: { from, to } }; we revert the
 * auto-kept items in that timestamp range instead.
 *
 * Returns { movedCount, batch: <updated batch counts> }.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request
    .json()
    .catch(() => ({} as { window?: { from?: string; to?: string } }));
  const window = body?.window;

  try {
    const result =
      window && window.from && window.to
        ? await sendWindowBackToReview(window.from, window.to)
        : await sendBatchBackToReview(id);
    return Response.json(result);
  } catch (err) {
    console.error("[send-back] failed:", err);
    return Response.json({ error: "Couldn't send this batch back right now." }, { status: 500 });
  }
}
