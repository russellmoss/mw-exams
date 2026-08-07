import { getUser } from "@/lib/auth";
import { messageBelongsToUser, rateMessage } from "@/lib/coach/store";

export const runtime = "nodejs";

const MAX_COMMENT = 2000;

/**
 * POST /api/coach/feedback — thumbs up/down on one Coach reply.
 * Body: { messageId: number, rating: 'up' | 'down', comment?: string }
 *
 * Separate from /api/feedback on purpose. That route writes user_attempts rows destined for the
 * examiner-feedback pipeline, which analyses claims about QUESTIONS. A rating of a chat reply is a
 * different object with a different reader, and mixing them would put chat transcripts into the
 * queue an admin triages for question quality.
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const messageId = Number(body?.messageId);
  const rating = body?.rating === "up" ? "up" : body?.rating === "down" ? "down" : null;

  if (!Number.isInteger(messageId) || messageId <= 0) {
    return Response.json({ error: "messageId is required" }, { status: 400 });
  }
  if (!rating) return Response.json({ error: "rating must be 'up' or 'down'" }, { status: 400 });

  const comment =
    typeof body?.comment === "string" && body.comment.trim()
      ? body.comment.trim().slice(0, MAX_COMMENT)
      : null;

  // 404 rather than 403 for a message the user doesn't own — a 403 would confirm the id exists.
  if (!(await messageBelongsToUser(messageId, user.id))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  await rateMessage({ messageId, userId: user.id, rating, comment });
  return Response.json({ ok: true });
}
