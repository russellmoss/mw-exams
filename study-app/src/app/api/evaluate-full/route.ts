import { requireApiKey } from "@/lib/api-key";
import { produceFullEvaluation } from "./produce";

export const runtime = "nodejs";
// Raised from 120 when the persona re-voicing pass landed. Measured on a real debrief: pass 1
// (grading, Opus) 61s + pass 2 (re-voicing, Sonnet) 43s = ~104s, which left 16s of headroom against
// the old cap — a longer script would have timed out mid-stream and cost the candidate their graded
// attempt. 300 matches /api/coach, the other long-running streaming route.
export const maxDuration = 300;

/**
 * The study-flow debrief route. The grading core lives in ./produce.ts (shared with
 * /api/live-tasting/[id]/grade, which loads its inputs server-side — see that route for why the
 * client-supplied wines/modelAnswer here are fine for THIS flow: the wines are revealed to the
 * candidate at debrief time anyway).
 */
export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const {
      // Sent so the STORED answer key can be read server-side — that key is the only place a wine's
      // keyed banker/curveball role lives, and without it the answer-key claim check can only flag.
      questionId,
      questionText,
      preGlassReasoning,
      modelAnswer,
      paper,
      wineAppearances,
      wines,
      // Known-Wine Write-Up ("dry notes") mode: the wine identity was revealed to the candidate
      // up front, so grade the write-up only — fold identification marks into the remaining
      // sub-parts and skip the stem-analysis review.
      identityRevealed,
      // 'voice' when the candidate dictated. Spelling is then reported but not deducted.
      inputMethod: inputMethodRaw,
      userAnswer: submittedAnswer,
    } = await request.json();

    if (!questionText || !submittedAnswer || !paper) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const readable = await produceFullEvaluation({
      apiKey: keyResult.apiKey,
      userId: keyResult.user.id,
      usageSource: keyResult.source,
      questionId: typeof questionId === "string" ? questionId : null,
      questionText,
      preGlassReasoning,
      modelAnswer,
      paper,
      wineAppearances,
      wines,
      identityRevealed: !!identityRevealed,
      inputMethod: inputMethodRaw === "voice" ? "voice" : "typed",
      userAnswer: submittedAnswer,
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("evaluate-full error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
