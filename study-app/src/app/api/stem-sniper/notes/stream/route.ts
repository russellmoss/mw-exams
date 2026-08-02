import { neon } from "@neondatabase/serverless";
import { requireApiKey } from "@/lib/api-key";
import { generateSanitizedTastingNotes, type TastingWine } from "@/lib/tasting";
import { sseStream } from "@/lib/thinking-stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/stem-sniper/notes/stream?questionId=  →  text/event-stream
 *
 * The SSE twin of `../route.ts`: Reverse Tasting Stage 2 (Layer B), reporting each phase and the
 * model's reasoning as the notes are generated and validated. Same guarantees as the JSON route —
 * the wines are loaded server-side and NEVER returned, only per-slot notes with variety/region
 * giveaways stripped — and the same `{slot, note}[]` payload arrives in the final `result` event.
 */
export async function GET(request: Request) {
  const keyResult = await requireApiKey(request);
  if (keyResult instanceof Response) return keyResult;

  const { searchParams } = new URL(request.url);
  const questionId = searchParams.get("questionId");
  if (!questionId) return Response.json({ error: "questionId required" }, { status: 400 });

  const apiKey = keyResult.apiKey;
  const source = keyResult.source;
  const userId = keyResult.user.id;

  return sseStream(async (emit) => {
    emit({ type: "status", label: "Pouring the glass…" });

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT wines FROM generated_questions WHERE question_id = ${questionId}`;
    const r = rows[0];
    if (!r) throw new Error("question not found");

    const wines = (typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines) as TastingWine[];
    if (!Array.isArray(wines) || wines.length === 0) throw new Error("no wines for question");

    const notes = await generateSanitizedTastingNotes({
      wines,
      questionId,
      apiKey,
      source,
      userId,
      emit,
    });

    emit({ type: "status", label: "Glass ready." });
    return { notes: wines.map((w, i) => ({ slot: w.slot, note: notes[i] || "" })) };
  });
}
