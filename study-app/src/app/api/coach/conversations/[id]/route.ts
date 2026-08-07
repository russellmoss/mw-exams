import { getUser } from "@/lib/auth";
import { archiveConversation, loadConversationForDisplay } from "@/lib/coach/store";

export const runtime = "nodejs";

/**
 * GET /api/coach/conversations/[id] — reopen a past conversation.
 * DELETE /api/coach/conversations/[id] — archive it (hidden from the list; rows retained).
 *
 * Both scope on user_id inside the query rather than checking ownership afterwards, and both return
 * 404 rather than 403 for someone else's id — a 403 confirms the id exists.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

  const { id } = await params;
  const { messages, ratings } = await loadConversationForDisplay(id, user.id);
  if (messages.length === 0) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json({
    conversationId: id,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.role,
      text: m.text ?? "",
      toolsUsed: m.tools_used ?? [],
      restricted: m.attempt_state === "in_progress" || m.attempt_state === "submitted",
    })),
    ratings: Object.fromEntries(ratings.map((r) => [r.message_id, r.rating])),
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

  const { id } = await params;
  const ok = await archiveConversation(id, user.id);
  if (!ok) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ ok: true });
}
