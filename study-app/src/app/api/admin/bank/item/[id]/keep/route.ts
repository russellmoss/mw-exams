import { getUser } from "@/lib/auth";
import { reviewBankQuestion } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/admin/bank/item/[id]/keep — admin-only.
 *
 * Approve one pending banked question (status pending → approved) so it becomes servable to
 * candidates. [id] is the generated question's id. Scoped to pending rows, so a double-tap is a
 * harmless no-op.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const result = await reviewBankQuestion(id, "keep", user.id);
  if (!result || !result.changed) {
    return Response.json({ ok: true, changed: false });
  }
  return Response.json({ ok: true, changed: true });
}
