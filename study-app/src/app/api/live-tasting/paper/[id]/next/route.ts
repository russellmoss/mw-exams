import { after } from "next/server";
import { requireApiKey } from "@/lib/api-key";
import { getLiveTastingPaper } from "@/lib/db";
import { generateNextFlight } from "@/lib/live-tasting-paper-engine";
import { sseStream } from "@/lib/thinking-stream";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST /api/live-tasting/paper/[id]/next — generate ONE missing flight (SSE). The client chains
 * calls until { done: true }: 3-5 flights at 2-4 minutes each cannot fit a single invocation,
 * and client-driven chaining survives serverless where a background loop would not.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;
  const { id } = await params;

  const paper = await getLiveTastingPaper(id, keyResult.user.id);
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });
  if (paper.abandoned_at) return Response.json({ error: "Paper abandoned" }, { status: 409 });

  return sseStream(async (emit) => {
    const outcome = await generateNextFlight({
      paper,
      apiKey: keyResult.apiKey,
      emit,
      keepAlive: (work) => after(() => work.catch(() => {})),
    });
    if ("error" in outcome) throw new Error(outcome.error);
    return outcome;
  });
}
