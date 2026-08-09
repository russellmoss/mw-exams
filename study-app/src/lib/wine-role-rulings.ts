// wine-role-rulings.ts — the ledger of banker/curveball claims, and the batch adjudicator.
//
// A reviewer flips a wine's role chip on /review. That is a specific, checkable assertion about how the
// Institute uses one class of wine, and it is the highest-leverage feedback this system receives:
// upheld, it edits data/banker_signals.json, which changes both the validator that rejects flights and
// the prompt that builds them, and then invalidates banked questions that were only passing under the
// old calibration.
//
// The RULES for ruling on a claim live in prompts/role-adjudication.ts, shared with the feedback
// analyser so an inline adjudication (dispute filed with a rejection) and a batch one (dispute filed
// with an approve) cannot reach different verdicts on the same claim. This module owns the database
// side: reading pending claims, spending the tokens, writing the verdicts back.
//
// An OVERRULED ruling is a first-class outcome and is retained, not deleted: it is the record that the
// system pushed back, it stops the same disputed wine being re-litigated every pass, and the
// upheld:overruled ratio is the only measure of whether this loop adjudicates or rubber-stamps.

import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import {
  buildRoleAdjudicationSystemPrompt,
  parseRoleRulings,
  renderCalibrationForAdjudication,
  renderRoleClaims,
  type ParsedRuling,
  type ProposedEdit,
  type RoleDisputeForPrompt,
} from "@/lib/prompts/role-adjudication";

export type RulingVerdict = "pending" | "upheld" | "overruled" | "inconclusive";

export interface RoleRuling extends RoleDisputeForPrompt {
  reviewerId: number | null;
  verdict: RulingVerdict;
  rationale: string | null;
  proposedEdit: ProposedEdit | null;
  targetSignal: string | null;
  prUrl: string | null;
  codifiedAt: string | null;
  createdAt: string;
}

function db() {
  return neon(process.env.DATABASE_URL!);
}

function toRuling(r: Record<string, unknown>): RoleRuling {
  return {
    id: Number(r.id),
    questionId: String(r.question_id),
    slot: Number(r.slot),
    reviewerId: r.reviewer_id == null ? null : Number(r.reviewer_id),
    reviewerName: (r.reviewer_name as string) ?? null,
    wineLabel: (r.wine_label as string) ?? null,
    variety: (r.variety as string) ?? null,
    region: (r.region as string) ?? null,
    country: (r.country as string) ?? null,
    keyedRole: r.keyed_role as "banker" | "curveball",
    claimedRole: r.claimed_role as "banker" | "curveball",
    verdict: r.verdict as RulingVerdict,
    rationale: (r.rationale as string) ?? null,
    proposedEdit: (r.proposed_edit as ProposedEdit) ?? null,
    targetSignal: (r.target_signal as string) ?? null,
    prUrl: (r.pr_url as string) ?? null,
    codifiedAt: r.codified_at ? String(r.codified_at) : null,
    createdAt: String(r.created_at),
  };
}

export async function getRoleRulings(
  opts: {
    verdict?: RulingVerdict;
    limit?: number;
    /** Only upheld rulings whose edit has not yet been carried into the signal table. */
    uncodifiedOnly?: boolean;
  } = {}
): Promise<RoleRuling[]> {
  const sql = db();
  const rows = (await sql.query(
    `
    SELECT r.*, u.name AS reviewer_name
    FROM wine_role_rulings r
    LEFT JOIN users u ON u.id = r.reviewer_id
    WHERE ($1::text IS NULL OR r.verdict = $1)
      AND ($2::boolean IS NOT TRUE OR r.codified_at IS NULL)
    ORDER BY r.created_at DESC
    LIMIT $3
    `,
    [
      opts.verdict ?? null,
      opts.uncodifiedOnly ?? false,
      Math.max(1, Math.min(200, opts.limit ?? 50)),
    ]
  )) as unknown as Record<string, unknown>[];
  return rows.map(toRuling);
}

/** The pending claims attached to one attempt — what a rejection's own analysis should rule on. */
export async function getPendingRulingsForAttempt(attemptId: number): Promise<RoleRuling[]> {
  const sql = db();
  const rows = (await sql`
    SELECT r.*, u.name AS reviewer_name
    FROM wine_role_rulings r
    LEFT JOIN users u ON u.id = r.reviewer_id
    WHERE r.attempt_id = ${attemptId} AND r.verdict = 'pending'
    ORDER BY r.slot
  `) as Record<string, unknown>[];
  return rows.map(toRuling);
}

