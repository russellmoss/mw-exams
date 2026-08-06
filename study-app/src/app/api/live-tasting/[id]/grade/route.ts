import { requireApiKey } from "@/lib/api-key";
import {
  getLiveTastingSession,
  getQuestionById,
  getAttemptById,
  createAttemptWithUser,
  updateAttempt,
  casClaimSessionAttempt,
  stampLiveTastingEvent,
  recordQuestionView,
  incrementTimesServed,
} from "@/lib/db";
import { deriveSessionState } from "@/lib/live-tasting";
import { produceFullEvaluation } from "@/app/api/evaluate-full/produce";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/live-tasting/[id]/grade — the blind grading wrapper (live_tasting_plan.md §2.4).
 *
 * The client sends ONLY its own work: { userAnswer, preGlassReasoning?, inputMethod? }. Question
 * text, wines, appearances and model answer are loaded server-side — the client never holds the
 * flight, so there is nothing to leak in dev tools.
 *
 * One-shot semantics:
 *  - The attempt row is created and the answer persisted BEFORE the LLM call, then the session's
 *    attempt_id is claimed by CAS (UPDATE ... WHERE attempt_id IS NULL). A concurrent second
 *    submit loses the CAS and reattaches to the existing attempt instead of duplicating.
 *  - graded_at is stamped only in the stream's onComplete — a dropped connection leaves the
 *    session gradeable, and the retry reuses the persisted answer's attempt.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  const userId = keyResult.user.id;
  const { id } = await params;

  const session = await getLiveTastingSession(id, userId);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  const state = deriveSessionState(session);
  if (state === "tasted") return Response.json({ error: "Already graded" }, { status: 409 });
  if (state === "abandoned") return Response.json({ error: "Session abandoned" }, { status: 409 });

  const body = await request.json();
  const userAnswer = typeof body.userAnswer === "string" ? body.userAnswer.trim() : "";
  if (!userAnswer) return Response.json({ error: "Missing userAnswer" }, { status: 400 });
  const preGlassReasoning =
    typeof body.preGlassReasoning === "string" ? body.preGlassReasoning : null;
  const inputMethod: "typed" | "voice" = body.inputMethod === "voice" ? "voice" : "typed";

  const question = await getQuestionById(session.question_id);
  if (!question) return Response.json({ error: "Question missing" }, { status: 500 });
  const wines: { slot: number; fullText: string; appearance?: string }[] =
    typeof question.wines === "string" ? JSON.parse(question.wines) : question.wines;

  // Attempt: reuse the one a dropped stream left behind, else create + CAS-claim.
  let attemptId = session.attempt_id;
  if (attemptId == null) {
    const attempt = await createAttemptWithUser(session.question_id, userId, "live-tasting", undefined);
    const claimed = await casClaimSessionAttempt(session.id, attempt.id);
    if (!claimed) {
      // Lost a race with a concurrent submit — reattach to the winner's attempt.
      const fresh = await getLiveTastingSession(id, userId);
      attemptId = fresh?.attempt_id ?? attempt.id;
    } else {
      attemptId = attempt.id;
    }
  }

  // Persist the candidate's work BEFORE grading: a retry after a dropped stream must never
  // depend on the client still holding the text.
  await updateAttempt(attemptId, { user_answer: userAnswer, input_method: inputMethod });
  if (preGlassReasoning) await updateAttempt(attemptId, { pre_glass_reasoning: preGlassReasoning });

  // Exposure bookkeeping, same as every serve path.
  recordQuestionView(userId, session.question_id).catch(() => {});
  incrementTimesServed(session.question_id).catch(() => {});

  const vintages = (session.vintages_bought ?? null) as Record<string, string> | null;
  const finalAttemptId = attemptId;

  const readable = await produceFullEvaluation({
    apiKey: keyResult.apiKey,
    userId,
    usageSource: keyResult.source,
    questionText: question.question_text,
    preGlassReasoning,
    modelAnswer: question.model_answer,
    paper: session.paper,
    wineAppearances: wines
      .filter((w) => w.appearance)
      .map((w) => ({ slot: w.slot, appearance: w.appearance! })),
    wines,
    identityRevealed: false,
    inputMethod,
    userAnswer,
    vintagesBought: vintages,
    onComplete: async (finalText) => {
      await updateAttempt(finalAttemptId, { answer_feedback: finalText });
      // Deliberately loose: the debrief's exact bolding/casing varies (E2E run 2 parsed
      // null/null with the strict forms). Anchor on the labels, tolerate any markdown around.
      const passMatch = finalText.match(/Result\s*:?[\s*[]*?(PASS|BORDERLINE|FAIL)/i);
      if (passMatch) await updateAttempt(finalAttemptId, { pass_estimate: passMatch[1].toUpperCase() });
      const marksMatch = finalText.match(/Estimated\s+marks\s*:?[\s*[]*([^\n*\]]+)/i);
      if (marksMatch) await updateAttempt(finalAttemptId, { marks_estimate: marksMatch[1].trim().slice(0, 60) });
      await updateAttempt(finalAttemptId, { completed_at: new Date().toISOString() });
      // Stamped LAST: graded_at is the fact "a debrief exists and was saved".
      await stampLiveTastingEvent(session.id, "graded_at");
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
