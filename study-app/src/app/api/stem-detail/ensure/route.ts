import { requireApiKey } from "@/lib/api-key";
import { getQuestionById } from "@/lib/db";
import { ensureStemVariants } from "@/lib/stem-detail";

export const runtime = "nodejs";
export const maxDuration = 120;

// Out-of-band Stem Detail backfill.
//
// Deriving the two stem variants costs a model call, so it must NEVER sit on /api/get-question's
// critical path — that is exactly what caused the "Question generation timed out" reports (a 5-8s
// call stacked on an already-slow generation chain, pushing past the browser's 120s abort).
//
// Instead the setup screen fires this endpoint after the question is already on screen and does not
// block on it. The question is fully usable the whole time: any level without a stored variant falls
// back to the canonical stem. When this resolves, the client patches the previews in place.
//
// Idempotent and self-limiting: ensureStemVariants no-ops once both levels are stored, so each
// question is derived once, ever. A failure here is invisible to the candidate.
export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const { questionId } = await request.json();
    if (!questionId || typeof questionId !== "string") {
      return Response.json({ error: "Missing questionId" }, { status: 400 });
    }

    const question = await getQuestionById(questionId);
    if (!question) return Response.json({ error: "Unknown question" }, { status: 404 });

    // Already complete — return what's stored without touching the model.
    if (question.stem_guided && question.stem_exam_real) {
      return Response.json({
        variants: {
          guided: question.stem_guided,
          exam_real: question.stem_exam_real,
        },
        derived: false,
      });
    }

    const variants = await ensureStemVariants(
      {
        question_id: question.question_id,
        question_text: question.question_text,
        stem_guided: question.stem_guided ?? null,
        stem_exam_real: question.stem_exam_real ?? null,
      },
      keyResult.apiKey,
      { source: keyResult.source, userId: keyResult.user.id, questionId: question.question_id }
    );

    return Response.json({ variants, derived: true });
  } catch (err) {
    console.error("stem-detail/ensure error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
