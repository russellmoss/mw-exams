import { neon } from "@neondatabase/serverless";
import { getUser, type AuthUser } from "./auth";
import { decrypt } from "./encryption";

interface ApiKeyResult {
  apiKey: string;
  source: "user" | "server";
}

/**
 * Resolves the Anthropic API key for the requesting user.
 * - Checks user_api_keys table first (any user can set their own key)
 * - Admins fall back to process.env.ANTHROPIC_API_KEY
 * - Regular users with no key get null (must BYO)
 */
export async function getUserApiKey(
  request: Request
): Promise<{ user: AuthUser; key: ApiKeyResult } | { user: null; key: null } | { user: AuthUser; key: null }> {
  const user = await getUser(request);
  if (!user) return { user: null, key: null };

  const sql = neon(process.env.DATABASE_URL!);

  // Check for user's own key first
  const rows = await sql`
    SELECT encrypted_key FROM user_api_keys
    WHERE user_id = ${user.id} AND provider = 'anthropic'
  `;

  if (rows.length > 0) {
    try {
      const apiKey = decrypt(rows[0].encrypted_key as string);
      return { user, key: { apiKey, source: "user" } };
    } catch {
      // Decryption failed — key is corrupt, treat as missing
    }
  }

  // Admin fallback to server key
  if (user.isAdmin && process.env.ANTHROPIC_API_KEY) {
    return { user, key: { apiKey: process.env.ANTHROPIC_API_KEY, source: "server" } };
  }

  // Regular user with no key
  return { user, key: null };
}

/**
 * Resolve a user's API key by id, with no request in hand — the Live Tasting partner flow
 * (token-authenticated, no session) generates on the session OWNER's key. Same resolution
 * order as getUserApiKey: stored key first, admin server-fallback second, else null.
 */
export async function getApiKeyForUserId(userId: number): Promise<string | null> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT k.encrypted_key, u.is_admin
    FROM users u
    LEFT JOIN user_api_keys k ON k.user_id = u.id AND k.provider = 'anthropic'
    WHERE u.id = ${userId}
  `;
  const r = rows[0];
  if (!r) return null;
  if (r.encrypted_key) {
    try { return decrypt(r.encrypted_key as string); } catch { /* corrupt — fall through */ }
  }
  if (r.is_admin && process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  return null;
}

/**
 * Helper for API routes: resolves key or returns an error Response.
 * Use: const result = await requireApiKey(request); if (result instanceof Response) return result;
 */
export async function requireApiKey(
  request: Request
): Promise<{ user: AuthUser; apiKey: string; source: "user" | "server" } | Response> {
  const result = await getUserApiKey(request);

  if (!result.user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  if (!result.key) {
    return Response.json(
      { error: "API key required. Add your Anthropic API key in Settings." },
      { status: 402 }
    );
  }

  return { user: result.user, apiKey: result.key.apiKey, source: result.key.source };
}
