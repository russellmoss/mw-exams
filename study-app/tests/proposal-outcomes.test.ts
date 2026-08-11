import { describe, it, expect } from "vitest";
import {
  themeOverlap,
  findRecurrences,
  ruleTrends,
  outcomeLabel,
  type ProposalRow,
} from "@/lib/proposal-outcomes";

/**
 * The outcome loop the miner never had. It shipped 21 proposals and was never told whether one of
 * them worked, which is how fifteen rules accumulated while the reject rate went 34% -> 42%.
 *
 * The tests that matter most here are the ones pinning what this CANNOT do — a measurement that
 * quietly reports "all clear" is worse than no measurement, and this detector has a known blind spot.
 */

const p = (o: Partial<ProposalRow> & { id: number | string }): ProposalRow => ({
  theme: "",
  kind: "validator",
  status: "shipped",
  shippedAt: null,
  createdAt: "2026-08-06T00:00:00Z",
  ...o,
});

describe("themeOverlap", () => {
  it("scores a restatement of the same fault highly", () => {
    expect(
      themeOverlap(
        "Duplicate wine-set flights banked, only caught by post-hoc sweep",
        "Duplicate wine-set flights banked"
      )
    ).toBeGreaterThanOrEqual(0.9);
  });

  it("does not collide two unrelated themes", () => {
    expect(
      themeOverlap(
        "Sparkling Syrah over-represented in P3 sparkling flights",
        "Mark budget not enforced: total does not equal 25 x wines"
      )
    ).toBeLessThan(0.3);
  });

  it("is symmetric", () => {
    const a = "Flight has no banker and/or too many curveballs";
    const b = "Flight has no banker";
    expect(themeOverlap(a, b)).toBe(themeOverlap(b, a));
  });
});

describe("findRecurrences", () => {
  it("flags a fault re-proposed after its fix shipped", () => {
    const rows = [
      p({ id: 1, theme: "Duplicate wine-set flights banked", shippedAt: "2026-08-06T00:00:00Z" }),
      p({ id: 2, theme: "Duplicate wine-set flights banked again", status: "pr_opened", createdAt: "2026-08-09T00:00:00Z" }),
    ];
    const rec = findRecurrences(rows);
    expect(rec).toHaveLength(1);
    expect(rec[0].recurredAs[0].proposalId).toBe("2");
  });

  it("ignores a proposal that PREDATES the fix — it is not evidence the fix failed", () => {
    const rows = [
      p({ id: 1, theme: "Duplicate wine-set flights banked", shippedAt: "2026-08-09T00:00:00Z" }),
      p({ id: 2, theme: "Duplicate wine-set flights banked again", status: "pr_opened", createdAt: "2026-08-06T00:00:00Z" }),
    ];
    expect(findRecurrences(rows)).toHaveLength(0);
  });

  it("KNOWN BLIND SPOT: misses a real recurrence whose wording changed", () => {
    // Not an aspiration — the actual pair from the live ledger. #3 shipped 2026-08-06, #23 raised
    // 2026-08-09 restating the same banker fault, and containment scores 0.20. This test exists so
    // the limitation is a recorded fact rather than a surprise, and so anyone tempted to read "no
    // recurrence" as "the fixes held" trips over it first. If a future detector catches this pair,
    // delete the test — do not loosen the threshold until it does, or unrelated themes start matching.
    const rows = [
      p({ id: 3, theme: "Flight has no banker and/or too many curveballs", shippedAt: "2026-08-06T00:00:00Z" }),
      p({ id: 23, theme: "Banker status judged by grape variety alone, ignoring vintage", status: "shipped", createdAt: "2026-08-09T00:00:00Z" }),
    ];
    expect(themeOverlap(rows[0].theme, rows[1].theme)).toBeCloseTo(0.2, 1);
    expect(findRecurrences(rows)).toHaveLength(0);
  });
});

describe("ruleTrends", () => {
  it("marks a window below the floor as unreliable rather than hiding it", () => {
    // A rule "firing 100% less" can mean five attempts happened. Suppressing the row would read as
    // the rule being fine; surfacing it flagged lets a human see it was simply not measured.
    const [t] = ruleTrends([{ rule: "banker", beforeFired: 5, beforeTotal: 10, afterFired: 0, afterTotal: 3 }]);
    expect(t.reliable).toBe(false);
    expect(t.deltaPp).toBe(-50);
  });

  it("computes a rate change over adequate windows", () => {
    const [t] = ruleTrends([{ rule: "variety", beforeFired: 200, beforeTotal: 1000, afterFired: 30, afterTotal: 600 }]);
    expect(t.beforeRate).toBe(20);
    expect(t.afterRate).toBe(5);
    expect(t.deltaPp).toBe(-15);
    expect(t.reliable).toBe(true);
  });

  it("survives an empty window without dividing by zero", () => {
    const [t] = ruleTrends([{ rule: "x", beforeFired: 0, beforeTotal: 0, afterFired: 0, afterTotal: 0 }]);
    expect(t.beforeRate).toBe(0);
    expect(t.afterRate).toBe(0);
    expect(t.reliable).toBe(false);
  });
});

describe("outcomeLabel", () => {
  it("never lets an unmeasured fix read as a success", () => {
    const row = p({ id: 1, theme: "Some fix", shippedAt: "2026-08-06T00:00:00Z" });
    expect(outcomeLabel(row, [])).toMatch(/NOT VALIDATED/);
    expect(outcomeLabel(row, [])).not.toMatch(/no recurrence|worked|success|held/i);
  });

  it("names the proposal that restated the fault", () => {
    const row = p({ id: 1, theme: "Some fix", shippedAt: "2026-08-06T00:00:00Z" });
    const rec = [
      {
        proposalId: "1",
        theme: "Some fix",
        shippedAt: "2026-08-06T00:00:00Z",
        recurredAs: [{ proposalId: "9", theme: "Some fix again", createdAt: "2026-08-09T00:00:00Z", overlap: 0.9 }],
      },
    ];
    expect(outcomeLabel(row, rec)).toMatch(/DID NOT HOLD.*#9/);
  });

  it("passes a non-shipped status through untouched", () => {
    expect(outcomeLabel(p({ id: 1, status: "rejected" }), [])).toBe("rejected");
  });
});
