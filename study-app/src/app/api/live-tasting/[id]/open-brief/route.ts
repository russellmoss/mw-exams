import { getUser } from "@/lib/auth";
import { getLiveTastingSession, stampBriefSelfOpened } from "@/lib/db";
import { deriveSessionState } from "@/lib/live-tasting";

export const runtime = "nodejs";

/**
 * POST /api/live-tasting/[id]/open-brief — the candidate chose "Me" in the brief chooser.
 * Set-once stamp; from here the prep payload serves them the brief (they will also be the one
 * entering the wines, which is where the wine-level reveal stamp happens).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  const { id } = await params;

  const session = await getLiveTastingSession(id, user.id);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  if (deriveSessionState(session) !== "prep") {
    return Response.json({ error: "This session is past prep" }, { status: 409 });
  }

  await stampBriefSelfOpened(session.id);
  return Response.json({ ok: true });
}
