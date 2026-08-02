import { requireApiKey } from "@/lib/api-key";
import { type UsageMeta } from "@/lib/question-engine";
import { sseStream } from "@/lib/thinking-stream";
import { produceDrill } from "../produce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET /api/stem-sniper/drill/stream?paper=&family=  →  text/event-stream
 *
 * Same producer as the sibling JSON route, but reports as it works: phase labels from our own
 * pipeline plus the generating model's summarized reasoning, ending in a `result` event carrying
 * the identical stem-only drill payload. The candidate sees the machine thinking instead of a
 * frozen "Loading drill…".
 *
 * Auth failures are returned as a normal (non-SSE) Response so the client's fetch sees the status
 * code rather than a stream that opens and immediately errors.
 */
export async function GET(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;

  const { searchParams } = new URL(request.url);
  const paperRaw = searchParams.get("paper");
  const family = searchParams.get("family");
  const meta: UsageMeta = { source: keyResult.source, userId: keyResult.user.id };
  const apiKey = keyResult.apiKey;

  return sseStream(async (emit) => {
    emit({ type: "status", label: "Warming up the question engine…" });
    const drill = await produceDrill({
      paper: paperRaw ? Number(paperRaw) : null,
      family,
      apiKey,
      meta,
      emit,
    });
    if ("error" in drill) throw new Error(drill.error);
    emit({ type: "status", label: "Drill ready." });
    return drill;
  });
}
