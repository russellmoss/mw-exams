import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT sound_enabled FROM users WHERE id = ${user.id}`;
    return Response.json({ soundEnabled: rows[0]?.sound_enabled !== false });
  } catch {
    return Response.json({ soundEnabled: true });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

    const { soundEnabled } = await request.json();
    const sql = neon(process.env.DATABASE_URL!);
    await sql`UPDATE users SET sound_enabled = ${!!soundEnabled} WHERE id = ${user.id}`;
    return Response.json({ soundEnabled: !!soundEnabled });
  } catch {
    return Response.json({ error: "Failed to update" }, { status: 500 });
  }
}
