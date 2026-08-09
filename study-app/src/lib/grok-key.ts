import { neon } from "@neondatabase/serverless";
import { decrypt } from "./encryption";

// The xAI (Grok) key. Mirrors elevenlabs-key.ts exactly — same storage, same cache shape, same
// admin-server-fallback semantics — because it is the same kind of secret and a second set of rules
// for a fourth provider is how one of them ends up subtly wrong.
//
// WHAT IT UNLOCKS. Exactly one thing: the Unhinged persona, which routes its COPY through Grok. It
// is optional in the strongest sense — every other voice, and all grading, runs on Anthropic and is
// unaffected by whether this key exists.

export interface GrokKeyResult {
  key: string;
  source: "user" | "server";
}

const keyCache = new Map<number, { result: GrokKeyResult | null; expires: number }>();
const KEY_CACHE_TTL_MS = 60_000;

/** xAI keys are issued with an `xai-` prefix. */
export function looksLikeGrokKey(key: string): boolean {
  return key.trim().startsWith("xai-");
}

export function describeGrokKeyFormatProblem(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return "Enter a key or leave the field blank.";
  if (looksLikeGrokKey(trimmed)) return null;
  return "That doesn't look like an xAI key — they start with xai-.";
}

/**
 * The Grok key for a user: their own stored key first, then the server key for admins.
 *
 * Admin-only fallback for the same reason as every other provider: Grok calls are billed per use,
 * and a fallback for everyone would put every candidate's usage on our account.
 */
export async function getGrokKeyForUserId(userId: number): Promise<GrokKeyResult | null> {
  const cached = keyCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.result;

  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT k.encrypted_key, u.is_admin
    FROM users u
    LEFT JOIN user_api_keys k ON k.user_id = u.id AND k.provider = 'grok'
    WHERE u.id = ${userId}
  `;
  const r = rows[0];
  let result: GrokKeyResult | null = null;
  if (r?.encrypted_key) {
    try {
      result = { key: decrypt(r.encrypted_key as string), source: "user" };
    } catch {
      // Corrupt ciphertext — treat as missing rather than throwing on a cosmetic feature.
    }
  }
  if (!result && r?.is_admin && process.env.GROK_API_KEY) {
    result = { key: process.env.GROK_API_KEY, source: "server" };
  }
  keyCache.set(userId, { result, expires: Date.now() + KEY_CACHE_TTL_MS });
  return result;
}

export function invalidateGrokKeyCache(userId: number): void {
  keyCache.delete(userId);
}

/**
 * Live-validate against the cheapest authenticated xAI endpoint. `/v1/models` is a plain GET and
 * costs nothing, so a mistyped or revoked key is caught at signup rather than the first time
 * somebody switches to Unhinged and silently gets the Tutor instead.
 *
 * Inconclusive results (rate limit, outage) do NOT block the save — same policy as ElevenLabs. A
 * vendor having a bad afternoon is not the user's problem.
 */
export async function validateGrokKey(key: string): Promise<string | null> {
  const shape = describeGrokKeyFormatProblem(key);
  if (shape) return shape;
  try {
    const res = await fetch("https://api.x.ai/v1/models", {
      headers: { Authorization: `Bearer ${key.trim()}` },
    });
    if (res.ok) return null;
    if (res.status === 401 || res.status === 403) {
      return "xAI rejected that key. Check it was copied in full and has not been revoked.";
    }
    console.warn("[grok-key] validation inconclusive:", res.status);
    return null;
  } catch (err) {
    console.warn("[grok-key] validation could not reach xAI:", err);
    return null;
  }
}
