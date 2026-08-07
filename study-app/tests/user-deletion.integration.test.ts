/**
 * Integration tests for account deletion against a real Postgres database.
 *
 * Requires TEST_DATABASE_URL pointing at a DISPOSABLE Neon branch — never production. Production
 * and preview share one database in this project, and this suite deletes users. Skipped entirely
 * when the variable is unset.
 *
 * The branch must have migration 060 applied: these tests assert the *schema's* behaviour as much
 * as the module's. purgeUser issues a single DELETE and relies on the FK rules from 060 to decide
 * what cascades and what is anonymized, so a test that passed without those constraints would be
 * testing nothing.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { neon } from "@neondatabase/serverless";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeIf = TEST_DB ? describe : describe.skip;

if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const {
  assertNotLastAdmin,
  DELETION_GRACE_DAYS,
  DeletionBlockedError,
  formatPurgeDate,
  getPendingDeletion,
  purgeDateFor,
  purgeExpiredUsers,
  restoreUser,
  softDeleteUser,
} = await import("../src/lib/user-deletion");

const EMAIL = "vitest-deletion@example.invalid";
const OTHER_ADMIN_EMAIL = "vitest-deletion-admin@example.invalid";

describeIf("account deletion (real database)", () => {
  // describe.skip still evaluates this body to collect test names, so the client must not be
  // constructed eagerly — neon() throws on an undefined connection string.
  const sql = TEST_DB ? neon(TEST_DB) : (undefined as unknown as ReturnType<typeof neon<false, false>>);

  let userId: number;
  let attemptId: number;
  let analysisId: number;
  let otherAdminId: number;

  /** Remove anything a previous run left behind. */
  async function cleanup() {
    await sql`DELETE FROM users WHERE email IN (${EMAIL}, ${OTHER_ADMIN_EMAIL})`;
    await sql`DELETE FROM model_usage WHERE task_type = 'vitest-deletion'`;
    await sql`DELETE FROM generated_questions WHERE question_id = 'vitest-deletion-q'`;
    await sql`DELETE FROM feature_requests WHERE title = 'vitest-deletion-fr'`;
  }

  /**
   * Build a user carrying one row in every table that references users, so a purge has something
   * to prove in both directions. Deliberately includes a Live Tasting paper WITH a session
   * attached: that combination is what the previous hand-ordered implementation could not delete.
   */
  async function seedUser(): Promise<void> {
    const users = (await sql`
      INSERT INTO users (email, name, is_admin, is_active)
      VALUES (${EMAIL}, 'Deletion Test', false, true)
      RETURNING id
    `) as { id: number }[];
    userId = users[0].id;

    // Must exist before the attempt: user_attempts.question_id is a foreign key into the bank.
    // It doubles as the "non-personal row, kept and anonymized" fixture.
    await sql`
      INSERT INTO generated_questions (question_id, paper, family, family_label, question_text, wines, created_by_user_id)
      VALUES ('vitest-deletion-q', 1, 'f', 'F', 'q', '[]'::jsonb, ${userId})
    `;

    const attempts = (await sql`
      INSERT INTO user_attempts (user_id, question_id, user_answer)
      VALUES (${userId}, 'vitest-deletion-q', 'a candidate answer')
      RETURNING id
    `) as { id: number }[];
    attemptId = attempts[0].id;

    const analyses = (await sql`
      INSERT INTO feedback_analyses (user_id, attempt_id) VALUES (${userId}, ${attemptId})
      RETURNING id
    `) as { id: number }[];
    analysisId = analyses[0].id;
    // Close the reference cycle the schema has to survive: the attempt points back at its analysis.
    await sql`UPDATE user_attempts SET auto_analysis_id = ${analysisId} WHERE id = ${attemptId}`;

    await sql`
      INSERT INTO live_tasting_papers (id, user_id, paper, size, mode, pacing, city, country, composition)
      VALUES ('vitest-del-paper', ${userId}, 1, 'half', 'byo', 'flight-by-flight', 'London', 'UK', '{}'::jsonb)
    `;
    await sql`
      INSERT INTO live_tasting_sessions (id, user_id, paper, flight_size, archetype, city, country, paper_id, attempt_id)
      VALUES ('vitest-del-session', ${userId}, 1, 3, 'test', 'London', 'UK', 'vitest-del-paper', ${attemptId})
    `;

    await sql`INSERT INTO coach_conversations (id, user_id) VALUES ('vitest-del-convo', ${userId})`;
    await sql`INSERT INTO question_views (user_id, question_id) VALUES (${userId}, 'vitest-deletion-q')`;
    await sql`INSERT INTO question_flags (user_id, question_id) VALUES (${userId}, 'vitest-deletion-q')`;
    await sql`INSERT INTO grading_telemetry (user_id, grader) VALUES (${userId}, 'vitest')`;
    await sql`
      INSERT INTO user_api_keys (user_id, provider, encrypted_key, key_hint)
      VALUES (${userId}, 'anthropic', 'x', '...abcd')
    `;
    await sql`
      INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
      VALUES (${userId}, 'vitest-hash', now() + interval '1 hour')
    `;

    // Non-personal rows: these must SURVIVE the purge with the user reference nulled.
    await sql`
      INSERT INTO model_usage (user_id, task_type, model) VALUES (${userId}, 'vitest-deletion', 'test-model')
    `;
    await sql`
      INSERT INTO feature_requests (created_by, title) VALUES (${userId}, 'vitest-deletion-fr')
    `;
  }

  beforeAll(async () => {
    await cleanup();
    const admins = (await sql`
      INSERT INTO users (email, name, is_admin, is_active)
      VALUES (${OTHER_ADMIN_EMAIL}, 'Other Admin', true, true)
      RETURNING id
    `) as { id: number }[];
    otherAdminId = admins[0].id;
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(async () => {
    await sql`DELETE FROM users WHERE email = ${EMAIL}`;
    await sql`DELETE FROM model_usage WHERE task_type = 'vitest-deletion'`;
    await sql`DELETE FROM generated_questions WHERE question_id = 'vitest-deletion-q'`;
    await sql`DELETE FROM feature_requests WHERE title = 'vitest-deletion-fr'`;
    await seedUser();
  });

  describe("softDeleteUser", () => {
    it("locks the account and stamps the purge date", async () => {
      const pending = await softDeleteUser(sql, userId, otherAdminId);

      const rows = (await sql`
        SELECT is_active, deleted_at, deleted_by FROM users WHERE id = ${userId}
      `) as { is_active: boolean; deleted_at: string | null; deleted_by: number | null }[];

      expect(rows[0].is_active).toBe(false);
      expect(rows[0].deleted_at).not.toBeNull();
      expect(rows[0].deleted_by).toBe(otherAdminId);
      expect(pending.purgeDate.getTime() - pending.deletedAt.getTime()).toBe(
        DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000
      );
    });

    it("revokes API keys and reset tokens immediately, not in 30 days", async () => {
      await softDeleteUser(sql, userId, null);

      const keys = await sql`SELECT 1 FROM user_api_keys WHERE user_id = ${userId}`;
      const tokens = await sql`SELECT 1 FROM password_reset_tokens WHERE user_id = ${userId}`;
      expect(keys).toHaveLength(0);
      expect(tokens).toHaveLength(0);
    });

    it("does not extend the grace period when called twice", async () => {
      const first = await softDeleteUser(sql, userId, null);
      const second = await softDeleteUser(sql, userId, otherAdminId);

      expect(second.deletedAt.getTime()).toBe(first.deletedAt.getTime());
      // The original actor is preserved too — a re-submit must not rewrite the audit trail.
      const rows = (await sql`SELECT deleted_by FROM users WHERE id = ${userId}`) as {
        deleted_by: number | null;
      }[];
      expect(rows[0].deleted_by).toBeNull();
    });

    it("records a self-deletion with a null actor", async () => {
      await softDeleteUser(sql, userId, null);
      const found = await getPendingDeletion(sql, { email: EMAIL });
      expect(found?.id).toBe(userId);
    });
  });

  describe("restoreUser", () => {
    it("reactivates a pending account and clears the deletion", async () => {
      await softDeleteUser(sql, userId, otherAdminId);
      expect(await restoreUser(sql, userId)).toBe(true);

      const rows = (await sql`
        SELECT is_active, deleted_at, deleted_by FROM users WHERE id = ${userId}
      `) as { is_active: boolean; deleted_at: string | null; deleted_by: number | null }[];
      expect(rows[0].is_active).toBe(true);
      expect(rows[0].deleted_at).toBeNull();
      expect(rows[0].deleted_by).toBeNull();
      expect(await getPendingDeletion(sql, { id: userId })).toBeNull();
    });

    it("reports false for an account that was not being deleted", async () => {
      expect(await restoreUser(sql, userId)).toBe(false);
    });
  });

  describe("purgeExpiredUsers", () => {
    it("leaves accounts inside the grace period alone", async () => {
      await softDeleteUser(sql, userId, null);

      const { purged } = await purgeExpiredUsers(sql);
      expect(purged.map((u) => u.id)).not.toContain(userId);

      const rows = await sql`SELECT 1 FROM users WHERE id = ${userId}`;
      expect(rows).toHaveLength(1);
    });

    it("purges the account and all of its personal data once the window has passed", async () => {
      await softDeleteUser(sql, userId, null);
      await sql`
        UPDATE users SET deleted_at = now() - make_interval(days => ${DELETION_GRACE_DAYS + 1})
         WHERE id = ${userId}
      `;

      const { purged } = await purgeExpiredUsers(sql);
      expect(purged.map((u) => u.id)).toContain(userId);

      // Every table the person's own content lived in.
      const remaining = {
        user: await sql`SELECT 1 FROM users WHERE id = ${userId}`,
        attempts: await sql`SELECT 1 FROM user_attempts WHERE user_id = ${userId}`,
        analyses: await sql`SELECT 1 FROM feedback_analyses WHERE user_id = ${userId}`,
        papers: await sql`SELECT 1 FROM live_tasting_papers WHERE user_id = ${userId}`,
        sessions: await sql`SELECT 1 FROM live_tasting_sessions WHERE user_id = ${userId}`,
        coach: await sql`SELECT 1 FROM coach_conversations WHERE user_id = ${userId}`,
        views: await sql`SELECT 1 FROM question_views WHERE user_id = ${userId}`,
        flags: await sql`SELECT 1 FROM question_flags WHERE user_id = ${userId}`,
        telemetry: await sql`SELECT 1 FROM grading_telemetry WHERE user_id = ${userId}`,
      };
      for (const [table, rows] of Object.entries(remaining)) {
        expect(rows, `${table} should have been purged`).toHaveLength(0);
      }
    });

    it("keeps the cost ledger and shared question bank, anonymized", async () => {
      await softDeleteUser(sql, userId, null);
      await sql`
        UPDATE users SET deleted_at = now() - make_interval(days => ${DELETION_GRACE_DAYS + 1})
         WHERE id = ${userId}
      `;
      await purgeExpiredUsers(sql);

      const usage = (await sql`
        SELECT user_id FROM model_usage WHERE task_type = 'vitest-deletion'
      `) as { user_id: number | null }[];
      const question = (await sql`
        SELECT created_by_user_id FROM generated_questions WHERE question_id = 'vitest-deletion-q'
      `) as { created_by_user_id: number | null }[];
      const request = (await sql`
        SELECT created_by FROM feature_requests WHERE title = 'vitest-deletion-fr'
      `) as { created_by: number | null }[];

      // The row survives (the Cost dashboard's history stays intact) but no longer names anyone.
      expect(usage).toHaveLength(1);
      expect(usage[0].user_id).toBeNull();
      expect(question).toHaveLength(1);
      expect(question[0].created_by_user_id).toBeNull();
      expect(request).toHaveLength(1);
      expect(request[0].created_by).toBeNull();
    });

    /**
     * Regression: on master this exact shape — a Live Tasting paper with a session attached —
     * aborted the delete transaction with a foreign-key violation, so the two affected users
     * could not delete their accounts at all.
     */
    it("purges a user who has a Live Tasting paper with sessions attached", async () => {
      const before = await sql`
        SELECT 1 FROM live_tasting_sessions WHERE id = 'vitest-del-session' AND paper_id IS NOT NULL
      `;
      expect(before, "fixture should include a session bound to a paper").toHaveLength(1);

      await softDeleteUser(sql, userId, null);
      await sql`
        UPDATE users SET deleted_at = now() - make_interval(days => ${DELETION_GRACE_DAYS + 1})
         WHERE id = ${userId}
      `;

      const { purged } = await purgeExpiredUsers(sql);
      expect(purged.map((u) => u.id)).toContain(userId);
      expect(await sql`SELECT 1 FROM live_tasting_sessions WHERE id = 'vitest-del-session'`).toHaveLength(0);
      expect(await sql`SELECT 1 FROM live_tasting_papers WHERE id = 'vitest-del-paper'`).toHaveLength(0);
    });

    it("leaves no dangling reference to the purged user anywhere", async () => {
      await softDeleteUser(sql, userId, null);
      await sql`
        UPDATE users SET deleted_at = now() - make_interval(days => ${DELETION_GRACE_DAYS + 1})
         WHERE id = ${userId}
      `;
      await purgeExpiredUsers(sql);

      // Ask the catalog rather than a hand-written list: a table added later is covered too,
      // provided migration 060's rule that every user reference carries an FK is respected.
      const dangling = (await sql`
        SELECT c.conrelid::regclass::text AS child, a.attname AS col
          FROM pg_constraint c
          JOIN unnest(c.conkey) k(attnum) ON true
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
         WHERE c.contype = 'f' AND c.confrelid = 'users'::regclass
      `) as { child: string; col: string }[];

      for (const { child, col } of dangling) {
        const rows = await sql.query(
          `SELECT 1 FROM ${child} WHERE ${col} = $1 LIMIT 1`,
          [userId]
        );
        expect(rows, `${child}.${col} still references the purged user`).toHaveLength(0);
      }
    });
  });

  describe("assertNotLastAdmin", () => {
    it("allows deleting an admin while another active admin remains", async () => {
      await sql`UPDATE users SET is_admin = true WHERE id = ${userId}`;
      await expect(assertNotLastAdmin(sql, userId)).resolves.toBeUndefined();
    });

    it("refuses to delete the last active admin", async () => {
      await sql`UPDATE users SET is_admin = false, is_active = false WHERE id != ${otherAdminId}`;
      await expect(assertNotLastAdmin(sql, otherAdminId)).rejects.toBeInstanceOf(DeletionBlockedError);
      // Put the fixture back for the remaining tests in this file.
      await sql`UPDATE users SET is_active = true WHERE id = ${userId}`;
    });

    it("does not count an admin who is already pending deletion", async () => {
      await sql`UPDATE users SET is_admin = true WHERE id = ${userId}`;
      await softDeleteUser(sql, userId, null);
      // otherAdmin is now the only admin who is not on the way out.
      await expect(assertNotLastAdmin(sql, otherAdminId)).rejects.toBeInstanceOf(DeletionBlockedError);
    });
  });

  describe("purge date formatting", () => {
    it("is stable regardless of the server's timezone", () => {
      const date = purgeDateFor("2026-08-07T23:30:00.000Z");
      expect(date.toISOString().slice(0, 10)).toBe("2026-09-06");
      expect(formatPurgeDate(date)).toBe("6 September 2026");
    });
  });
});
