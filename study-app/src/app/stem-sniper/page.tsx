"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { StemSniperCard, type Drill, type Prediction } from "../components/StemSniperCard";
import { StemSniperTastingCard, type TastingNote } from "../components/StemSniperTastingCard";
import { StemSniperResult, type ScoreResult, type Revealed } from "../components/StemSniperResult";
import { StemSniperIntro } from "../components/StemSniperIntro";
import { FeedbackButton } from "../components/FeedbackButton";

type Status = "intro" | "loading" | "drilling" | "revealing" | "tasting" | "result" | "empty";
type Mode = "sniper" | "reverse";
type Movement = { stage1Percent: number; stage2Percent: number; delta: number };

const INTRO_SEEN_KEY = "stem-sniper-intro-seen";
const MODE_KEY = "stem-sniper-mode";
const PAPERS: { label: string; value: number | null }[] = [
  { label: "Any", value: null },
  { label: "P1 Whites", value: 1 },
  { label: "P2 Reds", value: 2 },
  { label: "P3 Special", value: 3 },
];
export default function StemSniperPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");
  const [drill, setDrill] = useState<Drill | null>(null);
  const [result, setResult] = useState<{ result: ScoreResult; revealed: Revealed; attemptId: number | null } | null>(null);
  const [movement, setMovement] = useState<Movement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paper, setPaper] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("sniper");
  const [stage1Preds, setStage1Preds] = useState<Prediction[] | null>(null);
  const [notes, setNotes] = useState<TastingNote[] | null>(null);
  const [auto, setAuto] = useState<{ varieties: string[]; regions: string[]; styles: string[] }>({
    varieties: [],
    regions: [],
    styles: [],
  });
  // `mode` is read inside fetch callbacks; keep a ref so they don't need it as a dependency.
  const modeRef = useRef<Mode>("sniper");
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
    const m = typeof window !== "undefined" ? window.localStorage.getItem(MODE_KEY) : null;
    if (m === "reverse" || m === "sniper") setMode(m);
    fetch("/data/stem-autocomplete.json")
      .then((r) => r.json())
      .then((d) => setAuto({ varieties: d.varieties || [], regions: d.regions || [], styles: d.styles || [] }))
      .catch(() => {});
  }, []);

  // One fetch of a drill. /drill is the unified source: ~90% freshly generated through the shared
  // engine (with a stem key derived on the spot), ~10% from the validated banked pool.
  const fetchDrill = useCallback(async (p: number | null): Promise<Drill | null> => {
    try {
      const res = await fetch(`/api/stem-sniper/drill${p ? `?paper=${p}` : ""}`);
      return res.ok ? ((await res.json()) as Drill) : null;
    } catch {
      return null;
    }
  }, []);

  // Client-side prefetch of one drill. Fresh generation takes time, so the moment a drill is shown we
  // warm the NEXT one in the background; by the time the candidate finishes answering it's ready and
  // "Next drill" is near-instant. Keyed by paper so a filter change discards a stale prefetch.
  const prefetchRef = useRef<{ paper: number | null; promise: Promise<Drill | null> } | null>(null);
  const startPrefetch = useCallback(
    (p: number | null) => {
      prefetchRef.current = { paper: p, promise: fetchDrill(p) };
    },
    [fetchDrill]
  );

  const fetchNext = useCallback(
    async (p: number | null) => {
      setStatus("loading");
      setResult(null);
      setMovement(null);
      setStage1Preds(null);
      setNotes(null);
      // Use a ready/in-flight prefetched drill for this paper if we have one; else fetch live.
      let promise: Promise<Drill | null>;
      if (prefetchRef.current && prefetchRef.current.paper === p) {
        promise = prefetchRef.current.promise;
        prefetchRef.current = null;
      } else {
        promise = fetchDrill(p);
      }
      let d = await promise;
      if (!d) d = await fetchDrill(p); // prefetch missed (e.g. transient gen failure) — try once live
      if (d && d.questionId) {
        setDrill(d);
        setStatus("drilling");
        startPrefetch(p); // warm the next drill while the candidate works on this one
      } else {
        setDrill(null);
        setStatus("empty");
      }
    },
    [fetchDrill, startPrefetch]
  );

  useEffect(() => {
    if (!user) return;
    // First-time visitors see the how-it-works intro; returning visitors go
    // straight to a drill. The toggle in the header can reopen it anytime.
    const seen = typeof window !== "undefined" && window.localStorage.getItem(INTRO_SEEN_KEY);
    if (seen) {
      fetchNext(paper);
    } else {
      setStatus("intro");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Mode is chosen on the intro page (so the candidate commits to Sniper vs Reverse Tasting before
  // starting, and the intro explains both). Reopening "How it works" lets them switch.
  const startDrilling = (m: Mode) => {
    setMode(m);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(INTRO_SEEN_KEY, "1");
      window.localStorage.setItem(MODE_KEY, m);
    }
    fetchNext(paper);
  };

  // Sniper scoring (also the graceful fallback if the Layer-B reveal can't be produced).
  const scoreSniper = useCallback(async (preds: Prediction[]) => {
    if (!drill) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stem-sniper/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: drill.questionId, predictions: preds }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult({ result: data.result, revealed: data.revealed, attemptId: data.attemptId ?? null });
        setMovement(null);
        setStatus("result");
      }
    } finally {
      setSubmitting(false);
    }
  }, [drill]);

  // Reverse Tasting — Stage 1 submit: hold the Layer-A guess, fetch the sanitized Layer-B notes,
  // then advance to Stage 2. If notes can't be produced, gracefully score the Layer-A guess instead.
  const revealStage2 = useCallback(async (preds: Prediction[]) => {
    if (!drill) return;
    setStage1Preds(preds);
    setStatus("revealing");
    try {
      const res = await fetch(`/api/stem-sniper/notes?questionId=${encodeURIComponent(drill.questionId)}`);
      if (res.ok) {
        const data = await res.json();
        const ns: TastingNote[] = Array.isArray(data.notes) ? data.notes.filter((n: TastingNote) => n.note?.trim()) : [];
        if (ns.length > 0) {
          setNotes(ns);
          setStatus("tasting");
          return;
        }
      }
    } catch {
      /* fall through to fallback */
    }
    await scoreSniper(preds); // couldn't reveal the glass — score the stem guess
  }, [drill, scoreSniper]);

  // Stage 1 submit dispatch.
  const onSubmit = (preds: Prediction[]) => {
    if (modeRef.current === "reverse") revealStage2(preds);
    else scoreSniper(preds);
  };

  // Reverse Tasting — Stage 2 submit: score both stages and show the movement.
  const onSubmitStage2 = async (stage2Preds: Prediction[]) => {
    if (!drill || !stage1Preds) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/stem-sniper/submit-reverse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: drill.questionId, stage1: stage1Preds, stage2: stage2Preds }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult({ result: data.stage2, revealed: data.revealed, attemptId: data.attemptId ?? null });
        setMovement(data.movement ?? null);
        setStatus("result");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const selectPaper = (p: number | null) => {
    setPaper(p);
    fetchNext(p);
  };

  if (loading || !user) return null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stem Sniper</h1>
          <p className="text-sm text-muted mt-1">
            Read the stem, predict variety + origin before tasting, and score your blind-deduction instincts.
          </p>
        </div>
        {status !== "intro" && (
          <button
            onClick={() => setStatus("intro")}
            className="shrink-0 mt-1 text-xs text-muted hover:text-foreground border border-border hover:border-muted rounded-lg px-3 py-1.5 transition-colors cursor-pointer"
          >
            How it works
          </button>
        )}
      </div>

      {status === "intro" && <StemSniperIntro onStart={startDrilling} />}

      {status !== "intro" && (
        <>
          {/* Active-mode chip — mode is chosen on the intro; this just shows which is active. */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                mode === "reverse"
                  ? "bg-emerald-400/15 text-emerald-300 border-emerald-400/40"
                  : "bg-accent/15 text-accent border-accent/40"
              }`}
            >
              {mode === "reverse" ? "Reverse Tasting" : "Sniper"} mode
            </span>
            <button
              onClick={() => setStatus("intro")}
              className="text-[11px] text-muted/70 hover:text-foreground transition-colors cursor-pointer underline-offset-2 hover:underline"
            >
              switch
            </button>
          </div>

          {/* Paper filter */}
          <div className="flex flex-wrap gap-2 mb-6">
            {PAPERS.map((p) => (
              <button
                key={p.label}
                onClick={() => selectPaper(p.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                  paper === p.value
                    ? "bg-accent/15 text-accent border-accent/40"
                    : "bg-card border-border text-muted hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {status === "loading" && <div className="text-sm text-muted">Loading drill…</div>}
          {status === "revealing" && (
            <div className="bg-card border border-border rounded-xl p-6 text-sm text-muted flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
              <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
              <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
              <span className="ml-1">Revealing the glass — generating the tasting note…</span>
            </div>
          )}
          {status === "empty" && (
            <div className="bg-card border border-border rounded-xl p-6 text-sm text-muted">
              No drills available for that filter yet.
            </div>
          )}
          {status === "drilling" && drill && (
            <StemSniperCard
              drill={drill}
              varieties={auto.varieties}
              regions={auto.regions}
              styles={auto.styles}
              submitting={submitting}
              onSubmit={onSubmit}
            />
          )}
          {status === "tasting" && drill && notes && stage1Preds && (
            <StemSniperTastingCard
              questionText={drill.questionText}
              isP3={drill.paper === 3}
              notes={notes}
              initial={stage1Preds}
              varieties={auto.varieties}
              regions={auto.regions}
              styles={auto.styles}
              submitting={submitting}
              onSubmit={onSubmitStage2}
            />
          )}
          {status === "result" && result && (
            <>
              {movement && (
                <div className="mb-4 bg-card border border-border rounded-xl p-4">
                  <div className="text-xs font-semibold text-foreground mb-1">How the glass moved you</div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted">Layer A (stem)</span>
                    <span className="font-bold text-foreground">{movement.stage1Percent}%</span>
                    <span className="text-muted">→</span>
                    <span className="text-muted">Layer B (glass)</span>
                    <span className="font-bold text-foreground">{movement.stage2Percent}%</span>
                    <span
                      className={`ml-1 text-xs font-semibold ${
                        movement.delta > 0 ? "text-emerald-300" : movement.delta < 0 ? "text-fail" : "text-muted"
                      }`}
                    >
                      {movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted mt-1">
                    The calibration below is on your <span className="text-foreground/80">Layer-B</span> (post-tasting)
                    confidence — the honest one, made with the evidence in the glass.
                  </p>
                </div>
              )}
              <StemSniperResult
                result={result.result}
                revealed={result.revealed}
                submitting={status !== "result"}
                onNext={() => fetchNext(paper)}
              />
            </>
          )}
        </>
      )}

      {/* Always available — bottom-left, on every question + answer page (both modes). Works before a
          question is submitted so a broken/problematic drill can be reported (and auto-corrected)
          without attempting it: uses the live attempt once submitted, else creates one on-demand from
          the current drill's question. The step encodes mode + page so the analysis knows whether the
          feedback is about the stem, the Layer-B tasting note, or the scoring — all prefixed
          "stem-sniper" so feedback routing still recognises it. */}
      {status !== "intro" && (
        <FeedbackButton
          attemptId={result?.attemptId ?? null}
          questionId={drill?.questionId ?? null}
          userId={user.id}
          step={
            status === "tasting"
              ? "stem-sniper:reverse-tasting"
              : status === "result"
                ? movement
                  ? "stem-sniper:reverse-result"
                  : "stem-sniper:result"
                : mode === "reverse"
                  ? "stem-sniper:reverse-stem"
                  : "stem-sniper:stem"
          }
        />
      )}
    </div>
  );
}
