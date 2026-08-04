import { getUser } from "@/lib/auth";

/**
 * Shared auth for the scheduled routes: /api/cron/sweep-feedback, /api/cron/bank-worker, and
 * /api/admin/bank/resume (which the bank worker self-calls when it hands off to a fresh
 * invocation). Callers send `Authorization: Bearer $CRON_SECRET`; an admin session is also
 * accepted so the routes can be run on demand from a logged-in browser.
 *
 * When CRON_SECRET is unset the bearer branch can never match, so *every* scheduled caller — the
 * Vercel crons, .github/workflows/bank-worker-hourly.yml, and the worker's own self-resume hop —
 * collects a 401 indistinguishable from an ordinary unauthorized request. That is precisely how
 * three jobs sat dead and unnoticed until 2026-08-03. Hence the console.error: a missing secret is
 * a server misconfiguration and belongs in the runtime logs. The response body stays generic on
 * purpose — callers get "Unauthorized" either way, since config state isn't worth advertising.
 */
export async function isCronAuthorized(request: Request): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error(
      "[cron-auth] CRON_SECRET is not set — every scheduled caller will be rejected with 401. " +
        "Set it in the Vercel project env (Production) and in the repo's Actions secrets with the " +
        "same value, then redeploy.",
    );
  } else if (request.headers.get("authorization") === `Bearer ${cronSecret}`) {
    return true;
  }

  const user = await getUser(request);
  return !!user?.isAdmin;
}
