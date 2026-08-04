import { describe, it, expect } from "vitest";
import { seedConsecutiveFailures } from "../src/lib/bank-worker";

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
