import { after } from "next/server";
import { getUser } from "@/lib/auth";
import { requireApiKey } from "@/lib/api-key";
import {
  getBankBatch,
  getBatchPendingQuestions,
  getFlaggedPendingQuestions,
  getAnswerKeyGroundTruth,
  getAnswerKeyGroundTruths,
  getQuestionById,
  reviewBankQuestion,
  keepAllPending,
  applyBinReasons,
  extendBatchForReplacement,
  type GeneratedQuestion,
} from "@/lib/db";
import type { ProducerFlag } from "@/lib/bank-health/producer";
import { runBankBatch } from "@/lib/bank-worker";
import { validateQuestion, type AuditWine, type Violation } from "@/lib/question-validator";
import { sanitizeBinTags, sanitizeBinNote, VALIDATOR_LINKED_TAGS } from "@/lib/bin-reasons";

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

  // Producer Spread review flags (migration 032): one chip per over-used producer, surfaced above the
  // Keep/Bin controls. Parsed defensively — the column is JSONB but may arrive as a string.
  let producerFlags: ProducerFlag[] = [];
  const rawFlags = q.producer_flags;
  if (Array.isArray(rawFlags)) {
    producerFlags = rawFlags as ProducerFlag[];
  } else if (typeof rawFlags === "string") {
    try {
      const parsed = JSON.parse(rawFlags);
      if (Array.isArray(parsed)) producerFlags = parsed as ProducerFlag[];
    } catch {
      producerFlags = [];
    }
  }

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
    producerFlags,
  };
}

function violationsFor(q: GeneratedQuestion, groundTruth: unknown[]): Violation[] {
  return validateQuestion({
    questionId: q.question_id,
    paper: q.paper,
    family: q.family,
    questionText: q.question_text,
    totalMarks: q.total_marks,
    wines: groundTruth as AuditWine[],
  }).violations;
}

/**
 * Run the hard validator over a pending question so the reviewer sees the same verdict the corpus
 * audit would give, BEFORE deciding keep/bin.
 *
 * This exists because a reviewer kept a question whose stem promised three different grape varieties
 * over a Pinot Noir, a Cannonau di Sardegna and a Campo de Borja Garnacha — Cannonau and Garnacha are
 * both Grenache, so it was unanswerable, and nothing in the rendered stem or wine list said so. The
 * pane showed everything a candidate sees and nothing a validator knows.
 *
 * Returns null when the answer key hasn't been derived yet — the validator needs resolved varieties,
 * so with no key there is no verdict to show (better a stated "not available" than a false all-clear).
 */
async function verdictFor(q: GeneratedQuestion): Promise<{
  ok: boolean;
  hard: Violation[];
  soft: Violation[];
} | null> {
  const groundTruth = await getAnswerKeyGroundTruth(q.question_id);
  if (!groundTruth || groundTruth.length === 0) return null;

  const violations = violationsFor(q, groundTruth);
  const hard = violations.filter((v) => v.severity === "hard");
  return { ok: hard.length === 0, hard, soft: violations.filter((v) => v.severity === "soft") };
}

