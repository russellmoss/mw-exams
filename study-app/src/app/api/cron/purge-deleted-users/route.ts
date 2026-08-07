import { neon } from "@neondatabase/serverless";
import { isCronAuthorized } from "@/lib/cron-auth";
import { DELETION_GRACE_DAYS, purgeExpiredUsers } from "@/lib/user-deletion";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Phase two of account deletion: hard-purge the accounts whose grace period has run out.
 *
 * Scheduled from .github/workflows/purge-deleted-users-daily.yml, NOT from a Vercel cron. The
 * Hobby plan caps `crons` in vercel.json at two jobs and both slots are taken (sweep-feedback,
 * bank-worker). A third makes Vercel reject the deployment at creation time — no failed build to
 * look at, and git auto-deploy silently stops for every later commit. See CLAUDE.md.
 *
 * Auth is the shared cron gate: `Authorization: Bearer $CRON_SECRET`, or an admin session so it
 * can be triggered on demand.
 *
 * Safe to run as often as you like — it only ever touches rows already past their purge date.
 */
export async function GET(request: Request) {
  if (!(await isCronAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 1), 500);

    const sql = neon(process.env.DATABASE_URL!);
    const { purged, pending } = await purgeExpiredUsers(sql, { limit });

    // Log the ids: once the rows are gone this is the only record that the purge happened.
    if (purged.length > 0) {
      console.log(
        `[purge-deleted-users] purged ${purged.length} account(s): ` +
          purged.map((u) => `#${u.id}`).join(", ")
      );
    }

    return Response.json({
      ok: true,
      purgedCount: purged.length,
      purgedIds: purged.map((u) => u.id),
      stillPending: pending,
      graceDays: DELETION_GRACE_DAYS,
    });
  } catch (err) {
    console.error("purge-deleted-users error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Purge failed" },
      { status: 500 }
    );
  }
}
