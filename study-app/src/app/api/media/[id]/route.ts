import { getUser } from "@/lib/auth";
import { getMediaById } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Serve a cached feedback-illustration image (bytes) by id. Referenced from feedback markdown as
 * ![caption](/api/media/{id}). Images are generic (vineyards, grapes, vessels) and shared across
 * users, so any logged-in user may load them; content is immutable per id, so it caches hard.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

    const { id } = await params;
    const mediaId = parseInt(id, 10);
    if (isNaN(mediaId)) return Response.json({ error: "Invalid id" }, { status: 400 });

    const media = await getMediaById(mediaId);
    if (!media) return Response.json({ error: "Not found" }, { status: 404 });

    const buf = Buffer.from(media.image_base64, "base64");
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": media.content_type || "image/jpeg",
        "Content-Length": String(buf.length),
        "Cache-Control": "private, max-age=604800, immutable",
      },
    });
  } catch (err) {
    console.error("media serve error:", err);
    return Response.json({ error: "Failed to load image" }, { status: 500 });
  }
}
