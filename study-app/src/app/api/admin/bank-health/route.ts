import { getUser } from "@/lib/auth";
import { getBankHealthCached } from "@/lib/bank-health/aggregate";
import { parsePaperParam } from "@/lib/bank-health/paper-param";

export const runtime = "nodejs";

/**
 * GET /api/admin/bank-health?paper=1|2|3 — admin-only.
 *
 * The full Bank Health payload: totals, every benchmarked slice, and the benchmark year list. The
 * aggregation runs as SQL GROUP BY over the servable pool and is memoised for 60s (see
 * getBankHealthCached), so the page and its polling never re-scan on every request. An optional
 * `paper` param re-scopes every count/derivation to a single paper (absent = all three).
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const paper = parsePaperParam(new URL(request.url).searchParams.get("paper"));
  if (paper === "invalid") {
    return Response.json({ error: "Invalid paper" }, { status: 400 });
  }

  try {
    const payload = await getBankHealthCached(paper);
    return Response.json(payload, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    console.error("[bank-health] aggregation failed:", err);
    return Response.json({ error: "Couldn't read bank health right now." }, { status: 500 });
  }
}
