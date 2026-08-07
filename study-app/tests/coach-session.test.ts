import { describe, it, expect, beforeEach, vi } from "vitest";

// A minimal localStorage, because session.ts is a browser module and the point of these tests is the
// clock arithmetic, not the storage API.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const {
  IDLE_TIMEOUT_MS,
  clearSession,
  resumableConversationId,
  sessionWentStale,
  touchSession,
} = await import("@/lib/coach/session");

const T0 = 1_700_000_000_000;

beforeEach(() => store.clear());

describe("coach session freshness", () => {
  it("resumes a conversation inside the window", () => {
    touchSession("cv_abc", T0);
    expect(resumableConversationId(T0 + 60_000)).toBe("cv_abc");
  });

  it("starts clean once the window has passed", () => {
    touchSession("cv_abc", T0);
    expect(resumableConversationId(T0 + IDLE_TIMEOUT_MS + 1)).toBeNull();
  });

  it("uses a ten-minute window", () => {
    expect(IDLE_TIMEOUT_MS).toBe(10 * 60 * 1000);
  });

  it("measures from the LAST activity, not the first", () => {
    // The failure this guards: a long conversation ageing out mid-use because the clock started
    // when it began rather than at the most recent message.
    touchSession("cv_abc", T0);
    touchSession("cv_abc", T0 + 9 * 60_000);
    expect(resumableConversationId(T0 + 15 * 60_000)).toBe("cv_abc");
  });

  it("reports staleness distinctly from having no session at all", () => {
    // These render differently: one says "fresh start, your thread is in History", the other says
    // nothing. Conflating them would tell a first-time user their conversation had expired.
    expect(sessionWentStale(T0)).toBe(false);
    touchSession("cv_abc", T0);
    expect(sessionWentStale(T0 + 60_000)).toBe(false);
    expect(sessionWentStale(T0 + IDLE_TIMEOUT_MS + 1)).toBe(true);
  });

  it("forgets the session when explicitly cleared", () => {
    touchSession("cv_abc", T0);
    clearSession();
    expect(resumableConversationId(T0)).toBeNull();
    expect(sessionWentStale(T0 + IDLE_TIMEOUT_MS + 1)).toBe(false);
  });

  it("treats corrupt storage as no session rather than throwing", () => {
    store.set("mw-coach-session", "{not json");
    expect(resumableConversationId(T0)).toBeNull();
    store.set("mw-coach-session", JSON.stringify({ conversationId: 5 }));
    expect(resumableConversationId(T0)).toBeNull();
  });
});
