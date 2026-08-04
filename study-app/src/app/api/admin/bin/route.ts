import { getUser } from "@/lib/auth";
import { getBinnedItems, getBinReasonTally, getBinPapers } from "@/lib/db";
import { BIN_REASON_LABELS } from "@/lib/bin-reasons";

export const runtime = "nodejs";

/**
 * GET /api/admin/bin — admin-only. Drives The Bin page (/admin/bin).
 *
 * Returns the binned-item list (newest first, optionally filtered by ?reason= and/or ?paper=), the
 * reason tally across the whole ledger, and the distinct papers present (for the paper filter). Reason
 * keys are mapped to their user-facing labels here so the client never has to know internal keys.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const reason = url.searchParams.get("reason") || null;
  const paperRaw = url.searchParams.get("paper");
  const paper = paperRaw ? Number(paperRaw) : null;

  const [items, tally, papers] = await Promise.all([
    getBinnedItems({ reason, paper: paper && Number.isFinite(paper) ? paper : null }),
    getBinReasonTally(),
    getBinPapers(),
  ]);

  return Response.json({
    items: items.map((it) => ({
      ...it,
      reasonLabels: it.reasons.map((r) => BIN_REASON_LABELS[r] || r),
    })),
    tally: tally.map((t) => ({ reason: t.reason, label: BIN_REASON_LABELS[t.reason] || t.reason, count: t.count })),
    papers,
  });
}
