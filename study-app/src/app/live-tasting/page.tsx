"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

type SessionSummary = {
  id: string;
  state: "prep" | "shopping" | "tasted" | "abandoned";
  mode?: "pick-for-me" | "byo";
  blindIntegrity: "partner" | "self" | "unopened";
  paper: number;
  flightSize: number;
  city: string;
  createdAt: string;
  gradedAt: string | null;
};

type Prefs = {
  city: string | null; country: string | null; budgetAmount: number | null; budgetCurrency: string | null;
  detected?: { city: string; country: string } | null;
};

const STATE_CHIP: Record<string, { label: string; cls: string }> = {
  prep: { label: "Tasting prep", cls: "text-borderline border-borderline/40 bg-borderline/10" },
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
  const [mode, setMode] = useState<"pick-for-me" | "byo">("pick-for-me");
  const [createType, setCreateType] = useState<"question" | "paper">("question");
  const [paperSize, setPaperSize] = useState<"half" | "full">("half");
  const [paperPacing, setPaperPacing] = useState<"flight-by-flight" | "exam-conditions">("flight-by-flight");
  const [paperBudget, setPaperBudget] = useState("");
  const [papers, setPapers] = useState<{
    id: string; paper: number; size: string; pacing: string; city: string;
    flights: number; generated: number; graded: number; createdAt: string;
  }[]>([]);
  const [family, setFamily] = useState("F1");
  const [budgetOverride, setBudgetOverride] = useState("");
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  const load = useCallback(() => {
    return Promise.all([fetch("/api/live-tasting"), fetch("/api/user/live-tasting-prefs"), fetch("/api/live-tasting/paper")])
      .then(async ([sRes, pRes, ppRes]) => {
        if (sRes.ok) setSessions((await sRes.json()).sessions);
        if (pRes.ok) setPrefs(await pRes.json());
        if (ppRes.ok) setPapers((await ppRes.json()).papers ?? []);
      })
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const createSession = async () => {
    setCreating(true);
    setError(null);
    setProgress("Starting…");
    // Full paper: one POST samples the composition (and, for BYO, writes the multi-flight
    // brief — up to a couple of minutes); flight generation then chains on the paper page.
    if (createType === "paper") {
      try {
        setProgress(mode === "byo" ? "Sampling the paper & writing the shopping brief…" : "Sampling the paper composition…");
        const res = await fetch("/api/live-tasting/paper", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paper,
            size: paperSize,
            mode,
            pacing: paperPacing,
            ...(paperBudget.trim() ? { totalBudget: Number(paperBudget) } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to create the paper");
        router.push(`/live-tasting/paper/${data.paperId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setCreating(false);
        setProgress(null);
      }
      return;
    }
    try {
      const res = await fetch("/api/live-tasting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper,
          flightSize,
          mode,
          ...(mode === "byo" ? { family } : {}),
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
  const detected = prefs?.detected ?? null;
  const canCreate = marketSet || Boolean(detected);
  const marketLabel = marketSet ? prefs!.city : detected ? detected.city : null;
  const active = sessions.filter((s) => s.state !== "abandoned");

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Live Tasting</h1>
          <p className="text-sm text-muted mt-1">
            A real blind flight from wines you can actually buy near {marketLabel || "you"} — shop,
            bag, taste blind, get graded.
          </p>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
          {!canCreate && (
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

          {canCreate && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2 font-display">New Live Tasting</h2>
              {!marketSet && detected && (
                <div className="bg-borderline/10 border border-borderline/30 rounded-lg p-3 mb-4">
                  <p className="text-sm text-foreground">
                    Using your approximate location: <strong>{detected.city}, {detected.country}</strong> (from
                    your connection). <Link href="/settings" className="text-accent hover:text-accent-hover">Set
                    your market in Settings</Link> for precise shop matching and a travel radius.
                  </p>
                </div>
              )}
              <p className="text-sm text-muted mb-5">
                We&apos;ll pick a coherent MW-style flight available near {marketLabel}, write the
                question around it, and keep the wines hidden from you. Have a partner buy and bag
                the bottles to keep the blind honest.
              </p>
              {error && (
                <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-4">
                  <p className="text-sm text-fail">{error}</p>
                </div>
              )}
              {!creating && (
                <div className="mb-5">
                  <span className="block text-sm font-medium text-foreground mb-1.5">What are you building?</span>
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setCreateType("question")}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                        createType === "question"
                          ? "border-accent text-accent bg-accent/10"
                          : "border-border text-muted hover:text-foreground hover:border-muted"
                      }`}
                    >
                      One question
                    </button>
                    <button
                      onClick={() => setCreateType("paper")}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                        createType === "paper"
                          ? "border-accent text-accent bg-accent/10"
                          : "border-border text-muted hover:text-foreground hover:border-muted"
                      }`}
                    >
                      Full paper
                    </button>
                  </div>
                  {createType === "paper" && (
                    <p className="text-xs text-muted mb-4">
                      A corpus-realistic paper: the question mix, flight sizes and wine spread
                      mirror real exams — you don&apos;t pick families, just like the real thing.
                    </p>
                  )}
                  <span className="block text-sm font-medium text-foreground mb-1.5">Who picks the wines?</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMode("pick-for-me")}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                        mode === "pick-for-me"
                          ? "border-accent text-accent bg-accent/10"
                          : "border-border text-muted hover:text-foreground hover:border-muted"
                      }`}
                    >
                      Pick my wines
                    </button>
                    <button
                      onClick={() => setMode("byo")}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                        mode === "byo"
                          ? "border-accent text-accent bg-accent/10"
                          : "border-border text-muted hover:text-foreground hover:border-muted"
                      }`}
                    >
                      I&apos;ll choose wines
                    </button>
                  </div>
                  {mode === "byo" && (
                    <p className="text-xs text-muted mt-2">
                      You get a shopping brief for your paper and question type; buy whatever fits
                      (or hand the brief to a partner), enter the bottles, and the question is
                      built around them.
                    </p>
                  )}
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
                  {createType === "paper" && (
                    <>
                      <div>
                        <span className="block text-sm font-medium text-foreground mb-1.5">Paper size</span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPaperSize("half")}
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                              paperSize === "half" ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-foreground hover:border-muted"
                            }`}
                          >
                            Half — 6 bottles
                          </button>
                          <button
                            onClick={() => setPaperSize("full")}
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                              paperSize === "full" ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-foreground hover:border-muted"
                            }`}
                          >
                            Full — 12 bottles
                          </button>
                        </div>
                      </div>
                      <div>
                        <span className="block text-sm font-medium text-foreground mb-1.5">How will you sit it?</span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => setPaperPacing("flight-by-flight")}
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                              paperPacing === "flight-by-flight" ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-foreground hover:border-muted"
                            }`}
                          >
                            Flight by flight
                          </button>
                          <button
                            onClick={() => setPaperPacing("exam-conditions")}
                            className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors cursor-pointer ${
                              paperPacing === "exam-conditions" ? "border-accent text-accent bg-accent/10" : "border-border text-muted hover:text-foreground hover:border-muted"
                            }`}
                          >
                            Exam conditions ({paperSize === "full" ? "2h15" : "68 min"})
                          </button>
                        </div>
                        {paperPacing === "exam-conditions" && (
                          <p className="text-xs text-muted mt-1.5">
                            One sitting, real clock — questions unanswered at the deadline score zero.
                          </p>
                        )}
                      </div>
                      <div className="max-w-48">
                        <label htmlFor="ltPaperBudget" className="block text-sm font-medium text-foreground mb-1.5">
                          Total budget
                        </label>
                        <input
                          id="ltPaperBudget"
                          type="number"
                          min="1"
                          value={paperBudget}
                          onChange={(e) => setPaperBudget(e.target.value)}
                          placeholder={paperSize === "full" ? "e.g. 350" : "e.g. 180"}
                          className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm tabular-nums"
                        />
                      </div>
                    </>
                  )}
                  {createType === "question" && mode === "byo" && (
                    <div>
                      <span className="block text-sm font-medium text-foreground mb-1.5">Question family</span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {[
                          { id: "F1", label: "F1 · Same Variety", desc: "One grape across different origins or styles" },
                          { id: "F2", label: "F2 · Same Origin", desc: "One country or region, testing internal diversity" },
                          { id: "F3", label: "F3 · Blend Logic", desc: "Blends — composition and component roles" },
                          { id: "F4", label: "F4 · Mixed Breadth", desc: "Independent wines — breadth of identification" },
                          { id: "F5", label: "F5 · Method / Production", desc: "How it was made: sparkling, fortified, sweet" },
                          { id: "F6", label: "F6 · Style Mechanism", desc: "A structural axis: maturity, sweetness, style" },
                          { id: "F7", label: "F7 · Quality Hierarchy", desc: "Tiers within a legal classification" },
                        ].map((f) => (
                          <button
                            key={f.id}
                            onClick={() => setFamily(f.id)}
                            className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                              family === f.id
                                ? "border-accent bg-accent/10"
                                : "border-border hover:border-muted"
                            }`}
                          >
                            <span className={`block text-sm font-medium ${family === f.id ? "text-accent" : "text-foreground"}`}>{f.label}</span>
                            <span className="block text-xs text-muted mt-0.5">{f.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {createType === "question" && (
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
                  )}
                  <button
                    onClick={createSession}
                    className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer"
                  >
                    {createType === "paper"
                      ? `Build my ${paperSize} paper`
                      : mode === "byo" ? "Get my shopping brief" : "Build my flight"}
                  </button>
                </div>
              )}
            </section>
          )}

          {papers.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-3 font-display">Your papers</h2>
              <div className="space-y-3">
                {papers.map((pp) => (
                  <Link
                    key={pp.id}
                    href={`/live-tasting/paper/${pp.id}`}
                    className="block bg-card rounded-xl border border-border p-4 hover:bg-card-hover transition-colors"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {pp.size === "full" ? "Full" : "Half"} Paper {pp.paper} · {pp.flights} questions · {pp.city}
                        </p>
                        <p className="text-xs text-muted mt-0.5">
                          {new Date(pp.createdAt).toLocaleDateString()} · {pp.graded}/{pp.flights} graded
                          {pp.pacing === "exam-conditions" ? " · exam conditions" : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border text-accent border-accent/40 bg-accent/10">
                        {pp.generated < pp.flights ? "Generating" : pp.graded === pp.flights ? "Complete" : "In progress"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
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
                      {(() => {
                        // BYO with its question attached: the wines are in — signal "ready to
                        // taste", not "shopping" (there is nothing left to shop for).
                        const chip = s.mode === "byo" && s.state === "shopping"
                          ? { label: "Question ready", cls: "text-success border-success/40 bg-success/10" }
                          : STATE_CHIP[s.state];
                        return (
                          <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${chip.cls}`}>
                            {chip.label}
                          </span>
                        );
                      })()}
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
