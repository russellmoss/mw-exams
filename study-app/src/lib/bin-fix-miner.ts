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
  getFeedbackRowsForMining,
  getBinFixProposals,
  getBinFixProposal,
  insertBinFixProposal,
  markBinFixDispatched,
  markBinFixPrState,
  retireBinFixEvidence,
  tryAcquireMiningLock,
  releaseMiningLock,
  type BinFixProposal,
} from "@/lib/db";
import type { MinableBinRow } from "@/lib/prompts/bin-fix-miner-prompt";
import { buildBinFixMinerPrompt } from "@/lib/prompts/bin-fix-miner-prompt";
import { findRecurrences, outcomeLabel } from "@/lib/proposal-outcomes";
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

// Evidence some proposal already OWNS, and which must therefore not seed a second one.
//
// This used to key on 'shipped' alone, on the theory that a signal is spent once its root cause became
// code. That is true but far too late, and the gap it left is a race the miner loses routinely: a
// proposal reaches 'shipped' only after the PR merges AND reconcile runs, so every mine in between sees
// the evidence as live and clusters it again. On 2026-08-06 that produced three duplicate proposals in
// one day (10, 12 and 17 re-implementing validatePaperStyleMix, validateMarkBudget and the
// note-completeness codes), two of which reached open PRs before anyone noticed. Theme-text dedupe
// cannot catch them — the model rewords the label, and a reworded label is all it compares.
//
// So the claim starts at 'proposed'. The terminal-but-unshipped states deliberately RELEASE their
// evidence back to the pool: 'rejected' means the admin declined this framing (the fault is still real
// and should be re-mined, perhaps clustered differently), 'failed' means the Action produced nothing,
// and 'pr_closed' means the PR died unmerged. In all three the fault was never fixed.
//
// Applies to both streams. Bin rows have a codified_by column and feedback rows do not, but they share
// the race, so the in-memory claim covers both and no migration is needed.
const CLAIMING_STATUSES = new Set(["proposed", "dispatched", "pr_opened", "merged", "shipped"]);

export function claimedEvidenceIds(
  proposals: { status: string; evidenceItemIds: string[] }[]
): Set<string> {
  const out = new Set<string>();
  for (const p of proposals) {
    if (!CLAIMING_STATUSES.has(p.status)) continue;
    for (const id of p.evidenceItemIds) out.add(id);
  }
  return out;
}

type FeedbackMiningRow = Awaited<ReturnType<typeof getFeedbackRowsForMining>>[number];

function mapFeedbackRow(r: FeedbackMiningRow): MinableBinRow {
  return {
    itemId: r.itemId,
    paper: r.paper,
    tags: r.mode && r.mode !== "full" ? [`drill: ${r.mode}`] : [],
    note: r.note,
    stem: r.stem,
    binnedAt: r.submittedAt,
    source: "feedback",
    feedbackStatus: r.feedbackStatus,
  };
}

// Both signal streams in the one shape the miner prompt takes. Feedback rows carry their source
// label and use the feedback-submitted timestamp where the bin rows use binned_at. Exported for
// the offline mining dry-run harness; app code goes through mineBinFixProposals.
export async function getSignalRowsForMining(): Promise<MinableBinRow[]> {
  const [binRows, feedbackRows, proposals] = await Promise.all([
    getBinRowsForMining(),
    getFeedbackRowsForMining(),
    getBinFixProposals(),
  ]);
  const claimed = claimedEvidenceIds(proposals);
  const binMapped = binRows.filter((r) => !claimed.has(r.itemId)).map((r) => ({ ...r, source: "bin" as const }));
  const fbMapped = feedbackRows.filter((r) => !claimed.has(r.itemId)).map(mapFeedbackRow);
  // The mining routes run under Vercel's 300s maxDuration and a 43-row ledger already measured
  // ~270s of Opus thinking — cap the combined ledger so latency cannot grow unboundedly with
  // feedback volume. Admin bins always make the cut; newest feedback fills what remains.
  const MAX_MINING_ROWS = 100;
  return [...binMapped, ...fbMapped.slice(0, Math.max(0, MAX_MINING_ROWS - binMapped.length))];
}

// Second dedupe layer, behind the mining lock. The lock stops CONCURRENT runs from mining the same
// ledger blind to each other; this catches the sequential case where the model rewords a theme it
// was told not to re-propose ("Flight mark total must equal exactly 25 marks per wine" vs "Mark
// budget not enforced: total ≠ 25 × wines" — real proposals 12 and 14). Compared on significant
// words only, and the threshold is deliberately HIGH: suppressing a genuinely new cluster is worse
// than letting a near-duplicate through for the admin to reject.
const THEME_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "not", "is", "are", "be", "must",
  "per", "by", "with", "at", "as", "into", "one", "must", "should",
]);

export function themeTokens(theme: string): Set<string> {
  return new Set(
    theme
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !THEME_STOPWORDS.has(w))
  );
}

/**
 * Overlap coefficient (shared / smaller set) of two themes' significant words, 0–1.
 *
 * Measured against the real corpus rather than guessed: over the two known duplicate pairs and six
 * known-distinct pairs from bin_fix_proposals, the unstemmed overlap coefficient scored duplicates
 * at 0.43–0.50 and distinct pairs at 0.00–0.14 — a ~3x margin. Jaccard separates too but compresses
 * everything under 0.31, and crude plural-stemming made it WORSE (a distinct pair rose to 0.33) by
 * collapsing "wine"/"wines" across unrelated themes. Hence: overlap, no stemming.
 */
