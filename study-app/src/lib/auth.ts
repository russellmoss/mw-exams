import jwt from "jsonwebtoken";
import { neon } from "@neondatabase/serverless";

const JWT_SECRET = process.env.JWT_SECRET || "mw-study-secret-key-change-me";
const COOKIE_NAME = "mw-session";
const TOKEN_EXPIRY = "7d";

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
}

interface JwtPayload {
  userId: number;
  email: string;
  name: string;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { userId: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch {
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
    SELECT id, email, name, is_admin, is_active FROM users WHERE id = ${payload.userId}
  `;

  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.is_active === false) return null;
  return { id: row.id as number, email: row.email as string, name: row.name as string, isAdmin: row.is_admin as boolean };
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
