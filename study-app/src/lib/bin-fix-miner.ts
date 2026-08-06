// bin-fix-miner.ts — the bin root-cause miner + codify-and-retire loop (migration 042).
//
// The digest/lessons prompt blocks are bounded rolling nudges, so a RECURRING fault ages out and
// recurs (the ledger shows the same complaint binned 3–6 times). This module closes that gap:
//
//   mineBinFixProposals()     — cluster recurring reasoned bins (one LLM call over the live ledger)
//                               and store one mechanical-fix proposal per cluster for admin review.
//   dispatchBinFixProposal()  — fire the proposal through the EXISTING auto-feedback GitHub Action
//                               as a PR-GATED code change (reviewOnly always; scoped to the same
//                               path allow-lists feedback uses for that Kind). No auto-merge, ever.
//   reconcileBinFixProposals()— pull PR state from GitHub (nothing pushes merges back to us); when a
//                               fix PR has merged, RETIRE the cluster's ledger rows from the prompt
//                               feeds (codified_by) and regenerate the lessons summary. Knowledge
//                               migrates from prompt-nudge to code; the prompts shrink.
//
// Mining is deliberately conservative: clusters need ≥3 evidence rows, fixes must be mechanical, and
// anything materially matching an existing proposal is skipped (enforced in the prompt AND re-checked
// here). The admin always sits between a proposal and a dispatch.

import Anthropic from "@anthropic-ai/sdk";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import {
  getBinRowsForMining,
  getBinFixProposals,
  getBinFixProposal,
  insertBinFixProposal,
  markBinFixDispatched,
  markBinFixPrState,
  retireBinFixEvidence,
  type BinFixProposal,
} from "@/lib/db";
import { buildBinFixMinerPrompt } from "@/lib/prompts/bin-fix-miner-prompt";
import { dispatchRepositoryEvent } from "@/lib/github-dispatch";
import { GEN_PATHS, VALIDATOR_PATHS } from "@/lib/apply-change";
import { reconcileOpenPrs } from "@/lib/pr-status";
import { regenerateBinLessons } from "@/lib/bin-lessons";
import { BIN_REASON_LABELS } from "@/lib/bin-reasons";

const MIN_CLUSTER_SIZE = 3;

export interface MinedCluster {
  theme: string;
  kind: "generation" | "validator";
  paper: number | null;
  itemIds: string[];
  proposal: string;
}

// Parse + validate the miner's JSON. `knownItemIds` is the set the model was shown — anything else
// is hallucinated and dropped; a cluster that falls under MIN_CLUSTER_SIZE after filtering dies.
// Malformed output degrades to [] (mine nothing) — never to a fabricated proposal.
export function parseMinedClusters(text: string, knownItemIds: Set<string>): MinedCluster[] {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) raw = fence[1].trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const clusters = (parsed as { clusters?: unknown })?.clusters;
  if (!Array.isArray(clusters)) return [];

  const out: MinedCluster[] = [];
  for (const c of clusters) {
    const theme = typeof (c as { theme?: unknown }).theme === "string" ? ((c as { theme: string }).theme || "").trim() : "";
    const kind = (c as { kind?: unknown }).kind;
    const paperRaw = (c as { paper?: unknown }).paper;
    const proposal =
      typeof (c as { proposal?: unknown }).proposal === "string" ? ((c as { proposal: string }).proposal || "").trim() : "";
    const idsRaw = (c as { itemIds?: unknown }).itemIds;
    if (!theme || !proposal) continue;
    if (kind !== "generation" && kind !== "validator") continue;
    const paper = paperRaw === 1 || paperRaw === 2 || paperRaw === 3 ? paperRaw : null;
    const itemIds = Array.isArray(idsRaw)
      ? [...new Set(idsRaw.filter((x): x is string => typeof x === "string" && knownItemIds.has(x)))]
      : [];
    if (itemIds.length < MIN_CLUSTER_SIZE) continue;
    out.push({ theme: theme.slice(0, 200), kind, paper, itemIds, proposal });
  }
  return out;
}

export interface MineResult {
  status: "mined" | "nothing_to_mine" | "no_api_key" | "error";
  created: BinFixProposal[];
}

