import { getUser } from "@/lib/auth";
import { getBankBatch, setBankBatchStatus } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/admin/bank/cancel  { batchId } — admin-only.
 *
 * Stops a run. The worker checks batch status between slots, so generation halts promptly. Questions
 * already produced stay 'pending' and remain reviewable; nothing already generated is discarded.
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { batchId } = await request.json().catch(() => ({}));
  if (!batchId) return Response.json({ error: "Missing batchId" }, { status: 400 });

  const batch = await getBankBatch(batchId);
  if (!batch) return Response.json({ error: "Batch not found" }, { status: 404 });

  await setBankBatchStatus(batchId, "cancelled", { completed: true });
  return Response.json({ ok: true });
}
