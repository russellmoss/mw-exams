/**
 * Live Tasting derived state (live_tasting_plan.md §2.3). Client-safe — pure functions over the
 * session row's event timestamps, no DB access.
 *
 * The session stores FACTS (immutable set-once timestamps); everything the UI shows is derived
 * here at render time. That is what makes the blind-integrity badge honest: it can only ever
 * downgrade (a self-reveal after a partner share flips partner → self forever), and there is no
 * stored enum to go stale.
 */

export type LiveTastingState = "shopping" | "tasted" | "abandoned";
export type BlindIntegrity = "partner" | "self" | "unopened";

// Stockist types live HERE (not in retail-availability.ts) because client components render
// stockist cards, and retail-availability transitively imports @neondatabase/serverless — a
// server-only module the client bundle must never reach (client-server-boundary test).
export type StockistKind = "local" | "state_store" | "mail";
export type StockistConfidence = "listed" | "likely" | "unverified";

export type Stockist = {
  name: string;
  kind: StockistKind;
  url: string;
  price: number | null;
  currency: string | null;
  confidence: StockistConfidence;
};

type SessionEvents = {
  user_revealed_at: string | null;
  token_first_used_at: string | null;
  graded_at: string | null;
  abandoned_at: string | null;
};

export function deriveSessionState(s: SessionEvents): LiveTastingState {
  if (s.abandoned_at) return "abandoned";
  if (s.graded_at) return "tasted";
  return "shopping";
}

/**
 * partner  — someone opened the share link and the user themself never opened the list: the blind
 *            is intact.
 * self     — the user opened the shopping list; identity was visible to them before tasting.
 * unopened — nobody has seen the list yet (freshly generated, or graded without ever opening it —
 *            e.g. the partner bought from a screenshot before sharing was minted).
 */
export function deriveBlindIntegrity(s: SessionEvents): BlindIntegrity {
  if (s.user_revealed_at) return "self";
  if (s.token_first_used_at) return "partner";
  return "unopened";
}

export const BLIND_INTEGRITY_LABEL: Record<BlindIntegrity, string> = {
  partner: "Blind kept — a partner handled the wines",
  self: "You saw the wines before tasting",
  unopened: "Shopping list never opened in-app",
};

export function liveTastingSessionId(): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36])
    .join("");
  return `lts_${rand}`;
}
