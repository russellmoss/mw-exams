import { requireApiKey } from "@/lib/api-key";
import { gradeFlashCard, isValidPromptType, FlashGradeParseError } from "./produce";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/flash-notes/grade — plain JSON. Thin handler over the shared grader in ./produce.ts.
 *
 * The drill itself uses the SSE twin at ./stream so the mark reports as it's decided; this route
 * stays for any caller that just wants the verdict.
 */
export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const { paper, promptType, wines, answer } = await request.json();
    if (!isValidPromptType(promptType) || !Array.isArray(wines) || !wines.length || !answer) {
      return Response.json({ error: "Missing or invalid fields" }, { status: 400 });
    }

    const grade = await gradeFlashCard({
      paper,
      promptType,
      wines,
      answer,
      apiKey: keyResult.apiKey,
      source: keyResult.source,
      userId: keyResult.user.id,
    });
    return Response.json(grade);
  } catch (err) {
    if (err instanceof FlashGradeParseError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    console.error("flash-notes grade error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
