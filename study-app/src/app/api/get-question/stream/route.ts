import { requireApiKey } from "@/lib/api-key";
import { type UsageMeta } from "@/lib/question-engine";
import { sseStream } from "@/lib/thinking-stream";
import { produceQuestion } from "../produce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/get-question/stream  →  text/event-stream
 *
 * Same producer as the sibling JSON route, reporting as it works: which bank tier it's trying,
 * then — when nothing suitable is banked — each generation attempt and the writing model's own
 * summarized reasoning. The final `result` event carries the identical question payload.
 *
 * Auth and validation failures are returned as normal JSON responses so the client sees the status
 * code rather than a stream that opens and immediately errors.
 */
export async function POST(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;

  const { paper, family, forceFresh } = await request.json();
  if (!paper) return Response.json({ error: "Missing paper" }, { status: 400 });

  const meta: UsageMeta = { source: keyResult.source, userId: keyResult.user.id };
  const apiKey = keyResult.apiKey;

  return sseStream(async (emit) => {
    const outcome = await produceQuestion({ paper, family, forceFresh, apiKey, meta, emit });
    // The engine signals "nothing available" as data; surface it as a stream error so the client's
    // single failure path handles it (and its retry gets a chance at the fast banked fallback).
    if ("error" in outcome) throw new Error(outcome.error);
    emit({ type: "status", label: "Question ready." });
    return outcome;
  });
}
