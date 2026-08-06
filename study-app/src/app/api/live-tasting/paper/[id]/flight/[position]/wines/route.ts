import { after } from "next/server";
import { requireApiKey } from "@/lib/api-key";
import {
  getLiveTastingPaper,
  getPaperSessions,
  createLiveTastingPrepSession,
  linkSessionToPaper,
} from "@/lib/db";
import { attachByoWines, validateEnteredWines } from "@/lib/live-tasting-engine";
import { paperComposition, } from "@/lib/live-tasting-paper-engine";
import { liveTastingSessionId } from "@/lib/live-tasting";
import { sseStream } from "@/lib/thinking-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/live-tasting/paper/[id]/flight/[position]/wines — BYO paper: attach the bought
 * wines for ONE flight (SSE). Creates the flight's child session on the spot (BYO paper flights
 * don't exist until their wines do) and runs the standard pinned generation. Candidate
 * self-entry route — the paper-level brief chooser gated what they saw.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; position: string }> }
) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  const { id, position: posRaw } = await params;
  const position = Number(posRaw);

  const paper = await getLiveTastingPaper(id, keyResult.user.id);
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });
  if (paper.mode !== "byo") return Response.json({ error: "This paper picks its own wines" }, { status: 409 });
  if (paper.abandoned_at) return Response.json({ error: "Paper abandoned" }, { status: 409 });

  const comp = paperComposition(paper).find((c) => c.position === position);
  if (!comp) return Response.json({ error: "No such flight" }, { status: 400 });
  const children = await getPaperSessions(paper.id);
  if (children.some((c) => c.paper_position === position)) {
    return Response.json({ error: "This flight already has its wines" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = validateEnteredWines(body.wines);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  if (parsed.wines.length !== comp.flightSize) {
    return Response.json(
      { error: `Flight ${position} needs exactly ${comp.flightSize} wines per the paper's composition` },
      { status: 400 }
    );
  }

  return sseStream(async (emit) => {
    const session = await createLiveTastingPrepSession({
      id: liveTastingSessionId(),
      userId: paper.user_id,
      paper: paper.paper,
      flightSize: comp.flightSize,
      archetype: comp.family,
      city: paper.city,
      country: paper.country,
      budgetAmount: comp.perBottleBudget,
      budgetCurrency: paper.budget_currency,
      prepGuidance: "",
    });
    await linkSessionToPaper(session.id, paper.id, position);
    const outcome = await attachByoWines({
      session,
      wines: parsed.wines,
      apiKey: keyResult.apiKey,
      emit,
      keepAlive: (work) => after(() => work.catch(() => {})),
    });
    if ("error" in outcome) throw new Error(outcome.error);
    emit({ type: "status", label: `Flight ${position} is ready.` });
    return { ok: true, position };
  });
}
