import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import { restoreUser } from "@/lib/user-deletion";

export const runtime = "nodejs";

/**
 * POST /api/admin/users/[id]/restore — cancel a pending deletion.
 *
 * This is the whole point of the grace period: an account deleted by mistake (by an admin, or by
 * a user who changed their mind) can be brought back until the purge job takes it. Afterwards the
 * row is gone and there is nothing to restore — hence the 404 rather than a silent success.
 *
 * Revoked API keys and password-reset tokens are deliberately NOT restored; see restoreUser.
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

    const sql = neon(process.env.DATABASE_URL!);
    const restored = await restoreUser(sql, targetId);
    if (!restored) {
      return Response.json(
        { error: "No pending deletion for this account." },
        { status: 404 }
      );
    }

    const rows = await sql`
      SELECT id, email, name, is_admin, is_active, deleted_at FROM users WHERE id = ${targetId}
    `;
    return Response.json({ success: true, user: rows[0] });
  } catch (err) {
    console.error("POST admin/users/[id]/restore error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
