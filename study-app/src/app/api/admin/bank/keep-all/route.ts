import { getUser } from "@/lib/auth";
import { keepAllPending } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/admin/bank/keep-all  { batchId } — admin-only.
 * Approves every remaining pending question in the batch in one shot.
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { batchId } = await request.json().catch(() => ({}));
  if (!batchId) return Response.json({ error: "Missing batchId" }, { status: 400 });

  const approved = await keepAllPending(batchId, user.id);
  return Response.json({ ok: true, approved });
}
