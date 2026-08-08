import { getUser } from "@/lib/auth";
import { getBankStatusCounts, getReviewableBatches } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAPER_DESCRIPTOR: Record<number, string> = { 1: "Whites", 2: "Reds", 3: "Special" };

/**
 * GET /api/admin/bank/review-queue/status — admin-only.
 *
 * Per paper: how many questions are banked and servable, how many are still awaiting a Keep/Bin
 * decision, and which batch the review pane should open on.
 *
 * This replaces the old /api/admin/fill-bank/status, which also reported running-batch progress,
 * stall recovery, per-question cost and the "leaning toward" generation hint. Bulk generation was
 * removed (see the Bank Review section in src/app/components/BankReviewSection.tsx), so there is no
 * batch to be mid-flight, nothing to cost, and no next batch to bias — only a queue to work through.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const [counts, reviewable] = await Promise.all([getBankStatusCounts(), getReviewableBatches()]);

  const papers = [1, 2, 3].map((paper) => {
    const c = counts.find((x) => x.paper === paper);
    // Newest reviewable batch for this paper — the review pane opens on it.
    const rev = reviewable.find((b) => b.paper === paper) || null;
    return {
      paper,
      descriptor: PAPER_DESCRIPTOR[paper],
      keptCount: c?.approved ?? 0,
      pendingCount: c?.pending ?? 0,
      reviewBatchId: rev?.id ?? null,
    };
  });

  return Response.json({ papers });
}
