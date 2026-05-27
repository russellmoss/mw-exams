import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { questionId } = await request.json();
    if (!questionId) {
      return Response.json({ error: "Missing questionId" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT model_answer IS NOT NULL AND length(model_answer) > 100 as ready
      FROM generated_questions
      WHERE question_id = ${questionId}
    `;

    return Response.json({ ready: rows[0]?.ready ?? false });
  } catch (err) {
    console.error("check-model-answer error:", err);
    return Response.json({ ready: false });
  }
}
