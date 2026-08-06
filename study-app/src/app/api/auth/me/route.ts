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
    // Study defaults (migration 047) — the onboarding choices; questionSourceDefault drives which
    // acquire path the study flow leads with.
    const prefRows = await sql`
      SELECT stem_detail_default, question_source_default, reasoning_stream_default
      FROM users WHERE id = ${user.id}
    `;
    const raw = prefRows[0]?.stem_detail_default;
    // Coerce any legacy/unknown value (including the retired 'blind') to the exam-real default.
    const stemDetailDefault =
      raw === "guided" || raw === "exam_real" ? raw : "exam_real";
    const questionSourceDefault =
      prefRows[0]?.question_source_default === "banked" ? "banked" : "fresh";
    const reasoningStreamDefault = prefRows[0]?.reasoning_stream_default !== false;

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        hasApiKey,
        stemDetailDefault,
        questionSourceDefault,
        reasoningStreamDefault,
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
