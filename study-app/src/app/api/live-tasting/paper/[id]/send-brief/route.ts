import { randomBytes } from "node:crypto";
import { getUser } from "@/lib/auth";
import { getLiveTastingPaper, setPaperShareToken, setPaperBriefSentTo } from "@/lib/db";
import { hashShareToken } from "@/lib/share-token";
import { sendPartnerBriefEmail } from "@/lib/live-tasting-mail";

export const runtime = "nodejs";

const SHARE_TTL_DAYS = 90;

/**
 * POST /api/live-tasting/paper/[id]/send-brief — email the MULTI-FLIGHT brief to a partner.
 * Body: { email }. Paper-level twin of the session route: mints (rotating) the paper share
 * token, emails brief + the per-flight entry page, records brief_sent_to. The candidate stays
 * blind — the paper GET withholds the brief until an explicit open-brief.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  const { id } = await params;

  const paper = await getLiveTastingPaper(id, user.id);
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });
  if (paper.mode !== "byo" || !paper.prep_guidance || paper.abandoned_at) {
    return Response.json({ error: "This paper's brief is not routable" }, { status: 409 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return Response.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const token = randomBytes(24).toString("base64url");
  await setPaperShareToken(paper.id, hashShareToken(token), new Date(Date.now() + SHARE_TTL_DAYS * 24 * 3600_000));

  const origin = new URL(request.url).origin;
  const sent = await sendPartnerBriefEmail({
    to: email,
    brief: paper.prep_guidance,
    entryUrl: `${origin}/shop/paper/${token}`,
  });
  if (!sent) {
    return Response.json({ error: "The email could not be sent — try again shortly." }, { status: 502 });
  }
  await setPaperBriefSentTo(paper.id, email);
  return Response.json({ ok: true, sentTo: email });
}
