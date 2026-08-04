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
  touchBankBatch,
  getBatchActualCost,
  getBankFamilyHistogram,
  type BankBatch,
  type BankTargeting,
} from "@/lib/db";
import { generateFreshQuestion, familyForQuestionType, type UsageMeta } from "@/lib/question-engine";

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

// Chunked execution (spec §4): generate in small groups rather than one long request so a serverless
// timeout can't kill the whole run — the resume hop / cron picks up the next chunk. Three at a time.
export const CONCURRENCY = 3;

// Generation limits for THIS worker, overriding the interactive defaults in question-engine.ts.
//
// Those defaults (45s per call, 95s of budget) are sized to sit under the browser's 120s abort with a
// user watching a spinner. A background bulk run has neither, and inheriting that ceiling threw away
// near-complete work: measured p90 latency sat at exactly 45,00Xms in every hour sampled — the
// distribution was censored at the cap, so we could not even see how long those calls needed — and
// 33% of attempts died there rather than at a validator.
//
// 70s per call inside 110s of budget guarantees one full attempt and affords a second whenever the
// first returns quickly (the loop needs MIN_CALL_MS=25s remaining to start one).
export const WORKER_CALL_TIMEOUT_MS = Number(process.env.BANK_WORKER_CALL_TIMEOUT_MS) || 70_000;
export const WORKER_GENERATION_BUDGET_MS = Number(process.env.BANK_WORKER_GENERATION_BUDGET_MS) || 110_000;

// The awaited model answer + wine enrichment that run after generation, before the item is done.
export const POST_GENERATION_MS = 55_000;

// Hard per-item timeout (spec §3). generateFreshQuestion has its own internal generation budget, but
// this is a belt-and-braces ceiling around the whole item (generation + awaited model answer +
// enrichment) so a single wedged call can never hang the chunk. A timed-out attempt is treated like
// any other failed attempt: it is retried, and only a genuine final failure increments items_skipped.
//
// It MUST leave room for the generation budget plus the post-generation work, or it becomes the
// binding constraint and kills items that were about to succeed — silently converting a raised
// generation budget into a no-op.
export const ITEM_TIMEOUT_MS =
  Number(process.env.BANK_WORKER_ITEM_TIMEOUT_MS) || WORKER_GENERATION_BUDGET_MS + POST_GENERATION_MS;

class ItemTimeoutError extends Error {}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ItemTimeoutError(`item exceeded ${ms}ms`)), ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}
// Leave headroom under the route's maxDuration (300s) for the final flush + a resume hop.
export const BUDGET_MS = Number(process.env.BANK_WORKER_BUDGET_MS) || 285_000;

// Worst case for ONE item. withTimeout() caps every item at ITEM_TIMEOUT_MS, so that IS the bound —
// deriving it from anything else invites the two to drift apart, and the old hard-coded 145_000 was
// already 25s adrift of the 120_000 ceiling actually being enforced.
//
// Getting this wrong is not cosmetic: it backs the "never start work you cannot finish" rule. The
// original code asked only "have I used 240s yet?", which is the wrong question — an item begun at
// 239s could still run for minutes, and generateOneIntoBatch retried up to 3 times on top. One hard
// question could overrun maxDuration from a standing start, and did: a Paper 2 batch returned HTTP
// 504 to the hourly workflow.
//
// Throughput is unchanged by the raise. At 145s a 285s invocation fitted one round of CONCURRENCY
// items (285-145=140 < 145); at 165s it still fits exactly one (285-165=120 < 165). Each item simply
// gets a fair shot at finishing.
export const ITEM_WORST_CASE_MS = ITEM_TIMEOUT_MS;

// Circuit breaker. A failed question is not free — it burns a full generation budget (up to eight
// model calls) and bills for every one, and the /api/admin/fill-bank route caps count at nothing at
// all. When generation is genuinely broken the loop used to grind through the entire request paying
// for each failure: on 2026-08-04 two batches went 0-for-6 and 0-for-3, and $16.55 went out the door
// in fourteen minutes for zero questions. At that rate a 50-question batch is roughly $118 of
// nothing. Five consecutive failures is not a run of bad luck, it is a broken generator, and the
// telemetry now records exactly which rule is responsible — so stop and let someone read it.
const MAX_CONSECUTIVE_FAILURES = Number(process.env.BANK_WORKER_MAX_CONSECUTIVE_FAILURES) || 5;

