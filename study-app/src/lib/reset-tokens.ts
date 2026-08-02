/**
 * Password-reset token issue / verify / redeem.
 *
 * The token is a bearer credential: whoever holds it can take over the account, so it is treated
 * like one. 32 bytes of crypto randomness (not a UUID, which leaks structure and has fewer random
 * bits), stored only as a SHA-256 hash, short-lived, and single-use.
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export const TOKEN_TTL_MINUTES = 60;

/** Max reset requests per account per hour. Low: a real user needs one, maybe two. */
export const MAX_PER_EMAIL_PER_HOUR = 3;
/** Max per IP per hour, to blunt someone walking a list of addresses. */
export const MAX_PER_IP_PER_HOUR = 10;

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/** base64url — safe in a query string without escaping, unlike base64's +/= */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Constant-time comparison of two token hashes.
 *
 * Lookup is by hash equality in SQL, which is not constant-time, but this guards the final
 * confirmation so a timing signal cannot be used to walk a token byte by byte.
 */
export function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export interface RateLimitState {
  allowed: boolean;
  reason?: "email" | "ip";
}

export async function checkRateLimit(userId: number, ip: string | null): Promise<RateLimitState> {
  const sql = db();

  const byEmail = await sql`
    SELECT count(*)::int AS n FROM password_reset_tokens
    WHERE user_id = ${userId} AND created_at > now() - interval '1 hour'
  `;
  if ((byEmail[0]?.n ?? 0) >= MAX_PER_EMAIL_PER_HOUR) {
    return { allowed: false, reason: "email" };
  }

  if (ip) {
    const byIp = await sql`
      SELECT count(*)::int AS n FROM password_reset_tokens
      WHERE request_ip = ${ip} AND created_at > now() - interval '1 hour'
    `;
    if ((byIp[0]?.n ?? 0) >= MAX_PER_IP_PER_HOUR) {
      return { allowed: false, reason: "ip" };
    }
  }

  return { allowed: true };
}

/**
 * Issue a token, returning the RAW value — the only moment it exists outside the user's inbox.
 * Any previously outstanding token for this user is burned, so the most recent email is the only
 * one that works.
 */
export async function createResetToken(userId: number, ip: string | null): Promise<string> {
  const sql = db();
  const token = generateToken();
  const tokenHash = hashToken(token);

  await sql`
    UPDATE password_reset_tokens SET used_at = now()
    WHERE user_id = ${userId} AND used_at IS NULL
  `;

  await sql`
    INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, request_ip)
    VALUES (
      ${userId},
      ${tokenHash},
      now() + (${TOKEN_TTL_MINUTES} * interval '1 minute'),
      ${ip}
    )
  `;

  return token;
}

export type VerifyFailure = "not_found" | "expired" | "used";

export interface VerifyResult {
  ok: boolean;
  userId?: number;
  email?: string;
  name?: string;
  reason?: VerifyFailure;
}

/** Check a token without redeeming it — used to decide whether to render the reset form. */
export async function verifyResetToken(token: string): Promise<VerifyResult> {
  if (!token) return { ok: false, reason: "not_found" };

  const sql = db();
  const tokenHash = hashToken(token);

  const rows = await sql`
    SELECT t.id, t.user_id, t.token_hash, t.used_at,
           (t.expires_at < now()) AS is_expired,
           u.email, u.name
    FROM password_reset_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ${tokenHash}
  `;

  if (rows.length === 0) return { ok: false, reason: "not_found" };
  const row = rows[0];

  if (!hashesEqual(row.token_hash as string, tokenHash)) {
    return { ok: false, reason: "not_found" };
  }
  if (row.used_at) return { ok: false, reason: "used" };
  if (row.is_expired) return { ok: false, reason: "expired" };

  return {
    ok: true,
    userId: row.user_id as number,
    email: row.email as string,
    name: row.name as string,
  };
}

/**
 * Redeem a token and set the new password.
 *
 * The password write and the token burn go in one transaction: if they could diverge, a crash
 * between them would either leave a working token after a password change, or change the password
 * while the user believes the link failed.
 */
export async function consumeResetToken(
  token: string,
  passwordHash: string
): Promise<VerifyResult> {
  const check = await verifyResetToken(token);
  if (!check.ok) return check;

  const sql = db();
  const tokenHash = hashToken(token);

  await sql.transaction([
    sql`UPDATE users SET password_hash = ${passwordHash} WHERE id = ${check.userId}`,
    sql`UPDATE password_reset_tokens SET used_at = now() WHERE token_hash = ${tokenHash} AND used_at IS NULL`,
    // Any other outstanding token is now stale — a completed reset should invalidate every
    // link that was in flight, not just the one that was clicked.
    sql`UPDATE password_reset_tokens SET used_at = now() WHERE user_id = ${check.userId} AND used_at IS NULL`,
  ]);

  return check;
}
