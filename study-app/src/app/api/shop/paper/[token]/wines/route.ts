import { after } from "next/server";
import {
  getLiveTastingPaperByTokenHash,
  getPaperSessions,
  createLiveTastingPrepSession,
  linkSessionToPaper,
  getUserEmailById,
} from "@/lib/db";
import { hashShareToken, looksLikeShareToken } from "@/lib/share-token";
import { attachByoWines, validateEnteredWines } from "@/lib/live-tasting-engine";
import { paperComposition } from "@/lib/live-tasting-paper-engine";
import { liveTastingSessionId } from "@/lib/live-tasting";
import { getApiKeyForUserId } from "@/lib/api-key";
import { sendQuestionReadyEmail } from "@/lib/live-tasting-mail";
import { sseStream } from "@/lib/thinking-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/shop/paper/[token]/wines — PARTNER wine entry for ONE flight of a BYO paper (SSE,
 * no auth). Body: { position, wines }. Creates the flight's child session and runs pinned
 * generation on the paper owner's key; no reveal stamps, so the candidate stays blind. When the
 * LAST flight lands, the candidate gets ONE "your paper is ready" email (per-flight would spam).
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!looksLikeShareToken(token)) return Response.json({ error: "Not found" }, { status: 404 });

  const paper = await getLiveTastingPaperByTokenHash(hashShareToken(token));
  if (!paper || paper.mode !== "byo") return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const position = Number(body.position);
  const comp = paperComposition(paper).find((c) => c.position === position);
  if (!comp) return Response.json({ error: "No such flight" }, { status: 400 });

  const children = await getPaperSessions(paper.id);
  if (children.some((c) => c.paper_position === position)) {
    return Response.json({ error: "This flight already has its wines" }, { status: 409 });
  }

  const parsed = validateEnteredWines(body.wines);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  if (parsed.wines.length !== comp.flightSize) {
    return Response.json(
      { error: `Flight ${position} needs exactly ${comp.flightSize} wines per the brief` },
      { status: 400 }
    );
  }

  const apiKey = await getApiKeyForUserId(paper.user_id);
  if (!apiKey) {
    return Response.json(
      { error: "The candidate's account has no API key configured — ask them to add one in Settings." },
      { status: 409 }
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
      apiKey,
      emit,
      keepAlive: (work) => after(() => work.catch(() => {})),
    });
    if ("error" in outcome) throw new Error(outcome.error);

    // Last flight in? One ready email to the candidate.
    const total = paperComposition(paper).length;
    const now = await getPaperSessions(paper.id);
    if (now.length >= total) {
      const owner = await getUserEmailById(paper.user_id).catch(() => null);
      if (owner?.email) {
        const origin = new URL(request.url).origin;
        sendQuestionReadyEmail({
          to: owner.email,
          toName: owner.name ?? undefined,
          sessionUrl: `${origin}/live-tasting/paper/${paper.id}`,
        }).catch(() => {});
      }
      emit({ type: "status", label: "That was the last flight — the whole paper is ready. Bag and number everything!" });
    } else {
      emit({ type: "status", label: `Flight ${position} done — ${total - now.length} to go.` });
    }
    return { ok: true, position, remaining: total - now.length };
  });
}