/**
 * Consecutive-failure count to resume with, since the run spans several invocations and only the
 * totals are persisted.
 *
 * If nothing has EVER been generated, every recorded failure was consecutive by definition, so the
 * count carries across invocations and a wholesale-broken batch still trips the breaker after a
 * resume. Once anything has succeeded the ordering is unknowable from totals alone — a batch could
 * have failed ten then generated one — so it restarts at zero. That errs toward doing the work,
 * which is the right way to be wrong: the cost of an extra round is bounded, and a batch that is
 * still failing will trip the breaker within this invocation anyway.
 */
export function seedConsecutiveFailures(batch: Pick<BankBatch, "generated_count" | "failed_count">): number {
  return batch.generated_count === 0 ? batch.failed_count : 0;
}

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
  // Optional Bank Health targeting, persisted on the batch so a resumed invocation keeps the aim.
  targeting?: BankTargeting | null;
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
    targeting: input.targeting ?? null,
  });
}

// Generate exactly ONE validated question into the batch as 'pending'. Retries up to 2 extra times on
// a non-generated outcome (parse/validator miss → the engine falls back to a banked question, which
// we discard). Returns true on a genuine new pending question, false if all attempts failed.
async function generateOneIntoBatch(
  batch: BankBatch,
  family: string,
  pinned: boolean,
  apiKey: string,
  meta: UsageMeta,
  deadline: number,
  targeting?: BankTargeting | null
): Promise<"generated" | "failed" | "timeout"> {
  for (let attempt = 0; attempt < 3; attempt++) {
    // Deadline-aware, like the generation loop's own attempt guard: only start a retry we can
    // finish. Running out of time is NOT a failure — the item is untouched and a resumed
    // invocation will take it, so it must not increment failed_count.
    if (attempt > 0 && deadline - Date.now() < ITEM_WORST_CASE_MS) return "timeout";
    try {
      const outcome = await withTimeout(
        generateFreshQuestion(
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
          {
            status: "pending",
            batchId: batch.id,
            awaitBackgroundWork: true,
            // A pinned run generates the same family every time, which makes the novelty check's
            // family-gated stem-template rules fire on every candidate. See the note in
            // validateNoveltyAgainstLatest — targeted runs police the WINES and the framing sentence.
            familyTargeted: pinned,
            // No browser, no one waiting — see the constants for why the interactive ceiling was
            // costing us a third of all attempts.
            budgetMs: WORKER_GENERATION_BUDGET_MS,
            callTimeoutMs: WORKER_CALL_TIMEOUT_MS,
          },
          undefined,
          // Bank Health soft-constraint aim (Generate more like this). Absent on an untargeted run.
          targeting ?? undefined
        ),
        ITEM_TIMEOUT_MS
      );
      // Only a freshly GENERATED result is a new pending question. A 'pre-populated' outcome means
      // generation didn't converge and the engine served an existing (approved) question instead —
      // discard it silently and retry, exactly as the spec requires.
      if (!("error" in outcome) && outcome.source === "generated") return "generated";
    } catch (err) {
      console.error(`[bank-worker] batch ${batch.id} generation error (attempt ${attempt + 1}):`, err);
    }
  }
  return "failed";
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
  // batchId (migration 029): every call this run makes is stamped with the batch, so a run that
  // banks nothing still reports what it cost. Attributing by question_id alone loses failed attempts
  // entirely — they save no question — and a wholly failed batch reconciled to $0.00.
  const meta: UsageMeta = { source: "server", userId, batchId };
  const startedAt = Date.now();

  let batch = await getBankBatch(batchId);
  if (!batch) return;
  // A cancelled/stalled batch stops immediately; a ready one has no work left.
  if (batch.status !== "running") return;

  // Heartbeat immediately: this invocation is alive and working the batch, so the stall sweep must
  // not release it out from under us while the first chunk runs.
  await touchBankBatch(batchId);

  // Global item counter: which round-robin family slot this item takes. Seeded from work already
  // done so a resume continues the rotation rather than restarting it.
  let issued = batch.generated_count + batch.failed_count;
  let consecutiveFailures = seedConsecutiveFailures(batch);

  // Read the live banked distribution ONCE per invocation and lead with the thinnest families (spec's
  // diversity step). Recomputed on each resume so a long run keeps chasing the current gaps.
  const histogram = await getBankFamilyHistogram();
  const familyCounts = new Map<string, number>();
  for (const h of histogram) {
    if (h.paper === batch.paper) familyCounts.set(h.family, h.count);
  }
  // A targeted run whose question-type maps to a specific family pins every item to that family so
  // the whole batch stays on-aim; otherwise fall back to the thinnest-first diversity rotation.
  const targeting = (batch.targeting ?? null) as BankTargeting | null;
  const pinnedFamily = targeting?.questionType ? familyForQuestionType(targeting.questionType) : null;
  const familyOrder = pinnedFamily
    ? [pinnedFamily]
    : orderFamiliesByDeficit(batch.paper, familyCounts);

  const remaining = () => {
    const b = batch!;
    return b.requested_count - (b.generated_count + b.failed_count);
  };

  const deadline = startedAt + BUDGET_MS;

  while (remaining() > 0) {
    // Cancel (spec §2): re-read status before starting each chunk and exit if the admin cancelled
    // (or the stall sweep released) the run. Every question generated so far is kept.
    const live = await getBankBatch(batchId);
    if (!live || live.status !== "running") {
      console.log(`[bank-worker] batch ${batchId} no longer running (${live?.status ?? "gone"}); stopping`);
      return;
    }
    batch = live;

    // Checked BEFORE any work, so a resumed batch that was already failing wholesale stops here
    // rather than paying for one more round first.
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      const spend = await getBatchActualCost(batchId).catch(() => 0);
      console.error(
        `[bank-worker] batch ${batchId} ABORTED after ${consecutiveFailures} consecutive failures ` +
          `(${batch.generated_count} generated, ${batch.failed_count} failed, $${spend.toFixed(2)} spent). ` +
          `Generation is failing systematically — query generation_attempts for the rules firing.`
      );
      await setBankBatchStatus(batchId, "failed", { completed: true, actualCostUsd: spend });
      return;
    }

    // Don't begin a round unless a worst-case item still fits before the deadline.
    if (deadline - Date.now() < ITEM_WORST_CASE_MS) {
      // Out of time for this invocation but work remains — hand off and let the fresh invocation (or
      // the cron) continue. Status stays 'running'.
      console.log(`[bank-worker] batch ${batchId} hit budget with ${remaining()} left; scheduling resume`);
      await scheduleResume(baseUrl ?? null, batchId);
      return;
    }

    const slotCount = Math.min(CONCURRENCY, remaining());
    const slots = Array.from({ length: slotCount }, () => familyOrder[issued++ % familyOrder.length]);

    const results = await Promise.all(
      slots.map((family) =>
        generateOneIntoBatch(batch!, family, !!pinnedFamily, apiKey, meta, deadline, targeting)
      )
    );

    const generated = results.filter((r) => r === "generated").length;
    const failed = results.filter((r) => r === "failed").length;
    const timedOut = results.some((r) => r === "timeout");
    const updated = await incrementBatchCounts(batchId, { generated, failed });
    if (!updated) return;
    batch = updated;

    // Re-check for cancellation between slots so Cancel takes effect promptly.
    if (batch.status !== "running") {
      console.log(`[bank-worker] batch ${batchId} no longer running (${batch.status}); stopping`);
      return;
    }

    // Timeouts are excluded by construction — `failed` counts only genuine rejections, so running
    // out of clock never moves the breaker. Tested at the top of the next iteration.
    consecutiveFailures = generated > 0 ? 0 : consecutiveFailures + failed;

    // An item abandoned mid-way for time (not for failure) means this invocation is done.
    if (timedOut) {
      console.log(`[bank-worker] batch ${batchId} ran out of time mid-item; scheduling resume`);
      await scheduleResume(baseUrl ?? null, batchId);
      return;
    }
  }

  // All planned work done → flip to ready and reconcile actual spend. The NotificationBell surfaces
  // ready batches on its next poll (getReviewableBatches), so this is the "notify when ready" signal.
  const actualCost = await getBatchActualCost(batchId).catch(() => 0);
  await setBankBatchStatus(batchId, "complete", { completed: true, actualCostUsd: actualCost });
  console.log(`[bank-worker] batch ${batchId} complete — ${batch.generated_count} generated, ${batch.failed_count} failed`);
}
