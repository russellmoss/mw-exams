import { after } from "next/server";
import { getUser } from "@/lib/auth";
import { requireApiKey } from "@/lib/api-key";
import {
  getBankBatch,
  getBatchPendingQuestions,
  getQuestionById,
  reviewBankQuestion,
  keepAllPending,
  extendBatchForReplacement,
  type GeneratedQuestion,
} from "@/lib/db";
import { runBankBatch } from "@/lib/bank-worker";

export const runtime = "nodejs";
export const maxDuration = 300;

const FAMILY_LABELS: Record<string, string> = {
  F1: "Same variety",
  F2: "Same origin",
  F3: "Blend logic",
  F4: "Mixed breadth",
  F5: "Method / production",
  F6: "Style mechanism",
  F7: "Quality hierarchy",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  low: "Standard",
  medium: "Testing",
  high: "Curveball",
};

// Shape a stored question into the review payload the card renders: verbatim stem, a per-wine mark
// breakdown that sums to the total (exactly 25 marks per wine, spec), and the wine list. Structured
// wine attributes are surfaced when present in the stored metadata; the verbatim descriptor is always
// returned so the reviewer sees exactly what a candidate would.
function serialize(q: GeneratedQuestion) {
  const wines = typeof q.wines === "string" ? JSON.parse(q.wines as unknown as string) : q.wines;
  const list = Array.isArray(wines) ? wines : [];
  const perWine = list.length > 0 ? Math.round(q.total_marks / list.length) : q.total_marks;

  const meta = (q.metadata || {}) as Record<string, unknown>;
  const difficulty =
    (typeof meta.difficulty === "string" && meta.difficulty) ||
    (typeof meta.curveball === "string" && meta.curveball) ||
    null;

  const outWines = list.map(
    (w: { slot: number; fullText: string; appearance?: string } & Record<string, unknown>) => {
      const vintageMatch = /\b(19|20)\d{2}\b/.exec(w.fullText || "");
      return {
        slot: w.slot,
        text: w.fullText,
        variety: (w.variety as string) ?? null,
        region: (w.region as string) ?? null,
        country: (w.country as string) ?? null,
        vintage: (w.vintage as string) ?? (vintageMatch ? vintageMatch[0] : null),
        priceBand: (w.priceBand as string) ?? (w.price_band as string) ?? null,
      };
    }
  );

  const markBreakdown = list.map((w: { slot: number }) => ({
    label: `Wine ${w.slot}`,
    marks: perWine,
  }));

  return {
    id: q.question_id,
    paper: q.paper,
    family: q.family,
    familyLabel: FAMILY_LABELS[q.family] || q.family_label || q.family,
    difficulty: difficulty ? DIFFICULTY_LABELS[difficulty] || difficulty : null,
    stem: q.question_text,
    markBreakdown,
    total: q.total_marks,
    wines: outWines,
  };
}

/**
 * GET /api/admin/fill-bank/review?batch=… — admin-only.
 *
 * The next pending question for the batch (oldest first) as a full review payload, plus the
 * reviewer's position (n of total). Binned questions are hard-deleted, so "total" is the kept count
 * so far plus everything still pending.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const batchId = new URL(request.url).searchParams.get("batch");
  if (!batchId) return Response.json({ error: "Missing batch" }, { status: 400 });

  const batch = await getBankBatch(batchId);
  if (!batch) return Response.json({ error: "Batch not found" }, { status: 404 });

  const pending = await getBatchPendingQuestions(batchId);
  const total = batch.kept_count + pending.length;
  const question = pending[0] ? serialize(pending[0]) : null;

  return Response.json({
    batchId: batch.id,
    paper: batch.paper,
    replaceBinned: batch.replace_binned,
    status: batch.status,
    keptCount: batch.kept_count,
    remaining: pending.length,
    position: { n: question ? batch.kept_count + 1 : total, total },
    question,
  });
}

/**
 * POST /api/admin/fill-bank/review  { id, action:'keep'|'bin'|'keepAll' } — admin-only.
 *
 * keep    → review_state='kept' (servable).
 * bin     → the row is hard-deleted (immediate, permanent, no undo); if the batch has
 *           "Replace anything I bin" on, one replacement generation is appended to the same batch.
 * keepAll → every remaining pending question in the batch is kept in one shot.
 */
export async function POST(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  if (!keyResult.user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { id, action } = body as { id?: string; action?: string };
  if (!id || !action || !["keep", "bin", "keepAll"].includes(action)) {
    return Response.json({ error: "Missing id or invalid action" }, { status: 400 });
  }

  if (action === "keepAll") {
    // `id` is either a question id in the batch or the batch id itself.
    const q = await getQuestionById(id);
    const batchId = q?.batch_id ?? id;
    const kept = await keepAllPending(batchId, keyResult.user.id);
    return Response.json({ ok: true, kept });
  }

  const result = await reviewBankQuestion(id, action as "keep" | "bin", keyResult.user.id);
  if (!result || !result.changed) {
    return Response.json({ ok: true, changed: false });
  }

  let replacementQueued = false;
  if (action === "bin" && result.batchId) {
    const batch = await getBankBatch(result.batchId);
    if (batch && batch.replace_binned) {
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
            console.error(`[fill-bank/review] replacement worker failed for ${extended.id}:`, err);
          }
        });
      }
    }
  }

  return Response.json({ ok: true, changed: true, replacementQueued });
}
