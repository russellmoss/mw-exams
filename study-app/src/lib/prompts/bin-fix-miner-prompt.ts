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
  status: string;
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
  CONSTRAINT that prevents producing it. Prefer validator when both apply — checks are testable.

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
      ? params.existingProposals.map((p) => `- [${p.status}] ${p.theme}`).join("\n")
      : "(none)";

  const user = `## Signal ledger — reasoned bins + accepted user feedback still live in the prompt feeds
${rowsBlock}

## Existing proposals (do not duplicate; 'rejected' means declined — do not re-propose)
${proposalsBlock}

Mine the clusters now and return the strict JSON.`;

  return { system, user };
}