export function themeSimilarity(a: string, b: string): number {
  const ta = themeTokens(a);
  const tb = themeTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}

// Sits in the measured gap (distinct max 0.14, duplicate min 0.43), nearer the distinct side so a
// genuinely new cluster is never suppressed on a coin-flip.
export const THEME_DUPLICATE_THRESHOLD = 0.3;
// An overlap coefficient divides by the SMALLER set, so a 2-word theme would match almost anything
// containing both words. Require real lexical agreement as well — both known duplicates share 3+.
export const THEME_DUPLICATE_MIN_SHARED = 3;

export function isDuplicateTheme(a: string, b: string): boolean {
  if (a.toLowerCase().trim() === b.toLowerCase().trim()) return true;
  const ta = themeTokens(a);
  const tb = themeTokens(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared >= THEME_DUPLICATE_MIN_SHARED && themeSimilarity(a, b) >= THEME_DUPLICATE_THRESHOLD;
}

export interface MineResult {
  status: "mined" | "nothing_to_mine" | "no_api_key" | "already_running" | "error";
  created: BinFixProposal[];
}

export async function mineBinFixProposals(opts: {
  apiKey?: string;
  userId?: number | null;
  source?: "user" | "server";
}): Promise<MineResult> {
  let lockHeld = false;
  try {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { status: "no_api_key", created: [] };

    const rows = await getSignalRowsForMining();
    if (rows.length < MIN_CLUSTER_SIZE) return { status: "nothing_to_mine", created: [] };

    // Take the lock AFTER the cheap early-outs but BEFORE reading the proposals we dedupe against —
    // that read is the start of the critical section (see tryAcquireMiningLock).
    if (!(await tryAcquireMiningLock(opts.source === "user" ? `user:${opts.userId ?? "?"}` : "cron"))) {
      return { status: "already_running", created: [] };
    }
    lockHeld = true;
    const existing = await getBinFixProposals();

    // OUTCOME, not raw status. Passing p.status alone showed the miner twenty-one rows reading
    // "[shipped]" — which reads as a track record when nothing had ever measured whether one of
    // those fixes made its fault go away. outcomeLabel says "NOT VALIDATED" for the ones nobody has
    // checked and names the later proposal when a fault demonstrably came back.
    const recurrences = findRecurrences(
      existing.map((p) => ({
        id: p.id,
        theme: p.theme,
        kind: p.kind,
        status: p.status,
        shippedAt: p.retiredAt,
        createdAt: p.createdAt,
      }))
    );
    const prompt = buildBinFixMinerPrompt({
      rows,
      existingProposals: existing.map((p) => {
        const row = {
          id: p.id,
          theme: p.theme,
          kind: p.kind,
          status: p.status,
          shippedAt: p.retiredAt,
          createdAt: p.createdAt,
        };
        return { theme: p.theme, status: outcomeLabel(row, recurrences), id: String(p.id) };
      }),
    });

    const client = new Anthropic({ apiKey });
    const { model, abGroup } = await selectModel("bin_fix_mining", apiKey, "opus");
    const t0 = Date.now();
    // On current Opus-tier models thinking is ON by default and max_tokens caps thinking + text
    // TOGETHER — 4000 was consumed entirely by thinking over a 60-row ledger, returning zero text.
    const message = await client.messages.create({
      model,
      max_tokens: 16000,
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

    // Defensive theme dedupe on top of the prompt instruction: an identical theme never becomes a
    // second proposal row, and neither does a REWORDED one (themeSimilarity — see its comment).
    const seenThemes = existing.map((p) => p.theme);
    const created: BinFixProposal[] = [];
    for (const c of clusters) {
      const dupe = seenThemes.find((t) => isDuplicateTheme(t, c.theme));
      if (dupe) {
        console.log(`[bin-fix-miner] skipped near-duplicate theme "${c.theme}" (matches "${dupe}")`);
        continue;
      }
      seenThemes.push(c.theme);
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
  } finally {
    // Release only if WE took it — a run that bounced off a held lock must not free the holder's.
    if (lockHeld) await releaseMiningLock().catch(() => {});
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
  // A cluster's evidence may span both streams (admin bins + accepted user feedback).
  const [binRows, feedbackRows] = await Promise.all([
    getBinRowsForMining(500),
    getFeedbackRowsForMining(500),
  ]);
  const allRows: MinableBinRow[] = [
    ...binRows.map((r) => ({ ...r, source: "bin" as const })),
    ...feedbackRows.map(mapFeedbackRow),
  ];
  const evidence = allRows.filter((r) => p.evidenceItemIds.includes(r.itemId));
  const evidenceBlock = evidence
    .map((r) => {
      const tagLabels = r.tags.map((t) => BIN_REASON_LABELS[t] || t).join(", ");
      const noteLabel =
        r.source === "feedback"
          ? `user feedback (${r.feedbackStatus ?? "accepted"} by the analysis loop)`
          : "reviewer note";
      return [
        `- ${r.itemId} (paper ${r.paper ?? "?"})${tagLabels ? ` — ${tagLabels}` : ""}`,
        r.note ? `  ${noteLabel}: "${r.note}"` : null,
        r.stem ? `  stem: ${r.stem.slice(0, 180)}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");

  const context = [
    `Recurring fault cluster: ${p.theme}`,
    `Scope: ${p.paper ? `Paper ${p.paper}` : "cross-paper"} — ${p.evidenceItemIds.length} validated signals (admin bins and/or accepted user feedback)`,
    ``,
    `## Evidence (the flagged questions and the stated reasons)`,
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
