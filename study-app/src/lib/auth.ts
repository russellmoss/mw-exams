import jwt from "jsonwebtoken";
import { neon } from "@neondatabase/serverless";

const COOKIE_NAME = "mw-session";
const TOKEN_EXPIRY = "7d";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  /**
   * Question Review access (migration 066). Its own flag, NOT derived from isAdmin: 12 of the 14
   * live accounts are admins, so an admin check would show the surface to nearly everyone. Granting
   * a reviewer is an UPDATE on users, not a deploy.
   */
  canReviewQuestions: boolean;
}

interface JwtPayload {
  userId: number;
  email: string;
  name: string;
}

// Resolved lazily, never at module load: a missing secret must fail the request,
// not the build. Deliberately has no fallback value — signing sessions with a
// default that is committed to the repo would let anyone forge a session.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error(
      "JWT_SECRET is not set. Refusing to sign or verify sessions with a default secret."
    );
  }
  return secret;
}

// Takes only what it actually signs. The JWT carries identity, never authorization — every role and
// grant (is_admin, can_review_questions) is re-read from the DB by getUser on each request, so a
// revoked grant takes effect immediately instead of lingering until the 7-day token expires.
export function signToken(user: Pick<AuthUser, "id" | "email" | "name">): string {
  return jwt.sign(
    { userId: user.id, email: user.email, name: user.name },
    getJwtSecret(),
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
    return decoded;
  } catch {
    // Covers both an invalid/expired token and a missing secret. Either way we
    // fail closed — no session is treated as valid.
    return null;
  }
}

export async function getUser(request: Request): Promise<AuthUser | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const cookies = parseCookies(cookieHeader);
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  // Verify the user still exists in the database
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT id, email, name, is_admin, is_active, can_review_questions
    FROM users WHERE id = ${payload.userId}
  `;

  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.is_active === false) return null;
  return {
    id: row.id as number,
    email: row.email as string,
    name: row.name as string,
    isAdmin: row.is_admin as boolean,
    // Strict === true, so a NULL grants nothing. The COLUMN's existence is guaranteed by the
    // prebuild migration runner, which applies 066 before the new code serves (same assumption every
    // other per-user column here makes — see the walkthrough flags in /api/auth/me).
    canReviewQuestions: row.can_review_questions === true,
  };
}

export function createSessionCookie(token: string): string {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [key, ...valueParts] = pair.trim().split("=");
    if (key) {
      cookies[key.trim()] = valueParts.join("=").trim();
    }
  }
  return cookies;
}
