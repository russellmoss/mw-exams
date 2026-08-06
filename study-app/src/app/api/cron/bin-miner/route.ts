import { isCronAuthorized } from "@/lib/cron-auth";
import { mineBinFixProposals, reconcileBinFixProposals } from "@/lib/bin-fix-miner";

export const runtime = "nodejs";
// One Opus-class mining call + a handful of GitHub PR lookups.
export const maxDuration = 300;

/**
 * GET /api/cron/bin-miner — the daily heartbeat of the codify-and-retire loop (migration 042).
 *
 * Two steps, both idempotent:
 *   1. Reconcile in-flight fix PRs against GitHub — a merged fix retires its cluster's ledger rows
 *      from the digest/lessons prompt feeds and refreshes the lessons summary (the admin UI also
 *      does this on load; this covers days nobody opens the page).
 *   2. Mine the live ledger for NEW recurring-fault clusters and store proposals for admin review.
 *      Mining needs the server ANTHROPIC_API_KEY; without one it skips and says so.
 *
 * Driven by .github/workflows/bin-fix-miner-daily.yml (the GitHub-Actions-not-Vercel-crons pattern —
 * the Hobby plan's 2-cron budget stays with bank-worker). Auth: Bearer CRON_SECRET or admin session.
 */
export async function GET(request: Request) {
  if (!(await isCronAuthorized(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const reconciled = await reconcileBinFixProposals();
    const mined = await mineBinFixProposals({ source: "server" });
    return Response.json({
      ok: mined.status !== "error",
      reconciled,
      mining: { status: mined.status, created: mined.created.map((p) => ({ id: p.id, theme: p.theme })) },
    });
  } catch (err) {
    console.error("bin-miner cron error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Miner failed" },
      { status: 500 }
    );
  }
}
