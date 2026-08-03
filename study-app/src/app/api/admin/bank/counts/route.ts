import { getUser } from "@/lib/auth";
import { getBankStatusCounts } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/bank/counts — admin-only.
 *
 * Per-paper live bank counts plus the total pending-review count. Feeds the "Fill the Bank" card
 * lines and, crucially, the amber dot on the NavBar "Bank" link (which polls this on mount + every
 * 60s). Non-admins get a zeroed payload so the nav renders nothing.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ papers: [], pending: 0 });
  }

  const counts = await getBankStatusCounts();
  const papers = [1, 2, 3].map((paper) => {
    const c = counts.find((x) => x.paper === paper);
    return { paper, approved: c?.approved ?? 0, pending: c?.pending ?? 0 };
  });
  const pending = papers.reduce((sum, p) => sum + p.pending, 0);

  return Response.json({ papers, pending });
}
