import { getUser } from "@/lib/auth";
import { getBinnedItems, getBinReasonTally, getBinPapers, upholdBinReason } from "@/lib/db";
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

/**
 * POST /api/admin/bin  { itemId, action: 'uphold' } — admin-only.
 *
 * The admin's override of a bin-reason challenge (migration 041): the bin stays binned AND the
 * reason re-enters the digest/lessons prompt feeds ('upheld' passes the invalid-gate). The other way
 * out of a challenge — agreeing with it and restoring the question — is the existing
 * DELETE /api/admin/bank/item/[id]/bin (unbin). Idempotent: a row no longer at 'invalid' (already
 * upheld, re-reasoned, or restored) returns changed:false without erroring.
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { itemId, action } = body as { itemId?: unknown; action?: unknown };
  if (typeof itemId !== "string" || !itemId || action !== "uphold") {
    return Response.json({ error: "Missing itemId or invalid action" }, { status: 400 });
  }

  const changed = await upholdBinReason(itemId);
  return Response.json({ ok: true, changed });
}
