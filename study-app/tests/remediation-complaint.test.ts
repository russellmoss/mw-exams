import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import {
  feedbackQuarantineEntries,
  attemptIdsFromEntries,
  buildComplaintBlock,
  targetSkipReason,
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

describe("targetSkipReason", () => {
  // Two remediators can legitimately run at once (the nightly workflow and a hand-run --only batch),
  // and on 2026-08-09 they raced: both selected gen_p1_F2_1786306298953 at startup and both
  // regenerated it. The helper judges a row RE-READ just before spending, so the second runner
  // stands down instead of duplicating the first one's replacement.
  const cleanWine = {
    slot: 1,
    fullText: "Domaine Leflaive, Puligny-Montrachet 1er Cru Les Pucelles 2020. Burgundy, France",
  };

  it("skips a row another runner archived, and one that vanished entirely", () => {
    expect(targetSkipReason(undefined)).toMatch(/no longer exists/);
    expect(
      targetSkipReason({ archived: "true", invalid_reasons: [{ rule: "marks" }], validated: false, wines: [cleanWine] })
    ).toMatch(/archived/);
  });

  it("proceeds while EITHER quarantine flag is still live", () => {
    expect(
      targetSkipReason({ archived: null, invalid_reasons: [{ rule: "marks" }], validated: true, wines: [cleanWine] })
    ).toBeNull();
    expect(
      targetSkipReason({ archived: null, invalid_reasons: null, validated: false, wines: [cleanWine] })
    ).toBeNull();
  });

  it("skips a row whose flags another runner cleared — validated true or absent both read as clean", () => {
    expect(
      targetSkipReason({ archived: null, invalid_reasons: null, validated: true, wines: [cleanWine] })
    ).toMatch(/no longer flagged/);
    // No stem_answer_keys row at all (LEFT JOIN null) is also not-flagged.
    expect(
      targetSkipReason({ archived: null, invalid_reasons: null, validated: null, wines: [cleanWine] })
    ).toMatch(/no longer flagged/);
  });

  it("does NOT mistake a malformed-wines target for a cleared one — that selector never sets a flag", () => {
    // main()'s third quarantine signal detects generator deliberation in wines[] directly from the
    // raw labels, without writing invalid_reasons. Flag-cleanliness alone therefore proves nothing
    // for these targets; only clean labels do.
    const deliberation = { slot: 2, fullText: "Chambers Rosewood — wait, excluded. Let me correct." };
    expect(
      targetSkipReason({ archived: null, invalid_reasons: null, validated: true, wines: [cleanWine, deliberation] })
    ).toBeNull();
    // Same row serialized as a jsonb string — the tolerance every other reader of wines[] has.
    expect(
      targetSkipReason({ archived: null, invalid_reasons: null, validated: true, wines: JSON.stringify([deliberation]) })
    ).toBeNull();
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

  it("each target is re-read and re-judged INSIDE the loop, before tryRepair spends anything", () => {
    // The anti-race check must run per-question at processing time — hoisted above the loop it
    // would just be a second stale selection, and after tryRepair it would be after the spend.
    const loopAt = main.indexOf("for (const old of targets)");
    const recheckAt = main.indexOf("targetSkipReason(", loopAt);
    const repairAt = main.indexOf("tryRepair(old)", loopAt);
    expect(loopAt).toBeGreaterThan(-1);
    expect(recheckAt).toBeGreaterThan(loopAt);
    expect(repairAt).toBeGreaterThan(-1);
    expect(recheckAt).toBeLessThan(repairAt);
    // And it judges a FRESH row, not the startup selection: the re-read query sits with it.
    const rereadAt = main.indexOf("SELECT g.invalid_reasons, g.metadata->>'archived'", loopAt);
    expect(rereadAt).toBeGreaterThan(loopAt);
    expect(rereadAt).toBeLessThan(recheckAt);
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
