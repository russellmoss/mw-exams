import { getUser } from "@/lib/auth";
import { getBankStatusCounts, getRunningBatches, getBankFamilyHistogram } from "@/lib/db";
import { estimateBatchCost, EST_COST_PER_QUESTION, PAPER_FAMILIES } from "@/lib/bank-worker";

export const runtime = "nodejs";

// Target size for a healthy per-paper bank — drives the amber fill bar on the Admin card.
const TARGET_PER_PAPER = 50;

// Short candidate-facing descriptor per paper (P1 whites, P2 reds, P3 everything else).
const PAPER_DESCRIPTOR: Record<number, string> = { 1: "whites", 2: "reds", 3: "sparkling & fortified" };

// Human labels for the gap-hint families. Keep in sync with the review page / batch route.
const FAMILY_HINT: Record<string, string> = {
  F1: "same-variety",
  F2: "same-origin",
  F3: "blend logic",
  F4: "mixed-breadth",
  F5: "method / production",
  F6: "style mechanism",
  F7: "quality hierarchy",
};

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

  const [counts, running, histogram] = await Promise.all([
    getBankStatusCounts(),
    getRunningBatches(),
    getBankFamilyHistogram(),
  ]);

  const papers = [1, 2, 3].map((paper) => {
    const c = counts.find((x) => x.paper === paper);
    const run = running.find((b) => b.paper === paper) || null;

    // Gap hint: among the families this paper actually uses, name the least-represented one so the
    // admin knows where the bank is thin before generating (round-robin generation then fills it).
    const fams = PAPER_FAMILIES[paper] || [];
    const countFor = (f: string) =>
      histogram.find((h) => h.paper === paper && h.family === f)?.count ?? 0;
    let gapFamily: string | null = null;
    let gapCount = Infinity;
    for (const f of fams) {
      const n = countFor(f);
      if (n < gapCount) {
        gapCount = n;
        gapFamily = f;
      }
    }
    const gapHint = gapFamily ? `thin on ${FAMILY_HINT[gapFamily] ?? gapFamily} questions` : null;

    return {
      paper,
      descriptor: PAPER_DESCRIPTOR[paper],
      approved: c?.approved ?? 0,
      pending: c?.pending ?? 0,
      target: TARGET_PER_PAPER,
      gapHint,
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

  return Response.json({
    papers,
    costPerQuestion: EST_COST_PER_QUESTION,
    estimateBatchCost: estimateBatchCost(10),
    target: TARGET_PER_PAPER,
  });
}
