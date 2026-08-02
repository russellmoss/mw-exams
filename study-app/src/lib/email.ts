/**
 * Transactional email via Brevo's HTTP API.
 *
 * Brevo rather than Resend/Mailgun because this app has no custom domain — it runs on a
 * vercel.app subdomain whose DNS we cannot edit, and those providers require DNS verification
 * before they will deliver to anyone but the account owner. Brevo verifies a single sender
 * ADDRESS instead, which is already done for the configured sender.
 *
 * HTTP API rather than SMTP: SMTP connections from short-lived serverless functions are slow to
 * establish and prone to timing out; a single POST is a better fit and returns a message id.
 */

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

export interface SendEmailInput {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  ok: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send one transactional email.
 *
 * Never throws. Callers are on user-facing paths where a mail failure must not turn into a 500 —
 * in particular the password-reset request, which has to return an identical response whether or
 * not the account exists. Failures are logged and reported through the return value.
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || "MW Practical Study";

  if (!apiKey || !senderEmail) {
    console.error("[email] BREVO_API_KEY or BREVO_SENDER_EMAIL is not set — cannot send.");
    return { ok: false, error: "email_not_configured" };
  }

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: input.to, ...(input.toName ? { name: input.toName } : {}) }],
        subject: input.subject,
        htmlContent: input.html,
        textContent: input.text,
      }),
    });

    if (!res.ok) {
      // Brevo returns a JSON body with `code`/`message` on failure; keep it out of the response
      // to the user but make it visible in logs.
      const detail = await res.text().catch(() => "");
      console.error(`[email] Brevo returned ${res.status}: ${detail.slice(0, 300)}`);
      return { ok: false, error: `brevo_${res.status}` };
    }

    const body = (await res.json().catch(() => ({}))) as { messageId?: string };
    return { ok: true, messageId: body.messageId };
  } catch (err) {
    console.error("[email] send failed:", err);
    return { ok: false, error: "network_error" };
  }
}
