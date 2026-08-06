import { getUser } from "@/lib/auth";
import { getLiveTastingPaper } from "@/lib/db";
import { neon } from "@neondatabase/serverless";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";

/**
 * POST /api/live-tasting/paper/[id]/feedback — paper-level feedback (migration 047).
 * Body: { text }.
 *
 * Exists because attempt-anchored feedback has no home before a paper's first question exists
 * (the exact moment paper-GENERATION feedback happens). Appends to the paper row and emails
 * admins so it is seen — at ~100 users an email beats building a review surface.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
  const { id } = await params;

  const paper = await getLiveTastingPaper(id, user.id);
  if (!paper) return Response.json({ error: "Not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 4000) : "";
  if (!text) return Response.json({ error: "Empty feedback" }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    UPDATE live_tasting_papers
    SET user_feedback = COALESCE(user_feedback, '[]'::jsonb) || ${JSON.stringify([
      { text, byUserId: user.id, at: new Date().toISOString() },
    ])}::jsonb
    WHERE id = ${paper.id}
  `;

  // Visibility: straight to the admins' inboxes, fire-and-forget.
  const admins = (await sql`SELECT email, name FROM users WHERE is_admin = true AND is_active = true`) as { email: string; name: string | null }[];
  const summary = `Paper ${paper.paper} (${paper.size}, ${paper.mode}, ${paper.pacing}) — ${paper.id}`;
  for (const a of admins) {
    sendEmail({
      to: a.email,
      toName: a.name ?? undefined,
      subject: `Live Tasting paper feedback from ${user.name ?? user.email}`,
      html: `<p><strong>${summary}</strong></p><p style="white-space:pre-wrap">${text.replace(/</g, "&lt;")}</p>`,
      text: `${summary}\n\n${text}`,
    }).catch(() => {});
  }

  return Response.json({ ok: true });
}
