import { getUser } from "@/lib/auth";
import {
  getBankStatusCounts,
  getRunningBatches,
  getReviewableBatches,
  getBankPerQuestionAvgCost,
} from "@/lib/db";
import { EST_COST_PER_QUESTION } from "@/lib/bank-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAPER_DESCRIPTOR: Record<number, string> = { 1: "Whites", 2: "Reds", 3: "Special" };

/**
 * GET /api/admin/fill-bank/status — admin-only.
 *
 * Per paper: the servable (kept) count, any batch currently running { generated_count,
 * requested_count }, and the number of questions still awaiting review. Plus the observed
 * per-question spend (grounds the card's "roughly $X–Y" cost range). The card polls this.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [counts, running, reviewable, avgCost] = await Promise.all([
    getBankStatusCounts(),
    getRunningBatches(),
    getReviewableBatches(),
    getBankPerQuestionAvgCost(),
  ]);

  const costPerQuestion = avgCost > 0 ? avgCost : EST_COST_PER_QUESTION;

  const papers = [1, 2, 3].map((paper) => {
    const c = counts.find((x) => x.paper === paper);
    const run = running.find((b) => b.paper === paper) || null;
    // Newest reviewable batch for this paper — the review pane opens on it.
    const rev = reviewable.find((b) => b.paper === paper) || null;
    return {
      paper,
      descriptor: PAPER_DESCRIPTOR[paper],
      keptCount: c?.approved ?? 0,
      pendingCount: c?.pending ?? 0,
      running: run
        ? { batchId: run.id, generatedCount: run.generated_count + run.failed_count, requestedCount: run.requested_count }
        : null,
      reviewBatchId: rev?.id ?? run?.id ?? null,
    };
  });

  return Response.json({ papers, costPerQuestion });
}
