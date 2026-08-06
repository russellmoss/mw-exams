import { neon } from "@neondatabase/serverless";
import { decrypt } from "./encryption";
import { logTavilyUsage } from "./usage-log";

export interface TavilyKeyResult {
  key: string;
  source: "user" | "server";
}

// One enrichment pass makes a dozen Tavily calls in quick succession; without this memo each one
// would re-run the key lookup. Sixty seconds is short enough that a key saved in Settings is picked
// up almost immediately even on a warm serverless instance.
const keyCache = new Map<number, { result: TavilyKeyResult | null; expires: number }>();
const KEY_CACHE_TTL_MS = 60_000;

/**
 * Resolves the Tavily API key for a user, mirroring the Anthropic resolution in api-key.ts:
 * - The user's own stored key wins (provider = 'tavily' in user_api_keys), even for admins
 * - Admins fall back to process.env.TAVILY_API_KEY
 * - Regular users with no key get null — web research is skipped for them (BYOK)
 */
export async function getTavilyKeyForUserId(userId: number): Promise<TavilyKeyResult | null> {
  const cached = keyCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.result;

  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT k.encrypted_key, u.is_admin
    FROM users u
    LEFT JOIN user_api_keys k ON k.user_id = u.id AND k.provider = 'tavily'
    WHERE u.id = ${userId}
  `;
  const r = rows[0];
  let result: TavilyKeyResult | null = null;
  if (r?.encrypted_key) {
    try {
      result = { key: decrypt(r.encrypted_key as string), source: "user" };
    } catch {
      // Decryption failed — key is corrupt, treat as missing
    }
  }
  if (!result && r?.is_admin && process.env.TAVILY_API_KEY) {
    result = { key: process.env.TAVILY_API_KEY, source: "server" };
  }
  keyCache.set(userId, { result, expires: Date.now() + KEY_CACHE_TTL_MS });
  return result;
}

/**
 * Resolution entry point for the Tavily call sites, which know at most a userId.
 * - userId present → per-user resolution above (user key → admin env fallback → null)
 * - no userId → a server-side job with no user in scope (cron, bank resume) → server key
 */
export async function resolveTavilyKey(userId?: number | null): Promise<TavilyKeyResult | null> {
  if (userId != null) return getTavilyKeyForUserId(userId);
  return process.env.TAVILY_API_KEY
    ? { key: process.env.TAVILY_API_KEY, source: "server" }
    : null;
}

/**
 * Live-validates a Tavily key with a 1-result search (1 credit — Tavily has no free validate
 * endpoint). Returns an error message on definite rejection, null otherwise. Mirrors the Anthropic
 * validation stance: only an authentication failure rejects; network trouble or rate limits mean
 * the key is probably fine.
 */
export async function validateTavilyKey(key: string, userId: number | null): Promise<string | null> {
  let ok = false;
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: "wine", max_results: 1, search_depth: "basic" }),
      signal: AbortSignal.timeout(15_000),
    });
    ok = res.ok;
    if (res.status === 401 || res.status === 403) {
      logTavilyUsage({ taskType: "key_validation", query: "wine", resultsCount: 0, credits: 1, userId, success: false });
      return "Tavily API key validation failed. Please check your key.";
    }
  } catch {
    // Network error — don't block signup on Tavily being unreachable
  }
  logTavilyUsage({ taskType: "key_validation", query: "wine", resultsCount: 0, credits: 1, userId, success: ok });
  return null;
}
