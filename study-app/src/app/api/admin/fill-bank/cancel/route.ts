import { getUser } from "@/lib/auth";
import { cancelBankBatch } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/admin/fill-bank/cancel  { batchId } — admin-only.
 *
 * Sets status='cancelled'. The worker re-reads status before each chunk and exits, so cancel takes
 * effect within one chunk. Every question generated so far is KEPT (persisted as review_state
 * 'pending') and stays reviewable. Scoped to a 'running' batch — a completed run can't be
 * retro-cancelled — so a stale click is a harmless no-op.
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const batchId = typeof body.batchId === "string" ? body.batchId : null;
  if (!batchId) return Response.json({ error: "Missing batchId" }, { status: 400 });

  const cancelled = await cancelBankBatch(batchId);
  return Response.json({ ok: true, cancelled: !!cancelled });
}
