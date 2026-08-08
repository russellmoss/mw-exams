import { getUser } from "@/lib/auth";
import { getQuestionById, type GeneratedQuestion } from "@/lib/db";

export const runtime = "nodejs";

// Family F-codes → the human labels used across the review surfaces (mirrors bank/review-queue).
const FAMILY_LABELS: Record<string, string> = {
  F1: "Same variety",
  F2: "Same origin",
  F3: "Blend logic",
  F4: "Mixed breadth",
  F5: "Method / production",
  F6: "Style mechanism",
  F7: "Quality hierarchy",
};

// Shape a stored question into the reviewer payload the Unreviewed modal renders: verbatim stem, a
// per-wine mark breakdown that sums to the total (25 marks per wine, spec), and the numbered wine list
// with identity / region / vintage. Same presentation contract as the batch review card (serialize in
// api/admin/bank/review-queue) so the modal can reuse the QuestionDisplay / WineReveal style.
function serialize(q: GeneratedQuestion) {
  const wines = typeof q.wines === "string" ? JSON.parse(q.wines as unknown as string) : q.wines;
  const list = Array.isArray(wines) ? wines : [];
  const perWine = list.length > 0 ? Math.round(q.total_marks / list.length) : q.total_marks;

  const outWines = list.map(
    (w: { slot: number; fullText: string } & Record<string, unknown>) => {
      const vintageMatch = /\b(19|20)\d{2}\b/.exec(w.fullText || "");
      return {
        slot: w.slot,
        text: w.fullText,
        variety: (w.variety as string) ?? null,
        region: (w.region as string) ?? null,
        country: (w.country as string) ?? null,
        vintage: (w.vintage as string) ?? (vintageMatch ? vintageMatch[0] : null),
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
    stem: q.question_text,
    markBreakdown,
    total: q.total_marks,
    wines: outWines,
  };
}

/**
 * GET /api/admin/bank/item/[id] — admin-only.
 *
 * The full reviewer payload for one banked question, by question_id. Feeds the Unreviewed modal body.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const q = await getQuestionById(id);
  if (!q) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({ question: serialize(q) });
}
