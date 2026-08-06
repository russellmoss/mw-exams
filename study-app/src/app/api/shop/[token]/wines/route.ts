import { after } from "next/server";
import { getLiveTastingSessionByTokenHash } from "@/lib/db";
import { hashShareToken, looksLikeShareToken } from "@/lib/share-token";
import { attachByoWines, validateEnteredWines } from "@/lib/live-tasting-engine";
import { getApiKeyForUserId } from "@/lib/api-key";
import { sseStream } from "@/lib/thinking-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/shop/[token]/wines — PARTNER wine entry for a BYO prep session (SSE, no auth).
 *
 * This is the blind-preserving path: the partner bought the bottles per the shopping brief and
 * enters them here; the candidate's session gains its question WITHOUT any reveal stamp, so the
 * blind badge stays 'partner'. Token-authenticated; generation runs on the session OWNER's API
 * key (same attribution as everything else in their session).
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!looksLikeShareToken(token)) return Response.json({ error: "Not found" }, { status: 404 });

  const session = await getLiveTastingSessionByTokenHash(hashShareToken(token));
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  if (session.question_id != null) {
    return Response.json({ error: "This tasting already has its wines" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = validateEnteredWines(body.wines);
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const apiKey = await getApiKeyForUserId(session.user_id);
  if (!apiKey) {
    return Response.json(
      { error: "The candidate's account has no API key configured — ask them to add one in Settings." },
      { status: 409 }
    );
  }

  return sseStream(async (emit) => {
    const outcome = await attachByoWines({
      session,
      wines: parsed.wines,
      apiKey,
      emit,
      keepAlive: (work) => after(() => work.catch(() => {})),
    });
    if ("error" in outcome) throw new Error(outcome.error);
    emit({ type: "status", label: "All set — bag and number the bottles; they can taste when ready." });
    return { ok: true };
  });
}
