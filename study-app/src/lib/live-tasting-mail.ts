import { sendEmail } from "./email";

/**
 * Live Tasting transactional mail (migration 044): the partner shopping brief and the
 * "question is ready" nudge back to the candidate. Both best-effort via the Brevo mailer
 * (sendEmail never throws).
 */

/** Minimal markdown→HTML for OUR generated briefs (headings/bold/lists/hr) — no md lib server-side. */
export function briefMarkdownToHtml(md: string): string {
  const esc = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = esc.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  const inline = (s: string) =>
    s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*]+)\*/g, "<em>$1</em>");
  for (const line of lines) {
    const l = line.trim();
    if (/^- /.test(l)) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(l.slice(2))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    if (/^---+$/.test(l)) out.push("<hr>");
    else if (/^### /.test(l)) out.push(`<h3>${inline(l.slice(4))}</h3>`);
    else if (/^## /.test(l)) out.push(`<h2>${inline(l.slice(3))}</h2>`);
    else if (/^# /.test(l)) out.push(`<h2>${inline(l.slice(2))}</h2>`);
    else if (l) out.push(`<p>${inline(l)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
}

export async function sendPartnerBriefEmail(opts: {
  to: string;
  brief: string;
  entryUrl: string;
}): Promise<boolean> {
  const { to, brief, entryUrl } = opts;
  const html = `
<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 640px; margin: 0 auto; color: #1c1917;">
  <h1 style="font-size: 20px;">You're the wine buyer for a blind tasting</h1>
  <p>Someone practising for the Master of Wine exam needs you to buy their wines — <strong>don't tell them what you pick</strong>.</p>
  <p>1. Buy bottles matching the brief below (any decent wine shop or mail order).<br>
     2. Enter exactly what you bought at the link — the practice question is built around your bottles.<br>
     3. Bag and number the bottles; reveal nothing until they've answered.</p>
  <p style="margin: 24px 0;">
    <a href="${entryUrl}" style="background: #b45309; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open the brief &amp; enter the wines</a>
  </p>
  <hr style="border: none; border-top: 1px solid #d6d3d1; margin: 24px 0;">
  ${briefMarkdownToHtml(brief)}
  <p style="color: #78716c; font-size: 12px; margin-top: 24px;">This link stops working once the tasting is graded.</p>
</div>`;
  const text = `You're the wine buyer for a blind tasting practice. Don't tell them what you pick.\n\nBuy bottles matching the brief, then enter what you bought here:\n${entryUrl}\n\n${brief}`;
  const res = await sendEmail({
    to,
    subject: "Wine shopping brief — you're buying for a blind tasting",
    html,
    text,
  });
  return res.ok;
}

export async function sendQuestionReadyEmail(opts: {
  to: string;
  toName?: string;
  sessionUrl: string;
}): Promise<boolean> {
  const { to, toName, sessionUrl } = opts;
  const html = `
<div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 640px; margin: 0 auto; color: #1c1917;">
  <h1 style="font-size: 20px;">Your blind tasting is ready 🍷</h1>
  <p>Your partner has the wines and entered them — the question is live. When the bottles are bagged, numbered and poured, open your session and taste blind.</p>
  <p style="margin: 24px 0;">
    <a href="${sessionUrl}" style="background: #b45309; color: #fff; padding: 12px 20px; border-radius: 8px; text-decoration: none; font-weight: 600;">Open your Live Tasting</a>
  </p>
  <p style="color: #78716c; font-size: 12px;">You'll see the question stem only — the wines stay hidden until you're graded.</p>
</div>`;
  const text = `Your blind tasting is ready. Your partner entered the wines and the question is live:\n${sessionUrl}`;
  const res = await sendEmail({
    to,
    toName,
    subject: "Your blind tasting is ready — the wines are in",
    html,
    text,
  });
  return res.ok;
}
