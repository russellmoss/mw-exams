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
import { ADVISORY_RULES, blockingViolations } from "../src/lib/question-engine";

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
