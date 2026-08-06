import { getUser } from "@/lib/auth";
import { getLiveTastingSession, getQuestionById, getAttemptById } from "@/lib/db";
import { deriveSessionState, deriveBlindIntegrity } from "@/lib/live-tasting";
import type { Stockist } from "@/lib/retail-availability";

export const runtime = "nodejs";

type SlotAvail = { slot: number; label?: string; stockists?: Stockist[]; thin?: boolean };

/**
 * GET /api/live-tasting/[id] — state-dependent session payload (live_tasting_plan.md §6.1).
 *
 * REDACTION IS THE CONTRACT HERE: before graded_at, the payload carries the question text, marks
 * and per-slot stockist COUNTS only — never wine identity, stockist names (they name the wines),
 * the model answer, or the key. tests/live-tasting-redaction.test.ts enforces this shape.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  const { id } = await params;

  const session = await getLiveTastingSession(id, user.id);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });

  const state = deriveSessionState(session);

  // BYO tasting prep (migration 043): no question exists yet — the payload is the shopping
  // brief. Wine identity can't leak because none has been chosen.
  if (state === "prep" || session.question_id == null) {
    return Response.json({
      id: session.id,
      state: "prep",
      mode: session.mode,
      blindIntegrity: deriveBlindIntegrity(session),
      paper: session.paper,
      flightSize: session.flight_size,
      archetype: session.archetype,
      city: session.city,
      country: session.country,
      budgetAmount: session.budget_amount,
      budgetCurrency: session.budget_currency,
      createdAt: session.created_at,
      shareActive: Boolean(session.share_token_hash && !session.graded_at && !session.abandoned_at),
      prepGuidance: session.prep_guidance,
    });
  }

  const question = await getQuestionById(session.question_id);
  if (!question) return Response.json({ error: "Question missing" }, { status: 500 });

  const avail = (session.availability ?? {}) as { archetypeLabel?: string; slots?: SlotAvail[] };
  const slots = Array.isArray(avail.slots) ? avail.slots : [];

  const base = {
    id: session.id,
    state,
    mode: session.mode,
    blindIntegrity: deriveBlindIntegrity(session),
    paper: session.paper,
    flightSize: session.flight_size,
    city: session.city,
    country: session.country,
    budgetAmount: session.budget_amount,
    budgetCurrency: session.budget_currency,
    createdAt: session.created_at,
    shareActive: Boolean(session.share_token_hash && !session.graded_at && !session.abandoned_at),
    question: {
      questionText: question.question_text,
      totalMarks: question.total_marks,
    },
    slotSummaries: slots.map((s) => ({
      slot: s.slot,
      stockistCount: Array.isArray(s.stockists) ? s.stockists.length : 0,
      thin: Boolean(s.thin),
    })),
  };

  if (state !== "tasted") return Response.json(base);

  // Post-grade: the full reveal.
  const attempt = session.attempt_id ? await getAttemptById(session.attempt_id) : null;
  const wines = typeof question.wines === "string" ? JSON.parse(question.wines) : question.wines;
  return Response.json({
    ...base,
    reveal: {
      attemptId: session.attempt_id,
      wines,
      modelAnswer: question.model_answer,
      availability: session.availability,
      feedback: attempt?.answer_feedback ?? null,
      passEstimate: attempt?.pass_estimate ?? null,
      marksEstimate: attempt?.marks_estimate ?? null,
      userAnswer: attempt?.user_answer ?? null,
      preGlassReasoning: attempt?.pre_glass_reasoning ?? null,
    },
  });
}
