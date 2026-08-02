import { requireApiKey } from "@/lib/api-key";
import { sseStream } from "@/lib/thinking-stream";
import { gradeFlashCard, isValidPromptType } from "../produce";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/flash-notes/grade/stream  →  text/event-stream
 *
 * The SSE twin of `../route.ts`. Same prompt, same scoring; the examiner's reasoning streams while
 * it marks instead of the screen sitting on "Marking your note…". The final `result` event carries
 * the identical `{score, verdict, feedback}` payload.
 *
 * Not a spoiler surface: Flash Notes reveals the wine identities up front (it's a Dry-Notes-style
 * drill and awards no identification marks), and the card is already submitted by this point.
 */
export async function POST(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;

  const { paper, promptType, wines, answer } = await request.json();
  if (!isValidPromptType(promptType) || !Array.isArray(wines) || !wines.length || !answer) {
    return Response.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  const apiKey = keyResult.apiKey;
  const source = keyResult.source;
  const userId = keyResult.user.id;

  return sseStream(async (emit) => {
    const grade = await gradeFlashCard({
      paper,
      promptType,
      wines,
      answer,
      apiKey,
      source,
      userId,
      emit,
    });
    emit({ type: "status", label: "Marked." });
    return grade;
  });
}
