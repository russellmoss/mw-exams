// Type-only: this module never constructs a client, it operates on one handed in by the caller.
// Keeping the import erasable means the constants and date helpers below can be imported by client
// components (the Settings and admin pages) without pulling the Postgres driver into the bundle.
import type { NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Account deletion: the shared machinery behind both entry points — a user deleting themselves
 * from Settings, and an admin deleting someone from the admin console.
 *
 * Deletion is two-phase:
 *
 *   1. SOFT DELETE, immediately. `users.deleted_at` is stamped and `is_active` is set false. The
 *      account is locked out the moment it is requested — `is_active = false` is already the gate
 *      every auth path checks (getUser, login, the Google callback, forgot-password, the admin
 *      invite/reset senders), so no new lockout logic is needed. Credentials that could be used to
 *      get back in — API keys, outstanding password-reset tokens — are destroyed right here rather
 *      than waiting out the window.
 *
 *   2. HARD PURGE, after DELETION_GRACE_DAYS. `purgeExpiredUsers` runs daily from
 *      .github/workflows/purge-deleted-users-daily.yml and issues a plain `DELETE FROM users`.
 *
 * The purge is one statement because migration 060 moved the cascade into the schema. Every column
 * that references users now carries an explicit ON DELETE rule: CASCADE for the person's own
 * content, SET NULL for rows that merely mention them (the cost/usage ledger behind the admin Cost
 * dashboard, and the shared question bank they contributed to — those survive, anonymized).
 *
 * Do not reintroduce a hand-written list of DELETEs here. The previous implementation did that and
 * got it wrong twice: it ordered live_tasting_papers before the sessions referencing them, which
 * made deletion impossible for any user who had run a Live Tasting paper, and it silently missed
 * the twelve columns that had no foreign key at all. If a new table needs to participate, give it
 * an FK in a migration — that way it cannot be forgotten.
 */

// The concrete shape `neon(url)` returns. Writing it as ReturnType<typeof neon> would widen the
// generics to <boolean, boolean>, which callers' <false, false> clients are not assignable to.
type Sql = NeonQueryFunction<false, false>;

/** How long a deleted account is recoverable before it is purged for good. */
export const DELETION_GRACE_DAYS = 30;

/** The exact phrase the Settings modal makes a user type to delete their own account. */
export const SELF_DELETE_CONFIRMATION_PHRASE = "I want to delete my account";

/** The date a pending-deletion account gets purged. One implementation so the UI, the API error
 *  messages and the job can never quote different dates for the same account. */
export function purgeDateFor(deletedAt: Date | string): Date {
  const base = typeof deletedAt === "string" ? new Date(deletedAt) : deletedAt;
  const due = new Date(base);
  due.setUTCDate(due.getUTCDate() + DELETION_GRACE_DAYS);
  return due;
}

/** Human-readable purge date, e.g. "6 September 2026". Pinned to en-GB/UTC rather than the
 *  server locale so the date in an API error matches the date the UI renders. */
export function formatPurgeDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export class DeletionBlockedError extends Error {}

/**
 * Refuse to delete the last active admin. Losing every admin locks the whole app's administration
 * out permanently — there is no console to promote someone from.
 *
 * Pending-deletion admins do not count towards the total: they are already `is_active = false`, so
 * two admins deleting themselves in sequence still trips this on the second one.
 */
export async function assertNotLastAdmin(sql: Sql, userId: number): Promise<void> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS count FROM users
    WHERE is_admin = true AND is_active = true AND deleted_at IS NULL AND id != ${userId}
  `) as { count: number }[];

  if ((rows[0]?.count ?? 0) === 0) {
    throw new DeletionBlockedError(
      "This is the only active admin account. Promote another admin before deleting it."
    );
  }
}

export interface PendingDeletion {
  id: number;
  email: string;
  deletedAt: Date;
  purgeDate: Date;
}

/**
 * Read the pending-deletion state of an account, or null if it is not scheduled for deletion.
 * Used by the auth routes to explain *why* a login was refused, and by the admin UI to badge rows.
 */
export async function getPendingDeletion(
  sql: Sql,
  where: { id: number } | { email: string }
): Promise<PendingDeletion | null> {
  const rows = (await ("id" in where
    ? sql`SELECT id, email, deleted_at FROM users WHERE id = ${where.id} AND deleted_at IS NOT NULL`
    : sql`SELECT id, email, deleted_at FROM users WHERE email = ${where.email} AND deleted_at IS NOT NULL`)) as {
    id: number;
    email: string;
    deleted_at: string;
  }[];

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    deletedAt: new Date(row.deleted_at),
    purgeDate: purgeDateFor(row.deleted_at),
  };
}

/**
 * Schedule an account for deletion and lock it immediately.
 *
 * `actorId` is the admin who did it, or null when the user deleted themselves.
 *
 * Idempotent by design: `deleted_at` is only stamped when it is still NULL, so a double-submit
 * cannot quietly extend somebody's grace period by another 30 days.
 */
export async function softDeleteUser(
  sql: Sql,
  userId: number,
  actorId: number | null
): Promise<PendingDeletion> {
  // Both fields are gated on the OLD deleted_at (the right-hand side of an UPDATE sees pre-update
  // values), so the first request wins outright. COALESCE would not do for deleted_by: a
  // self-deletion legitimately records NULL, and COALESCE cannot tell that apart from "unset",
  // so a later admin call would silently rewrite a self-deletion as an admin one.
  const rows = (await sql`
    UPDATE users
       SET deleted_at = COALESCE(deleted_at, now()),
           deleted_by = CASE WHEN deleted_at IS NULL THEN ${actorId} ELSE deleted_by END,
           is_active  = false
     WHERE id = ${userId}
     RETURNING id, email, deleted_at
  `) as { id: number; email: string; deleted_at: string }[];

  if (rows.length === 0) throw new DeletionBlockedError("User not found.");

  // Revoke the ways back in now, not in 30 days. A BYOK key left live on a deleted account keeps
  // spending the owner's Anthropic credit, and an outstanding reset link would let somebody walk
  // straight past the is_active gate by setting a new password.
  await sql`DELETE FROM user_api_keys WHERE user_id = ${userId}`;
  await sql`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`;

  const row = rows[0];
  return {
    id: row.id,
    email: row.email,
    deletedAt: new Date(row.deleted_at),
    purgeDate: purgeDateFor(row.deleted_at),
  };
}

/**
 * Cancel a pending deletion and reactivate the account. Only reachable while the row still exists —
 * once the purge has run there is nothing to restore.
 *
 * Note the deleted API keys and reset tokens do NOT come back; the user re-adds a key if they want
 * one. Restoring a credential we deliberately revoked would be the wrong default.
 */
export async function restoreUser(sql: Sql, userId: number): Promise<boolean> {
  const rows = (await sql`
    UPDATE users
       SET deleted_at = NULL, deleted_by = NULL, is_active = true
     WHERE id = ${userId} AND deleted_at IS NOT NULL
     RETURNING id
  `) as { id: number }[];

  return rows.length > 0;
}

/**
 * Irreversibly remove a user and everything migration 060 says travels with them.
 * Exported mainly so tests and the admin path can force a purge without waiting 30 days.
 */
export async function purgeUser(sql: Sql, userId: number): Promise<boolean> {
  const rows = (await sql`DELETE FROM users WHERE id = ${userId} RETURNING id`) as { id: number }[];
  return rows.length > 0;
}

export interface PurgeResult {
  purged: { id: number; email: string }[];
  /** Accounts still inside their grace period — reported so a quiet run is distinguishable from
   *  a broken one in the workflow log. */
  pending: number;
}

/**
 * Purge every account whose grace period has elapsed. Called by the daily job.
 *
 * `limit` bounds a single run so a large backlog cannot exceed the route's time budget; the job
 * runs daily and drains the rest on the next pass.
 */
export async function purgeExpiredUsers(sql: Sql, { limit = 100 } = {}): Promise<PurgeResult> {
  const due = (await sql`
    SELECT id, email FROM users
     WHERE deleted_at IS NOT NULL
       AND deleted_at < now() - make_interval(days => ${DELETION_GRACE_DAYS})
     ORDER BY deleted_at
     LIMIT ${limit}
  `) as { id: number; email: string }[];

  const purged: { id: number; email: string }[] = [];
  for (const user of due) {
    // One at a time: a single user whose purge fails should not strand the rest of the batch.
    try {
      if (await purgeUser(sql, user.id)) purged.push(user);
    } catch (err) {
      console.error(`[purge-deleted-users] failed to purge user ${user.id}:`, err);
    }
  }

  const pendingRows = (await sql`
    SELECT COUNT(*)::int AS count FROM users WHERE deleted_at IS NOT NULL
  `) as { count: number }[];

  return { purged, pending: pendingRows[0]?.count ?? 0 };
}
