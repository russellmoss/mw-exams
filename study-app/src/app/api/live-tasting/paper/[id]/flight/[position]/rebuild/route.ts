import { getUser } from "@/lib/auth";
import {
  getLiveTastingPaper,
  getPaperSessions,
  getUnservableQuestionIds,
  releaseFlightPosition,
  retireUnlinkedSession,
} from "@/lib/db";
import { paperComposition } from "@/lib/live-tasting-paper-engine";

export const runtime = "nodejs";

/**
 * POST /api/live-tasting/paper/[id]/flight/[position]/rebuild — retire an UNSERVABLE flight so the
 * generation chain rebuilds that position.
 *
 * The engine reclaims a dead flight on its own when nobody has acted on it. This route exists for the
 * other case: a flight whose shopping list has been opened or shared may already be bottles on a table,
 * so swapping its wines is the candidate's call, not a background sweep's. It retires the session (the
 * position must be free before a replacement can take migration 058's unique index) and clears any stale
 * generation claim; the client then POSTs .../next, which now sees the position as missing.
 *
 * Deliberately narrow: only a flight the shared predicate calls unservable, and never one whose marks are
 * already banked — rebuilding that would rewrite a result rather than repair a hole.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; position: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

  const { id, position: posRaw } = await params;
  const position = Number(posRaw);
  if (!Number.isInteger(position) || position < 1) {
    return Response.json({ error: "Bad flight position" }, { status: 400 });
  }

  const paper = await getLiveTastingPaper(id, user.id);
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });
  if (paper.abandoned_at) return Response.json({ error: "Paper abandoned" }, { status: 409 });
  if (paper.mode !== "pick-for-me") {
    // A BYO flight's wines come from the partner, so there is nothing for the engine to regenerate —
    // the honest answer is a new entry, not a rebuild.
    return Response.json(
      { error: "This paper's wines come from your shopping partner. Ask them to re-enter this flight's bottles." },
      { status: 409 }
    );
  }
  if (!paperComposition(paper).some((c) => c.position === position)) {
    return Response.json({ error: "No such flight" }, { status: 400 });
  }

  const session = (await getPaperSessions(paper.id)).find((s) => s.paper_position === position);
  if (!session) return Response.json({ error: "That flight hasn't been built yet" }, { status: 409 });

  const unservable = await getUnservableQuestionIds([session.question_id]);
  if (!session.question_id || !unservable.has(session.question_id)) {
    return Response.json({ error: "That flight is fine — nothing to rebuild" }, { status: 409 });
  }
  if (session.graded_at || session.attempt_id) {
    return Response.json(
      { error: "This flight is already graded. Rebuilding it would rewrite the result." },
      { status: 409 }
    );
  }

  await retireUnlinkedSession(session.id);
  // A claim left behind by the generation that produced this dead flight would otherwise make the next
  // request report `busy` for up to five minutes.
  await releaseFlightPosition(paper.id, position);

  return Response.json({ ok: true, position, retiredSessionId: session.id });
}
