import { getUser } from "@/lib/auth";
import { requireApiKey } from "@/lib/api-key";
import { getBinnedItems, getBinReasonTally, getBinPapers, upholdBinReason, setBinReasonRebuttal } from "@/lib/db";
import { BIN_REASON_LABELS, MAX_BIN_NOTE_CHARS } from "@/lib/bin-reasons";
import { runBinReasonCheck } from "@/lib/bin-reason-check";

export const runtime = "nodejs";
// The rebut action re-runs the adjudication check synchronously (one Claude call) so the UI can show
// the fresh verdict; give it room.
export const maxDuration = 120;

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
 * POST /api/admin/bin — admin-only. Two challenge-resolution actions (migrations 041/043):
 *   • { itemId, action: 'uphold' } — override the challenge: the bin stays binned AND the reason
 *     re-enters the digest/lessons prompt feeds ('upheld' passes the invalid-gate).
 *   • { itemId, action: 'rebut', rebuttal } — answer the challenge with clarifying information and
 *     re-adjudicate (needs a Claude key). Returns the fresh verdict + analysis: valid/uncertain
 *     withdraws the challenge (the reason feeds again); invalid means it stands.
 * The third way out — agreeing with the challenge and restoring the question — is the existing
 * DELETE /api/admin/bank/item/[id]/bin (unbin). All idempotent: a row no longer at 'invalid'
 * (already upheld, re-reasoned, or restored) returns changed:false without erroring.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { itemId, action, rebuttal } = body as { itemId?: unknown; action?: unknown; rebuttal?: unknown };
  if (typeof itemId !== "string" || !itemId) {
    return Response.json({ error: "Missing itemId" }, { status: 400 });
  }

  if (action === "uphold") {
    const user = await getUser(request);
    if (!user || !user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const changed = await upholdBinReason(itemId);
    return Response.json({ ok: true, changed });
  }

  if (action === "rebut") {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;
    if (!keyResult.user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    // Rebuttals get 5× the note cap — clarifying context is the whole point — but still bounded.
    const text = typeof rebuttal === "string" ? rebuttal.trim().slice(0, MAX_BIN_NOTE_CHARS * 5) : "";
    if (!text) {
      return Response.json({ error: "Missing rebuttal text" }, { status: 400 });
    }
    const stored = await setBinReasonRebuttal(itemId, text);
    if (!stored) {
      // Not at 'invalid' any more — already upheld, restored, or re-reasoned.
      return Response.json({ ok: true, changed: false });
    }
    const result = await runBinReasonCheck({
      itemId,
      apiKey: keyResult.apiKey,
      userId: keyResult.user.id,
      source: "user",
    });
    return Response.json({
      ok: result.status === "checked",
      changed: true,
      verdict: result.verdict ?? null,
      analysis: result.analysis ?? null,
      withdrawn: result.status === "checked" && result.verdict !== "invalid",
    });
  }

  return Response.json({ error: "Invalid action" }, { status: 400 });
}
