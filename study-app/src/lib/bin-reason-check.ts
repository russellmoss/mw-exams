// bin-reason-check.ts — the "push back on a bad bin reason" loop (the bin-side twin of
// feedback-analysis.ts).
//
// A reasoned bin feeds forward into generation prompts, so a factually wrong reason mis-trains the
// generator. runBinReasonCheck() adjudicates the stated reason against the question's own content,
// the historical corpus, and the live EK — and stores the verdict ON THE LEDGER ROW. The bin itself
// is never touched: 'invalid' only (a) excludes the reason from the digest/lessons feeds (gated in
// db.ts) and (b) surfaces a Pushback card on /admin where the admin can Restore the question or
// Uphold the bin ('upheld' re-admits the reason to the feeds — the admin has final say).
//
// Called best-effort (fire-and-forget in after()) from every path a reason can land through, so it
// must never throw into a bin flow. Reasons are re-applied per chip tap while the Undo bar is up;
// check_fingerprint makes repeat calls for an unchanged (tags, note) pair a cheap no-op.

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import { getEmpiricalKnowledgeForAnalysis } from "@/lib/db";
import { buildBinReasonCheckPrompt } from "@/lib/prompts/bin-reason-check-prompt";

export type BinReasonCheckStatus =
  | "checked"
  | "no_reason"
  | "no_question"
  | "already_checked"
  | "not_found"
  | "no_api_key"
  | "error";

export interface BinReasonCheckResult {
  status: BinReasonCheckStatus;
  verdict?: "valid" | "invalid" | "uncertain";
}

// Stable fingerprint of a (tags, note) pair — what a stored verdict was computed FOR. Order of tag
// taps must not force a re-check, so tags are sorted.
export function binReasonFingerprint(tags: string[] | null, note: string | null): string {
  return JSON.stringify([[...(tags ?? [])].sort(), (note ?? "").trim()]);
}

// Parse the strict first-line verdict; anything malformed degrades to 'uncertain' (which feeds
// forward, i.e. behaves exactly like today) rather than ever fabricating a challenge.
export function parseBinReasonVerdict(text: string): "valid" | "invalid" | "uncertain" {
  const m = text.match(/verdict:\s*\**(valid|invalid|uncertain)\**/i);
  return (m?.[1]?.toLowerCase() as "valid" | "invalid" | "uncertain") ?? "uncertain";
}

export async function runBinReasonCheck(opts: {
  itemId: string;
  apiKey?: string;
  userId?: number | null;
  source?: "user" | "server";
}): Promise<BinReasonCheckResult> {
  try {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { status: "no_api_key" };

    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`
      SELECT b.item_id, b.paper, b.reason_tags, b.reason_note, b.check_fingerprint,
             g.question_text, g.wines, g.family_label, g.total_marks
      FROM bank_bin_reasons b
      LEFT JOIN generated_questions g ON g.question_id = b.item_id
      WHERE b.item_id = ${opts.itemId}
    `;
    const row = rows[0] as
      | {
          paper: number;
          reason_tags: string[] | null;
          reason_note: string | null;
          check_fingerprint: string | null;
          question_text: string | null;
          wines: unknown;
          family_label: string | null;
          total_marks: number | null;
        }
      | undefined;
    if (!row) return { status: "not_found" };

    const tags = Array.isArray(row.reason_tags) ? row.reason_tags : [];
    const note = row.reason_note?.trim() || null;
    if (tags.length === 0 && !note) return { status: "no_reason" };
    // Can't adjudicate a reason without the question it is about (older hard-deleted rows).
    if (!row.question_text) return { status: "no_question" };

    const fingerprint = binReasonFingerprint(tags, note);
    if (row.check_fingerprint === fingerprint) return { status: "already_checked" };

    const wines = (
      typeof row.wines === "string" ? JSON.parse(row.wines) : (row.wines ?? [])
    ) as { slot: number; fullText: string }[];

    const empiricalKnowledge = await getEmpiricalKnowledgeForAnalysis(row.paper);
    const prompt = buildBinReasonCheckPrompt({
      paper: row.paper,
      familyLabel: row.family_label,
      questionText: row.question_text,
      wines,
      totalMarks: row.total_marks,
      tags,
      note,
      empiricalKnowledge,
    });

    const client = new Anthropic({ apiKey });
    const { model, abGroup } = await selectModel("bin_reason_check", apiKey, "sonnet");
    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 700,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    logClaudeUsage(
      {
        taskType: "bin_reason_check",
        model,
        source: opts.source ?? "server",
        userId: opts.userId ?? null,
        abGroup,
      },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("")
      .trim();
    const verdict = parseBinReasonVerdict(text);
    const analysis = text.replace(/^\s*verdict:.*$/im, "").trim().slice(0, 4000);

    // Guard against a chip tap that changed the reason while this check was in flight: only store a
    // verdict for the exact (tags, note) it was computed on. A superseding reason arrives with its
    // check columns cleared (applyBinReasons), so the next check re-runs on the new state.
    const tagsVal = tags.length > 0 ? tags : null;
    await sql`
      UPDATE bank_bin_reasons SET
        check_verdict = ${verdict}, check_analysis = ${analysis},
        check_fingerprint = ${fingerprint}, checked_at = NOW()
      WHERE item_id = ${opts.itemId}
        AND reason_tags IS NOT DISTINCT FROM ${tagsVal}
        AND reason_note IS NOT DISTINCT FROM ${row.reason_note}
    `;

    if (verdict === "invalid") {
      console.warn(`[bin-reason-check] CHALLENGED item=${opts.itemId} tags=${tags.join(",")}`);
    }
    return { status: "checked", verdict };
  } catch (err) {
    console.error("[bin-reason-check] failed (non-fatal):", err);
    return { status: "error" };
  }
}
