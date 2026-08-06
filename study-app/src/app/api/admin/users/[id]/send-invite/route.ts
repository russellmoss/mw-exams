import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import { createResetToken, INVITE_TTL_MINUTES } from "@/lib/reset-tokens";
import { sendEmail } from "@/lib/email";
import {
  invitationHtml,
  invitationText,
  invitationSubject,
} from "@/lib/email-templates/invitation";

export const runtime = "nodejs";

function appUrl(request: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return new URL(request.url).origin;
}

/**
 * POST /api/admin/users/[id]/send-invite — sends a welcome/invitation email with a set-password
 * link. The link is a long-lived password-reset token, so the recipient lands on /reset-password
 * to choose their first password and is signed in on completion.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(request);
    if (!user || !user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const targetId = parseInt(id, 10);
    if (isNaN(targetId)) {
      return Response.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT id, email, name, is_active FROM users WHERE id = ${targetId}`;
    if (rows.length === 0) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }
    const target = rows[0];
    if (target.is_active === false) {
      return Response.json({ error: "Account is disabled — enable it first" }, { status: 400 });
    }

    const token = await createResetToken(targetId, null, INVITE_TTL_MINUTES);
    const inviteUrl = `${appUrl(request)}/reset-password?token=${encodeURIComponent(token)}`;

    const templateInput = {
      name: (target.name as string) || "there",
      inviteUrl,
      invitedBy: user.name || "An administrator",
      expiryText: "7 days",
    };

    const result = await sendEmail({
      to: target.email as string,
      toName: target.name as string,
      subject: invitationSubject(),
      html: invitationHtml(templateInput),
      text: invitationText(templateInput),
    });

    if (!result.ok) {
      console.error(`[admin send-invite] send failed for user ${targetId}: ${result.error}`);
      return Response.json({ error: `Email failed to send: ${result.error}` }, { status: 502 });
    }

    console.info(`[admin] user ${user.id} sent invitation to user ${targetId}`);
    return Response.json({ ok: true, sentTo: target.email });
  } catch (err) {
    console.error("POST admin/users/[id]/send-invite error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
