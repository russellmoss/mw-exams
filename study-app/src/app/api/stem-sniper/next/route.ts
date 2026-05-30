import { neon } from "@neondatabase/serverless";
import { getUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/stem-sniper/next?paper=&family=
 * Returns the next Stem Sniper drill: the question STEM only (never the wines, model answer,
 * or answer key). Only draws questions that have a validated stem_answer_keys row.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const paperRaw = searchParams.get("paper");
  const paper = paperRaw ? Number(paperRaw) : null;
  const family = searchParams.get("family"); // e.g. "F3" or null

  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT q.question_id, q.paper, q.family, q.family_label, q.question_text, q.total_marks,
           jsonb_array_length(q.wines::jsonb) AS wine_count
    FROM generated_questions q
    JOIN stem_answer_keys k ON k.question_id = q.question_id
    WHERE k.validated = true
      AND (${paper}::int IS NULL OR q.paper = ${paper}::int)
      AND (${family}::text IS NULL OR q.family = ${family}::text)
    ORDER BY random()
    LIMIT 1
  `;
  const r = rows[0];
  if (!r) return Response.json({ error: "No drills available for that filter" }, { status: 404 });

  return Response.json({
    questionId: r.question_id,
    paper: r.paper,
    family: r.family,
    familyLabel: r.family_label,
    questionText: r.question_text,
    totalMarks: r.total_marks,
    wineCount: Number(r.wine_count),
  });
}
