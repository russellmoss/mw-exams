import { getUser } from "@/lib/auth";
import { markNarrationsPlayed } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Mark the caller's verdict narrations as spoken. The bell POSTs this the moment
 * a clip actually starts playing, so it is never spoken again on any later
 * page load, navigation, or device. Consumes any backlog of unplayed narration
 * in one go (the single clip the user just heard stands in for all of them).
 */
export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

    const marked = await markNarrationsPlayed(user.id);
    return Response.json({ marked });
  } catch (err) {
    console.error("mark-narration-played error:", err);
    return Response.json({ error: "Failed" }, { status: 500 });
  }
}