export async function recordRoleVerdicts(
  parsed: ParsedRuling[],
  analysisId?: number | null
): Promise<number> {
  if (parsed.length === 0) return 0;
  const sql = db();
  let n = 0;
  for (const p of parsed) {
    const rows = await sql`
      UPDATE wine_role_rulings
      SET verdict = ${p.verdict},
          rationale = ${p.rationale.slice(0, 2000)},
          proposed_edit = ${p.edit},
          target_signal = ${p.signal},
          analysis_id = COALESCE(${analysisId ?? null}, analysis_id),
          updated_at = NOW()
      WHERE id = ${p.id}
      RETURNING id
    `;
    n += rows.length;
  }
  return n;
}

/**
 * Adjudicate a batch of pending claims in one call, and write the verdicts back.
 *
 * Batched because the claims are independent and short: a review pass produces disputes in bursts, and
 * one call over ten of them costs a fraction of ten calls.
 *
 * Returns what it ruled AND which ids came back unruled. That second list is not an internal detail —
 * it is the difference between "the system considered your claim and disagreed" and "your claim fell
 * on the floor", and only the first is acceptable to show a reviewer who took the trouble to file it.
 */
export async function adjudicateRoleRulings(opts: {
  apiKey: string;
  rulingIds?: number[];
  limit?: number;
  userId?: number | null;
}): Promise<{ adjudicated: ParsedRuling[]; unruled: number[]; considered: number }> {
  const sql = db();
  const rows = (
    opts.rulingIds && opts.rulingIds.length > 0
      ? await sql`
          SELECT r.*, u.name AS reviewer_name FROM wine_role_rulings r
          LEFT JOIN users u ON u.id = r.reviewer_id
          WHERE r.id = ANY(${opts.rulingIds}) AND r.verdict = 'pending'
          ORDER BY r.id`
      : await sql`
          SELECT r.*, u.name AS reviewer_name FROM wine_role_rulings r
          LEFT JOIN users u ON u.id = r.reviewer_id
          WHERE r.verdict = 'pending'
          ORDER BY r.created_at ASC
          LIMIT ${Math.max(1, Math.min(25, opts.limit ?? 10))}`
  ) as Record<string, unknown>[];

  const rulings = rows.map(toRuling);
  if (rulings.length === 0) return { adjudicated: [], unruled: [], considered: 0 };

  const user = [
    renderCalibrationForAdjudication(),
    "",
    `## The ${rulings.length} claim${rulings.length === 1 ? "" : "s"} to adjudicate`,
    "",
    renderRoleClaims(rulings),
    "",
    `Work through each claim, then emit exactly ${rulings.length} RoleRuling line${rulings.length === 1 ? "" : "s"} — one per claim, in order.`,
  ].join("\n");

  const client = new Anthropic({ apiKey: opts.apiKey });
  const { model, abGroup } = await selectModel("role_adjudication", opts.apiKey, "opus");
  const t0 = Date.now();
  const message = await client.messages.create({
    model,
    // Sized for a batch: a paragraph of reasoning plus a verdict line per claim, over up to 25 claims.
    // The feedback analyser's hard lesson (ANALYSIS_MAX_TOKENS) is that the machine-readable line is
    // written LAST, so a ceiling that truncates loses precisely the part that matters.
    max_tokens: 16000,
    system: buildRoleAdjudicationSystemPrompt(),
    messages: [{ role: "user", content: user }],
  });
  logClaudeUsage(
    { taskType: "role_adjudication", model, source: "server", userId: opts.userId ?? null, abGroup },
    message.usage,
    { latencyMs: Date.now() - t0 }
  );

  const text = message.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  const sent = new Set(rulings.map((r) => r.id));
  const adjudicated = parseRoleRulings(text).filter((p) => sent.has(p.id));
  await recordRoleVerdicts(adjudicated);
  const ruled = new Set(adjudicated.map((p) => p.id));
  return {
    adjudicated,
    unruled: rulings.map((r) => r.id).filter((id) => !ruled.has(id)),
    considered: rulings.length,
  };
}
