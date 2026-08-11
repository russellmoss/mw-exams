// bin-fix-miner-prompt.ts — cluster recurring bin reasons into root-cause fix proposals.
//
// The digest/lessons blocks are rolling nudges: recurring faults age out and recur. This prompt asks
// the model to find the CLUSTERS — the same fault binned again and again — and to propose ONE
// mechanical fix per cluster, targeted at the layer where that logic actually lives (the same
// "narrowest fix" doctrine the feedback pipeline uses). Output is strict JSON; the app inserts each
// cluster as a bin_fix_proposals row for the admin to dispatch (PR-gated) or reject.

import { BIN_REASON_LABELS } from "@/lib/bin-reasons";

export interface MinableBinRow {
  itemId: string;
  paper: number | null;
  tags: string[];
  note: string | null;
  stem: string | null;
  binnedAt: string;
  // Which signal stream the row came from. Omitted = 'bin' (the original stream), so existing
  // callers and tests keep working. 'feedback' rows are user feedback the analysis loop accepted;
  // feedbackStatus distinguishes fully accepted from partially accepted — or 'endorsed' (praise:
  // POSITIVE signal, a contrast class, often carrying an embedded design suggestion).
  source?: "bin" | "feedback";
  feedbackStatus?: "accepted" | "partial" | "endorsed";
}

export interface ExistingProposalSummary {
  theme: string;
  /**
   * The OUTCOME label from proposal-outcomes.ts, not the raw DB status.
   *
   * A shipped proposal arrives here as "shipped — NOT VALIDATED" or "shipped — DID NOT HOLD, fault
   * re-proposed as #N". The raw status alone read as a track record: twenty-one rows saying
   * "[shipped]" while the measured reject rate over the same period went 34% -> 42%.
   */
  status: string;
  /** Proposal id, so a recurrence label can name the proposal that restated the fault. */
  id?: string;
}

