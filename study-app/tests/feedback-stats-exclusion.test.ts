/**
 * Feedback-tab rows must never be counted as study attempts.
 *
 * Migration 053 stores Feedback-tab submissions AS `user_attempts` rows: general-scope feedback is
 * written with mode='full', question_id=NULL, scope='general'. That lands it inside getUserStats's
 * `(mode IS NULL OR mode = 'full')` filter, so before the fix every submission incremented
 * total_attempts while contributing no pass_estimate — inflating the History scoreboard's
 * "N in progress" line with rows the candidate never studied.
 *
 * The by_paper / by_family arms are structurally safe (they JOIN generated_questions, which drops
 * question-less rows). The invariant asserted here is therefore: EVERY aggregate arm of
 * getUserStats either joins generated_questions or carries the scope exclusion — so a new arm added
 * later can't quietly reintroduce the leak.
 *
 * The behavioural half of this regression test (insert a real feedback row, assert total_attempts
 * doesn't move) lives in feedback-stats-exclusion.integration.test.ts, which needs a disposable
 * database branch. This file is the part that runs on every build.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DB_SOURCE = readFileSync(join(process.cwd(), "src/lib/db.ts"), "utf8");

/** The exclusion predicate, written identically in getUserAttempts and getUserStats. */
const SCOPE_EXCLUSION = /scope\s+IS\s+DISTINCT\s+FROM\s+'general'/i;

function functionBody(name: string): string {
  const start = DB_SOURCE.indexOf(`export async function ${name}(`);
  expect(start, `${name} not found in src/lib/db.ts`).toBeGreaterThan(-1);
  const next = DB_SOURCE.indexOf("\nexport ", start + 1);
  return DB_SOURCE.slice(start, next === -1 ? undefined : next);
}

function sqlTemplates(source: string): string[] {
  return [...source.matchAll(/\bsql\s*`([\s\S]*?)`/g)].map((m) => m[1]);
}

describe("Feedback-tab rows are not study attempts", () => {
  it("excludes general-scope rows from every getUserStats aggregate", () => {
    const arms = sqlTemplates(functionBody("getUserStats"));
    // totals, by_paper, by_family, recent_results — a new arm should trip this count and make the
    // author decide which side of the invariant it falls on.
    expect(arms).toHaveLength(4);

    for (const arm of arms) {
      const safeByJoin = /JOIN\s+generated_questions/i.test(arm);
      expect(
        safeByJoin || SCOPE_EXCLUSION.test(arm),
        `getUserStats arm counts general-scope feedback as an attempt:\n${arm.trim()}`
      ).toBe(true);
    }
  });

  it("uses the same predicate the History attempt list uses", () => {
    expect(functionBody("getUserAttempts")).toMatch(SCOPE_EXCLUSION);
  });

  it("does not exclude study attempts by feedback source", () => {
    // recordTabFeedback stamps source='feedback_tab' onto the EXISTING attempt when feedback is
    // left on a question the candidate answered, so a `source <> 'feedback_tab'` exclusion would
    // erase real completed reps — and their pass/fail — from the scoreboard. `scope` is the field
    // that separates app-level feedback from study reps; `source` is not.
    for (const arm of sqlTemplates(functionBody("getUserStats"))) {
      expect(arm, `getUserStats must not filter on source:\n${arm.trim()}`).not.toMatch(
        /source\s*(?:<>|!=|IS\s+DISTINCT\s+FROM)\s*'feedback_tab'/i
      );
    }
    expect(DB_SOURCE).toMatch(
      /UPDATE user_attempts SET[\s\S]{0,400}?source = 'feedback_tab', category = \$\{category\}, scope = 'question'/
    );
  });
});
