import { getUser } from "@/lib/auth";
import { getBankStatusCounts } from "@/lib/db";
import { getGenerationLean } from "@/lib/bank-health/country-balance";

export const runtime = "nodejs";

/**
 * GET /api/admin/bank/counts — admin-only.
 *
 * Per-paper live bank counts plus the total pending-review count. Feeds the "Bank Review" card
 * lines and, crucially, the amber dot on the NavBar "Bank" link (which polls this on mount + every
 * 60s). Non-admins get a zeroed payload so the nav renders nothing.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ papers: [], pending: 0 });
  }

  const [counts, lean] = await Promise.all([getBankStatusCounts(), getGenerationLean()]);
  const papers = [1, 2, 3].map((paper) => {
    const c = counts.find((x) => x.paper === paper);
    return { paper, approved: c?.approved ?? 0, pending: c?.pending ?? 0 };
  });
  const pending = papers.reduce((sum, p) => sum + p.pending, 0);

  // Country Balance (always-on): the light origins the next batches will lean toward, so the generate
  // panel can render its one-line hint without a separate request. Empty when the read is
  // insufficient or nothing is light.
  return Response.json({ papers, pending, leaningToward: lean });
}
