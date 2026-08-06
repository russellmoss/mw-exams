/**
 * Invitation email, styled to match the app's "Cellar" system (see DESIGN.md).
 *
 * Same email constraints as reset-password.ts: hand-inlined hex tokens, table layout, VML button
 * fallback for Outlook. The invite link is a password-reset token under the hood — the recipient
 * lands on /reset-password to choose their first password, which also signs them in.
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

export interface InvitationEmailInput {
  name: string;
  inviteUrl: string;
  /** Name of the admin who sent the invite, e.g. "Russell Moss". */
  invitedBy: string;
  /** Human-readable link lifetime, e.g. "7 days". */
  expiryText: string;
}

export function invitationSubject(): string {
  return "You're invited to MW Practical Study";
}

export function invitationText({ name, inviteUrl, invitedBy, expiryText }: InvitationEmailInput): string {
  return [
    `Hi ${name},`,
    "",
    `${invitedBy} has invited you to MW Practical Study — a blind-tasting study app built around ten years of Master of Wine practical exam papers.`,
    "",
    "Open the link below to set your password and get started:",
    "",
    inviteUrl,
    "",
    `This link expires in ${expiryText} and can only be used once. If it expires, ask ${invitedBy} to send a new one.`,
    "",
    "If you weren't expecting this, you can ignore this email.",
    "",
    "— MW Practical Study",
  ].join("\n");
}

export function invitationHtml({ name, inviteUrl, invitedBy, expiryText }: InvitationEmailInput): string {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(inviteUrl);
  const safeInviter = escapeHtml(invitedBy);
  const safeExpiry = escapeHtml(expiryText);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>You're invited</title>
</head>
<body style="margin:0; padding:0; background-color:${BG}; -webkit-text-size-adjust:100%;">
<!-- Preheader: shown in the inbox list preview, hidden in the body. -->
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:transparent; height:0; width:0;">
${safeInviter} invited you to MW Practical Study — set your password to get started.
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
You&rsquo;re invited
</h1>

<p style="margin:0 0 16px 0; font-family:${SANS}; font-size:15px; line-height:1.65; color:${TEXT};">
Hi ${safeName},
</p>

<p style="margin:0 0 28px 0; font-family:${SANS}; font-size:15px; line-height:1.65; color:${TEXT};">
${safeInviter} has invited you to MW Practical Study — a blind-tasting study app built around ten
years of Master of Wine practical exam papers. Set your password below to get started.
</p>

<!-- Button. VML so Outlook renders a real filled button rather than bare text. -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
<tr>
<td align="center" bgcolor="${ACCENT}" style="background-color:${ACCENT}; border-radius:8px;">
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeUrl}" style="height:44px;v-text-anchor:middle;width:220px;" arcsize="18%" stroke="f" fillcolor="${ACCENT}">
<w:anchorlock/>
<center style="color:${CARD};font-family:${SANS};font-size:15px;font-weight:600;">Set your password</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-- -->
<a href="${safeUrl}" style="display:inline-block; padding:13px 28px; font-family:${SANS}; font-size:15px; font-weight:600; color:${CARD}; text-decoration:none; border-radius:8px;">
Set your password
</a>
<!--<![endif]-->
</td>
</tr>
</table>

<p style="margin:0 0 8px 0; font-family:${SANS}; font-size:13px; line-height:1.6; color:${MUTED};">
This link expires in ${safeExpiry} and can only be used once. If it expires, ask ${safeInviter} to send a new one.
</p>

<p style="margin:0 0 24px 0; font-family:${SANS}; font-size:13px; line-height:1.6; color:${MUTED};">
If you weren&rsquo;t expecting this, you can safely ignore this email.
</p>

<!-- Fallback for clients that strip or mangle the button. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="border-top:1px solid ${BORDER}; padding-top:20px;">
<p style="margin:0 0 6px 0; font-family:${SANS}; font-size:12px; line-height:1.6; color:${MUTED};">
If the button doesn&rsquo;t work, paste this into your browser:
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
You received this because ${safeInviter} invited this address to MW Practical Study.
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;
}
