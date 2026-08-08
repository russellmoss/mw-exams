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
    // All three providers in one query. The client gate needs to know which are missing BEFORE
    // rendering the app, so three round-trips here would be three chances to flash the wrong state.
    const keyRows = await sql`
      SELECT provider FROM user_api_keys
      WHERE user_id = ${user.id} AND provider IN ('anthropic', 'tavily', 'elevenlabs')
    `;
    const stored = new Set(keyRows.map((r) => r.provider as string));
    // Admins fall back to the server key for each — the BYOK exemption, applied per provider so an
    // admin missing one is not treated as missing all three.
    const hasApiKey = stored.has("anthropic") || (user.isAdmin && !!process.env.ANTHROPIC_API_KEY);
    const hasTavilyKey = stored.has("tavily") || (user.isAdmin && !!process.env.TAVILY_API_KEY);
    const hasVoiceKey = stored.has("elevenlabs") || (user.isAdmin && !!process.env.ELEVENLABS_API_KEY);

    // Stem Detail default (migration 013) — used to preselect the dial on the setup screen.
    // Study defaults (migration 047) — the onboarding choices; questionSourceDefault drives which
    // acquire path the study flow leads with.
    // Shell prefs (migration 050) — intro/tour flags, exam countdown, Continue card config.
    const prefRows = await sql`
      SELECT stem_detail_default, question_source_default, reasoning_stream_default,
             intro_seen, tour_seen, walkthrough_seen, coach_walkthrough_seen,
             practical_walkthrough_seen, theory_walkthrough_seen,
             exam_date, last_drill_config
      FROM users WHERE id = ${user.id}
    `;
    const raw = prefRows[0]?.stem_detail_default;
    // Coerce any legacy/unknown value (including the retired 'blind') to the exam-real default.
    const stemDetailDefault =
      raw === "guided" || raw === "exam_real" ? raw : "exam_real";
    // Coerce toward 'banked' (migration 063): only an explicit 'fresh' leads with generation.
    const questionSourceDefault =
      prefRows[0]?.question_source_default === "fresh" ? "fresh" : "banked";
    const reasoningStreamDefault = prefRows[0]?.reasoning_stream_default !== false;

    return Response.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        // Question Review (migration 066) — gates the header link. getUser already read it.
        canReviewQuestions: user.canReviewQuestions,
        hasApiKey,
        hasTavilyKey,
        hasVoiceKey,
        stemDetailDefault,
        questionSourceDefault,
        reasoningStreamDefault,
        introSeen: prefRows[0]?.intro_seen === true,
        tourSeen: prefRows[0]?.tour_seen === true,
        walkthroughSeen: prefRows[0]?.walkthrough_seen === true,
        coachWalkthroughSeen: prefRows[0]?.coach_walkthrough_seen === true,
        practicalWalkthroughSeen: prefRows[0]?.practical_walkthrough_seen === true,
        theoryWalkthroughSeen: prefRows[0]?.theory_walkthrough_seen === true,
        examDate: prefRows[0]?.exam_date
          ? String(prefRows[0].exam_date).slice(0, 10)
          : null,
        lastDrillConfig: prefRows[0]?.last_drill_config ?? null,
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
