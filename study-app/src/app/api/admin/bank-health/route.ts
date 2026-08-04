import { getUser } from "@/lib/auth";
import { getBankHealthCached } from "@/lib/bank-health/aggregate";

export const runtime = "nodejs";

/**
 * GET /api/admin/bank-health — admin-only.
 *
 * The full Bank Health payload: totals, every benchmarked slice, and the benchmark year list. The
 * aggregation runs as SQL GROUP BY over the servable pool and is memoised for 60s (see
 * getBankHealthCached), so the page and its polling never re-scan on every request.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const payload = await getBankHealthCached();
    return Response.json(payload, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    console.error("[bank-health] aggregation failed:", err);
    return Response.json({ error: "Couldn't read bank health right now." }, { status: 500 });
  }
}
