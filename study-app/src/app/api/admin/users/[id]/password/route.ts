import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

/**
 * POST /api/admin/users/[id]/password — admin sets a user's password directly.
 * Body: { password }. Burns any outstanding reset tokens so an old emailed link can't undo
 * the admin's change.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(request);
    if (!user || !user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const targetId = parseInt(id, 10);
    if (isNaN(targetId)) {
      return Response.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const { password } = await request.json();
    if (typeof password !== "string" || password.length < 6) {
      return Response.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT id FROM users WHERE id = ${targetId}`;
    if (rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${targetId}`;
    await sql`
      UPDATE password_reset_tokens SET used_at = now()
      WHERE user_id = ${targetId} AND used_at IS NULL
    `;

    console.info(`[admin] user ${user.id} set password for user ${targetId}`);
    return Response.json({ ok: true });
  } catch (err) {
    console.error("POST admin/users/[id]/password error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
