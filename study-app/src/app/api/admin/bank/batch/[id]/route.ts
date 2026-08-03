import { getUser } from "@/lib/auth";
import { getBankBatch, getBatchQuestions, type GeneratedQuestion } from "@/lib/db";

export const runtime = "nodejs";

const FAMILY_LABELS: Record<string, string> = {
  F1: "Same Variety",
  F2: "Same Origin",
  F3: "Blend Logic",
  F4: "Mixed Breadth",
  F5: "Method / Production",
  F6: "Style Mechanism",
  F7: "Quality Hierarchy",
};

function serialize(q: GeneratedQuestion) {
  const wines = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
  return {
    questionId: q.question_id,
    paper: q.paper,
    family: q.family,
    familyLabel: FAMILY_LABELS[q.family] || q.family_label || q.family,
    questionText: q.question_text,
    totalMarks: q.total_marks,
    wines: Array.isArray(wines)
      ? wines.map((w: { slot: number; fullText: string; appearance?: string }) => ({
          slot: w.slot,
          fullText: w.fullText,
          appearance: w.appearance ?? null,
        }))
      : [],
    status: q.status,
  };
}

/**
 * GET /api/admin/bank/batch/[id] — admin-only.
 *
 * The batch row + every question it produced (stem, mark allocation, wine list) so /admin/bank can
 * render the review stack, the kept/binned collapsed rows, and the summary. Poll every 3s while
 * batch.status === 'running'.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const batch = await getBankBatch(id);
  if (!batch) {
    return Response.json({ error: "Batch not found" }, { status: 404 });
  }

  const questions = (await getBatchQuestions(id)).map(serialize);

  return Response.json({
    batch: {
      id: batch.id,
      paper: batch.paper,
      status: batch.status,
      requested: batch.requested_count,
      generated: batch.generated_count,
      failed: batch.failed_count,
      replaceRejected: batch.replace_rejected,
      estCostUsd: batch.est_cost_usd == null ? null : Number(batch.est_cost_usd),
      actualCostUsd: batch.actual_cost_usd == null ? null : Number(batch.actual_cost_usd),
      createdAt: batch.created_at,
      completedAt: batch.completed_at,
    },
    questions,
  });
}
