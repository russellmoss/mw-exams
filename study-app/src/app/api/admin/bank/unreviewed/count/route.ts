import { getUser } from "@/lib/auth";
import { getUnreviewedCount } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/admin/bank/unreviewed/count — admin-only.
 *
 * Cheap { total } for the Unreviewed count pill / "Start reviewing" gate. Non-admins get 0.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ total: 0 });
  }
  const total = await getUnreviewedCount();
  return Response.json({ total });
}