// How many of the still-pending questions fail hard validation. "Keep all" approves every one of them
// in a single click, so without this the reviewer is told about the question on screen and nothing
// about the other N they are also about to accept.
async function failingPendingCount(pending: GeneratedQuestion[]): Promise<number> {
  const keys = await getAnswerKeyGroundTruths(pending.map((q) => q.question_id));
  let failing = 0;
  for (const q of pending) {
    const gt = keys.get(q.question_id);
    if (!gt) continue; // no key → no verdict; counted as unknown, not as failing
    if (violationsFor(q, gt).some((v) => v.severity === "hard")) failing++;
  }
  return failing;
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

  const params = new URL(request.url).searchParams;

  // Producer-flag deep-link (spec §3): the Bank Health "N flagged items awaiting review" link opens the
  // review queue filtered to items carrying a producer flag, ACROSS batches. Keep/Bin work per-item, so
  // the batch-scoped fields are synthesised from the flagged set.
  if (params.get("flagged") === "producer") {
    const pending = await getFlaggedPendingQuestions();
    const keys = await getAnswerKeyGroundTruths(pending.map((q) => q.question_id));
    const questions = pending.map((q) => {
      const gt = keys.get(q.question_id);
      let cardVerdict: { ok: boolean; hard: Violation[]; soft: Violation[] } | null = null;
      if (gt && gt.length > 0) {
        const violations = violationsFor(q, gt);
        const hard = violations.filter((v) => v.severity === "hard");
        cardVerdict = { ok: hard.length === 0, hard, soft: violations.filter((v) => v.severity === "soft") };
      }
      return { ...serialize(q), verdict: cardVerdict };
    });
    const total = pending.length;
    return Response.json({
      batchId: "flagged:producer",
      flagged: "producer",
      paper: pending[0]?.paper ?? null,
      replaceBinned: false,
      status: "complete",
      keptCount: 0,
      remaining: total,
      position: { n: total > 0 ? 1 : 0, total },
      question: questions[0] ?? null,
      verdict: questions[0]?.verdict ?? null,
      failingRemaining: await failingPendingCount(pending),
      questions,
    });
  }

  const batchId = params.get("batch");
  if (!batchId) return Response.json({ error: "Missing batch" }, { status: 400 });

  const batch = await getBankBatch(batchId);
  if (!batch) return Response.json({ error: "Batch not found" }, { status: 404 });

  const pending = await getBatchPendingQuestions(batchId);
  const total = batch.kept_count + pending.length;
  const question = pending[0] ? serialize(pending[0]) : null;
  const verdict = pending[0] ? await verdictFor(pending[0]) : null;
  const failingRemaining = await failingPendingCount(pending);

  // Full pending queue (each with its own verdict) so the review card can drive optimistic, local
  // navigation — Bin/Keep advance instantly without a server round-trip per card. Verdicts reuse the
  // batched ground-truth read so the whole list costs one key fetch, not one per question.
  const keys = await getAnswerKeyGroundTruths(pending.map((q) => q.question_id));
  const questions = pending.map((q) => {
    const gt = keys.get(q.question_id);
    let cardVerdict: { ok: boolean; hard: Violation[]; soft: Violation[] } | null = null;
    if (gt && gt.length > 0) {
      const violations = violationsFor(q, gt);
      const hard = violations.filter((v) => v.severity === "hard");
      cardVerdict = { ok: hard.length === 0, hard, soft: violations.filter((v) => v.severity === "soft") };
    }
    return { ...serialize(q), verdict: cardVerdict };
  });

  return Response.json({
    batchId: batch.id,
    paper: batch.paper,
    replaceBinned: batch.replace_binned,
    status: batch.status,
    keptCount: batch.kept_count,
    remaining: pending.length,
    position: { n: question ? batch.kept_count + 1 : total, total },
    question,
    verdict,
    failingRemaining,
    questions,
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
  const { id, action, reasonTags, reasonNote } = body as {
    id?: string;
    action?: string;
    reasonTags?: unknown;
    reasonNote?: unknown;
  };
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

  // OPTIONAL bin reason — never required. Sanitised to known tags / a trimmed <=500-char note.
  const tags = action === "bin" ? sanitizeBinTags(reasonTags) : null;
  const note = action === "bin" ? sanitizeBinNote(reasonNote) : null;

  // HARD-validator gap logging (spec §4): when a bin is tagged with a contradiction-class fault the
  // mechanical validator is meant to catch, record whether the validator actually flagged it. The row
  // is hard-deleted by the bin, so the verdict is taken BEFORE deciding. A "caught" line is expected;
  // "MISSED" is a genuine validator gap worth surfacing.
  if (action === "bin" && tags && tags.some((t) => VALIDATOR_LINKED_TAGS.includes(t as never))) {
    const pre = await getQuestionById(id);
    const verdict = pre ? await verdictFor(pre) : null;
    const caught = !!verdict && verdict.hard.length > 0;
    console.warn(
      `[validator-gap] item=${id} tags=${tags.join(",")} validator=${
        verdict === null ? "no-key" : caught ? "caught" : "MISSED"
      }`
    );
  }

  const result = await reviewBankQuestion(id, action as "keep" | "bin", keyResult.user.id, {
    tags,
    note,
  });
  if (!result || !result.changed) {
    return Response.json({ ok: true, changed: false });
  }

  // Remaining pending count for the batch, so the client can reconcile its optimistic removal.
  const remaining = result.batchId
    ? (await getBatchPendingQuestions(result.batchId)).length
    : 0;

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

  return Response.json({ ok: true, changed: true, replacementQueued, remaining });
}

/**
 * PATCH /api/admin/fill-bank/review  { itemIds: string[], reasons: string[], note?: string }
 *
 * Optional, non-blocking reason capture for items still on the Undo stack (spec §3). Fire-and-forget:
 * the client never rolls back on failure, so this must never touch bin state. Reasons apply to EVERY
 * id passed. Unknown tags are dropped; a missing/expired ledger row is a silent no-op.
 *
 * Gates on getUser (no Claude key needed — nothing is generated). Validator-gap logging (spec §5): a
 * contradiction-class tag the hard validator is meant to catch is logged as caught/MISSED, using the
 * still-present (soft-deleted) row.
 */
export async function PATCH(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const { itemIds, reasons, note } = body as {
    itemIds?: unknown;
    reasons?: unknown;
    note?: unknown;
  };
  const ids = Array.isArray(itemIds)
    ? itemIds.filter((x): x is string => typeof x === "string")
    : [];
  if (ids.length === 0) return Response.json({ ok: true, updated: 0 });

  const tags = sanitizeBinTags(reasons);
  const cleanNote = sanitizeBinNote(note);

  const updated = await applyBinReasons(ids, tags, cleanNote);

  if (tags && tags.some((t) => VALIDATOR_LINKED_TAGS.includes(t as never))) {
    for (const id of ids) {
      const pre = await getQuestionById(id);
      const verdict = pre ? await verdictFor(pre) : null;
      const caught = !!verdict && verdict.hard.length > 0;
      console.warn(
        `[validator-gap] item=${id} tags=${tags.join(",")} validator=${
          verdict === null ? "no-key" : caught ? "caught" : "MISSED"
        }`
      );
    }
  }

  return Response.json({ ok: true, updated });
}
