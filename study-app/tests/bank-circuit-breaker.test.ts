import { describe, it, expect } from "vitest";
import { seedConsecutiveFailures, shouldAbortForPoorYield, CONCURRENCY } from "../src/lib/bank-worker";

/**
 * A failed question bills for a full generation budget. With no cap on batch size, a systematically
 * broken generator used to grind through the whole request paying for every failure — two batches
 * went 0-for-6 and 0-for-3 on 2026-08-04 and $16.55 bought nothing.
 *
 * The breaker counts CONSECUTIVE failures, but a run spans several invocations and only the totals
 * survive. These pin the inference made from those totals.
 */
describe("seedConsecutiveFailures", () => {
  it("carries every failure across a resume while nothing has succeeded", () => {
    // Nothing generated, so the failures were consecutive by definition — a wholesale-broken batch
    // must still trip the breaker after resuming, not start counting from zero each time.
    expect(seedConsecutiveFailures({ generated_count: 0, failed_count: 4 })).toBe(4);
  });

  it("restarts at zero once anything has been generated", () => {
    // Totals cannot say whether the failures came before or after the success, so it errs toward
    // doing the work: a batch that is still broken re-trips within this invocation anyway.
    expect(seedConsecutiveFailures({ generated_count: 1, failed_count: 9 })).toBe(0);
  });

  it("is zero for a fresh batch", () => {
    expect(seedConsecutiveFailures({ generated_count: 0, failed_count: 0 })).toBe(0);
  });
});

/**
 * The consecutive-failure breaker has a hole it cannot close on its own, and these pin the guard that
 * does. seedConsecutiveFailures resets to 0 on every resume once anything has been generated, on the
 * reasoning that a broken batch "re-trips within this invocation anyway" — which only holds if an
 * invocation runs several rounds. When items are SLOW it runs exactly one, contributing at most
 * CONCURRENCY to a threshold of 5, so the counter never gets there and the next hop zeroes it.
 *
 * Slow failures are the expensive ones, so that hole sat directly under the money.
 */
describe("the consecutive counter cannot reach the threshold on its own", () => {
  it("cannot be tripped by a single round of failures", () => {
    // One round contributes at most CONCURRENCY. If this ever stops being true the yield guard is
    // belt-and-braces rather than load-bearing — no bug, but this comment is then wrong.
    expect(CONCURRENCY).toBeLessThan(5);
  });

  it("zeroes a wholesale-broken batch's counter on resume once anything was generated", () => {
    // 1 generated, 40 failed: still reseeds to 0, which is the hole.
    expect(seedConsecutiveFailures({ generated_count: 1, failed_count: 40 })).toBe(0);
  });
});

describe("shouldAbortForPoorYield", () => {
  it("stops the batch the consecutive breaker cannot", () => {
    // The exact shape above: generating almost nothing while failing relentlessly, across resumes.
    expect(shouldAbortForPoorYield({ generated_count: 1, failed_count: 40 })).toBe(true);
  });

  it("stops a batch generating nothing at all", () => {
    // The observed Paper 1 batch: 0 generated, 20 failed, and it ran to completion paying for each.
    expect(shouldAbortForPoorYield({ generated_count: 0, failed_count: 20 })).toBe(true);
  });

  it("leaves a healthy batch alone", () => {
    expect(shouldAbortForPoorYield({ generated_count: 20, failed_count: 3 })).toBe(false);
  });

  it("leaves a merely mediocre batch alone", () => {
    // Half-yield is not broken, just slow going — killing it would be worse than letting it run.
    expect(shouldAbortForPoorYield({ generated_count: 12, failed_count: 12 })).toBe(false);
  });

  it("holds off until there is enough evidence to judge", () => {
    // An unlucky opening run must not kill a batch before it has had a fair chance.
    expect(shouldAbortForPoorYield({ generated_count: 0, failed_count: 3 })).toBe(false);
    expect(shouldAbortForPoorYield({ generated_count: 0, failed_count: 9 })).toBe(false);
  });

  it("is resume-safe: it reads only persisted totals", () => {
    // The whole point — unlike the consecutive counter, nothing here is per-invocation state, so a
    // hand-off cannot launder a failing batch into a fresh start.
    const totals = { generated_count: 2, failed_count: 30 };
    expect(shouldAbortForPoorYield(totals)).toBe(shouldAbortForPoorYield({ ...totals }));
    expect(shouldAbortForPoorYield(totals)).toBe(true);
  });
});
