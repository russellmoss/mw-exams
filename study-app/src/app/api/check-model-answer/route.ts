import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

// Readiness poll for a model answer being written in the background.
//
// This returns the ANSWER, not just a boolean. It used to return `{ready}` alone, which made the
// poll structurally incapable of fixing the thing it exists to fix: the client learned the answer
// had landed but had no text to install, so the debrief kept rendering "No model answer available
// for this question yet." Callers dispatch the payload straight into study state.
export async function POST(request: Request) {
  try {
    const { questionId } = await request.json();
    if (!questionId) {
      return Response.json({ error: "Missing questionId" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT model_answer, proposed_annotation, study_diagram_assist
      FROM generated_questions
      WHERE question_id = ${questionId}
    `;

    const row = rows[0];
    // The >100 floor is the original readiness test, kept as-is: a persisted-but-stub answer should
    // not unblock the submit gate.
    const ready = !!row?.model_answer && row.model_answer.length > 100;

    return Response.json({
      ready,
      // Only sent once genuinely ready, so a caller can dispatch the payload unconditionally.
      modelAnswer: ready ? row.model_answer : null,
      proposedAnnotation: ready ? row.proposed_annotation ?? null : null,
      studyDiagramAssist: ready ? row.study_diagram_assist ?? null : null,
    });
  } catch (err) {
    console.error("check-model-answer error:", err);
    return Response.json({ ready: false, modelAnswer: null });
  }
}
