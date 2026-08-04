// bank-worker.ts — the Fill-the-Bank bulk generator.
//
// One bank_batch = one bulk run. This worker reuses the EXACT study-question pipeline
// (generateFreshQuestion in question-engine.ts) — same generation call, same hard validators, same
// background model-answer + wine-enrichment — but persists each result as status='pending' under the
// batch_id so nothing reaches a candidate until an admin approves it in the Fill-the-Bank section of
// the Admin settings card. Claude spend is
// logged by the engine's own logClaudeUsage calls, so a bulk run shows up on /admin/costs for free.
//
// DURABILITY: the run is driven from `after()` (post-response) and, if it can't finish inside one
// serverless invocation's wall-clock budget, it POSTs /api/admin/bank/resume to continue in a fresh
// invocation. A daily cron (/api/cron/bank-worker) is the safety net for any batch left 'running'.
// Progress (bank_batches.generated_count / failed_count) is written after every item, so a killed
// invocation resumes from where it stopped and a closed tab never strands a run.

import {
  createBankBatch,
  getBankBatch,
  incrementBatchCounts,
  setBankBatchStatus,
  getBatchActualCost,
  getBankFamilyHistogram,
  type BankBatch,
} from "@/lib/db";
import { generateFreshQuestion, type UsageMeta } from "@/lib/question-engine";

// Families valid for each paper, from the corpus paper×family grid (EK-0077). Requested questions
// are distributed round-robin across these so a bulk run ladders the whole family spread rather than
// stacking one shape. Within each generation the engine's corpus-calibrated prompt + validators
// steer the curveball mix (~75% low / 18% medium / 6% high, EK-0023) and the price-band spread.
export const PAPER_FAMILIES: Record<number, string[]> = {
  1: ["F1", "F2", "F3", "F4", "F5", "F7"],
  2: ["F1", "F2", "F3", "F4", "F7"],
  3: ["F1", "F2", "F4", "F5", "F6", "F7"],
};

// Diversity ordering (spec): before generating, read the paper's live banked distribution and lead
// with the THINNEST families so a bulk run fills the gaps first, then cycles the rest — deliberately
// spreading the batch across question families rather than stacking an already-over-represented
// shape. `counts` is the current APPROVED-question count per family for this paper (from
// getBankFamilyHistogram). Sorted ascending by count; ties (and the empty-bank cold start) fall back
// to the corpus family order for a stable rotation.
function orderFamiliesByDeficit(paper: number, counts: Map<string, number>): string[] {
  const fams = PAPER_FAMILIES[paper] || PAPER_FAMILIES[1];
  return [...fams].sort((a, b) => {
    const diff = (counts.get(a) ?? 0) - (counts.get(b) ?? 0);
    return diff !== 0 ? diff : fams.indexOf(a) - fams.indexOf(b);
  });
}

// Coarse up-front estimate for the Admin card's "estimated cost" line. Each banked question pays for
// one Opus generation + one Opus model answer + a Sonnet enrichment pass; ~$0.35 is a deliberately
// round, slightly conservative figure. The batch's ACTUAL spend is reconciled from model_usage on
// completion (getBatchActualCost) and shown on /admin/costs.
export const EST_COST_PER_QUESTION = 0.35;

export function estimateBatchCost(count: number): number {
  return Math.round(count * EST_COST_PER_QUESTION * 100) / 100;
}

// Muted "roughly $2–3" range for the Admin card: per-question average × count, widened ±35%, rounded
// to whole dollars (spec). `perQuestion` defaults to the static estimate; the card passes the real
// observed per-question spend when it has one.
export function estimateBatchCostRange(
  count: number,
  perQuestion: number = EST_COST_PER_QUESTION
): { minCents: number; maxCents: number; minDollars: number; maxDollars: number } {
  const mid = count * perQuestion;
  const minCents = Math.round(mid * 0.65 * 100);
  const maxCents = Math.round(mid * 1.35 * 100);
  const minDollars = Math.max(0, Math.floor(minCents / 100));
  const maxDollars = Math.max(minDollars + (maxCents > minCents ? 1 : 0), Math.ceil(maxCents / 100));
  return { minCents, maxCents, minDollars, maxDollars };
}

const CONCURRENCY = 2;
// Leave headroom under the route's maxDuration (300s) for the final flush + a resume hop.
const BUDGET_MS = Number(process.env.BANK_WORKER_BUDGET_MS) || 240_000;

export const VALID_PAPERS = [1, 2, 3] as const;
export const MIN_COUNT = 1;
export const MAX_COUNT = 50;

export function isValidPaper(p: unknown): p is 1 | 2 | 3 {
  return p === 1 || p === 2 || p === 3;
}

// Create the batch row. Kept separate from the worker so the route can create → return batchId
// immediately, then schedule runBankBatch in after().
export async function startBankBatch(input: {
  paper: 1 | 2 | 3;
  count: number;
  replaceBinned: boolean;
  createdBy: number | null;
}): Promise<BankBatch> {
  const range = estimateBatchCostRange(input.count);
  return createBankBatch({
    paper: input.paper,
    requestedCount: input.count,
    replaceBinned: input.replaceBinned,
    createdBy: input.createdBy,
    estCostUsd: estimateBatchCost(input.count),
    estCostMinCents: range.minCents,
    estCostMaxCents: range.maxCents,
  });
}

