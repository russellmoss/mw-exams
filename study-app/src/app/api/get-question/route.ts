import { requireApiKey } from "@/lib/api-key";
import { type UsageMeta, type GenerationOutcome } from "@/lib/question-engine";
import { produceQuestion } from "./produce";

export const runtime = "nodejs";
export const maxDuration = 300;

// The engine returns DATA; this route maps it to HTTP (error → 500, otherwise the question payload).
function asResponse(outcome: GenerationOutcome): Response {
  if ("error" in outcome) return Response.json({ error: outcome.error }, { status: 500 });
  return Response.json(outcome);
}

/**
 * POST /api/get-question — plain JSON. Thin handler over the shared producer in ./produce.ts.
 *
 * The landing page now uses the SSE twin at ./stream so a 30-60s generation reports as it works;
 * this route stays for any caller that just wants the payload with no progress feed.
 */
export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;
    const meta: UsageMeta = { source: keyResult.source, userId: keyResult.user.id };

    // `focus` is the Paper 3 style bias; the producer ignores it for Papers 1/2.
    const { paper, family, forceFresh, focus } = await request.json();
    if (!paper) return Response.json({ error: "Missing paper" }, { status: 400 });

    return asResponse(
      await produceQuestion({ paper, family, forceFresh, focus, apiKey: keyResult.apiKey, meta })
    );
  } catch (err) {
    console.error("get-question error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
