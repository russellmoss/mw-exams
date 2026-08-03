import { after } from "next/server";
import { requireApiKey } from "@/lib/api-key";
import {
  reviewBankQuestion,
  undoBankReview,
  getBankBatch,
  extendBatchForReplacement,
} from "@/lib/db";
import { runBankBatch } from "@/lib/bank-worker";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/admin/bank/review  { questionId, decision: 'keep' | 'bin' | 'undo' }
 *
 * Admin-only per-question gate. 'keep' → approved (servable), 'bin' → rejected. 'undo' returns a
 * decided row to pending. If a bin lands in a batch with replace_rejected on, one replacement
 * generation is enqueued into the SAME batch (durable worker, in after()).
 */
export async function POST(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  if (!keyResult.user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { questionId, decision, batchId } = body as {
    questionId?: string;
    decision?: string;
    batchId?: string;
  };
  if (!questionId || !decision || !["keep", "bin", "undo"].includes(decision)) {
    return Response.json({ error: "Missing questionId or invalid decision" }, { status: 400 });
  }

  if (decision === "undo") {
    if (!batchId) return Response.json({ error: "Missing batchId for undo" }, { status: 400 });
    const ok = await undoBankReview(questionId, batchId);
    return Response.json({ ok });
  }

  const result = await reviewBankQuestion(questionId, decision as "keep" | "bin", keyResult.user.id);
  if (!result || !result.changed) {
    // Already reviewed (or not pending) — treat as a no-op success so a double-tap is harmless.
    return Response.json({ ok: true, changed: false });
  }

  let replacementQueued = false;
  if (decision === "bin" && result.batchId) {
    const batch = await getBankBatch(result.batchId);
    if (batch && batch.replace_rejected) {
      const extended = await extendBatchForReplacement(result.batchId);
      if (extended) {
        replacementQueued = true;
        const apiKey = keyResult.apiKey;
        const userId = keyResult.user.id;
        const baseUrl = new URL(request.url).origin;
        after(async () => {
          try {
            await runBankBatch({ batchId: extended.id, apiKey, userId, baseUrl });
          } catch (err) {
            console.error(`[bank/review] replacement worker failed for batch ${extended.id}:`, err);
          }
        });
      }
    }
  }

  return Response.json({ ok: true, changed: true, replacementQueued });
}
