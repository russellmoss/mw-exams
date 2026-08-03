import { getUser } from "@/lib/auth";
import { getBankStatusCounts } from "@/lib/db";

export const runtime = "nodejs";
// Never cache the nav-dot count — a stale value would hide (or invent) a batch waiting for review.
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/bank/pending-count — admin-only.
 *
 * The total number of generated questions sitting in 'pending' across all papers (plus a per-paper
 * breakdown), for the amber dot on the NavBar / UserMenu "Bank" links. Non-admins get a zeroed
 * payload so the nav renders no dot.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ pending: 0, papers: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const counts = await getBankStatusCounts();
  const papers = [1, 2, 3].map((paper) => {
    const c = counts.find((x) => x.paper === paper);
    return { paper, approved: c?.approved ?? 0, pending: c?.pending ?? 0 };
  });
  const pending = papers.reduce((sum, p) => sum + p.pending, 0);

  return Response.json({ pending, papers }, { headers: { "Cache-Control": "no-store" } });
}
