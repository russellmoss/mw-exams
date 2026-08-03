import { getUser } from "@/lib/auth";
import { getBankStatusCounts, getRunningBatches } from "@/lib/db";
import { estimateBatchCost, EST_COST_PER_QUESTION } from "@/lib/bank-worker";

export const runtime = "nodejs";

/**
 * GET /api/admin/bank/status — admin-only.
 *
 * Per-paper bank health (approved + pending counts) and any run currently in progress. Powers the
 * "Fill the Bank" Admin card, which polls it.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [counts, running] = await Promise.all([getBankStatusCounts(), getRunningBatches()]);

  const papers = [1, 2, 3].map((paper) => {
    const c = counts.find((x) => x.paper === paper);
    const run = running.find((b) => b.paper === paper) || null;
    return {
      paper,
      approved: c?.approved ?? 0,
      pending: c?.pending ?? 0,
      running: run
        ? {
            batchId: run.id,
            requested: run.requested_count,
            generated: run.generated_count,
            failed: run.failed_count,
          }
        : null,
    };
  });

  return Response.json({ papers, costPerQuestion: EST_COST_PER_QUESTION, estimateBatchCost: estimateBatchCost(10) });
}