export function buildBinFixMinerPrompt(params: {
  rows: MinableBinRow[];
  existingProposals: ExistingProposalSummary[];
}): { system: string; user: string } {
  const system = `You are the bin ROOT-CAUSE MINER for the MW Practical Exam Study System.

## Context
The ledger below carries TWO validated human signal streams, labeled per row:
- "admin bin": an expert admin reviewed a generated practice question and binned it with a reason.
- "user feedback (accepted)" / "user feedback (partial)": a user complained about a served question
  or drill, and the feedback-analysis loop judged the complaint valid (fully or partially). Raw
  unvetted feedback never reaches you.
- "user feedback (endorsed)": a user PRAISED a served question and the loop endorsed it. These are
  positive rows — never cluster them as faults. Use them two ways: (1) as a CONTRAST class (what do
  endorsed questions have that a fault cluster's questions lack — that difference sharpens the
  proposal); (2) praise often embeds a design suggestion ("one wine could be New World for extra
  contrast") — a suggestion recurring across ≥3 endorsed rows may itself form a cluster, phrased as
  an enhancement, provided the fix is still mechanical (a prompt constraint or selection rule).
Both streams feed prompts only as bounded rolling nudges — which means a RECURRING fault keeps
recurring: the same complaint appears three, four, six times. Your job is to find those recurring
clusters and propose ONE mechanical fix per cluster, so the fault is enforced in code permanently
instead of re-whispered to the model forever.

## What qualifies as a cluster
- At least 3 ledger rows expressing the SAME underlying fault (same root cause, not merely the same
  tag — "too_obscure because no banker in the flight" and "too_obscure because the producer is
  obscure" are DIFFERENT clusters).
- Clusters MAY mix sources — the same fault surfacing in admin bins AND accepted user feedback is
  STRONGER evidence than either stream alone, so prefer forming the cross-source cluster over two
  smaller single-source ones.
- Weight repeat-accepted feedback specially: every accepted feedback already triggered its own
  one-off point fix when it was accepted, so a fault that KEEPS being accepted over time is proof
  the point fixes did not generalize — exactly what a root-cause fix is for.
- The fault must be fixable MECHANICALLY — as a validator rule, a generation-prompt constraint, a
  selection/query rule, or a data cap. If the only fix is "tell the model to try harder", it is not a
  cluster; leave it to the rolling digest.
- Skip anything that materially matches an existing proposal listed below (any status except
  'rejected' means it is or was in flight; 'rejected' means the admin declined it — do not re-propose
  the same theme).

## Fix targeting (the narrowest-layer doctrine)
Name the layer/file the fix belongs in — mis-targeting produces a fix that cannot work:
- What a generated question CONTAINS (wine choice, banker/curveball mix, mark allocation, stem
  phrasing rules, "don't state what the candidate should infer"):
  study-app/src/lib/prompts/question-generation-prompt.ts (kind: generation)
- A bad question PASSING validation (stem contradicts wines, missing banker where the family
  requires one, marks inconsistent): study-app/src/lib/question-validator.ts (kind: validator)
- Wine/producer SELECTION, repetition caps, dedup: study-app/src/lib/question-engine.ts,
  study-app/src/lib/db.ts, or the producer-spread logic in study-app/src/lib/bank-health/
  (kind: generation)
- Pick kind 'validator' when the fix is a CHECK that rejects bad output; 'generation' when it is a
  CONSTRAINT that prevents producing it.
- PREFER 'generation' WHEN BOTH APPLY. This reverses earlier guidance ("prefer validator — checks
  are testable"), which measurement contradicted on both halves:
  * Checks are not more testable. Every selection rule shipped on 2026-08-10 (country/Old-New World
    spread, flight-fingerprint dedup, style frequency caps) landed with unit tests and passed. And a
    selection rule is testable in the way that matters more — its effect on the first-pass rate is
    directly measurable via scripts/analyze-generation.mjs.
  * Checks cost more than they look. First-pass generation currently passes only 25% of drafts
    (416/1643 over 30 days); every hard validator rule lowers that further and buys another redraft
    at full model price. A validator rule ALSO re-judges the existing bank: one proposal
    (MISSING_RS_ALCOHOL_ASK) would have moved hard violations from 181 to 319 of 886 banked
    questions — 138 new quarantines from a single rule.
  A constraint that prevents the fault costs one selection retry. A check that catches it costs a
  redraft plus a retroactive quarantine. Reach for the check only when the fault genuinely cannot be
  prevented at selection time — e.g. it depends on the STEM the model writes, not on the wines chosen.
- If you do propose kind 'validator', the brief MUST state how many currently-banked questions the
  rule would newly fail, or say plainly that the number is unknown and must be measured before merge.
  A rule whose blast radius nobody stated is a rule nobody can price.

## Proposal quality bar
Each proposal is a build brief an autonomous coding agent will implement and a human will review as a
PR. It must be specific: name the file, the rule, the threshold, and the test to add. 4–10 sentences.
Never propose sweeping rewrites; one narrow rule per cluster.

## Output format (STRICT)
Raw JSON only — no markdown fences, no prose before or after:
{"clusters": [{"theme": "<short label, <=80 chars>", "kind": "generation"|"validator",
"paper": <1|2|3|null for cross-paper>, "itemIds": ["<ledger item_id>", ...],
"proposal": "<the build brief>"}]}
- itemIds must list EVERY ledger row below that belongs to the cluster (these get retired when the
  fix ships — an omitted row keeps nagging the prompts forever).
- If nothing qualifies, return {"clusters": []}.`;

  const rowsBlock = params.rows
    .map((r) => {
      const tagLabels = r.tags.map((t) => BIN_REASON_LABELS[t] || t).join(", ");
      const source =
        r.source === "feedback" ? `user feedback (${r.feedbackStatus ?? "accepted"})` : "admin bin";
      return [
        `- item_id: ${r.itemId} | paper ${r.paper ?? "?"} | ${r.binnedAt.slice(0, 10)} | source: ${source}`,
        `  tags: ${tagLabels || "(none)"}`,
        r.note ? `  note: "${r.note}"` : null,
        r.stem ? `  stem: ${r.stem.slice(0, 200)}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const proposalsBlock =
    params.existingProposals.length > 0
      ? params.existingProposals
          .map((p) => `- [${p.status}]${p.id ? ` #${p.id}` : ""} ${p.theme}`)
          .join("\n")
      : "(none)";

  const user = `## Signal ledger — reasoned bins + accepted user feedback still live in the prompt feeds
${rowsBlock}

## Existing proposals (do not duplicate; 'rejected' means declined — do not re-propose)
SHIPPED DOES NOT MEAN IT WORKED, and each row now carries what is actually known:
- "shipped — NOT VALIDATED" — the PR merged; nothing has measured whether the fault stopped. This is
  the honest default, not a pass. Measured over 497 reviewer votes, fifteen rules written this way
  moved the reject rate from 34% to 42% — they made it WORSE — and one rejected 13.1% of REAL
  past-paper flights. A long list of shipped rows is not a track record.
- "shipped — DID NOT HOLD, fault re-proposed as #N" — the fault came back after the fix landed. Do
  NOT re-propose the same shape at the same layer; it already failed once. Either target a different
  layer (usually: prevent it at selection instead of rejecting it at validation) or leave it alone
  and say why in a different cluster.
Recurrence detection UNDER-REPORTS — it matches theme text, and you are told above not to repeat a
theme, so the clearest evidence of failure is the thing this instruction suppresses. Treat "NOT
VALIDATED" as unknown, never as working.
${proposalsBlock}

Mine the clusters now and return the strict JSON.`;

  return { system, user };
}
