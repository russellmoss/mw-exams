import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Not authenticated" }, { status: 401 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const keyRows = await sql`
      SELECT id FROM user_api_keys WHERE user_id = ${user.id} AND provider = 'anthropic'
    `;
    const hasApiKey = keyRows.length > 0 || (user.isAdmin && !!process.env.ANTHROPIC_API_KEY);

    // Stem Detail default (migration 013) — used to preselect the dial on the setup screen.
    const prefRows = await sql`SELECT stem_detail_default FROM users WHERE id = ${user.id}`;
    const raw = prefRows[0]?.stem_detail_default;
    const stemDetailDefault =
      raw === "guided" || raw === "exam_real" || raw === "blind" ? raw : "exam_real";

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        hasApiKey,
        stemDetailDefault,
      },
    });
  } catch (err) {
    console.error("Auth me error:", err);
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
