import { after } from "next/server";
import { requireApiKey } from "@/lib/api-key";
import { reviewBankQuestion, getBankBatch, extendBatchForReplacement } from "@/lib/db";
import { runBankBatch } from "@/lib/bank-worker";

export const runtime = "nodejs";
// A binned item can enqueue one replacement generation, driven in after() past the response.
export const maxDuration = 300;

/**
 * POST /api/admin/bank/item/[id]/bin — admin-only.
 *
 * Reject one pending banked question (status pending → rejected) so it never reaches a candidate.
 * [id] is the generated question's id. If its batch has "Replace anything I bin" on, one replacement
 * generation is enqueued into the SAME batch via the durable worker, so a run of 10 still yields 10
 * kept.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  if (!keyResult.user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const result = await reviewBankQuestion(id, "bin", keyResult.user.id);
  if (!result || !result.changed) {
    return Response.json({ ok: true, changed: false });
  }

  let replacementQueued = false;
  if (result.batchId) {
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
            console.error(`[bank/item/bin] replacement worker failed for batch ${extended.id}:`, err);
          }
        });
      }
    }
  }

  return Response.json({ ok: true, changed: true, replacementQueued });
}
