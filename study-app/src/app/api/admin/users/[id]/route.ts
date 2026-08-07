import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import {
  assertNotLastAdmin,
  DeletionBlockedError,
  DELETION_GRACE_DAYS,
  softDeleteUser,
} from "@/lib/user-deletion";

export const runtime = "nodejs";

/**
 * GET /api/admin/users/[id] — everything the user-management modal shows: signup profile, auth
 * methods (password / Google), API-key status, attempt counts, and Live Tasting market.
 * Never returns the password hash itself — only whether one exists.
 */
export async function GET(
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
    const rows = await sql`
      SELECT
        u.id, u.email, u.name, u.address, u.business, u.job_title,
        u.is_admin, u.is_active, u.created_at, u.avatar_url, u.deleted_at,
        (u.password_hash IS NOT NULL) AS has_password,
        (u.google_sub IS NOT NULL) AS google_linked,
        u.live_city, u.live_state, u.live_country,
        u.live_budget_amount, u.live_budget_currency, u.live_radius_minutes,
        CASE WHEN k.id IS NOT NULL THEN true ELSE false END AS has_own_key,
        k.key_hint,
        COUNT(DISTINCT a.id)::int AS attempt_count,
        COUNT(DISTINCT CASE WHEN a.completed_at IS NOT NULL THEN a.id END)::int AS completed_count
      FROM users u
      LEFT JOIN user_api_keys k ON u.id = k.user_id AND k.provider = 'anthropic'
      LEFT JOIN user_attempts a ON u.id = a.user_id
        AND a.mode IS DISTINCT FROM 'theory'
      WHERE u.id = ${targetId}
      GROUP BY u.id, k.id, k.key_hint
    `;
    if (rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json({ user: rows[0] });
  } catch (err) {
    console.error("GET admin/users/[id] error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users/[id] — role/status toggles (isAdmin/isActive, self-guarded) plus the
 * profile and Live Tasting location fields the modal edits. Profile edits are allowed on your own
 * account; only the role/status toggles are not.
 */
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

    const body = await request.json();
    const sql = neon(process.env.DATABASE_URL!);

    if (typeof body.isAdmin === "boolean" || typeof body.isActive === "boolean") {
      // Prevent self-demotion / self-lockout
      if (targetId === user.id) {
        return Response.json({ error: "Cannot modify your own admin status" }, { status: 400 });
      }
      // An account scheduled for deletion is is_active = false by design. Letting the ordinary
      // Enable toggle clear that would put a user back in circulation while the purge job still
      // has them queued — they'd be deleted for real, without warning, on some later night.
      const pending = (await sql`
        SELECT deleted_at FROM users WHERE id = ${targetId} AND deleted_at IS NOT NULL
      `) as { deleted_at: string }[];
      if (pending.length > 0) {
        return Response.json(
          { error: "This account is scheduled for deletion. Restore it first." },
          { status: 409 }
        );
      }
      if (typeof body.isAdmin === "boolean") {
        await sql`UPDATE users SET is_admin = ${body.isAdmin} WHERE id = ${targetId}`;
      }
      if (typeof body.isActive === "boolean") {
        await sql`UPDATE users SET is_active = ${body.isActive} WHERE id = ${targetId}`;
      }
    }

    // Profile fields. Only the keys present in the body are written, so the role-toggle calls
    // from the user list (which send no profile keys) leave the profile untouched.
    if (typeof body.name === "string") {
      const name = body.name.trim().slice(0, 200);
      if (!name) return Response.json({ error: "Name cannot be empty" }, { status: 400 });
      await sql`UPDATE users SET name = ${name} WHERE id = ${targetId}`;
    }

    if (typeof body.email === "string") {
      const email = body.email.trim().toLowerCase().slice(0, 320);
      if (!email || !email.includes("@")) {
        return Response.json({ error: "Invalid email" }, { status: 400 });
      }
      const clash = await sql`SELECT id FROM users WHERE email = ${email} AND id != ${targetId}`;
      if (clash.length > 0) {
        return Response.json({ error: "Email already in use by another account" }, { status: 409 });
      }
      await sql`UPDATE users SET email = ${email} WHERE id = ${targetId}`;
    }

    if ("address" in body) {
      const address = typeof body.address === "string" ? body.address.trim().slice(0, 500) : "";
      await sql`UPDATE users SET address = ${address || null} WHERE id = ${targetId}`;
    }
    if ("business" in body) {
      const business = typeof body.business === "string" ? body.business.trim().slice(0, 200) : "";
      await sql`UPDATE users SET business = ${business || null} WHERE id = ${targetId}`;
    }
    if ("jobTitle" in body) {
      const jobTitle = typeof body.jobTitle === "string" ? body.jobTitle.trim().slice(0, 200) : "";
      await sql`UPDATE users SET job_title = ${jobTitle || null} WHERE id = ${targetId}`;
    }

    // Live Tasting market. City/country may be cleared here (unlike the self-serve route) — an
    // admin removing a stale location is legitimate; the Live Tasting flow re-prompts for it.
    if ("liveCity" in body) {
      const liveCity = typeof body.liveCity === "string" ? body.liveCity.trim().slice(0, 120) : "";
      await sql`UPDATE users SET live_city = ${liveCity || null} WHERE id = ${targetId}`;
    }
    if ("liveState" in body) {
      const liveState = typeof body.liveState === "string" ? body.liveState.trim().slice(0, 80) : "";
      await sql`UPDATE users SET live_state = ${liveState || null} WHERE id = ${targetId}`;
    }
    if ("liveCountry" in body) {
      const liveCountry = typeof body.liveCountry === "string" ? body.liveCountry.trim().slice(0, 80) : "";
      await sql`UPDATE users SET live_country = ${liveCountry || null} WHERE id = ${targetId}`;
    }

    const rows = await sql`
      SELECT id, email, name, address, business, job_title, is_admin, is_active, deleted_at,
             live_city, live_state, live_country
      FROM users WHERE id = ${targetId}
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

/**
 * DELETE /api/admin/users/[id] — an admin deletes someone else's account.
 *
 * Schedules the deletion (locked out now, purged from the database in DELETION_GRACE_DAYS) rather
 * than dropping the row on the spot, so a mistaken click is recoverable via the restore route.
 *
 * Two guards beyond the admin check: an admin cannot delete themselves from here (that is what the
 * Settings flow is for, and it carries its own typed confirmation), and the last active admin
 * cannot be deleted at all. The caller must also echo back the target's email address, which is
 * the safeguard against deleting the wrong row in a list of forty similar-looking users.
 */
export async function DELETE(
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

    if (targetId === user.id) {
      return Response.json(
        { error: "Use Settings to delete your own account." },
        { status: 400 }
      );
    }

    const sql = neon(process.env.DATABASE_URL!);

    const rows = (await sql`SELECT id, email FROM users WHERE id = ${targetId}`) as {
      id: number;
      email: string;
    }[];
    if (rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    const target = rows[0];

    const body = await request.json().catch(() => ({}));
    const confirmation = typeof body?.confirmation === "string" ? body.confirmation.trim() : "";
    if (confirmation.toLowerCase() !== target.email.toLowerCase()) {
      return Response.json(
        { error: `Confirmation does not match. Type the account's email exactly: ${target.email}` },
        { status: 400 }
      );
    }

    try {
      await assertNotLastAdmin(sql, targetId);
    } catch (err) {
      if (err instanceof DeletionBlockedError) {
        return Response.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    const pending = await softDeleteUser(sql, targetId, user.id);

    return Response.json({
      success: true,
      user: { id: pending.id, email: pending.email },
      deletedAt: pending.deletedAt.toISOString(),
      purgeDate: pending.purgeDate.toISOString(),
      graceDays: DELETION_GRACE_DAYS,
    });
  } catch (err) {
    console.error("DELETE admin/users/[id] error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
