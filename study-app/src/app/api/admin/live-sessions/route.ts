import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user?.isAdmin) {
      return Response.json({ error: "Admin required" }, { status: 403 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Active sessions: attempts with a current_step set and started in the last 2 hours
    const sessions = await sql`
      SELECT
        a.id as attempt_id,
        a.question_id,
        a.current_step,
        a.pre_glass_reasoning,
        a.user_answer,
        a.started_at,
        a.completed_at,
        u.id as user_id,
        u.name as user_name,
        q.paper,
        q.family,
        q.family_label,
        q.question_text,
        q.wines
      FROM user_attempts a
      JOIN users u ON a.user_id = u.id
      JOIN generated_questions q ON a.question_id = q.question_id
      WHERE a.current_step IS NOT NULL
        AND a.completed_at IS NULL
        AND a.started_at > NOW() - INTERVAL '2 hours'
      ORDER BY a.started_at DESC
    `;

    return Response.json({ sessions });
  } catch (err) {
    console.error("live-sessions error:", err);
    return Response.json({ error: "Failed to fetch" }, { status: 500 });
  }
}
