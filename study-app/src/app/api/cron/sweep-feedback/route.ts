import { getUser } from "@/lib/auth";
import { sweepStrandedFeedback } from "@/lib/feedback-analysis";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Self-healing sweeper: analyzes feedback that was submitted but never analyzed
 * (the "stranded" set — user_feedback present, auto_analysis_id NULL, feedback_status NULL).
 * The primary fix is server-side triggering in /api/save-attempt; this is the safety net
 * for anything that still slips through (e.g. a save-attempt invocation killed mid-`after()`).
 *
 * Auth: Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. We also allow an admin user
 * (so it can be run on demand from an authenticated session). Processes a small batch per call;
 * repeated runs drain any backlog.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  let authorized = isCron;
  if (!authorized) {
    const user = await getUser(request);
    authorized = !!user?.isAdmin;
  }
  if (!authorized) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "3", 10) || 3, 1), 10);
    const result = await sweepStrandedFeedback(limit);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("sweep-feedback error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Sweep failed" },
      { status: 500 }
    );
  }
}
