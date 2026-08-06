"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDraft } from "@/lib/use-draft";
import { useProgressStream } from "@/lib/use-progress-stream";
import { ThinkingTrace } from "../components/ThinkingTrace";

// ─────────────────────────────────────────────────────────────────────────────
// Flash Notes — a rapid, single-prompt variant of Dry Notes.
// Flow: setup (build a deck / infinite) → card → verdict → summary.
// Each card persists to user_attempts as mode = 'flash' so it appears in History.
// ─────────────────────────────────────────────────────────────────────────────

// The slice of the question payload Flash Notes uses — it trims the flight and ignores the rest.
type FlashQuestion = { question_id: string; paper: number; wines: unknown };

type PromptType = "style" | "quality" | "maturity" | "commercial";
type Verdict = "pass" | "borderline" | "fail";
type DeckMode = "deck" | "infinite";
type Screen = "setup" | "loading" | "card" | "grading" | "verdict" | "summary";

const PROMPTS: Record<PromptType, { label: string; chip: string; brief: string }> = {
  style: {
    label: "Style & Method",
    chip: "Style",
    brief: "Describe the style of each wine and infer the winemaking that produced it.",
  },
  quality: {
    label: "Quality",
    chip: "Quality",
    brief: "Assess the quality of each wine, calibrated to its tier and origin. Name the official quality level where relevant.",
  },
  maturity: {
    label: "Maturity & Drinking Window",
    chip: "Maturity",
    brief: "Assess maturity and the drinking window — current state, hold or drink now, how much longer it improves, and how long it holds.",
  },
  commercial: {
    label: "Commercial Appraisal",
    chip: "Commercial",
    brief: "Appraise each wine commercially — channel, geography, a realistic price, the competitive set, and a drinking window.",
  },
};

const ALL_PROMPTS: PromptType[] = ["style", "quality", "maturity", "commercial"];
const TARGET_PER_WINE = 480; // 8:00 / wine — the MW per-written-response pace target.

interface DeckSettings {
  mode: DeckMode;
  count: number; // 0 for infinite
  promptTypes: PromptType[]; // selected chips (deck mode)
  mixItUp: boolean;
}

interface CardWine {
  slot: number;
  fullText: string;
}

interface ActiveCard {
  attemptId: number | null;
  questionId: string;
  paper: number;
  wines: CardWine[];
  promptType: PromptType;
}

interface CardResult {
  verdict: Verdict;
  score: number;
  elapsedSeconds: number;
  wineCount: number;
  promptType: PromptType;
}

