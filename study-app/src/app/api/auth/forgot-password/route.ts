import { neon } from "@neondatabase/serverless";
import { createResetToken, checkRateLimit, TOKEN_TTL_MINUTES } from "@/lib/reset-tokens";
import { sendEmail } from "@/lib/email";
import {
  resetPasswordHtml,
  resetPasswordText,
  resetPasswordSubject,
} from "@/lib/email-templates/reset-password";

export const runtime = "nodejs";

/**
 * Always-200 response, regardless of whether the account exists, whether mail sent, or whether the
 * caller is rate limited.
 *
 * Any variation here — a different status, message, or error — turns this endpoint into an account
 * enumeration oracle: an attacker could discover which of a list of addresses have accounts. The
 * user-visible result is identical in every case; the detail goes to the logs.
 */
const GENERIC_RESPONSE = {
  ok: true,
  message: "If an account exists for that email, a reset link is on its way.",
};

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

function appUrl(request: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  // Preview deployments get a dynamic hostname, so fall back to the requested origin rather than
  // sending someone a link to production.
  return new URL(request.url).origin;
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== "string") {
      return Response.json(GENERIC_RESPONSE, { status: 200 });
    }

    const normalized = email.toLowerCase().trim();
    const ip = clientIp(request);

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT id, email, name, is_active FROM users WHERE email = ${normalized}
    `;

    if (rows.length === 0) {
      console.info(`[forgot-password] no account for ${normalized}`);
      return Response.json(GENERIC_RESPONSE, { status: 200 });
    }

    const user = rows[0];

    if (user.is_active === false) {
      console.info(`[forgot-password] account disabled: ${normalized}`);
      return Response.json(GENERIC_RESPONSE, { status: 200 });
    }

    const rate = await checkRateLimit(user.id as number, ip);
    if (!rate.allowed) {
      console.warn(`[forgot-password] rate limited (${rate.reason}) for ${normalized}`);
      return Response.json(GENERIC_RESPONSE, { status: 200 });
    }

    const token = await createResetToken(user.id as number, ip);
    const resetUrl = `${appUrl(request)}/reset-password?token=${encodeURIComponent(token)}`;

    const templateInput = {
      name: (user.name as string) || "there",
      resetUrl,
      expiryMinutes: TOKEN_TTL_MINUTES,
    };

    const result = await sendEmail({
      to: user.email as string,
      toName: user.name as string,
      subject: resetPasswordSubject(),
      html: resetPasswordHtml(templateInput),
      text: resetPasswordText(templateInput),
    });

    if (!result.ok) {
      // Deliberately still a 200: telling the caller that mail failed would also tell them the
      // account exists.
      console.error(`[forgot-password] send failed for ${normalized}: ${result.error}`);
    } else {
      console.info(`[forgot-password] sent to ${normalized} (${result.messageId ?? "no id"})`);
    }

    return Response.json(GENERIC_RESPONSE, { status: 200 });
  } catch (err) {
    console.error("forgot-password error:", err);
    // Even an unexpected failure returns the generic 200 — a 500 here would leak that this
    // address took a different code path.
    return Response.json(GENERIC_RESPONSE, { status: 200 });
  }
}
