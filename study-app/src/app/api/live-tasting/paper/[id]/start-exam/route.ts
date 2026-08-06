import { getUser } from "@/lib/auth";
import { getLiveTastingPaper, getPaperSessions, startPaperExam } from "@/lib/db";
import { examDurationMinutes } from "@/lib/live-tasting-paper";
import { paperComposition } from "@/lib/live-tasting-paper-engine";

export const runtime = "nodejs";

/**
 * POST /api/live-tasting/paper/[id]/start-exam — start the real clock (exam-conditions papers).
 * Set-once: 2h15 for a full paper, pro-rata for half. Requires every flight generated — you
 * can't sit an exam whose questions don't exist yet.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  const { id } = await params;

  const paper = await getLiveTastingPaper(id, user.id);
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });
  if (paper.pacing !== "exam-conditions") {
    return Response.json({ error: "This paper is flight-by-flight — no clock to start" }, { status: 409 });
  }
  const children = await getPaperSessions(paper.id);
  if (children.length < paperComposition(paper).length) {
    return Response.json({ error: "Not every flight is generated yet" }, { status: 409 });
  }

  const minutes = examDurationMinutes(paper.size as "half" | "full");
  const deadline = new Date(Date.now() + minutes * 60_000);
  await startPaperExam(paper.id, deadline);
  return Response.json({ ok: true, deadlineAt: deadline.toISOString(), minutes });
}
