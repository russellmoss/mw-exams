"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

type SessionSummary = {
  id: string;
  state: "shopping" | "tasted" | "abandoned";
  blindIntegrity: "partner" | "self" | "unopened";
  paper: number;
  flightSize: number;
  city: string;
  createdAt: string;
  gradedAt: string | null;
};

type Prefs = { city: string | null; country: string | null; budgetAmount: number | null; budgetCurrency: string | null };

const STATE_CHIP: Record<string, { label: string; cls: string }> = {
  shopping: { label: "Shopping", cls: "text-accent border-accent/40 bg-accent/10" },
  tasted: { label: "Tasted", cls: "text-success border-success/40 bg-success/10" },
  abandoned: { label: "Abandoned", cls: "text-muted border-border bg-card" },
};

export default function LiveTastingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [paper, setPaper] = useState(1);
  const [flightSize, setFlightSize] = useState(3);
  const [budgetOverride, setBudgetOverride] = useState("");
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    try {
      const [sRes, pRes] = await Promise.all([
        fetch("/api/live-tasting"),
        fetch("/api/user/live-tasting-prefs"),
      ]);
      if (sRes.ok) setSessions((await sRes.json()).sessions);
      if (pRes.ok) setPrefs(await pRes.json());
    } catch {
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const createSession = async () => {
    setCreating(true);
    setError(null);
    setProgress("Starting…");
    try {
      const res = await fetch("/api/live-tasting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper,
          flightSize,
          ...(budgetOverride.trim() ? { budgetAmount: Number(budgetOverride) } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start generation");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let sessionId: string | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line || line === "data: [DONE]") continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "status" && evt.label) setProgress(evt.label);
            if (evt.type === "error") throw new Error(evt.message);
            if (evt.type === "result" && evt.data?.sessionId) sessionId = evt.data.sessionId;
          } catch (e) {
            if (e instanceof Error && e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }
      if (!sessionId) throw new Error("Generation ended without a session — please try again.");
      router.push(`/live-tasting/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setCreating(false);
      setProgress(null);
    }
  };

  if (authLoading || !user || sessions === null) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-muted">
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
          <span className="ml-2 text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  const marketSet = Boolean(prefs?.city && prefs?.country);
  const active = sessions.filter((s) => s.state !== "abandoned");

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Live Tasting</h1>
          <p className="text-sm text-muted mt-1">
            A real blind flight from wines you can actually buy near {prefs?.city || "you"} — shop,
            bag, taste blind, get graded.
          </p>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
          {!marketSet && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2 font-display">Set your market first</h2>
              <p className="text-sm text-muted mb-4">
                Live Tasting needs to know where you shop. Set your city, country and per-bottle
                budget in Settings.
              </p>
              <Link
                href="/settings"
                className="inline-block px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200"
              >
                Open Settings
              </Link>
            </section>
          )}

          {marketSet && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2 font-display">New Live Tasting</h2>
              <p className="text-sm text-muted mb-5">
                We&apos;ll pick a coherent MW-style flight available near {prefs!.city}, write the
                question around it, and keep the wines hidden from you. Have a partner buy and bag
                the bottles to keep the blind honest.
              </p>
              {error && (
                <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-4">
                  <p className="text-sm text-fail">{error}</p>
                </div>
              )}
              {creating ? (
                <div className="flex items-center gap-3 text-muted py-4">
                  <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                  <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
                  <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
                  <span className="ml-2 text-sm">{progress}</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <span className="block text-sm font-medium text-foreground mb-1.5">Paper</span>
                    <div className="flex gap-2">
                      {[
                        { n: 1, label: "1 · Whites" },
                        { n: 2, label: "2 · Reds" },
                        { n: 3, label: "3 · Special" },
                      ].map((p) => (
                        <button
                          key={p.n}
                          onClick={() => setPaper(p.n)}
                          className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                            paper === p.n
                              ? "border-accent text-accent bg-accent/10"
                              : "border-border text-muted hover:text-foreground hover:border-muted"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-6">
                    <div>
                      <span className="block text-sm font-medium text-foreground mb-1.5">Wines</span>
                      <div className="flex gap-2">
                        {[2, 3, 4].map((n) => (
                          <button
                            key={n}
                            onClick={() => setFlightSize(n)}
                            className={`w-10 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer tabular-nums ${
                              flightSize === n
                                ? "border-accent text-accent bg-accent/10"
                                : "border-border text-muted hover:text-foreground hover:border-muted"
                            }`}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex-1 max-w-40">
                      <label htmlFor="ltBudget" className="block text-sm font-medium text-foreground mb-1.5">
                        Budget / bottle
                      </label>
                      <input
                        id="ltBudget"
                        type="number"
                        min="1"
                        value={budgetOverride}
                        onChange={(e) => setBudgetOverride(e.target.value)}
                        placeholder={
                          prefs?.budgetAmount
                            ? `${prefs.budgetAmount} ${prefs.budgetCurrency ?? ""}`
                            : "no limit"
                        }
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm tabular-nums"
                      />
                    </div>
                  </div>
                  <button
                    onClick={createSession}
                    className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer"
                  >
                    Build my flight
                  </button>
                </div>
              )}
            </section>
          )}

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3 font-display">Your sessions</h2>
            {active.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-6">
                <p className="text-sm text-muted">
                  No sessions yet. Generate one above — you&apos;ll get a question stem and a
                  shopping list (kept hidden from you); once the bottles are bagged and numbered,
                  come back, taste blind, and write your full note for grading.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {active.map((s) => (
                  <Link
                    key={s.id}
                    href={`/live-tasting/${s.id}`}
                    className="block bg-card rounded-xl border border-border p-4 hover:bg-card-hover transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Paper {s.paper} · {s.flightSize} wines · {s.city}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {new Date(s.createdAt).toLocaleDateString()}
                          {s.state === "tasted" && s.blindIntegrity === "self" && " · you saw the wines pre-taste"}
                          {s.state === "tasted" && s.blindIntegrity === "partner" && " · blind kept via partner"}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${STATE_CHIP[s.state].cls}`}>
                        {STATE_CHIP[s.state].label}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
