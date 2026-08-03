import { after } from "next/server";
import { requireApiKey } from "@/lib/api-key";
import { getRunningBatchForPaper } from "@/lib/db";
import {
  startBankBatch,
  runBankBatch,
  estimateBatchCost,
  isValidPaper,
  MIN_COUNT,
  MAX_COUNT,
} from "@/lib/bank-worker";

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
  const paper = Number(body.paper);
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
    replaceRejected,
    createdBy: keyResult.user.id,
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
