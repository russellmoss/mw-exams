import { createHash } from "node:crypto";

/**
 * Live Tasting partner-link token hashing (live_tasting_plan.md §2.5). Only the sha-256 of a
 * share token is ever stored; the raw token exists in the mint response and the partner's URL.
 */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Shape check before hashing a path segment — rejects junk without a DB roundtrip. */
export function looksLikeShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{24,64}$/.test(token);
}
