import { getUser } from "@/lib/auth";
import { getLiveTastingPaper, stampPaperBriefSelfOpened } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/live-tasting/paper/[id]/open-brief — the candidate chose "Me" for the paper brief.
 * Set-once; the paper GET serves them the brief (and per-flight self entry) from here on.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  const { id } = await params;

  const paper = await getLiveTastingPaper(id, user.id);
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });
  if (paper.mode !== "byo" || paper.abandoned_at) {
    return Response.json({ error: "Nothing to open" }, { status: 409 });
  }

  await stampPaperBriefSelfOpened(paper.id);
  return Response.json({ ok: true });
}
