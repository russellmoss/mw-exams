import { requireApiKey } from "@/lib/api-key";
import { generateSanitizedTastingNotes } from "@/lib/tasting";

export const runtime = "nodejs";

// Thin route over the shared tasting generator (src/lib/tasting.ts). The study page calls this with
// the revealed wines; Reverse Tasting uses the same generator server-side via /api/stem-sniper/notes.
export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const { wines, questionId } = await request.json();
    if (!wines || !Array.isArray(wines) || wines.length === 0) {
      return Response.json({ error: "Missing or empty wines array" }, { status: 400 });
    }

    const tastingNotes = await generateSanitizedTastingNotes({
      wines,
      questionId,
      apiKey: keyResult.apiKey,
      source: keyResult.source,
      userId: keyResult.user.id,
    });

    return Response.json({ tastingNotes });
  } catch (err) {
    console.error("generate-tasting error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