function fmt(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function fmtClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// Pace coloring per spec: green < 8:00/wine, amber 8:00–10:00, red > 10:00.
function paceColor(perWine: number): string {
  if (perWine < TARGET_PER_WINE) return "text-success";
  if (perWine <= 600) return "text-borderline";
  return "text-fail";
}

const VERDICT_STYLE: Record<Verdict, { label: string; cls: string }> = {
  pass: { label: "PASS", cls: "bg-success/15 text-success border-success/40" },
  borderline: { label: "BORDERLINE", cls: "bg-borderline/15 text-borderline border-borderline/40" },
  fail: { label: "FAIL", cls: "bg-fail/15 text-fail border-fail/40" },
};

function paperLabel(paper: number): string {
  return paper === 1 ? "P1 Whites" : paper === 2 ? "P2 Reds" : "P3 Special";
}

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function FlashNotesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  // Read the paper/family handoff from the landing page once, at mount (sessionStorage is
  // client-only, so guard for SSR). The redirect effect below covers the missing/unauth cases.
  const [setup] = useState<{ paper: number; family: string } | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = sessionStorage.getItem("mw-flash-setup");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [screen, setScreen] = useState<Screen>("setup");
  const [error, setError] = useState<string | null>(null);

  // Live progress for the two AI waits in the drill. Both are ungated: Flash Notes reveals the
  // wine identities up front (it awards no identification marks), so the model's reasoning gives
  // nothing away that the card itself doesn't. Separate traces because they're separate screens.
  const cardTrace = useProgressStream();
  const gradeTrace = useProgressStream();

  // Setup form state
  const [count, setCount] = useState<number>(10);
  const [selectedPrompts, setSelectedPrompts] = useState<PromptType[]>(["style", "quality"]);
  const [mixItUp, setMixItUp] = useState<boolean>(false);

  // Run state. `settings` drives the render (deck vs infinite, card count); settingsRef mirrors it
  // so the async card callbacks always read the latest without re-subscribing.
  const [settings, setSettings] = useState<DeckSettings | null>(null);
  const settingsRef = useRef<DeckSettings | null>(null);
  const deckIdRef = useRef<string>("");
  const [cardIndex, setCardIndex] = useState(0);
  const [results, setResults] = useState<CardResult[]>([]);
  const [card, setCard] = useState<ActiveCard | null>(null);
  // Per card, so a reload during a flash note doesn't cost the note; the key
  // changes with the card, so the next one always starts blank.
  const [answer, setAnswer, clearAnswer] = useDraft(`flash-note:${card?.attemptId ?? card?.questionId ?? "pending"}`);
  const [lastGrade, setLastGrade] = useState<{ verdict: Verdict; score: number; feedback: string; elapsedSeconds: number; wineCount: number } | null>(null);

  // Stopwatch
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopwatchStart = useCallback(() => {
    startRef.current = Date.now();
    setElapsed(0);
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000);
    }, 250);
  }, []);
  const stopwatchStop = useCallback((): number => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return (Date.now() - startRef.current) / 1000;
  }, []);
  useEffect(() => () => { if (tickRef.current) clearInterval(tickRef.current); }, []);

  // Redirect out if unauthenticated, or if there's no paper/family handoff to run on.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (!setup) { router.push("/practical/dry-flights"); return; }
  }, [authLoading, user, router, setup]);

  // Choose the prompt for a given card index from the active pool.
  const pickPrompt = useCallback((s: DeckSettings): PromptType => {
    const pool = s.mode === "infinite" || s.mixItUp || s.promptTypes.length === 0 ? ALL_PROMPTS : s.promptTypes;
    return randomFrom(pool);
  }, []);

  // Fetch a question, trim its flight to 2–3 wines, create + tag the attempt, and show the card.
  const fetchCard = useCallback(
    async (index: number) => {
      const s = settingsRef.current;
      if (!setup || !s) return;
      setScreen("loading");
      setError(null);
      // No need to blank the box: the draft is keyed to the card, so the new
      // card brings its own (empty) draft with it.
      try {
        const data = await cardTrace.run<{ question: FlashQuestion }>(
          "/api/get-question/stream",
          { paper: setup.paper, family: setup.family },
          { timeoutMs: 180_000 }
        );
        if (!data?.question) {
          // errorRef, not error: the closure's `error` predates the stream.
          throw new Error(cardTrace.errorRef.current || "Could not load a card.");
        }
        const q = data.question;
        const rawWines = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
        // Enforce a 2–3 wine flight for Flash Notes: surface at most 3 wines from whatever the
        // engine served (Flash grades a single competency over the revealed flight, not the
        // question's printed sub-parts, so a trimmed flight is self-contained).
        const wines: CardWine[] = (Array.isArray(rawWines) ? rawWines : [])
          .slice(0, 3)
          .map((w: { slot: number; fullText: string }) => ({ slot: w.slot, fullText: w.fullText }));
        if (wines.length === 0) throw new Error("That question had no wines — try again.");

        const promptType = pickPrompt(s);

        // Persist this card as a Flash Notes attempt so it lands in History with results +
        // the "Leave feedback" button.
        let attemptId: number | null = null;
        try {
          const created = await fetch("/api/save-attempt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create", questionId: q.question_id, userId: user?.id, mode: "flash" }),
          }).then((r) => r.json());
          attemptId = created?.attempt?.id ?? null;
          if (attemptId) {
            await fetch("/api/save-attempt", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "update",
                attemptId,
                prompt_type: promptType,
                flight_wine_count: wines.length,
                deck_id: deckIdRef.current,
                card_index: index,
                deck_settings: s,
              }),
            });
          }
        } catch { /* persistence is best-effort; the drill still runs */ }

        setCard({ attemptId, questionId: q.question_id, paper: q.paper, wines, promptType });
        setCardIndex(index);
        setScreen("card");
        stopwatchStart();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load card");
        setScreen("setup");
      }
    },
    [setup, user, pickPrompt, stopwatchStart]
  );

  const startRun = useCallback(
    (mode: DeckMode) => {
      const s: DeckSettings = {
        mode,
        count: mode === "infinite" ? 0 : count,
        promptTypes: selectedPrompts,
        mixItUp,
      };
      settingsRef.current = s;
      setSettings(s);
      deckIdRef.current = `flash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setResults([]);
      fetchCard(0);
    },
    [count, selectedPrompts, mixItUp, fetchCard]
  );

  const submitCard = useCallback(async () => {
    if (!card || !answer.trim()) return;
    const elapsedSeconds = Math.round(stopwatchStop());
    setScreen("grading");

    // Save the written answer immediately (best-effort).
    if (card.attemptId) {
      fetch("/api/save-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", attemptId: card.attemptId, user_answer: answer.trim() }),
      }).catch(() => {});
    }

    try {
      const data = await gradeTrace.run<{ verdict: Verdict; score: number; feedback: string }>(
        "/api/flash-notes/grade/stream",
        {
          paper: card.paper,
          promptType: card.promptType,
          wines: card.wines,
          answer: answer.trim(),
        }
      );
      if (!data?.verdict) {
        // errorRef, not error: the closure's `error` predates the stream.
        throw new Error(gradeTrace.errorRef.current || "Grading failed.");
      }
      const verdict: Verdict = data.verdict;
      const score: number = data.score;
      const feedback: string = data.feedback || "";

      if (card.attemptId) {
        fetch("/api/save-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            attemptId: card.attemptId,
            answer_feedback: feedback,
            pass_estimate: verdict,
            marks_estimate: String(score),
            elapsed_seconds: elapsedSeconds,
          }),
        }).catch(() => {});
      }

      setResults((r) => [...r, { verdict, score, elapsedSeconds, wineCount: card.wines.length, promptType: card.promptType }]);
      setLastGrade({ verdict, score, feedback, elapsedSeconds, wineCount: card.wines.length });
      setScreen("verdict");
      clearAnswer(); // graded and stored — the draft has done its job
    } catch (err) {
      // Keep the draft: grading failed, so they're sent back to the card to resubmit.
      setError(err instanceof Error ? err.message : "Grading failed");
      setScreen("card");
      stopwatchStart(); // let them resubmit
    }
  }, [card, answer, stopwatchStop, stopwatchStart, clearAnswer]);

  const nextCard = useCallback(() => {
    const s = settingsRef.current;
    if (!s) return;
    const nextIndex = cardIndex + 1;
    if (s.mode === "deck" && nextIndex >= s.count) {
      setScreen("summary");
      return;
    }
    fetchCard(nextIndex);
  }, [cardIndex, fetchCard]);

  const stopRun = useCallback(() => {
    setScreen("summary");
  }, []);

  const runAgain = useCallback(() => {
    const s = settingsRef.current;
    if (!s) { setScreen("setup"); return; }
    deckIdRef.current = `flash-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setResults([]);
    fetchCard(0);
  }, [fetchCard]);

  const togglePrompt = (p: PromptType) => {
    setSelectedPrompts((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const total = settings?.count ?? 0;

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <button
            onClick={() => router.push("/practical/dry-flights")}
            className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            &larr; Back to paper
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent border border-accent/30 font-medium uppercase tracking-wider">
              Flash Notes
            </span>
            {setup && (
              <span className="text-xs font-mono px-2 py-1 rounded bg-accent/15 text-accent">
                {paperLabel(setup.paper)}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-8">
          {error && screen !== "card" && (
            <div className="bg-fail/10 border border-fail/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-fail">{error}</p>
            </div>
          )}

          {/* ── Step 1: Setup ── */}
          {screen === "setup" && (
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight mb-2">Flash Notes</h1>
              <p className="text-sm text-muted mb-8">
                Rapid single-prompt drills. The wines are shown up front — write one focused note,
                get a quick verdict, and track your pace against 8:00 per wine.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                {/* Build a deck */}
                <div className="bg-card rounded-xl border border-border p-6 flex flex-col">
                  <h2 className="font-semibold text-foreground mb-1">Build a deck</h2>
                  <p className="text-sm text-muted mb-5">A fixed run of cards with the prompts you choose.</p>

                  <div className="mb-5">
                    <p className="text-xs uppercase tracking-wider text-muted mb-2">Cards</p>
                    <div className="inline-flex rounded-lg border border-border overflow-hidden">
                      {[5, 10, 20].map((n) => (
                        <button
                          key={n}
                          onClick={() => setCount(n)}
                          className={`px-4 py-1.5 text-sm font-medium tabular-nums transition-colors cursor-pointer ${
                            count === n ? "bg-accent text-background" : "bg-card hover:bg-card-hover text-muted"
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mb-5">
                    <p className="text-xs uppercase tracking-wider text-muted mb-2">Prompts</p>
                    <div className="flex flex-wrap gap-2">
                      {ALL_PROMPTS.map((p) => {
                        const active = !mixItUp && selectedPrompts.includes(p);
                        return (
                          <button
                            key={p}
                            disabled={mixItUp}
                            onClick={() => togglePrompt(p)}
                            className={`px-3 py-1.5 text-xs rounded-md transition-colors cursor-pointer ${
                              mixItUp
                                ? "bg-card text-muted/40 border border-border/50 cursor-not-allowed"
                                : active
                                  ? "bg-accent text-background font-semibold"
                                  : "bg-card hover:bg-card-hover text-muted border border-border"
                            }`}
                          >
                            {PROMPTS[p].chip}
                          </button>
                        );
                      })}
                    </div>
                    <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={mixItUp}
                        onChange={(e) => setMixItUp(e.target.checked)}
                        className="accent-[var(--accent)] cursor-pointer"
                      />
                      <span className="text-sm text-foreground">Mix it up</span>
                      <span className="text-xs text-muted">— randomize the prompt per card</span>
                    </label>
                  </div>

                  <button
                    onClick={() => startRun("deck")}
                    disabled={!mixItUp && selectedPrompts.length === 0}
                    className="mt-auto px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Start deck
                  </button>
                  {!mixItUp && selectedPrompts.length === 0 && (
                    <p className="text-xs text-fail mt-2">Pick at least one prompt, or turn on Mix it up.</p>
                  )}
                </div>

                {/* Infinite mode */}
                <div className="bg-card rounded-xl border border-border p-6 flex flex-col">
                  <h2 className="font-semibold text-foreground mb-1">Infinite mode</h2>
                  <p className="text-sm text-muted mb-5">
                    No count — a fresh card every time, prompts mixed, until you stop. Best for a
                    warm-up or a long grind.
                  </p>
                  <div className="flex-1 flex items-center justify-center py-6">
                    <div className="text-5xl font-display text-accent/30">&#8734;</div>
                  </div>
                  <button
                    onClick={() => startRun("infinite")}
                    className="mt-auto px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Start infinite
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Loading a card ── */}
          {screen === "loading" && (
            <div className="py-16">
              <p className="text-sm text-muted text-center mb-4">Dealing your next card…</p>
              <ThinkingTrace
                status={cardTrace.status}
                statuses={cardTrace.statuses}
                thinking={cardTrace.thinking}
                active={!cardTrace.error}
                error={cardTrace.error}
                idleLabel="Dealing your next card…"
              />
            </div>
          )}

          {/* ── Step 2: Card ── */}
          {screen === "card" && card && (
            <div className="space-y-6">
              {/* Progress + stopwatch */}
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  {settings?.mode === "deck" ? (
                    <>
                      <p className="text-xs text-muted mb-1.5 tabular-nums">
                        Card {cardIndex + 1} of {total}
                      </p>
                      <div className="h-1.5 rounded-full bg-card overflow-hidden">
                        <div
                          className="h-full bg-accent transition-all duration-300"
                          style={{ width: `${(cardIndex / Math.max(total, 1)) * 100}%` }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-muted tabular-nums">Card {cardIndex + 1} · &#8734;</p>
                  )}
                </div>
                <span className="font-mono text-lg tabular-nums text-muted" title="Time on this card">
                  {fmtClock(elapsed)}
                </span>
              </div>

              {/* The focused prompt */}
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-5">
                <p className="text-[10px] uppercase tracking-wider text-accent font-semibold mb-1">
                  {PROMPTS[card.promptType].chip}
                </p>
                <p className="text-foreground font-display text-lg leading-snug">
                  {PROMPTS[card.promptType].label}
                </p>
                <p className="text-sm text-muted mt-1.5">{PROMPTS[card.promptType].brief}</p>
              </div>

              {/* Wines revealed up front */}
              <div className="bg-card rounded-xl border border-border p-5">
                <p className="text-xs font-semibold text-accent mb-3 uppercase tracking-wide">
                  The Wines (revealed) · {card.wines.length} in the flight
                </p>
                <div className="space-y-2">
                  {card.wines.map((w) => (
                    <div key={w.slot} className="flex gap-3 bg-background rounded-lg p-3 border border-border/50">
                      <span className="text-accent font-mono font-bold shrink-0">{w.slot}.</span>
                      <span className="text-foreground text-sm">{w.fullText}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Answer */}
              <div>
                <textarea
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder={`Your ${PROMPTS[card.promptType].chip.toLowerCase()} note for the flight…`}
                  className="w-full min-h-[200px] bg-card border border-border rounded-xl p-4 text-foreground text-[15px] leading-relaxed resize-y placeholder:text-muted/50 focus:outline-none focus:border-accent/50 transition-colors"
                />
                {error && (
                  <p className="text-sm text-fail mt-2">{error}</p>
                )}
                <div className="flex justify-end mt-4">
                  <button
                    onClick={submitCard}
                    disabled={!answer.trim()}
                    className="px-8 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Submit
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Grading ── */}
          {screen === "grading" && (
            <div className="py-16">
              <p className="text-sm text-muted text-center mb-4">Marking your note…</p>
              <ThinkingTrace
                status={gradeTrace.status}
                statuses={gradeTrace.statuses}
                thinking={gradeTrace.thinking}
                active={!gradeTrace.error}
                error={gradeTrace.error}
                idleLabel="Marking your note…"
              />
            </div>
          )}

          {/* ── Step 3: Verdict ── */}
          {screen === "verdict" && lastGrade && (
            <div className="space-y-6">
              {(() => {
                const v = VERDICT_STYLE[lastGrade.verdict];
                const perWine = lastGrade.elapsedSeconds / Math.max(lastGrade.wineCount, 1);
                const under = perWine < TARGET_PER_WINE;
                return (
                  <>
                    <div className="bg-card rounded-xl border border-border p-6">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-4">
                          <span className={`px-4 py-1.5 rounded-full border text-sm font-semibold ${v.cls}`}>
                            {v.label}
                          </span>
                          <span className="font-display text-4xl text-foreground tabular-nums">
                            {lastGrade.score}
                            <span className="text-lg text-muted">/100</span>
                          </span>
                        </div>
                        {/* Time-for-card readout with per-wine pace */}
                        <div className={`text-right ${paceColor(perWine)}`}>
                          <p className="font-mono text-lg tabular-nums">
                            {fmt(lastGrade.elapsedSeconds)} · {fmt(perWine)}/wine
                          </p>
                          <p className="text-xs font-medium">
                            {under ? "✓ under pace" : "✗ over pace"}
                          </p>
                        </div>
                      </div>
                      {lastGrade.feedback && (
                        <div className="mt-5 pt-5 border-t border-border/60">
                          <p className="text-[10px] uppercase tracking-wider text-muted mb-1">What you missed</p>
                          <p className="text-sm text-foreground leading-relaxed">{lastGrade.feedback}</p>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-3">
                      {settings?.mode === "infinite" ? (
                        <>
                          <button
                            onClick={stopRun}
                            className="px-6 py-2.5 border border-border text-muted hover:text-foreground hover:border-muted rounded-lg transition-colors cursor-pointer"
                          >
                            Stop
                          </button>
                          <button
                            onClick={nextCard}
                            className="px-8 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors cursor-pointer"
                          >
                            Next card
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={nextCard}
                          className="px-8 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          {cardIndex + 1 >= total ? "See summary" : "Next card"}
                        </button>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* ── Step 4: Summary ── */}
          {screen === "summary" && (
            <div className="space-y-6">
              {(() => {
                const completed = results.length;
                const totalSeconds = results.reduce((a, r) => a + r.elapsedSeconds, 0);
                const totalWines = results.reduce((a, r) => a + r.wineCount, 0);
                const avgPerWine = totalWines > 0 ? totalSeconds / totalWines : 0;
                const spread: Record<Verdict, number> = {
                  pass: results.filter((r) => r.verdict === "pass").length,
                  borderline: results.filter((r) => r.verdict === "borderline").length,
                  fail: results.filter((r) => r.verdict === "fail").length,
                };
                const maxSpread = Math.max(1, spread.pass, spread.borderline, spread.fail);
                return (
                  <>
                    <h1 className="text-2xl font-bold text-foreground tracking-tight">Deck complete</h1>

                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="bg-card rounded-xl border border-border p-6">
                        <p className="text-xs uppercase tracking-wider text-muted mb-1">Cards completed</p>
                        <p className="font-display text-4xl text-foreground tabular-nums">{completed}</p>
                      </div>
                      <div className="bg-card rounded-xl border border-border p-6">
                        <p className="text-xs uppercase tracking-wider text-muted mb-1">Avg time / wine</p>
                        <p className={`font-display text-4xl tabular-nums ${paceColor(avgPerWine)}`}>
                          {completed > 0 ? fmt(avgPerWine) : "—"}
                        </p>
                        <p className="text-xs text-muted mt-1">target 8:00 / wine</p>
                      </div>
                    </div>

                    <div className="bg-card rounded-xl border border-border p-6">
                      <p className="text-xs uppercase tracking-wider text-muted mb-4">Verdict spread</p>
                      <div className="space-y-3">
                        {(["pass", "borderline", "fail"] as Verdict[]).map((vk) => {
                          const v = VERDICT_STYLE[vk];
                          const barColor =
                            vk === "pass" ? "bg-success" : vk === "borderline" ? "bg-borderline" : "bg-fail";
                          const textColor =
                            vk === "pass" ? "text-success" : vk === "borderline" ? "text-borderline" : "text-fail";
                          return (
                            <div key={vk} className="flex items-center gap-3">
                              <span className={`text-xs font-semibold w-24 ${textColor}`}>{v.label}</span>
                              <div className="flex-1 h-3 rounded-full bg-background overflow-hidden">
                                <div
                                  className={`h-full ${barColor} transition-all duration-300`}
                                  style={{ width: `${(spread[vk] / maxSpread) * 100}%` }}
                                />
                              </div>
                              <span className="text-sm tabular-nums text-foreground w-6 text-right">{spread[vk]}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => router.push("/practical/dry-flights")}
                        className="px-6 py-2.5 border border-border text-muted hover:text-foreground hover:border-muted rounded-lg transition-colors cursor-pointer"
                      >
                        Back to paper
                      </button>
                      <button
                        onClick={runAgain}
                        className="px-8 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors cursor-pointer"
                      >
                        Run it again
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
