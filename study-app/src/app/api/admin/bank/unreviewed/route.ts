import { getUser } from "@/lib/auth";
import { getUnreviewedQueue } from "@/lib/db";

export const runtime = "nodejs";

// Family F-codes → the human labels used across the review surfaces (mirrors fill-bank/review).
const FAMILY_LABELS: Record<string, string> = {
  F1: "Same variety",
  F2: "Same origin",
  F3: "Blend logic",
  F4: "Mixed breadth",
  F5: "Method / production",
  F6: "Style mechanism",
  F7: "Quality hierarchy",
};

// A cursor is the (created_at, question_id) of the last row of the previous page, base64-encoded so
// the client treats it as an opaque token. Malformed cursors fall back to page one.
function decodeCursor(raw: string | null): { createdAt: string; id: string } | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const sep = decoded.indexOf("|");
    if (sep < 0) return null;
    const createdAt = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(cursor: { createdAt: string; id: string } | null): string | null {
  if (!cursor) return null;
  return Buffer.from(`${cursor.createdAt}|${cursor.id}`, "utf8").toString("base64");
}

/**
 * GET /api/admin/bank/unreviewed?limit=&cursor= — admin-only.
 *
 * One keyset-paginated page of the Unreviewed Queue (oldest first): banked questions never explicitly
 * kept or binned. Returns { total, items, nextCursor } — nextCursor is null when the queue is drained.
 */
export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit")) || 25;
  const cursor = decodeCursor(params.get("cursor"));

  const { total, items, nextCursor } = await getUnreviewedQueue(limit, cursor);

  return Response.json({
    total,
    items: items.map((it) => ({
      id: it.id,
      paper: it.paper,
      family: FAMILY_LABELS[it.family] || it.familyLabel || it.family,
      wineCount: it.wineCount,
      createdAt: it.createdAt,
      stemPreview: it.stemPreview,
    })),
    nextCursor: encodeCursor(nextCursor),
  });
}
