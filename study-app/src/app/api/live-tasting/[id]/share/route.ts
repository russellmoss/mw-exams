import { randomBytes } from "node:crypto";
import { getUser } from "@/lib/auth";
import { getLiveTastingSession, setLiveTastingShareToken } from "@/lib/db";
import { deriveSessionState } from "@/lib/live-tasting";
import { hashShareToken } from "@/lib/share-token";

export const runtime = "nodejs";

const SHARE_TTL_DAYS = 90;

/**
 * POST /api/live-tasting/[id]/share — mint (or re-mint) the partner shopping-list link.
 *
 * The raw token is returned ONCE and only its sha-256 lands in the DB (live_tasting_plan.md
 * §2.5): database read access must never yield a usable link. Re-minting rotates: the previous
 * token's hash is overwritten, so old links 404 — which is also how replace-wine kills a stale
 * list a partner might be holding.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  const { id } = await params;

  const session = await getLiveTastingSession(id, user.id);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  if (deriveSessionState(session) !== "shopping") {
    return Response.json({ error: "This session is no longer in shopping" }, { status: 409 });
  }

  const token = randomBytes(24).toString("base64url"); // 192 bits
  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 3600_000);
  await setLiveTastingShareToken(session.id, hashShareToken(token), expiresAt);

  const origin = new URL(request.url).origin;
  return Response.json({ url: `${origin}/shop/${token}`, expiresAt: expiresAt.toISOString() });
}
