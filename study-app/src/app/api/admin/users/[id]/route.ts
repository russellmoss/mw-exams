import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

export async function PATCH(
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

    // Prevent self-demotion
    if (targetId === user.id) {
      return Response.json({ error: "Cannot modify your own admin status" }, { status: 400 });
    }

    const body = await request.json();
    const sql = neon(process.env.DATABASE_URL!);

    if (typeof body.isAdmin === "boolean") {
      await sql`UPDATE users SET is_admin = ${body.isAdmin} WHERE id = ${targetId}`;
    }

    if (typeof body.isActive === "boolean") {
      await sql`UPDATE users SET is_active = ${body.isActive} WHERE id = ${targetId}`;
    }

    const rows = await sql`
      SELECT id, email, name, is_admin, is_active FROM users WHERE id = ${targetId}
    `;
    if (rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json({ user: rows[0] });
  } catch (err) {
    console.error("PATCH admin/users/[id] error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
