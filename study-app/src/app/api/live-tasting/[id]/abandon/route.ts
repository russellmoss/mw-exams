import { getUser } from "@/lib/auth";
import { getLiveTastingSession, stampLiveTastingEvent } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/live-tasting/[id]/abandon — dismiss a session. Set-once; the share page 404s from
 * this moment (getLiveTastingSessionByTokenHash filters abandoned sessions out).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  const { id } = await params;

  const session = await getLiveTastingSession(id, user.id);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  if (session.graded_at) return Response.json({ error: "Already graded" }, { status: 409 });

  await stampLiveTastingEvent(session.id, "abandoned_at");
  return Response.json({ ok: true });
}
