import { getUser } from "@/lib/auth";
import { getUserAttempts, getUserStats } from "@/lib/db";
import { neon } from "@neondatabase/serverless";
import { getTheoryRubric } from "@/lib/theory/rubric";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const url = new URL(request.url);
    const targetUserIdParam = url.searchParams.get("userId");
    let targetUserId = user.id;
    let targetUserName = user.name;

    if (targetUserIdParam) {
      if (!user.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      targetUserId = parseInt(targetUserIdParam, 10);
      if (isNaN(targetUserId)) {
        return Response.json({ error: "Invalid userId" }, { status: 400 });
      }
      const sql = neon(process.env.DATABASE_URL!);
      const rows = await sql`SELECT name FROM users WHERE id = ${targetUserId}`;
      if (rows.length === 0) {
        return Response.json({ error: "User not found" }, { status: 404 });
      }
      targetUserName = rows[0].name as string;
    }

    const [rawAttempts, stats] = await Promise.all([
      getUserAttempts(targetUserId, 100),
      getUserStats(targetUserId),
    ]);
    const attempts = rawAttempts.map((attempt) => {
      if (attempt.mode !== "theory") return attempt;
      const rubric = getTheoryRubric(attempt.question_id);
      return {
        ...attempt,
        paper: rubric?.paper ?? 0,
        family: "theory",
        family_label: rubric?.domain.replaceAll("_", " ") ?? "Theory",
        subcategory: rubric?.section ?? null,
        question_text: rubric?.questionText ?? attempt.question_id,
        wines: [],
        model_answer: null,
        total_marks: 0,
      };
    });

    return Response.json({ attempts, stats, userName: targetUserName });
  } catch (err) {
    console.error("History error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
