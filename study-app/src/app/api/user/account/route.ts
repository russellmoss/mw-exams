import { getUser, clearSessionCookie } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import {
  assertNotLastAdmin,
  DeletionBlockedError,
  DELETION_GRACE_DAYS,
  SELF_DELETE_CONFIRMATION_PHRASE,
  softDeleteUser,
} from "@/lib/user-deletion";

export const runtime = "nodejs";

/**
 * DELETE /api/user/account — the caller deletes their own account.
 *
 * Schedules the deletion and signs them out immediately; the account is unusable from this moment
 * and is purged from the database DELETION_GRACE_DAYS later by the daily job. See
 * src/lib/user-deletion.ts for what survives the purge (anonymized) and what does not.
 *
 * The confirmation phrase is re-checked here, not just in the modal, so the destructive path can
 * never be reached by a bare curl or by a UI bug.
 */
export async function DELETE(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    if (body?.confirmation !== SELF_DELETE_CONFIRMATION_PHRASE) {
      return Response.json(
        { error: `Confirmation phrase does not match. Type exactly: ${SELF_DELETE_CONFIRMATION_PHRASE}` },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    if (user.isAdmin) {
      try {
        await assertNotLastAdmin(sql, user.id);
      } catch (err) {
        if (err instanceof DeletionBlockedError) {
          return Response.json({ error: err.message }, { status: 400 });
        }
        throw err;
      }
    }

    const pending = await softDeleteUser(sql, user.id, null);

    return Response.json(
      {
        success: true,
        purgeDate: pending.purgeDate.toISOString(),
        graceDays: DELETION_GRACE_DAYS,
      },
      { headers: { "Set-Cookie": clearSessionCookie() } }
    );
  } catch (err) {
    console.error("DELETE /api/user/account error:", err);
    return Response.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
