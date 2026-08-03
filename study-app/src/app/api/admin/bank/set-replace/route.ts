import { getUser } from "@/lib/auth";
import { setBatchReplaceRejected } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/admin/bank/set-replace  { batchId, replaceRejected } — admin-only.
 * Backs the "Replace anything I bin" toggle on /admin/bank.
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { batchId, replaceRejected } = await request.json().catch(() => ({}));
  if (!batchId || typeof replaceRejected !== "boolean") {
    return Response.json({ error: "Missing batchId or replaceRejected" }, { status: 400 });
  }

  await setBatchReplaceRejected(batchId, replaceRejected);
  return Response.json({ ok: true });
}
