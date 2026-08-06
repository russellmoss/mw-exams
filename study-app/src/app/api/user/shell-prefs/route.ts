import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

/**
 * PATCH /api/user/shell-prefs — the shell-redesign preferences (migration 050): intro/tour flags,
 * exam date, and the Continue card's last drill config. Each field is optional; only the fields
 * present in the body are written.
 */
export async function PATCH(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    if (typeof body.introSeen === "boolean") {
      await sql`UPDATE users SET intro_seen = ${body.introSeen} WHERE id = ${user.id}`;
    }
    if (typeof body.tourSeen === "boolean") {
      await sql`UPDATE users SET tour_seen = ${body.tourSeen} WHERE id = ${user.id}`;
    }
    if ("examDate" in body) {
      const examDate = body.examDate;
      if (examDate !== null && (typeof examDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(examDate))) {
        return Response.json({ error: "examDate must be YYYY-MM-DD or null" }, { status: 400 });
      }
      await sql`UPDATE users SET exam_date = ${examDate} WHERE id = ${user.id}`;
    }
    if ("lastDrillConfig" in body) {
      const config = body.lastDrillConfig;
      if (config !== null && (typeof config !== "object" || Array.isArray(config))) {
        return Response.json({ error: "lastDrillConfig must be an object or null" }, { status: 400 });
      }
      await sql`UPDATE users SET last_drill_config = ${config === null ? null : JSON.stringify(config)} WHERE id = ${user.id}`;
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/user/shell-prefs error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
