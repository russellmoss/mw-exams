import { after } from "next/server";
import { getUser } from "@/lib/auth";
import { requireApiKey } from "@/lib/api-key";
import {
  reviewBankQuestion,
  unbinBankQuestion,
  getBatchPendingQuestions,
} from "@/lib/db";
import { sanitizeBinTags, sanitizeBinNote } from "@/lib/bin-reasons";
import { regenerateBinLessons } from "@/lib/bin-lessons";
import { runBinReasonCheck } from "@/lib/bin-reason-check";

export const runtime = "nodejs";
// The bin itself is a single UPDATE; the budget covers the bin-reason adjudication in after().
export const maxDuration = 300;

/**
 * POST /api/admin/bank/item/[id]/bin — admin-only.
 *
 * Reject one pending banked question (status pending → rejected) so it never reaches a candidate.
 * [id] is the generated question's id.
 *
 * A bin used to enqueue a replacement generation when its batch had "Replace anything I bin" on.
 * Bulk generation has been removed, so a bin now only removes — the bank shrinks by one and nothing
 * is written to backfill it.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  if (!keyResult.user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  // OPTIONAL bin reason (never required) — sanitised to known codes / a trimmed <=200-char note.
  // Accepts the current { reasons, note } shape (spec §4) and the legacy { reasonTags, reasonNote }.
  const body = await request.json().catch(() => ({}));
  const { reasons, note: noteIn, reasonTags, reasonNote } = body as {
    reasons?: unknown;
    note?: unknown;
    reasonTags?: unknown;
    reasonNote?: unknown;
  };
  const tags = sanitizeBinTags(reasons ?? reasonTags);
  const note = sanitizeBinNote(noteIn ?? reasonNote);
  const result = await reviewBankQuestion(id, "bin", keyResult.user.id, { tags, note });
  if (!result || !result.changed) {
    return Response.json({ ok: true, changed: false });
  }

  // Bin with Reason (spec §4): a reasoned bin is first ADJUDICATED against the corpus/EK (pushback —
  // an invalid reason is withheld from the prompt feeds and surfaces on /admin), then refreshes the
  // distilled "Lessons for new questions" summary. The check runs before the regenerate so the
  // summary is distilled from already-gated rows. Best-effort — run past the response so neither
  // step ever delays the bin.
  if (tags || note) {
    const apiKey = keyResult.apiKey;
    const userId = keyResult.user.id;
    after(async () => {
      await runBinReasonCheck({ itemId: id, apiKey, userId, source: "user" });
      try {
        await regenerateBinLessons(apiKey, userId);
      } catch (err) {
        console.error("[bank/item/bin] bin-lessons regenerate failed (non-fatal):", err);
      }
    });
  }

  // Servable pool already excludes this row (it's hard-deleted); report the batch's remaining pending.
  const remaining = result.batchId
    ? (await getBatchPendingQuestions(result.batchId)).length
    : 0;

  return Response.json({ ok: true, changed: true, remaining });
}

/**
 * DELETE /api/admin/bank/item/[id]/bin — admin-only. Reverse a bin (the "Undo" path).
 *
 * Restores review_state 'binned' → 'pending' so the question re-enters the review queue, and drops its
 * bin-ledger row (an undone bin has no reason and must not feed the digest). No Claude key is needed —
 * nothing is generated — so this gates on getUser rather than requireApiKey. Idempotent: a row that is
 * no longer 'binned' returns changed:false without erroring.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const result = await unbinBankQuestion(id, user.id);
  if (!result.changed) return Response.json({ ok: true, changed: false });

  const remaining = result.batchId
    ? (await getBatchPendingQuestions(result.batchId)).length
    : 0;
  return Response.json({ ok: true, changed: true, remaining });
}
