// unkeyed-audit-scope.test.ts — what an audit is allowed to quarantine on when the row has no key.
//
// auditAndQuarantineQuestion used to INNER JOIN stem_answer_keys, so a question whose key never built
// was not in its result set at all: it returned "question or answer key not found" and the row sat
// banked with no verdict until the 06:40 UTC sweep — up to a day servable behind nothing but the
// serve gate. On 2026-08-09 that was 235 rows, 231 of them servable.
//
// The daily sweep (scripts/audit-questions.mjs) fixed the same hole on its own side on 2026-08-08 and
// has been evaluating unkeyed rows since. This pins the contract now shared by both paths, because
// the join is only half the fix — auditing an unkeyed row on the FULL rule set would be worse than
// not auditing it, and the two gates must not drift apart.
import { describe, it, expect } from "vitest";
import { enforceableViolations } from "@/lib/question-audit";
import { GROUND_TRUTH_INDEPENDENT_RULES } from "@/lib/question-rules.mjs";
import type { Violation } from "@/lib/question-validator";

const v = (rule: string): Violation => ({ rule, severity: "hard", detail: `${rule} fired` });

describe("enforceableViolations", () => {
  it("keeps everything on a keyed row", () => {
    const hard = [v("country-diversity"), v("MARKS_BELOW_FLOOR"), v("wrong_colour_for_paper")];
    expect(enforceableViolations(hard, true)).toHaveLength(3);
  });

  it("drops key-dependent rules on an unkeyed row", () => {
    // country-diversity is the specific rule that makes this necessary: it fires on 187 keyed
    // questions when their ground truth is stripped, and on zero of the same questions keyed.
    // Quarantining an unkeyed row on it would kill most of what it touched, over nothing.
    const hard = [v("country-diversity"), v("wrong_colour_for_paper"), v("single-variety-blend")];
    expect(enforceableViolations(hard, false)).toEqual([]);
  });

  it("still enforces the ground-truth-independent rules on an unkeyed row", () => {
    // These read the stem and the raw label only, so a missing key costs them nothing — which is
    // exactly why an unkeyed row is worth auditing at all rather than being waved through.
    const hard = [
      v("MARKS_BELOW_FLOOR"),
      v("excluded-producer"),
      v("pooled-block-per-wine-task"),
      v("country-diversity"),
    ];
    const kept = enforceableViolations(hard, false).map((x) => x.rule);
    expect(kept).toEqual(["MARKS_BELOW_FLOOR", "excluded-producer", "pooled-block-per-wine-task"]);
  });

  it("enforces exactly the shared list, not a private copy of it", () => {
    // The failure this guards against is a second gate growing its own divergent heuristic — the
    // mistake validateBankerMinimum made, which is how 144 bankerless flights passed generation and
    // were then quarantined post-save. Both audit paths must filter on the same exported array.
    const hard = GROUND_TRUTH_INDEPENDENT_RULES.map(v);
    expect(enforceableViolations(hard, false)).toHaveLength(GROUND_TRUTH_INDEPENDENT_RULES.length);
  });

  it("is a no-op when nothing is hard", () => {
    expect(enforceableViolations([], false)).toEqual([]);
    expect(enforceableViolations([], true)).toEqual([]);
  });
});
