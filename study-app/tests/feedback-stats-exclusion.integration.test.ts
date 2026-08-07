/**
 * Behavioural regression for the Feedback-tab / study-attempt leak (migration 053), against a real
 * Postgres database.
 *
 * Requires TEST_DATABASE_URL pointing at a DISPOSABLE Neon branch — never production. Production
 * and preview share one database in this project, so pointing this at "preview" would write real
 * user data. Skipped entirely when the variable is unset (and excluded from the build gate by the
 * *.integration.test.ts pattern); the always-on half of this regression lives in
 * feedback-stats-exclusion.test.ts.
 *
 * Two directions, because the obvious fix breaks the second one:
 *   1. A general-scope Feedback-tab submission must NOT move total_attempts.
 *   2. Leaving Feedback-tab feedback on an attempt you actually completed must NOT remove that
 *      attempt (or its pass) from the scoreboard — recordTabFeedback stamps source='feedback_tab'
 *      onto the existing row, so an exclusion keyed on `source` would silently delete real reps.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { neon } from "@neondatabase/serverless";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeIf = TEST_DB ? describe : describe.skip;

// db.ts reads DATABASE_URL lazily, so point it at the test branch before importing.
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const { getUserStats, recordTabFeedback } = await import("../src/lib/db");

const TEST_EMAIL = "vitest-feedback-stats@example.invalid";

describeIf("Feedback-tab rows and the History scoreboard (real database)", () => {
  // describe.skip still evaluates this body to collect test names, so the client must not be
  // constructed eagerly — neon() throws on an undefined connection string.
  const sql = TEST_DB ? neon(TEST_DB) : (undefined as unknown as ReturnType<typeof neon<false, false>>);
  let userId: number;

  beforeAll(async () => {
    await sql`DELETE FROM users WHERE email = ${TEST_EMAIL}`;
    const rows = await sql`
      INSERT INTO users (email, name, password_hash, is_admin, is_active)
      VALUES (${TEST_EMAIL}, 'Vitest Feedback User', 'x', false, true)
      RETURNING id
    `;
    userId = rows[0].id as number;
  });

  afterAll(async () => {
    if (userId) await sql`DELETE FROM user_attempts WHERE user_id = ${userId}`;
    await sql`DELETE FROM users WHERE email = ${TEST_EMAIL}`;
  });

  it("does not count general feedback as a study attempt", async () => {
    const before = await getUserStats(userId);

    const { id } = await recordTabFeedback({
      userId,
      text: "The timer keeps running while the panel is open.",
      category: "bug",
      scope: "general",
      route: "/history",
      pausedMs: 4200,
      questionId: null,
      attemptId: null,
    });

    // The row really was written — otherwise this test would pass for the wrong reason.
    const stored = await sql`SELECT mode, scope, source, question_id FROM user_attempts WHERE id = ${id}`;
    expect(stored[0]).toMatchObject({
      mode: "full",
      scope: "general",
      source: "feedback_tab",
      question_id: null,
    });

    const after = await getUserStats(userId);
    expect(after.total_attempts).toBe(before.total_attempts);
    expect(after.completed_attempts).toBe(before.completed_attempts);
    expect(after.pass_count + after.borderline_count + after.fail_count).toBe(
      before.pass_count + before.borderline_count + before.fail_count
    );
  });

  it("still counts a completed attempt after feedback is left on it", async () => {
    // A real study attempt is question-backed (user_attempts_question_family_check, migration 050),
    // so borrow an existing question rather than synthesising one — this test is about the stats
    // predicate, not about generated_questions' own shape.
    const questions = await sql`SELECT question_id FROM generated_questions LIMIT 1`;
    expect(questions.length, "needs at least one generated question to attach an attempt to").toBe(1);
    const questionId = questions[0].question_id as string;

    const inserted = await sql`
      INSERT INTO user_attempts (user_id, question_id, mode, stem_detail, completed_at, pass_estimate)
      VALUES (${userId}, ${questionId}, 'full', 'exam_real', NOW(), 'pass')
      RETURNING id
    `;
    const attemptId = inserted[0].id as number;
    const before = await getUserStats(userId);
    expect(before.pass_count).toBeGreaterThan(0);

    await recordTabFeedback({
      userId,
      text: "Marked me down for a note the key also gives.",
      category: "grading_off",
      scope: "question",
      route: "/history",
      pausedMs: null,
      questionId: null,
      attemptId,
    });

    // recordTabFeedback recorded onto the existing row, stamping it source='feedback_tab'.
    const stored = await sql`SELECT source, scope FROM user_attempts WHERE id = ${attemptId}`;
    expect(stored[0]).toMatchObject({ source: "feedback_tab", scope: "question" });

    const after = await getUserStats(userId);
    expect(after.total_attempts).toBe(before.total_attempts);
    expect(after.completed_attempts).toBe(before.completed_attempts);
    expect(after.pass_count).toBe(before.pass_count);
  });

  it("still rejects a question-less row that is not general feedback", async () => {
    // Migration 054 carves a hole in user_attempts_question_family_check for app-level feedback.
    // The hole must be exactly that shape: a question-less row with no scope is still a broken
    // attempt, not feedback. (Written with `=` instead of `IS NOT DISTINCT FROM`, the carve-out
    // evaluates to NULL here — and a CHECK only rejects FALSE — so this row would sail through.)
    await expect(
      sql`
        INSERT INTO user_attempts (user_id, mode, stem_detail, completed_at, pass_estimate)
        VALUES (${userId}, 'full', 'exam_real', NOW(), 'pass')
      `
    ).rejects.toThrow(/user_attempts_question_family_check/);
  });
});
