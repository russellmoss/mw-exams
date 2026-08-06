import { randomBytes } from "node:crypto";
import { getUser } from "@/lib/auth";
import { getLiveTastingSession, setLiveTastingShareToken, setBriefSentTo } from "@/lib/db";
import { deriveSessionState } from "@/lib/live-tasting";
import { hashShareToken } from "@/lib/share-token";
import { sendPartnerBriefEmail } from "@/lib/live-tasting-mail";

export const runtime = "nodejs";

const SHARE_TTL_DAYS = 90;

/**
 * POST /api/live-tasting/[id]/send-brief — email the shopping brief to a partner (BYO prep).
 * Body: { email }.
 *
 * The blind-preserving path from the very first step: the candidate routes the brief to their
 * buyer without ever reading it themselves. Mints (rotating) the share token and emails the
 * brief + entry link via the existing Brevo mailer. Owner-initiated only — the recipient address
 * comes from the candidate in their own session, never from observed content.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  const { id } = await params;

  const session = await getLiveTastingSession(id, user.id);
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  if (deriveSessionState(session) !== "prep" || !session.prep_guidance) {
    return Response.json({ error: "This session's brief is no longer routable" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + SHARE_TTL_DAYS * 24 * 3600_000);
  await setLiveTastingShareToken(session.id, hashShareToken(token), expiresAt);

  const origin = new URL(request.url).origin;
  const sent = await sendPartnerBriefEmail({
    to: email,
    brief: session.prep_guidance,
    entryUrl: `${origin}/shop/${token}`,
  });
  if (!sent) {
    return Response.json(
      { error: "The email could not be sent — copy the share link instead." },
      { status: 502 }
    );
  }

  await setBriefSentTo(session.id, email);
  return Response.json({ ok: true, sentTo: email });
}
