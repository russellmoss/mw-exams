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

// question-engine's own floor: it will not begin an attempt with less than this left on the clock.
const MIN_CALL_MS = 25_000;
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
    expect(WORKER_GENERATION_BUDGET_MS).toBeGreaterThanOrEqual(WORKER_CALL_TIMEOUT_MS + MIN_CALL_MS);
  });

  it("raises the per-call ceiling above the interactive default it used to inherit", () => {
    // The whole point of the override. If this ever drops back to 45s the worker is silently paying
    // the browser tax again.
    expect(WORKER_CALL_TIMEOUT_MS).toBeGreaterThan(45_000);
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
