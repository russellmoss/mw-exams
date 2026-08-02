/**
 * Integration tests for the password-reset token lifecycle against a real Postgres database.
 *
 * Requires TEST_DATABASE_URL pointing at a DISPOSABLE Neon branch — never production. Production
 * and preview share one database in this project, so a test that writes to "preview" would be
 * writing to real user data. Skipped entirely when the variable is unset.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { neon } from "@neondatabase/serverless";

const TEST_DB = process.env.TEST_DATABASE_URL;
const describeIf = TEST_DB ? describe : describe.skip;

// reset-tokens reads DATABASE_URL lazily, so point it at the test branch before importing.
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const { createResetToken, verifyResetToken, consumeResetToken, checkRateLimit, hashToken } =
  await import("../src/lib/reset-tokens");

const TEST_EMAIL = "vitest-reset-flow@example.invalid";

describeIf("password reset flow (real database)", () => {
  // describe.skip still evaluates this body to collect test names, so the client must not be
  // constructed eagerly — neon() throws on an undefined connection string, which would turn a
  // clean skip into a suite failure whenever TEST_DATABASE_URL is unset.
  const sql = TEST_DB ? neon(TEST_DB) : (undefined as unknown as ReturnType<typeof neon<false, false>>);
  let userId: number;

  beforeAll(async () => {
    await sql`DELETE FROM users WHERE email = ${TEST_EMAIL}`;
    const rows = await sql`
      INSERT INTO users (email, name, password_hash, is_admin, is_active)
      VALUES (${TEST_EMAIL}, 'Vitest User', 'original-hash', false, true)
      RETURNING id
    `;
    userId = rows[0].id as number;
  });

  afterAll(async () => {
    // ON DELETE CASCADE clears the tokens with the user.
    await sql`DELETE FROM users WHERE email = ${TEST_EMAIL}`;
  });

  it("issues a token that verifies", async () => {
    const token = await createResetToken(userId, "1.2.3.4");
    const result = await verifyResetToken(token);
    expect(result.ok).toBe(true);
    expect(result.userId).toBe(userId);
    expect(result.email).toBe(TEST_EMAIL);
  });

  it("stores only the hash, never the raw token", async () => {
    const token = await createResetToken(userId, null);
    const rows = await sql`
      SELECT token_hash FROM password_reset_tokens WHERE user_id = ${userId} AND used_at IS NULL
    `;
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).toBe(hashToken(token));
    expect(rows[0].token_hash).not.toBe(token);
  });

  it("invalidates previously outstanding tokens when a new one is issued", async () => {
    const first = await createResetToken(userId, null);
    const second = await createResetToken(userId, null);

    expect((await verifyResetToken(first)).reason).toBe("used");
    expect((await verifyResetToken(second)).ok).toBe(true);
  });

  it("rejects a token that does not exist", async () => {
    expect((await verifyResetToken("not-a-real-token")).reason).toBe("not_found");
  });

  it("rejects an empty token", async () => {
    expect((await verifyResetToken("")).reason).toBe("not_found");
  });

  it("rejects an expired token", async () => {
    const token = await createResetToken(userId, null);
    await sql`
      UPDATE password_reset_tokens SET expires_at = now() - interval '1 minute'
      WHERE token_hash = ${hashToken(token)}
    `;
    expect((await verifyResetToken(token)).reason).toBe("expired");
  });

  it("consumes a token, updates the password, and refuses reuse", async () => {
    const token = await createResetToken(userId, null);

    const consumed = await consumeResetToken(token, "brand-new-hash");
    expect(consumed.ok).toBe(true);

    const rows = await sql`SELECT password_hash FROM users WHERE id = ${userId}`;
    expect(rows[0].password_hash).toBe("brand-new-hash");

    // Single use: the same link must not work twice.
    expect((await verifyResetToken(token)).reason).toBe("used");
    const second = await consumeResetToken(token, "should-not-apply");
    expect(second.ok).toBe(false);

    const after = await sql`SELECT password_hash FROM users WHERE id = ${userId}`;
    expect(after[0].password_hash).toBe("brand-new-hash");
  });

  it("does not change the password when the token is invalid", async () => {
    await sql`UPDATE users SET password_hash = 'known-hash' WHERE id = ${userId}`;
    const result = await consumeResetToken("bogus-token", "attacker-hash");
    expect(result.ok).toBe(false);
    const rows = await sql`SELECT password_hash FROM users WHERE id = ${userId}`;
    expect(rows[0].password_hash).toBe("known-hash");
  });

  it("rate limits after the per-account hourly cap", async () => {
    await sql`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`;
    // MAX_PER_EMAIL_PER_HOUR is 3.
    for (let i = 0; i < 3; i++) await createResetToken(userId, "9.9.9.9");

    const limited = await checkRateLimit(userId, "9.9.9.9");
    expect(limited.allowed).toBe(false);
    expect(limited.reason).toBe("email");
  });

  it("allows a request when under the cap", async () => {
    await sql`DELETE FROM password_reset_tokens WHERE user_id = ${userId}`;
    expect((await checkRateLimit(userId, "5.5.5.5")).allowed).toBe(true);
  });
});
