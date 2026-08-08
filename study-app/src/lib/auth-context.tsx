"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";

interface AuthUser {
  id: number;
  email: string;
  name: string;
  isAdmin: boolean;
  /**
   * Question Review access (migration 066). Gates the header link only — every
   * /api/question-review/* route re-checks it server-side, because a hidden link is not a gate.
   */
  canReviewQuestions?: boolean;
  hasApiKey: boolean;
  /**
   * Tavily is REQUIRED like Anthropic — without it the research behind every answer cannot run.
   * ElevenLabs is not: it only unlocks voice, so `hasVoiceKey` gates a feature, not the app.
   * All three are true for an admin with the corresponding server key (BYOK-unless-admin).
   */
  hasTavilyKey?: boolean;
  hasVoiceKey?: boolean;
  stemDetailDefault?: "guided" | "exam_real";
  questionSourceDefault?: "banked" | "fresh";
  reasoningStreamDefault?: boolean;
  // Shell prefs (migration 050) — intro/tour flags, exam countdown, Continue card config.
  introSeen?: boolean;
  tourSeen?: boolean;
  // Migration 051 — the one-time diagram walkthrough between the intro and the tour.
  walkthroughSeen?: boolean;
  // Migration 056 — the one-time Coach walkthrough, which follows the diagram one.
  coachWalkthroughSeen?: boolean;
  // Migration 061 — the one-time Practical-drills walkthrough. Page-scoped, not part of the
  // launcher chain: it fires the first time /practical is opened.
  practicalWalkthroughSeen?: boolean;
  // Migration 062 — the same, for Theory, on the first visit to /theory.
  theoryWalkthroughSeen?: boolean;
  examDate?: string | null;
  lastDrillConfig?: {
    paper?: number;
    family?: string;
    mode?: string;
    stemDetail?: string;
  } | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setUser(data?.user ?? null);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Ignore errors, clear local state regardless
    }
    setUser(null);
  }, []);

  return (
    <AuthContext value={{ user, loading, logout, refresh }}>
      {children}
    </AuthContext>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
