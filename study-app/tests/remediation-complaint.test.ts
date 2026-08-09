import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  feedbackQuarantineEntries,
  attemptIdsFromEntries,
  buildComplaintBlock,
} from "../scripts/remediation-complaint.mjs";

/**
 * The reviewer-loop closures in remediation (2026-08-09).
 *
 * Before these, a validated rejection was "corrected" by discard-and-redraw: remediateOne knew only
 * paper × family, so for a Kind:question accept or a cohort retirement — complaints that never
 * become validator rules — nothing constrained the replacement away from the flagged fault, the
 * replacement arrived in the review queues unlinked to the complaint it answered, and a question
 * whose rule PR had not yet merged could be regenerated tonight under the OLD rules.
 *
 * The pure helpers are tested directly; the wiring is pinned in source the same way
 * feedback-quarantine-edge.test.ts pins the quarantine calls, because the failure that recreates
 * the gap is precisely "the call was removed or moved out of the branch that gates it".
 */

const read = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

describe("feedbackQuarantineEntries", () => {
  it("keeps only feedback-question entries, from either jsonb shape", () => {
    const entries = [
      { rule: "feedback-question", severity: "hard", detail: "Quarantined from attempt 41: …" },
      { rule: "marks", severity: "hard", detail: "total 70 != 75" },
    ];
    expect(feedbackQuarantineEntries(entries)).toHaveLength(1);
    expect(feedbackQuarantineEntries(JSON.stringify(entries))).toHaveLength(1);
  });

  it("returns [] for null, malformed JSON, and non-array shapes", () => {
    expect(feedbackQuarantineEntries(null)).toEqual([]);
    expect(feedbackQuarantineEntries("not json")).toEqual([]);
    expect(feedbackQuarantineEntries({ rule: "feedback-question" })).toEqual([]);
  });
});

describe("attemptIdsFromEntries", () => {
  it("reads the attempt id from BOTH quarantine writers' detail formats", () => {
    // quarantineAttemptQuestion and quarantineCohort each stamp "attempt N" — the only join key
    // back to the analysis. A cohort sibling has no user_attempts row of its own, so a question_id
    // join would miss it; this is why the id must be recoverable from the detail string.
    const entries = [
      { rule: "feedback-question", detail: "Quarantined from attempt 123: the analysis found the complaint valid — \"…\"" },
      { rule: "feedback-question", detail: "Cohort quarantine from attempt 456 (gen_p3_F5_1): a reviewer's objection was categorical" },
    ];
    expect(attemptIdsFromEntries(entries).sort()).toEqual([123, 456]);
  });

  it("dedupes repeated ids", () => {
    const entries = [
      { rule: "feedback-question", detail: "Quarantined from attempt 9: a" },
      { rule: "feedback-question", detail: "Cohort quarantine from attempt 9: b" },
    ];
    expect(attemptIdsFromEntries(entries)).toEqual([9]);
  });
});

describe("buildComplaintBlock", () => {
  it("returns empty for a row with no reviewer quarantine — validator-only rows get no block", () => {
    expect(buildComplaintBlock(null)).toBe("");
    expect(buildComplaintBlock({ entries: [], analyses: [] })).toBe("");
  });

  it("carries the quarantine detail and the reviewer's own feedback text", () => {
    const block = buildComplaintBlock({
      entries: [{ rule: "feedback-question", detail: "Cohort quarantine from attempt 7: sparkling shiraz over-represented" }],
      analyses: [{ attempt_id: 7, feedback_text: "Way too many sparkling Shiraz questions in P3." }],
    });
    expect(block).toContain("sparkling shiraz over-represented");
    expect(block).toContain("Way too many sparkling Shiraz questions in P3.");
    // The block must self-scope: advisory for this replacement, never a paper-scope override.
    expect(block).toContain("THIS replacement only");
  });

  it("caps entry and feedback lengths so a pathological row cannot flood the prompt", () => {
    const block = buildComplaintBlock({
      entries: [{ rule: "feedback-question", detail: "x".repeat(5000) }],
      analyses: [{ attempt_id: 1, feedback_text: "y".repeat(5000) }],
    });
    expect(block.length).toBeLessThan(2000);
  });
});

describe("remediate-questions.mjs — the wiring", () => {
  const src = read("scripts/remediate-questions.mjs");
  const remediateOne = src.slice(src.indexOf("async function remediateOne"), src.indexOf("// ── TIER 1"));
  const main = src.slice(src.indexOf("async function main"));

  it("remediateOne appends the bin-lessons block, like the live engine", () => {
    expect(remediateOne).toContain("getBinLessonsBlock()");
  });

  it("remediateOne injects the complaint block BEFORE the attempt loop spends anything", () => {
    const blockAt = remediateOne.indexOf("buildComplaintBlock(complaint)");
    const loopAt = remediateOne.indexOf("attempt <= MAX_ATTEMPTS");
    expect(blockAt).toBeGreaterThan(-1);
    expect(blockAt).toBeLessThan(loopAt);
  });

  it("a replacement inherits its predecessor's review votes (carryReviewsForward in the APPLY path)", () => {
    expect(main).toContain("carryReviewsForward(old.question_id, res.newId");
  });

  it("a question whose rule PR is in flight is deferred, not regenerated under the old rules", () => {
    // apply-change.ts's own definition of in-flight, and the check must gate target selection.
    const gateAt = main.indexOf('apply_status === "dispatched" || a.apply_status === "pr_opened"');
    const sliceAt = main.indexOf("actionable.slice(0, LIMIT)");
    expect(gateAt).toBeGreaterThan(-1);
    expect(sliceAt).toBeGreaterThan(-1);
    expect(gateAt).toBeLessThan(sliceAt);
  });

  it("--only scopes the target set before the PR gate, and unknown ids are reported not guessed", () => {
    // The targeted-batch path ("regen the questions the reviewer rejected today"). Scoping must
    // happen before the complaint/PR-gate partition so a targeted run gets the same protections
    // as a full nightly one — an --only filter applied after the slice would silently bypass them.
    const onlyAt = main.indexOf("ONLY.has(r.question_id)");
    const gateAt = main.indexOf('apply_status === "dispatched"');
    expect(onlyAt).toBeGreaterThan(-1);
    expect(onlyAt).toBeLessThan(gateAt);
    expect(main).toContain("not in the quarantined set");
  });
});
