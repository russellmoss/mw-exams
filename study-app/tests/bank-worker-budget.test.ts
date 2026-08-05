// bank-worker-budget.test.ts — the timing constants have to agree with each other.
//
// They did not. ITEM_WORST_CASE_MS was a hard-coded 145_000 while withTimeout() actually capped every
// item at ITEM_TIMEOUT_MS = 120_000, so the "never start work you cannot finish" arithmetic was being
// done against a number 25s adrift of the ceiling really being enforced. Separately, the worker
// inherited question-engine's INTERACTIVE call timeout (45s) — sized to sit under a browser's 120s
// abort, which a background bulk run does not have. Measured p90 latency sat at exactly the 45s cap
// in every hour sampled and 33% of attempts died there rather than at a validator.
//
// These constants are only correct as a SET, and each is individually plausible, so drift is silent.
// Hence this file.
import { describe, it, expect } from "vitest";
import {
  BUDGET_MS,
  CONCURRENCY,
  ITEM_TIMEOUT_MS,
  ITEM_WORST_CASE_MS,
  POST_GENERATION_MS,
  WORKER_CALL_TIMEOUT_MS,
  WORKER_GENERATION_BUDGET_MS,
} from "../src/lib/bank-worker";
import { GENERATION_TIMING } from "../src/lib/question-engine";

// The route's maxDuration. BUDGET_MS must leave room under it for the final flush + resume hop.
const ROUTE_MAX_DURATION_MS = 300_000;

describe("worker timing constants are mutually consistent", () => {
  it("leaves room for the generation budget plus the post-generation work inside the item ceiling", () => {
    // Otherwise ITEM_TIMEOUT_MS becomes the binding constraint and kills items that were about to
    // succeed — silently turning any raise of the generation budget into a no-op.
    expect(ITEM_TIMEOUT_MS).toBeGreaterThanOrEqual(WORKER_GENERATION_BUDGET_MS + POST_GENERATION_MS);
  });

  it("treats the enforced item ceiling as the worst case", () => {
    // withTimeout caps the item at ITEM_TIMEOUT_MS, so nothing can exceed it. Deriving the worst case
    // from anything else is how the two drifted apart last time.
    expect(ITEM_WORST_CASE_MS).toBe(ITEM_TIMEOUT_MS);
  });

  it("affords at least one complete generation attempt", () => {
    // A budget below one call timeout means the loop can never finish even a single attempt.
    //
    // This used to demand `+ MIN_CALL_MS` on top, i.e. room for a second in-engine attempt. That no
    // longer fits: the whole item must also cover the awaited model answer and enrichment inside one
    // invocation, and at real model speeds a generation retry and a model answer cannot both have
    // room. The retry is the right one to drop — generateOneIntoBatch retries the item up to 3 times
    // and the resume hop retries a timed-out one, so it was the third of three layers, whereas a
    // question banked without a model answer is unusable.
    expect(WORKER_GENERATION_BUDGET_MS).toBeGreaterThanOrEqual(WORKER_CALL_TIMEOUT_MS);
  });

  it("keeps the whole item — generation AND the awaited post-generation work — inside an invocation", () => {
    // The binding constraint, and the one that forced the trade above. Both halves are sized from
    // measurement (see the comments on each), so if either grows this is where it surfaces.
    expect(ITEM_WORST_CASE_MS).toBeLessThan(BUDGET_MS);
    // Real margin, not a rounding accident.
    expect(BUDGET_MS - ITEM_WORST_CASE_MS).toBeGreaterThanOrEqual(15_000);
  });

  it("never falls below the interactive per-call ceiling", () => {
    // This used to assert `> 45_000` — the interactive default at the time, hard-coded here. Both
    // halves of that are now wrong: the interactive default was itself too small (it censored the
    // median Opus call) and has been raised, so a frozen 45_000 no longer refers to anything real.
    // The durable rule is relative: a background bulk run has no one waiting on it, so it must never
    // be given LESS time per call than the path that does.
    expect(WORKER_CALL_TIMEOUT_MS).toBeGreaterThanOrEqual(GENERATION_TIMING.callTimeoutMs);
  });

  it("can still start a full round of items inside one invocation", () => {
    // The loop refuses to begin a round unless a worst-case item fits before the deadline. If the
    // worst case grows past the invocation budget, no round ever starts and the batch stalls at zero.
    expect(ITEM_WORST_CASE_MS).toBeLessThan(BUDGET_MS);
    expect(CONCURRENCY).toBeGreaterThan(0);
  });

  it("keeps the invocation budget under the route's maxDuration", () => {
    expect(BUDGET_MS).toBeLessThan(ROUTE_MAX_DURATION_MS);
    // Headroom for the final flush + the resume hop.
    expect(ROUTE_MAX_DURATION_MS - BUDGET_MS).toBeGreaterThanOrEqual(10_000);
  });
});
