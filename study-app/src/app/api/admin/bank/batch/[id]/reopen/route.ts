import { getUser } from "@/lib/auth";
import { reopenBatch, reopenWindow } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/admin/bank/batch/[id]/reopen — admin-only. Batch Undo.
 *
 * Reverses a bulk auto-keep: every auto-kept, not-yet-served item in the batch goes back to the
 * review queue (review_state='pending'); items already served to a candidate are left kept and
 * returned as skippedItems. The batch's reopened_at is stamped so the action is one-shot.
 *
 * FALLBACK: historic items that predate batch bookkeeping have no batch_id. For those the strip sends
 * a pseudo-batch whose id is "window:<day>" plus a body { window: { from, to } }; we reopen the
 * auto-kept items in that timestamp range instead.
 *
 * Returns { reopened, skipped, skippedItems: [{ id, label }] }.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({} as { window?: { from?: string; to?: string } }));
  const window = body?.window;

  try {
    if (window && window.from && window.to) {
      const result = await reopenWindow(window.from, window.to);
      return Response.json(result);
    }
    const result = await reopenBatch(id, user.id);
    return Response.json(result);
  } catch (err) {
    console.error("[batch-undo] reopen failed:", err);
    return Response.json({ error: "Couldn't reopen this batch right now." }, { status: 500 });
  }
}
