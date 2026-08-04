import { getUser } from "@/lib/auth";
import { getProducerTally, getFlaggedPendingCount } from "@/lib/db";
import { PRODUCER_ROWS_LIMIT } from "@/lib/bank-health/producer";

export const runtime = "nodejs";

/**
 * GET /api/admin/bank-health/producers?paper=all|1|2|3[&all=1] — admin-only.
 *
 * The Producer Spread payload for the Bank Health card: the paper's servable-wine total, distinct
 * producer count, the widest single producer's share, the number of flagged items awaiting review, and
 * the producer rows (top 12 by count, or the full list when all=1). Statuses/shares are computed from
 * the edit-in-one-place config (src/lib/bank-health/producer.ts).
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const rawPaper = params.get("paper");
  const paper: number | "all" =
    rawPaper === "1" || rawPaper === "2" || rawPaper === "3" ? Number(rawPaper) : "all";
  const expandAll = params.get("all") === "1";

  try {
    const [tally, flaggedCount] = await Promise.all([
      getProducerTally(paper),
      getFlaggedPendingCount(paper),
    ]);
    const rows = expandAll ? tally.rows : tally.rows.slice(0, PRODUCER_ROWS_LIMIT);
    return Response.json(
      {
        paper: paper === "all" ? "all" : paper,
        total_wines: tally.total_wines,
        distinct_producers: tally.distinct_producers,
        widest_share: tally.widest_share,
        flagged_count: flaggedCount,
        rows,
        truncated: !expandAll && tally.rows.length > PRODUCER_ROWS_LIMIT,
      },
      { headers: { "Cache-Control": "private, max-age=60" } }
    );
  } catch (err) {
    console.error("[producer-spread] aggregation failed:", err);
    return Response.json({ error: "Couldn't read producer spread right now." }, { status: 500 });
  }
}
