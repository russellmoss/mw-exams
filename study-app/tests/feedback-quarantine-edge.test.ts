import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

/**
 * The accept/partial → quarantine edge, pinned.
 *
 * Measured on the 9-Aug review batch: of 167 down-votes, every one got an analysis, but 26 whose
 * complaint was found VALID and 81 found PARTIALLY VALID were still servable afterwards — an accept
 * whose Kind routed to a code change shipped a rule PR and left the question in circulation, and a
 * partial never touched the bank at all. The candidate keeps meeting the question a reviewer already
 * condemned until remediation happens to replace it, which nothing was feeding.
 *
 * Both halves are DB-bound, so these are source pins in the style of feedback-verdict-gate: they
 * fail if the call is removed or moved out of the branch that gates it, which is the failure that
 * recreates the incident.
 */

const read = (rel: string) => fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

describe("feedback analysis — a validated complaint pulls its question", () => {
  const src = read("src/lib/feedback-analysis.ts");
  const start = src.indexOf("export async function applyRecommendation");
  const body = src.slice(start, src.indexOf("\nexport ", start + 1));

  it("accept quarantines the attempt's question even when the fix ships as a code PR", () => {
    const acceptBranch = body.slice(body.indexOf('recommendation === "accept"'), body.indexOf('recommendation === "reject"'));
    expect(acceptBranch).toContain("quarantineAttemptQuestion(attemptId");
  });

  it("partial quarantines too — 'some points valid' is still a confirmed fault", () => {
    const partialBranch = body.slice(body.indexOf('recommendation === "partial"'), body.indexOf('recommendation === "endorse"'));
    expect(partialBranch).toContain("quarantineAttemptQuestion(attemptId");
  });

  it("the quarantine writes the rule remediation and the audit both key on", () => {
    // 'feedback-question' is preserved by audit-questions.mjs --apply when clearing stale flags and
    // refused by remediation's in-place repair; any other rule string silently loses both guarantees.
    const helper = src.slice(src.indexOf("async function quarantineAttemptQuestion"));
    expect(helper).toMatch(/rule:\s*"feedback-question",\s*severity:\s*"hard"/);
  });
});

describe("remediation — reviewer quarantines are never 'repaired' in place", () => {
  it("tryRepair refuses feedback-question rows before the already-clean shortcut", () => {
    // tryRepair's "already clean" path trusts the VALIDATOR to decide a flag is stale, and a
    // reviewer's complaint is invisible to the validator — without this guard a feedback-quarantined
    // question that happens to pass validation is returned to service unchanged.
    const src = read("scripts/remediate-questions.mjs");
    const start = src.indexOf("async function tryRepair");
    const body = src.slice(start, src.indexOf("\nasync function", start + 1));
    const guardAt = body.indexOf('rule === "feedback-question"');
    const shortcutAt = body.indexOf('how: "already clean"');
    expect(guardAt).toBeGreaterThan(-1);
    expect(shortcutAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(shortcutAt);
  });
});
