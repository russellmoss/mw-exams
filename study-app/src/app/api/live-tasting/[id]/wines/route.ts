import { after } from "next/server";
import { requireApiKey } from "@/lib/api-key";
import { getLiveTastingSession, stampLiveTastingEvent } from "@/lib/db";
import { deriveSessionState } from "@/lib/live-tasting";
import { attachByoWines, validateEnteredWines } from "@/lib/live-tasting-engine";
import { sseStream } from "@/lib/thinking-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/live-tasting/[id]/wines — CANDIDATE self-entry for a BYO prep session (SSE).
 *
 * Entering the wines yourself reveals them, obviously — so this stamps user_revealed_at (the
 * 'self' blind badge) exactly like opening a shopping list. The blind-preserving path is the
 * partner entering them via /api/shop/[token]/wines, which stamps nothing on the candidate.
 * Body: { wines: [{producer, wineName, vintage, country, region?, price?}] } (2-4 entries).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  const { id } = await params;

  const session = await getLiveTastingSession(id, keyResult.user.id);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  if (deriveSessionState(session) !== "prep") {
    return Response.json({ error: "This session already has its wines" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = validateEnteredWines(body.wines);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  await stampLiveTastingEvent(session.id, "user_revealed_at");

  return sseStream(async (emit) => {
    const outcome = await attachByoWines({
      session,
      wines: parsed.wines,
      apiKey: keyResult.apiKey,
      emit,
      keepAlive: (work) => after(() => work.catch(() => {})),
    });
    if ("error" in outcome) throw new Error(outcome.error);
    emit({ type: "status", label: "Question ready — bag the bottles and taste when you like." });
    return { ok: true };
  });
}
