import { getLiveTastingSessionByTokenHash, setLiveTastingVintages } from "@/lib/db";
import { hashShareToken, looksLikeShareToken } from "@/lib/share-token";

export const runtime = "nodejs";

/**
 * POST /api/shop/[token]/vintage — the ONLY no-auth write in the feature, deliberately tiny:
 * a valid share token may record which VINTAGE was bought for a slot, nothing else. Values are
 * shape-checked (a year or NV), slots bounded, and the write is a merge into vintages_bought.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!looksLikeShareToken(token)) return Response.json({ error: "Not found" }, { status: 404 });

  const session = await getLiveTastingSessionByTokenHash(hashShareToken(token));
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const slot = Number(body.slot);
  const vintage = typeof body.vintage === "string" ? body.vintage.trim().toUpperCase() : "";
  if (!Number.isInteger(slot) || slot < 1 || slot > session.flight_size) {
    return Response.json({ error: "Bad slot" }, { status: 400 });
  }
  if (!/^(19|20)\d{2}$|^NV$/.test(vintage)) {
    return Response.json({ error: "Vintage must be a year or NV" }, { status: 400 });
  }

  const current = (session.vintages_bought ?? {}) as Record<string, string>;
  await setLiveTastingVintages(session.id, { ...current, [String(slot)]: vintage });
  return Response.json({ ok: true });
}
