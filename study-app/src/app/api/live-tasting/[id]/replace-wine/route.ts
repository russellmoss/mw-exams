import { requireApiKey } from "@/lib/api-key";
import { getLiveTastingSession } from "@/lib/db";
import { deriveSessionState } from "@/lib/live-tasting";
import { replaceWine } from "@/lib/live-tasting-engine";
import { sseStream } from "@/lib/thinking-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/live-tasting/[id]/replace-wine — swap one slot (SSE progress).
 * Body: { slot, confirm? }.
 *
 * Partner-mid-shop gate (live_tasting_plan.md §2.5): once the share link has been opened, a swap
 * silently changing the list is how a partner buys the wrong wine — so it requires an explicit
 * confirm, and the rotation (inside replaceWine) 404s the old link either way.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  const { id } = await params;

  const session = await getLiveTastingSession(id, keyResult.user.id);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  if (deriveSessionState(session) !== "shopping") {
    return Response.json({ error: "This session is no longer in shopping" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const slot = Number(body.slot);
  if (!Number.isInteger(slot) || slot < 1 || slot > session.flight_size) {
    return Response.json({ error: "Bad slot" }, { status: 400 });
  }
  if (session.token_first_used_at && body.confirm !== true) {
    return Response.json(
      {
        error: "Your partner may already be shopping from the shared list.",
        needsConfirm: true,
      },
      { status: 409 }
    );
  }

  return sseStream(async (emit) => {
    const outcome = await replaceWine({ session, slot, apiKey: keyResult.apiKey, emit });
    if ("error" in outcome) throw new Error(outcome.error);
    emit({ type: "status", label: "Wine replaced — the old share link no longer works." });
    return { ok: true };
  });
}
