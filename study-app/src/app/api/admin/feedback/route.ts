import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user || !user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const status = url.searchParams.get("status");

    const sql = neon(process.env.DATABASE_URL!);

    let attempts;
    if (status === "open") {
      attempts = await sql`
        SELECT a.*, u.name as user_name, u.email as user_email,
          q.paper, q.family, q.family_label, q.subcategory, q.question_text, q.wines, q.model_answer, q.total_marks
        FROM user_attempts a
        JOIN users u ON a.user_id = u.id
        JOIN generated_questions q ON a.question_id = q.question_id
        WHERE a.user_feedback IS NOT NULL AND a.feedback_status IS NULL
        ORDER BY a.completed_at DESC
      `;
    } else if (status === "accepted" || status === "rejected") {
      attempts = await sql`
        SELECT a.*, u.name as user_name, u.email as user_email,
          q.paper, q.family, q.family_label, q.subcategory, q.question_text, q.wines, q.model_answer, q.total_marks
        FROM user_attempts a
        JOIN users u ON a.user_id = u.id
        JOIN generated_questions q ON a.question_id = q.question_id
        WHERE a.feedback_status = ${status}
        ORDER BY a.feedback_reviewed_at DESC
      `;
    } else {
      attempts = await sql`
        SELECT a.*, u.name as user_name, u.email as user_email,
          q.paper, q.family, q.family_label, q.subcategory, q.question_text, q.wines, q.model_answer, q.total_marks
        FROM user_attempts a
        JOIN users u ON a.user_id = u.id
        JOIN generated_questions q ON a.question_id = q.question_id
        WHERE a.user_feedback IS NOT NULL
        ORDER BY a.completed_at DESC
      `;
    }

    const counts = await sql`
      SELECT
        COUNT(CASE WHEN user_feedback IS NOT NULL AND feedback_status IS NULL THEN 1 END)::int as open,
        COUNT(CASE WHEN feedback_status = 'accepted' THEN 1 END)::int as accepted,
        COUNT(CASE WHEN feedback_status = 'rejected' THEN 1 END)::int as rejected
      FROM user_attempts
      WHERE user_feedback IS NOT NULL
    `;

    return Response.json({
      attempts,
      counts: counts[0] || { open: 0, accepted: 0, rejected: 0 },
    });
  } catch (err) {
    console.error("GET admin/feedback error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
