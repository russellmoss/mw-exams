import { getUser } from "@/lib/auth";
import {
  getBankStatusCounts,
  getReviewableBatches,
  getLatestBatchPerPaper,
  releaseStalledBatches,
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

  // STALL RECOVERY (spec §1): every poll first releases any batch whose heartbeat has gone stale, so
  // the card reflects a 'stalled' state promptly and a new Generate is unblocked.
  await releaseStalledBatches();

  const [counts, latest, reviewable, avgCost] = await Promise.all([
    getBankStatusCounts(),
    getLatestBatchPerPaper(),
    getReviewableBatches(),
    getBankPerQuestionAvgCost(),
  ]);

  const costPerQuestion = avgCost > 0 ? avgCost : EST_COST_PER_QUESTION;

  const papers = [1, 2, 3].map((paper) => {
    const c = counts.find((x) => x.paper === paper);
    const last = latest.find((b) => b.paper === paper) || null;
    // Newest reviewable batch for this paper — the review pane opens on it.
    const rev = reviewable.find((b) => b.paper === paper) || null;

    const isRunning = last?.status === "running";
    const isStalled = last?.status === "stalled";
    const isDone = last?.status === "complete" || last?.status === "done" || last?.status === "cancelled";

    return {
      paper,
      descriptor: PAPER_DESCRIPTOR[paper],
      keptCount: c?.approved ?? 0,
      pendingCount: c?.pending ?? 0,
      running: isRunning
        ? {
            batchId: last!.id,
            // items_done + items_skipped = items attempted so far (the "3 of 10").
            generatedCount: last!.generated_count + last!.failed_count,
            requestedCount: last!.requested_count,
            skipped: last!.failed_count,
          }
        : null,
      // Auto-released dead run — grey note + Generate re-enabled. keptForReview = questions already
      // persisted and awaiting review.
      stalled: isStalled ? { batchId: last!.id, keptForReview: last!.pending_count } : null,
      // Terminal run — "9 of 10 written · 1 skipped", with "Write N more" when any were skipped.
      done:
        isDone && (last!.failed_count > 0 || last!.pending_count > 0)
          ? {
              batchId: last!.id,
              written: last!.generated_count,
              requested: last!.requested_count,
              skipped: last!.failed_count,
              pending: last!.pending_count,
              cancelled: last!.status === "cancelled",
            }
          : null,
      reviewBatchId: rev?.id ?? (isRunning ? last!.id : null),
    };
  });

  return Response.json({ papers, costPerQuestion });
}
