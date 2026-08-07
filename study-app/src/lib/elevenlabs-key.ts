import { neon } from "@neondatabase/serverless";
import { decrypt } from "./encryption";

export interface ElevenLabsKeyResult {
  key: string;
  source: "user" | "server";
}

// A single spoken answer fires one synthesis per sentence, so a read-aloud of a long reply makes a
// dozen calls in quick succession; without this memo each would re-run the key lookup. Sixty seconds
// matches the Tavily cache: short enough that a key saved in Settings is picked up almost
// immediately even on a warm serverless instance.
const keyCache = new Map<number, { result: ElevenLabsKeyResult | null; expires: number }>();
const KEY_CACHE_TTL_MS = 60_000;

/** Real ElevenLabs keys start with `sk_`. A key ID does not — see `describeKeyFormatProblem`. */
export function looksLikeElevenLabsKey(key: string): boolean {
  return key.trim().startsWith("sk_");
}

/**
 * Why a key was rejected, in the user's terms — or null if the shape is fine.
 *
 * The key-ID case earns its own message because it is the mistake people actually make: the
 * ElevenLabs dashboard shows a key ID next to every key, and it looks like a credential. This app
 * ran on one for two days — every synthesis failing with `invalid_api_key` while narration silently
 * produced nothing — so the wording names the trap rather than saying "invalid".
 */
export function describeKeyFormatProblem(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return "Enter a key or leave the field blank.";
  if (looksLikeElevenLabsKey(trimmed)) return null;
  return (
    "That looks like the key ID rather than the key itself. ElevenLabs shows both — the key starts " +
    "with sk_ and is only displayed once, when you create it."
  );
}

/**
 * Resolves the ElevenLabs API key for a user, mirroring getTavilyKeyForUserId exactly:
 * - The user's own stored key wins (provider = 'elevenlabs'), even for admins
 * - Admins fall back to process.env.ELEVENLABS_API_KEY
 * - Regular users with no key get null — voice is unavailable to them, which is the BYOK contract
 *
 * The fallback is admin-only ON PURPOSE. Synthesis and transcription are billed per use, so a
 * server-key fallback for everyone would put every candidate's voice usage on our account — the
 * same reason the Anthropic key works this way.
 */
export async function getElevenLabsKeyForUserId(userId: number): Promise<ElevenLabsKeyResult | null> {
  const cached = keyCache.get(userId);
  if (cached && cached.expires > Date.now()) return cached.result;

  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT k.encrypted_key, u.is_admin
    FROM users u
    LEFT JOIN user_api_keys k ON k.user_id = u.id AND k.provider = 'elevenlabs'
    WHERE u.id = ${userId}
  `;
  const r = rows[0];
  let result: ElevenLabsKeyResult | null = null;
  if (r?.encrypted_key) {
    try {
      result = { key: decrypt(r.encrypted_key as string), source: "user" };
    } catch {
      // Decryption failed — key is corrupt, treat as missing.
    }
  }
  if (!result && r?.is_admin && process.env.ELEVENLABS_API_KEY) {
    result = { key: process.env.ELEVENLABS_API_KEY, source: "server" };
  }
  keyCache.set(userId, { result, expires: Date.now() + KEY_CACHE_TTL_MS });
  return result;
}

/** Drop a user's cached resolution. Call after saving or clearing their key in Settings. */
export function invalidateElevenLabsKeyCache(userId: number): void {
  keyCache.delete(userId);
}

/**
 * Resolution for the call sites that have no user in scope — the feedback-verdict narration, which
 * runs from a cron. Those stay on the server key: they are our feature, not the candidate's usage.
 */
export function resolveServerElevenLabsKey(): string | null {
  return process.env.ELEVENLABS_API_KEY || null;
}

/**
 * Live-validate a key with the cheapest authenticated call ElevenLabs offers.
 *
 * `/v1/user` costs nothing, so this catches a revoked or mistyped key at signup rather than at the
 * first attempt to speak — which is exactly where the two-day narration outage hid.
 *
 * READ `code`, NOT THE STATUS AND NOT `type`. Both of these are `type: "authentication_error"`, and
 * they mean opposite things — verified against the live API:
 *
 *   A GOOD but scoped key   401 {"code":"unauthorized", "status":"missing_permissions",
 *                                "message":"...missing the permission user_read..."}
 *   A BOGUS key             400 {"code":"invalid_api_key", "status":"invalid_api_key_length"}
 *
 * So a permission failure is PROOF the key is real — ElevenLabs knew whose it was in order to decide
 * it wasn't allowed. A key scoped to text-to-speech and nothing else is exactly what a careful user
 * would create for this app, and rejecting it would be worse than not checking at all.
 *
 * Two earlier versions of this got it wrong in both directions: the first only rejected 401/403 and
 * so passed a bogus key (invalid keys come back 400); the second matched on `type` and so rejected a
 * real, working, scoped key. Hence the specificity here.
 *
 * Returns an error message, or null when the key is usable.
 */
export async function validateElevenLabsKey(key: string): Promise<string | null> {
  const shape = describeKeyFormatProblem(key);
  if (shape) return shape;
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": key.trim() },
    });
    if (res.ok) return null;

    const body = await res.text().catch(() => "");

    // Authenticated, just not permitted this call. The key is fine.
    if (/missing_permissions|"code"\s*:\s*"unauthorized"/i.test(body)) return null;

    if (/invalid_api_key/i.test(body) || res.status === 401 || res.status === 403) {
      // Pass ElevenLabs' own wording through when it is specific enough to act on — "must be exactly
      // 51 characters, got 49" tells the user far more than any sentence written here could.
      const detail = body.match(/"message"\s*:\s*"([^"]{1,160})"/)?.[1];
      return detail
        ? `ElevenLabs rejected that key: ${detail}`
        : "ElevenLabs rejected that key. Check it was copied in full and has not been revoked.";
    }

    // Anything else (rate limit, outage) is not the user's fault — do not block them on it.
    console.warn("[elevenlabs-key] validation inconclusive:", res.status, body.slice(0, 120));
    return null;
  } catch (err) {
    console.warn("[elevenlabs-key] validation could not reach ElevenLabs:", err);
    return null;
  }
}