export async function mineBinFixProposals(opts: {
  apiKey?: string;
  userId?: number | null;
  source?: "user" | "server";
}): Promise<MineResult> {
  try {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { status: "no_api_key", created: [] };

    const rows = await getBinRowsForMining();
    if (rows.length < MIN_CLUSTER_SIZE) return { status: "nothing_to_mine", created: [] };
    const existing = await getBinFixProposals();

    const prompt = buildBinFixMinerPrompt({
      rows,
      existingProposals: existing.map((p) => ({ theme: p.theme, status: p.status })),
    });

    const client = new Anthropic({ apiKey });
    const { model, abGroup } = await selectModel("bin_fix_mining", apiKey, "opus");
    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 4000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    logClaudeUsage(
      { taskType: "bin_fix_mining", model, source: opts.source ?? "server", userId: opts.userId ?? null, abGroup },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    const clusters = parseMinedClusters(text, new Set(rows.map((r) => r.itemId)));

    // Defensive theme dedupe on top of the prompt instruction — an identical theme (case-insensitive)
    // never becomes a second proposal row, whatever the model said.
    const seenThemes = new Set(existing.map((p) => p.theme.toLowerCase().trim()));
    const created: BinFixProposal[] = [];
    for (const c of clusters) {
      const key = c.theme.toLowerCase().trim();
      if (seenThemes.has(key)) continue;
      seenThemes.add(key);
      created.push(
        await insertBinFixProposal({
          theme: c.theme,
          kind: c.kind,
          paper: c.paper,
          evidenceItemIds: c.itemIds,
          proposal: c.proposal,
        })
      );
    }
    return { status: "mined", created };
  } catch (err) {
    console.error("[bin-fix-miner] mine failed (non-fatal):", err);
    return { status: "error", created: [] };
  }
}

// Fire a proposal through the auto-feedback Action. Reuses the exact event the feedback pipeline
// uses: analysisId is intentionally OMITTED (record-apply.mjs skips the feedback_analyses write and
// the EK-sync steps skip), binProposalId routes the result write-back to bin_fix_proposals instead.
// reviewOnly is ALWAYS "true" — a bin-driven generation/validator change is high-stakes by
// definition and must land as a PR for human review, never an auto-merge.
export async function dispatchBinFixProposal(opts: {
  proposalId: number;
  adminUserId: number;
}): Promise<{ dispatched: boolean; error?: string }> {
  const p = await getBinFixProposal(opts.proposalId);
  if (!p) return { dispatched: false, error: "not_found" };
  if (!["proposed", "failed", "pr_closed"].includes(p.status)) {
    return { dispatched: false, error: `not_dispatchable_from_${p.status}` };
  }

  // Ground the build brief in the actual evidence: the reasons (and stems) the cluster is made of.
  const evidence = (await getBinRowsForMining(500)).filter((r) => p.evidenceItemIds.includes(r.itemId));
  const evidenceBlock = evidence
    .map((r) => {
      const tagLabels = r.tags.map((t) => BIN_REASON_LABELS[t] || t).join(", ");
      return [
        `- ${r.itemId} (paper ${r.paper})${tagLabels ? ` — ${tagLabels}` : ""}`,
        r.note ? `  reviewer note: "${r.note}"` : null,
        r.stem ? `  stem: ${r.stem.slice(0, 180)}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const context = [
    `Recurring bin-reason cluster: ${p.theme}`,
    `Scope: ${p.paper ? `Paper ${p.paper}` : "cross-paper"} — ${p.evidenceItemIds.length} reasoned bins by the admin reviewer`,
    ``,
    `## Evidence (the binned questions and the reviewer's stated reasons)`,
    evidenceBlock || "(evidence rows no longer readable — see proposal)",
  ].join("\n");

  const analysisText = [
    `### Proposed Change (authoritative — implement this)`,
    p.proposal,
    ``,
    `Kind: ${p.kind}`,
  ].join("\n");

  const workBranch = `bin-fix/proposal-${p.id}`;
  const allowedPaths = (p.kind === "validator" ? VALIDATOR_PATHS : GEN_PATHS).join("\n");

  await dispatchRepositoryEvent("auto-feedback", {
    attemptId: 0,
    binProposalId: p.id,
    appliedBy: `admin:${opts.adminUserId}`,
    workBranch,
    context,
    analysisText,
    allowedPaths,
    reviewOnly: "true",
  });

  await markBinFixDispatched(p.id, workBranch, opts.adminUserId);
  return { dispatched: true };
}

// Pull-based close of the loop (same pattern as feedback/feature PRs): find proposals we believe
// are in flight, ask GitHub what actually happened, and on merge retire the evidence + refresh the
// lessons summary. Returns what changed so callers can log/serve it.
export async function reconcileBinFixProposals(): Promise<{
  merged: number[];
  closed: number[];
  retiredRows: number;
}> {
  const proposals = await getBinFixProposals();
  const inFlight = proposals
    .filter((p) => ["dispatched", "pr_opened"].includes(p.status))
    .map((p) => ({ id: p.id, pr_url: p.prUrl }));

  const merged: number[] = [];
  const closed: number[] = [];
  await reconcileOpenPrs(
    inFlight,
    () => true,
    async (row, state) => {
      await markBinFixPrState(row.id, state === "merged" ? "merged" : "pr_closed");
      (state === "merged" ? merged : closed).push(row.id);
    }
  );

  // Retire everything sitting at 'merged' — from this pass or written directly by the Action.
  let retiredRows = 0;
  const toRetire = new Set<number>(merged);
  for (const p of proposals) if (p.status === "merged") toRetire.add(p.id);
  for (const id of toRetire) retiredRows += await retireBinFixEvidence(id);

  // A retirement changes what the lessons distil from — refresh now, not on the next reasoned bin.
  if (retiredRows > 0) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) await regenerateBinLessons(apiKey, null);
  }

  return { merged, closed, retiredRows };
}
