"use client";

// Coach session freshness.
//
// THE RULE: come back after ten minutes away and you get a clean instance, not the middle of a
// conversation you have forgotten the start of.
//
// WHY THIS ISN'T JUST COMPONENT STATE. The dock lives in the root layout, so it survives every
// client-side navigation — a thread would otherwise persist for as long as the tab is open, which
// is hours. And a full reload would wipe it entirely, which is the opposite problem: reload the page
// mid-question and your conversation vanishes. Persisting {conversationId, lastActivityAt} to
// localStorage fixes both: a reload inside the window resumes exactly where you were, and any gap
// longer than the window starts fresh however you got back.
//
// Nothing is deleted when a session goes stale. The old conversation moves to the history list,
// where it can be reopened deliberately — which is the difference between "clean instance" and
// "lost work".

const KEY = "mw-coach-session";
export const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

interface StoredSession {
  conversationId: string;
  lastActivityAt: number;
}

function read(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (typeof p?.conversationId === "string" && typeof p?.lastActivityAt === "number") return p;
  } catch {
    /* unavailable or corrupt — treat as no session */
  }
  return null;
}

/**
 * The conversation to resume, or null to start fresh.
 *
 * Called on open and before each send. A clock that only ran on open would let a conversation left
 * sitting for an hour continue on the next message.
 */
export function resumableConversationId(now = Date.now()): string | null {
  const s = read();
  if (!s) return null;
  if (now - s.lastActivityAt > IDLE_TIMEOUT_MS) return null;
  return s.conversationId;
}

/** True when a session existed but has aged out — lets the UI say so rather than silently resetting. */
export function sessionWentStale(now = Date.now()): boolean {
  const s = read();
  return !!s && now - s.lastActivityAt > IDLE_TIMEOUT_MS;
}

export function touchSession(conversationId: string, now = Date.now()): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ conversationId, lastActivityAt: now }));
  } catch {
    /* private mode — the session just won't survive a reload */
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}