// Generate exactly ONE validated question into the batch as 'pending'. Retries up to 2 extra times on
// a non-generated outcome (parse/validator miss → the engine falls back to a banked question, which
// we discard). Returns true on a genuine new pending question, false if all attempts failed.
async function generateOneIntoBatch(
  batch: BankBatch,
  family: string,
  apiKey: string,
  meta: UsageMeta
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const outcome = await generateFreshQuestion(
        batch.paper,
        family,
        apiKey,
        meta,
        undefined,
        undefined,
        // awaitBackgroundWork: a banked question is only worth banking once its model answer and
        // wine enrichment exist. Without it this invocation returns the moment the row is written
        // and the platform freezes both mid-flight. It costs ~30s per question, so a batch fits
        // fewer items per invocation and leans harder on the resume path — which is correct: the
        // work is real either way, and resume is exercised by the hourly safety net.
        { status: "pending", batchId: batch.id, awaitBackgroundWork: true }
      );
      // Only a freshly GENERATED result is a new pending question. A 'pre-populated' outcome means
      // generation didn't converge and the engine served an existing (approved) question instead —
      // discard it silently and retry, exactly as the spec requires.
      if (!("error" in outcome) && outcome.source === "generated") return true;
    } catch (err) {
      console.error(`[bank-worker] batch ${batch.id} generation error (attempt ${attempt + 1}):`, err);
    }
  }
  return false;
}

async function scheduleResume(baseUrl: string | null, batchId: string): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!baseUrl || !secret) {
    console.warn(`[bank-worker] cannot self-resume batch ${batchId} (missing baseUrl/CRON_SECRET); the cron safety net will pick it up`);
    return;
  }
  try {
    await fetch(`${baseUrl}/api/admin/bank/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ batchId }),
    });
  } catch (err) {
    console.error(`[bank-worker] failed to schedule resume for ${batchId}:`, err);
  }
}

// Drive a batch to completion (or to the wall-clock budget, then hand off). Idempotent and safe to
// call repeatedly: it derives remaining work from the persisted counters, so a resume never
// double-counts. `meta.source` should be 'server' — bulk generation is on the admin/server key.
export async function runBankBatch(opts: {
  batchId: string;
  apiKey: string;
  userId: number | null;
  baseUrl?: string | null;
}): Promise<void> {
  const { batchId, apiKey, userId, baseUrl } = opts;
  const meta: UsageMeta = { source: "server", userId };
  const startedAt = Date.now();

  let batch = await getBankBatch(batchId);
  if (!batch) return;
  // A cancelled batch stops immediately; a ready one has no work left.
  if (batch.status !== "running") return;

  // Global item counter: which round-robin family slot this item takes. Seeded from work already
  // done so a resume continues the rotation rather than restarting it.
  let issued = batch.generated_count + batch.failed_count;

  // Read the live banked distribution ONCE per invocation and lead with the thinnest families (spec's
  // diversity step). Recomputed on each resume so a long run keeps chasing the current gaps.
  const histogram = await getBankFamilyHistogram();
  const familyCounts = new Map<string, number>();
  for (const h of histogram) {
    if (h.paper === batch.paper) familyCounts.set(h.family, h.count);
  }
  const familyOrder = orderFamiliesByDeficit(batch.paper, familyCounts);

  const remaining = () => {
    const b = batch!;
    return b.requested_count - (b.generated_count + b.failed_count);
  };

  while (remaining() > 0) {
    if (Date.now() - startedAt > BUDGET_MS) {
      // Out of time for this invocation but work remains — hand off and let the fresh invocation (or
      // the cron) continue. Status stays 'running'.
      console.log(`[bank-worker] batch ${batchId} hit budget with ${remaining()} left; scheduling resume`);
      await scheduleResume(baseUrl ?? null, batchId);
      return;
    }

    const slotCount = Math.min(CONCURRENCY, remaining());
    const slots = Array.from({ length: slotCount }, () => familyOrder[issued++ % familyOrder.length]);

    const results = await Promise.all(
      slots.map((family) => generateOneIntoBatch(batch!, family, apiKey, meta))
    );

    const generated = results.filter(Boolean).length;
    const failed = results.length - generated;
    const updated = await incrementBatchCounts(batchId, { generated, failed });
    if (!updated) return;
    batch = updated;

    // Re-check for cancellation between slots so Cancel takes effect promptly.
    if (batch.status !== "running") {
      console.log(`[bank-worker] batch ${batchId} no longer running (${batch.status}); stopping`);
      return;
    }
  }

  // All planned work done → flip to ready and reconcile actual spend. The NotificationBell surfaces
  // ready batches on its next poll (getReviewableBatches), so this is the "notify when ready" signal.
  const actualCost = await getBatchActualCost(batchId).catch(() => 0);
  await setBankBatchStatus(batchId, "complete", { completed: true, actualCostUsd: actualCost });
  console.log(`[bank-worker] batch ${batchId} complete — ${batch.generated_count} generated, ${batch.failed_count} failed`);
}
