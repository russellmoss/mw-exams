import { getUser, clearSessionCookie } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";

// The exact phrase the settings modal makes the user type. Re-checked server-side so the
// destructive path can never be reached by a bare curl or a UI bug.
const CONFIRMATION_PHRASE = "I want to delete my account";

/**
 * DELETE /api/user/account — permanently delete the calling user's own account.
 *
 * Removes the user row plus every row that belongs to them (attempts, feedback analyses,
 * question views, Live Tasting sessions/papers). API keys and outstanding password-reset
 * tokens go via ON DELETE CASCADE. Feature requests they filed are kept (they document
 * shipped work) with created_by nulled out.
 */
export async function DELETE(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (body?.confirmation !== CONFIRMATION_PHRASE) {
      return Response.json(
        { error: `Confirmation phrase does not match. Type exactly: ${CONFIRMATION_PHRASE}` },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    // An admin may not delete the account that would leave the app without one.
    if (user.isAdmin) {
      const admins = await sql`
        SELECT COUNT(*)::int AS count FROM users
        WHERE is_admin = true AND is_active = true AND id != ${user.id}
      `;
      if ((admins[0]?.count ?? 0) === 0) {
        return Response.json(
          { error: "You are the only active admin. Promote another admin before deleting this account." },
          { status: 400 }
        );
      }
    }

    // One transaction so a mid-way failure can't leave a half-deleted account.
    // user_attempts ↔ feedback_analyses reference each other, so the attempts' analysis
    // link is nulled first to break the cycle. feedback_analyses is cleared by user_id OR
    // attempt ownership — an analysis row must not survive pointing at a deleted attempt.
    await sql.transaction([
      sql`UPDATE feature_requests SET created_by = NULL WHERE created_by = ${user.id}`,
      sql`UPDATE user_attempts SET auto_analysis_id = NULL WHERE user_id = ${user.id}`,
      sql`DELETE FROM live_tasting_papers WHERE user_id = ${user.id}`,
      sql`DELETE FROM live_tasting_sessions WHERE user_id = ${user.id}`,
      sql`DELETE FROM feedback_analyses WHERE user_id = ${user.id}
          OR attempt_id IN (SELECT id FROM user_attempts WHERE user_id = ${user.id})`,
      sql`DELETE FROM user_attempts WHERE user_id = ${user.id}`,
      sql`DELETE FROM question_views WHERE user_id = ${user.id}`,
      sql`DELETE FROM users WHERE id = ${user.id}`,
    ]);

    return Response.json(
      { success: true },
      { headers: { "Set-Cookie": clearSessionCookie() } }
    );
  } catch (err) {
    console.error("DELETE /api/user/account error:", err);
    return Response.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
