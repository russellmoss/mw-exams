/**
 * Password-reset email, styled to match the app's "Cellar" system (see DESIGN.md).
 *
 * Email is not the web. Clients strip <style> blocks, ignore CSS custom properties, do not load
 * webfonts, and Outlook renders through Word. So the design tokens are hand-inlined as hex
 * literals, layout is tables rather than flex/grid, and the accent button has a VML fallback.
 *
 * Palette (DESIGN.md): background #0c0a09, card #1c1917, border #44403c, foreground #e7e5e4,
 * muted #a8a29e, accent #d97706. Fraunces is unavailable in mail, so the display face falls back
 * to Georgia — the nearest widely-installed serif with similar warmth.
 */

const BG = "#0c0a09";
const CARD = "#1c1917";
const BORDER = "#44403c";
const TEXT = "#e7e5e4";
const MUTED = "#a8a29e";
const ACCENT = "#d97706";

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const SERIF = "Georgia, 'Times New Roman', Times, serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface ResetEmailInput {
  name: string;
  resetUrl: string;
  expiryMinutes: number;
}

export function resetPasswordSubject(): string {
  return "Reset your MW Practical Study password";
}

export function resetPasswordText({ name, resetUrl, expiryMinutes }: ResetEmailInput): string {
  return [
    `Hi ${name},`,
    "",
    "You asked to reset your MW Practical Study password. Open the link below to choose a new one:",
    "",
    resetUrl,
    "",
    `This link expires in ${expiryMinutes} minutes and can only be used once.`,
    "",
    "If you didn't request this, you can ignore this email — your password will not change.",
    "",
    "— MW Practical Study",
  ].join("\n");
}

export function resetPasswordHtml({ name, resetUrl, expiryMinutes }: ResetEmailInput): string {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>Reset your password</title>
</head>
<body style="margin:0; padding:0; background-color:${BG}; -webkit-text-size-adjust:100%;">
<!-- Preheader: shown in the inbox list preview, hidden in the body. -->
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; height:0; width:0;">
Choose a new password — this link expires in ${expiryMinutes} minutes.
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BG}" style="background-color:${BG}; margin:0; padding:0;">
<tr>
<td align="center" style="padding:32px 16px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;">

<!-- Wordmark -->
<tr>
<td style="padding:0 0 24px 0; font-family:${SERIF}; font-size:15px; letter-spacing:0.08em; text-transform:uppercase; color:${MUTED};">
MW Practical Study
</td>
</tr>

<!-- Card: border-defined and flat, per the design system. No shadows. -->
<tr>
<td bgcolor="${CARD}" style="background-color:${CARD}; border:1px solid ${BORDER}; border-radius:12px; padding:32px;">

<h1 style="margin:0 0 20px 0; font-family:${SERIF}; font-size:26px; line-height:1.25; font-weight:600; color:${TEXT};">
Reset your password
</h1>

<p style="margin:0 0 16px 0; font-family:${SANS}; font-size:15px; line-height:1.65; color:${TEXT};">
Hi ${safeName},
</p>

<p style="margin:0 0 28px 0; font-family:${SANS}; font-size:15px; line-height:1.65; color:${TEXT};">
You asked to reset your password. Choose a new one using the button below.
</p>

<!-- Button. VML so Outlook renders a real filled button rather than bare text. -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
<tr>
<td align="center" bgcolor="${ACCENT}" style="background-color:${ACCENT}; border-radius:8px;">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="18%" stroke="f" fillcolor="${ACCENT}">
<w:anchorlock/>
<center style="color:${CARD};font-family:${SANS};font-size:15px;font-weight:600;">Choose a new password</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${safeUrl}" style="display:inline-block; padding:13px 28px; font-family:${SANS}; font-size:15px; font-weight:600; color:${CARD}; text-decoration:none; border-radius:8px;">
Choose a new password
</a>
<!--<![endif]-->
</td>
</tr>
</table>

<p style="margin:0 0 8px 0; font-family:${SANS}; font-size:13px; line-height:1.6; color:${MUTED};">
This link expires in ${expiryMinutes} minutes and can only be used once.
</p>

<p style="margin:0 0 24px 0; font-family:${SANS}; font-size:13px; line-height:1.6; color:${MUTED};">
If you didn't request this, you can safely ignore this email — your password won't change.
</p>

<!-- Fallback for clients that strip or mangle the button. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="border-top:1px solid ${BORDER}; padding-top:20px;">
<p style="margin:0 0 6px 0; font-family:${SANS}; font-size:12px; line-height:1.6; color:${MUTED};">
If the button doesn't work, paste this into your browser:
</p>
<p style="margin:0; font-family:${SANS}; font-size:12px; line-height:1.6; word-break:break-all;">
<a href="${safeUrl}" style="color:${ACCENT}; text-decoration:underline;">${safeUrl}</a>
</p>
</td></tr>
</table>

</td>
</tr>

<tr>
<td style="padding:24px 4px 0 4px; font-family:${SANS}; font-size:12px; line-height:1.6; color:${MUTED};">
You received this because someone requested a password reset for this address on MW Practical Study.
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}
