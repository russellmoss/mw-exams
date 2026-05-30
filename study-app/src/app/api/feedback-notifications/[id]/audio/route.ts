import { getUser } from "@/lib/auth";
import { getNarrationAudio } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Serve the spoken verdict narration (mp3) for one feedback analysis. The bell
 * plays this when a new verdict lands. Scoped to the owning user — you can only
 * hear narration for your own feedback. 404 when no narration was generated.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

    const { id } = await params;
    const analysisId = parseInt(id, 10);
    if (isNaN(analysisId)) {
      return Response.json({ error: "Invalid id" }, { status: 400 });
    }

    const audioBase64 = await getNarrationAudio(analysisId, user.id);
    if (!audioBase64) return Response.json({ error: "No narration" }, { status: 404 });

    const buf = Buffer.from(audioBase64, "base64");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(buf.length),
        // Per-user audio; immutable per analysis so it can be cached privately.
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (err) {
    console.error("narration audio error:", err);
    return Response.json({ error: "Failed to load narration" }, { status: 500 });
  }
}
