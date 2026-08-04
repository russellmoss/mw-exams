import { getUser } from "@/lib/auth";
import { getRecentBatches } from "@/lib/db";
import { parsePaperParam } from "@/lib/bank-health/paper-param";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/bank/batch/recent?limit=10&paper=1|2|3 — admin-only. Batch Undo.
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

  const searchParams = new URL(request.url).searchParams;
  const limitParam = Number(searchParams.get("limit"));
  const limit = Math.min(50, Math.max(1, Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 10));
  // Bank Health paper filter: scope recent batches to a single paper (absent = all).
  const paper = parsePaperParam(searchParams.get("paper"));
  if (paper === "invalid") {
    return Response.json({ error: "Invalid paper" }, { status: 400 });
  }

  try {
    const batches = await getRecentBatches(limit, paper);
    return Response.json({ batches });
  } catch (err) {
    console.error("[batch-undo] recent batches failed:", err);
    return Response.json({ error: "Couldn't read recent batches right now." }, { status: 500 });
  }
}
