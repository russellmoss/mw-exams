// advisory-rules.test.ts — which validators may fail a generation attempt.
//
// banker was demoted to advisory because its detector is not accurate enough to hard-reject on.
// Measured against the corpus's own benchmark_status tags on held-out years (2021+), the
// BENCHMARK_APPELLATIONS regex recognises 44.3% of real benchmarks and accepts 22.4% of
// non-benchmarks — it misses more real bankers than it catches. Widening it does not help, because
// benchmark-ness is not a property of the appellation: adding the major missing regions took recall
// to 63.4% but false positives to 40.8%, and a list derived from the corpus tags scored worse than
// the current one out of sample.
//
// The risk this file guards is scope creep. "Advisory" is a loaded gun pointed at question quality:
// anything added here stops blocking silently, and nothing about generation looks different
// afterwards. So the membership itself is pinned.
import { describe, it, expect } from "vitest";
import {
  ADVISORY_RULES,
  BANK_BLOCKING_RULES,
  blockingViolations,
  shouldRelaxBanker,
} from "../src/lib/question-engine";

describe("ADVISORY_RULES membership", () => {
  it("contains banker", () => {
    expect(ADVISORY_RULES.has("banker")).toBe(true);
  });

  it("contains nothing else", () => {
    // Deliberately exact. Demoting a rule is a real quality decision and must not ride along in an
    // unrelated change — if you are adding one, you should be updating this test on purpose.
    expect([...ADVISORY_RULES].sort()).toEqual(["banker"]);
  });

  it("never demotes a correctness rule", () => {
    // These encode what the question CLAIMS versus what it contains. A question whose stem says
    // "same variety" over three different grapes is simply wrong, and no detector-accuracy argument
    // applies — unlike banker, these do not guess.
    for (const rule of ["paperScope", "variety", "marks", "novelty", "consistency", "composition"]) {
      expect(ADVISORY_RULES.has(rule)).toBe(false);
    }
  });
});

describe("blockingViolations", () => {
  it("drops advisory violations from the blocking set", () => {
    expect(blockingViolations({ banker: ["no recognizable benchmark appellation"] })).toEqual([]);
  });

  it("keeps every non-advisory violation", () => {
    const out = blockingViolations({
      banker: ["no recognizable benchmark appellation"],
      variety: ["wine 1 variety undetectable"],
      marks: ["total_marks 70 != 2x25"],
    });
    expect(out).toHaveLength(2);
    expect(out.join(" ")).toMatch(/variety undetectable/);
    expect(out.join(" ")).toMatch(/total_marks/);
    expect(out.join(" ")).not.toMatch(/benchmark appellation/);
  });

  it("lets an otherwise-clean attempt pass when only banker fired", () => {
    // The whole point: this attempt used to be thrown away and regenerated.
    expect(blockingViolations({ banker: ["no recognizable benchmark appellation"] })).toHaveLength(0);
  });

  it("is empty for a clean attempt", () => {
    expect(blockingViolations({})).toEqual([]);
  });

  it("preserves the declared rule ordering", () => {
    // lastViolations is user-visible in logs; keeping insertion order keeps those readable.
    const out = blockingViolations({ variety: ["a"], marks: ["b"], novelty: ["c"] });
    expect(out).toEqual(["a", "b", "c"]);
  });
});

// The bank path (Fill-the-Bank worker, batchId set on saveOpts) is the one place where banker holds
// the line: no user waits on it, its retry budget is long, and letting advisory/relaxed attempts
// through is how the bank accumulated bankerless flights — 18 of 67 reasoned reviewer bins
// (too_obscure) in outputs/feedback_analyses/mike_bin_reasons_2026-08-05.md, Class 2.
describe("bank path banker enforcement", () => {
  it("pins BANK_BLOCKING_RULES membership to exactly banker", () => {
    // Same discipline as ADVISORY_RULES: promoting a rule to bank-blocking changes what the bank
    // will accept and must not ride along in an unrelated change.
    expect([...BANK_BLOCKING_RULES].sort()).toEqual(["banker"]);
  });

  it("every bank-blocking rule is advisory — otherwise it already blocks everywhere", () => {
    for (const rule of BANK_BLOCKING_RULES) {
      expect(ADVISORY_RULES.has(rule)).toBe(true);
    }
  });

  it("banker blocks on the bank path", () => {
    const out = blockingViolations(
      { banker: ["no recognizable benchmark appellation"] },
      { bankPath: true }
    );
    expect(out).toEqual(["no recognizable benchmark appellation"]);
  });

  it("banker stays advisory off the bank path, explicitly and by default", () => {
    const fired = { banker: ["no recognizable benchmark appellation"] };
    expect(blockingViolations(fired, { bankPath: false })).toEqual([]);
    expect(blockingViolations(fired)).toEqual([]);
  });

  it("non-advisory rules block identically on both paths", () => {
    const fired = { variety: ["a"], banker: ["b"], marks: ["c"] };
    expect(blockingViolations(fired, { bankPath: true })).toEqual(["a", "b", "c"]);
    expect(blockingViolations(fired, { bankPath: false })).toEqual(["a", "c"]);
  });

  it("never relaxes the banker check on the bank path, at any attempt", () => {
    // Blocking only works if the check RAN — a relaxed check reports no violations, and
    // blockingViolations cannot gate on a verdict that was never produced.
    for (const attempt of [1, 2, 3, 4, 5, 6, 10]) {
      expect(shouldRelaxBanker(attempt, true)).toBe(false);
    }
  });

  it("keeps the interactive attempt-4 relaxation", () => {
    expect(shouldRelaxBanker(1, false)).toBe(false);
    expect(shouldRelaxBanker(3, false)).toBe(false);
    expect(shouldRelaxBanker(4, false)).toBe(true);
    expect(shouldRelaxBanker(6, false)).toBe(true);
  });
});
