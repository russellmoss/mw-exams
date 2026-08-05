import { getUser } from "@/lib/auth";
import { computeVarietyBalance } from "@/lib/bank-health/variety-balance";

export const runtime = "nodejs";

/**
 * GET /api/admin/bank-health/varieties?paper=all|1|2|3 — admin-only.
 *
 * The Grape Balance payload: per-paper wine totals and one row per tracked variety comparing the
 * bank's dominant-variety share against its historical corpus target, sorted by absolute shortfall
 * descending. `paper` re-scopes the read to a single paper (absent / 'all' = all three). Memoised for
 * 60s per scope (see computeVarietyBalance) so the panel's poll never re-scans.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const rawPaper = new URL(request.url).searchParams.get("paper");
  let scope: 1 | 2 | 3 | "all";
  if (rawPaper == null || rawPaper === "" || rawPaper === "all") {
    scope = "all";
  } else if (rawPaper === "1" || rawPaper === "2" || rawPaper === "3") {
    scope = Number(rawPaper) as 1 | 2 | 3;
  } else {
    return Response.json({ error: "Invalid paper" }, { status: 400 });
  }

  try {
    const balance = await computeVarietyBalance(scope);
    return Response.json(
      { paperTotals: balance.paperTotals, rows: balance.rows, version: balance.version },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (err) {
    console.error("[grape-balance] aggregation failed:", err);
    return Response.json({ error: "Couldn't load grape coverage." }, { status: 500 });
  }
}
