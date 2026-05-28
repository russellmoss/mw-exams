import bcrypt from "bcryptjs";
import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const { newPassword } = await request.json();

    if (!newPassword) {
      return Response.json({ error: "New password is required" }, { status: 400 });
    }

    if (newPassword.length < 6) {
      return Response.json({ error: "New password must be at least 6 characters" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const newHash = await bcrypt.hash(newPassword, 10);
    await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user.id}`;

    return Response.json({ success: true });
  } catch (err) {
    console.error("change-password error:", err);
    return Response.json({ error: "Failed to change password" }, { status: 500 });
  }
}
