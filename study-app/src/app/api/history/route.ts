import { getUser } from "@/lib/auth";
import { getUserAttempts, getUserStats } from "@/lib/db";
import { neon } from "@neondatabase/serverless";

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

    const [attempts, stats] = await Promise.all([
      getUserAttempts(targetUserId, 100),
      getUserStats(targetUserId),
    ]);

    return Response.json({ attempts, stats, userName: targetUserName });
  } catch (err) {
    console.error("History error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
