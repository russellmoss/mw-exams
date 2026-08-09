import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * The corpus re-audit must fire on a RULE CHANGE, not on who merged it.
 *
 * It used to be a step inside auto-feedback.yml gated on `steps.merge.outputs.merged == '1'` — only
 * when the bot landed the change itself. A change PR-gated for human review skipped it, and nothing
 * re-ran after the human merged. PR-gating is decided by Kind, and the PR-gated Kinds are `generation`
 * and `validator`: exactly the changes that exist to re-verdict the corpus.
 *
 * Measured cost of the gap (2026-08-09): R-OW-ANCHOR merged via PR #128 with no re-audit, so 17
 * questions carrying the newly-caught defect stayed servable — and stayed in the reviewer's queue,
 * which reads the quarantine COLUMN rather than running the validator, until the sweep was triggered
 * by hand.
 */

const REPO = join(__dirname, "..", "..");
const reaudit = join(REPO, ".github", "workflows", "corpus-reaudit.yml");
const autoFeedback = join(REPO, ".github", "workflows", "auto-feedback.yml");

describe("corpus-reaudit workflow", () => {
  it("exists", () => {
    expect(existsSync(reaudit)).toBe(true);
  });

  const yml = () => readFileSync(reaudit, "utf-8");

  it("triggers on a push to master, not on a bot merge outcome", () => {
    const text = yml();
    expect(text).toMatch(/on:\s*[\s\S]*?push:\s*[\s\S]*?branches:\s*\[master\]/);
    // Comments stripped: the header explains the gate it replaced, and matching that would fail the
    // test for documenting the very property it asserts.
    const code = text.replace(/^\s*#.*$/gm, "");
    expect(code).not.toContain("steps.merge.outputs.merged");
  });

  it("watches every file whose change re-verdicts the corpus", () => {
    const text = yml();
    for (const path of [
      "study-app/src/lib/question-validator.ts",
      "study-app/src/lib/question-rules.mjs",
      "study-app/src/lib/question-engine.ts",
      "study-app/scripts/audit-questions.mjs",
    ]) {
      expect(text, `${path} is not in the paths filter`).toContain(path);
    }
  });

  it("checks out enough history to diff HEAD^..HEAD", () => {
    // The default depth-1 checkout has no HEAD^, so the diff errors, the file list comes back empty
    // and both work steps skip — a green run that did nothing. The workflow's first run did exactly
    // that on its own merge commit.
    expect(yml()).toMatch(/fetch-depth:\s*2/);
  });

  it("re-audits anyway when the diff is unavailable", () => {
    // The paths filter has already decided the push is relevant; this step only splits the work. With
    // no diff it must fail TOWARD auditing — the pass is idempotent, a skipped one leaves the defect
    // servable. (workflow_dispatch has no HEAD^ either.)
    const text = yml();
    expect(text).toMatch(/if \[ -z "\$CHANGED" \]/);
    expect(text.slice(text.indexOf('if [ -z "$CHANGED" ]'), text.indexOf('if [ -z "$CHANGED" ]') + 300)).toMatch(
      /rules=1/
    );
  });

  it("re-audits unconditionally on a manual dispatch", () => {
    // Diffing the last commit on a dispatch decides on whatever happened to land most recently, which
    // has nothing to do with why a human clicked the button.
    // The window is deliberately generous. It was {0,200} and went red when faef1d5 added a
    // six-line comment inside the branch — the workflow still set rules=1 unconditionally, so the
    // behaviour under test never changed; only the distance did. A character budget is incidental
    // to the intent here, and a tight one just fails the next person who explains themselves.
    expect(yml()).toMatch(/workflow_dispatch"\s*\]\s*;\s*then[\s\S]{0,800}rules=1/);
  });

  it("watches itself, so a change to it is exercised by the push that makes it", () => {
    expect(yml()).toContain(".github/workflows/corpus-reaudit.yml");
  });

  it("runs the audit through ts-loader", () => {
    // Without it, question-validator.ts's extensionless imports throw ERR_MODULE_NOT_FOUND and the
    // sweep goes dark with a green tick — the 2026-08-07 failure mode.
    expect(yml()).toMatch(/--import \.\/scripts\/ts-loader\.mjs scripts\/audit-questions\.mjs --apply/);
  });

  it("rebuilds keys BEFORE re-auditing", () => {
    // The audit reads ground_truth from stem_answer_keys; auditing against a key the same push just
    // invalidated verdicts the corpus on stale data.
    const text = yml();
    expect(text.indexOf("build-stem-answer-keys.mjs")).toBeLessThan(text.indexOf("audit-questions.mjs --apply"));
  });

  it("cannot apply concurrently with the nightly sweep", () => {
    // Two --apply passes racing on invalid_reasons would interleave quarantines and clears.
    expect(yml()).toMatch(/group:\s*corpus-audit-apply/);
    expect(readFileSync(join(REPO, ".github", "workflows", "question-audit-daily.yml"), "utf-8"))
      .toMatch(/group:\s*corpus-audit-apply/);
  });

  it("is not also left behind in auto-feedback.yml", () => {
    // Two mechanisms applying the same sweep is how they drift. The old step's removal is the fix.
    const text = readFileSync(autoFeedback, "utf-8");
    expect(text).not.toMatch(/^\s*run:.*audit-questions\.mjs --apply/m);
  });
});
