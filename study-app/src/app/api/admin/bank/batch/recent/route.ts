import { getUser } from "@/lib/auth";
import { getRecentBatches } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/bank/batch/recent?limit=10 — admin-only. Batch Undo.
 *
 * Recent bulk runs for the "Recent batches" strip: per-batch counts (generated / kept / binned /
 * pending / auto-kept / served-in-batch), who resolved it, whether it's been reopened, and a
 * canReopen flag (auto-kept-and-still-kept items exist AND it hasn't already been reopened). Historic
 * items with no batch_id are surfaced as day-clustered pseudo-batches carrying a { from, to } window.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const limitParam = Number(new URL(request.url).searchParams.get("limit"));
  const limit = Math.min(50, Math.max(1, Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 10));

  try {
    const batches = await getRecentBatches(limit);
    return Response.json({ batches });
  } catch (err) {
    console.error("[batch-undo] recent batches failed:", err);
    return Response.json({ error: "Couldn't read recent batches right now." }, { status: 500 });
  }
}
