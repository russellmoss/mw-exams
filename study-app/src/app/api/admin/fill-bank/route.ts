import { after } from "next/server";
import { requireApiKey } from "@/lib/api-key";
import { getRunningBatchForPaper, releaseStalledBatches } from "@/lib/db";
import {
  startBankBatch,
  runBankBatch,
  estimateBatchCostRange,
  isValidPaper,
  MIN_COUNT,
} from "@/lib/bank-worker";

export const runtime = "nodejs";
// The bulk run is driven in after() (post-response) so this invocation stays alive for the worker's
// wall-clock budget even though the response — just the batch id — is instant.
export const maxDuration = 300;

/**
 * POST /api/admin/fill-bank  { paper, count, replaceBinned }
 *
 * Admin-only. Creates a bank_batches row, kicks off the durable background worker, and returns the
 * batch id immediately (a closed tab never kills the run). No cap on count. One running batch per
 * paper is fine — a second request for a paper already running is a harmless no-op that returns the
 * live batch id rather than blocking.
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
  // "Replace anything I bin" — on by default.
  const replaceBinned = body.replaceBinned === undefined ? true : !!body.replaceBinned;

  if (!isValidPaper(paper)) {
    return Response.json({ error: "Paper must be 1, 2, or 3" }, { status: 400 });
  }
  if (!Number.isFinite(count) || count < MIN_COUNT) {
    return Response.json({ error: `Count must be at least ${MIN_COUNT}` }, { status: 400 });
  }

  // STALL RECOVERY (spec §1): before checking whether the paper is busy, release any batch whose
  // heartbeat has gone stale (>5 min). A dead 'running' row would otherwise block this Generate
  // forever — the "stuck on 3" bug. Its already-generated questions stay reviewable.
  await releaseStalledBatches();

  // One running batch per paper — don't block, just return the live one.
  const running = await getRunningBatchForPaper(paper);
  if (running) {
    return Response.json({ batchId: running.id, alreadyRunning: true });
  }

  const batch = await startBankBatch({
    paper,
    count,
    replaceBinned,
    createdBy: keyResult.user.id,
  });

  const baseUrl = new URL(request.url).origin;
  const apiKey = keyResult.apiKey;
  const userId = keyResult.user.id;
  after(async () => {
    try {
      await runBankBatch({ batchId: batch.id, apiKey, userId, baseUrl });
    } catch (err) {
      console.error(`[fill-bank] worker failed for batch ${batch.id}:`, err);
    }
  });

  return Response.json({ batchId: batch.id, estCost: estimateBatchCostRange(count) });
}
