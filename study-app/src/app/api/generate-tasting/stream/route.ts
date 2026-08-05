import { requireApiKey } from "@/lib/api-key";
import { generateSanitizedTastingNotes } from "@/lib/tasting";
import { sseStream } from "@/lib/thinking-stream";
import type { WineProvenance } from "@/lib/wine-bank-lookup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/generate-tasting/stream  →  text/event-stream
 *
 * The SSE twin of `../route.ts`, for the study page's tasting reveal. Same generator, same
 * sanitisation (variety/region/origin giveaways stripped) — the only difference is that the
 * generate-validate-regenerate loop reports as it runs instead of the button sitting on
 * "Generating tasting notes…" for the duration. The final `result` event carries the identical
 * `{ tastingNotes }` payload.
 */
export async function POST(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;

  const { wines, questionId } = await request.json();
  if (!wines || !Array.isArray(wines) || wines.length === 0) {
    return Response.json({ error: "Missing or empty wines array" }, { status: 400 });
  }

  const apiKey = keyResult.apiKey;
  const source = keyResult.source;
  const userId = keyResult.user.id;

  return sseStream(async (emit) => {
    // Where each note's reference profile came from. Rides on the RESULT event, not a progress event,
    // so it lands with the notes and the client cannot show it before them.
    let provenance: WineProvenance[] = [];
    const tastingNotes = await generateSanitizedTastingNotes({
      wines,
      questionId,
      apiKey,
      source,
      userId,
      emit,
      onProvenance: (p) => { provenance = p; },
    });
    emit({ type: "status", label: "Notes ready." });
    return { tastingNotes, provenance };
  });
}
