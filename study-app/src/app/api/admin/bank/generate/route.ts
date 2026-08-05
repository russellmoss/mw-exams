import { after } from "next/server";
import { requireApiKey } from "@/lib/api-key";
import { getRunningBatchForPaper, type BankTargeting } from "@/lib/db";
import {
  startBankBatch,
  runBankBatch,
  estimateBatchCost,
  isValidPaper,
  MIN_COUNT,
  MAX_COUNT,
} from "@/lib/bank-worker";

// Normalise a raw targeting body into the whitelisted soft-constraint shape, dropping anything
// unrecognised. Returns null when no usable targeting was supplied (an untargeted run).
function parseTargeting(raw: unknown): BankTargeting | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const out: BankTargeting = {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  if (isValidPaper(Number(t.paper))) out.paper = Number(t.paper);
  if (str(t.questionType)) out.questionType = str(t.questionType);
  if (str(t.curveball)) out.curveball = str(t.curveball);
  if (str(t.flightSize)) out.flightSize = str(t.flightSize);
  if (str(t.grape)) out.grape = str(t.grape);
  if (str(t.region)) out.region = str(t.region);
  if (str(t.priceBand)) out.priceBand = str(t.priceBand);
  if (str(t.varietyFocus)) out.varietyFocus = str(t.varietyFocus);
  return Object.keys(out).length > 0 ? out : null;
}

export const runtime = "nodejs";
// The bulk run is driven in after() (post-response), so this invocation stays alive for the worker's
// wall-clock budget even though the response — just the batchId — is instant.
export const maxDuration = 300;

/**
 * POST /api/admin/bank/generate  { paper, count, replaceRejected }
 *
 * Admin-only. Creates a bank_batches row, kicks off the durable worker, and returns { batchId }
 * immediately. Refuses if a run is already live for that paper (one batch per paper at a time).
 */
export async function POST(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  if (!keyResult.user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  // Bank Health "Generate more like this" sends an optional targeting object. Its paper (when set)
  // is the batch's paper, so a slice can generate for its own paper without a separate field. Grape
  // Balance "Fill the gap" sends its aim (varietyFocus / paper) at the top level, so fall back to
  // parsing the body itself when it carries a top-level varietyFocus aim.
  const targeting = parseTargeting(body.targeting ?? (body.varietyFocus ? body : null));
  const paper = Number(body.paper ?? targeting?.paper);
  const count = Math.round(Number(body.count));
  const replaceRejected = !!body.replaceRejected;

  if (!isValidPaper(paper)) {
    return Response.json({ error: "Paper must be 1, 2, or 3" }, { status: 400 });
  }
  if (!Number.isFinite(count) || count < MIN_COUNT || count > MAX_COUNT) {
    return Response.json({ error: `Count must be between ${MIN_COUNT} and ${MAX_COUNT}` }, { status: 400 });
  }

  const running = await getRunningBatchForPaper(paper);
  if (running) {
    return Response.json(
      { error: "A run is already in progress for this paper.", batchId: running.id },
      { status: 409 }
    );
  }

  const batch = await startBankBatch({
    paper,
    count,
    replaceBinned: replaceRejected,
    createdBy: keyResult.user.id,
    targeting,
  });

  const baseUrl = new URL(request.url).origin;
  const apiKey = keyResult.apiKey;
  const userId = keyResult.user.id;
  after(async () => {
    try {
      await runBankBatch({ batchId: batch.id, apiKey, userId, baseUrl });
    } catch (err) {
      console.error(`[bank/generate] worker failed for batch ${batch.id}:`, err);
    }
  });

  return Response.json({ batchId: batch.id, estCostUsd: estimateBatchCost(count) });
}
