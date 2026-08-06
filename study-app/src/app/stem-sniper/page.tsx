"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { StemSniperCard, type Drill, type Prediction } from "../components/StemSniperCard";
import { StemSniperTastingCard, type TastingNote } from "../components/StemSniperTastingCard";
import { StemSniperResult, type ScoreResult, type Revealed } from "../components/StemSniperResult";
import { StemSniperIntro } from "../components/StemSniperIntro";
import { OriginalStem } from "../components/OriginalStem";
import { FeedbackButton } from "../components/FeedbackButton";
import { ThinkingTrace } from "../components/ThinkingTrace";
import { useProgressStream } from "@/lib/use-progress-stream";

type Status = "intro" | "loading" | "drilling" | "revealing" | "tasting" | "result" | "empty";
type Mode = "sniper" | "reverse";
type Movement = { stage1Percent: number; stage2Percent: number; delta: number };
// What the candidate has narrowed the drill pool to. `variety` is null for "any grape".
type DrillFilter = { paper: number | null; variety: string | null };

const INTRO_SEEN_KEY = "stem-sniper-intro-seen";
const MODE_KEY = "stem-sniper-mode";
const VARIETY_KEY = "stem-sniper-variety";
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
  const [variety, setVariety] = useState<string | null>(null);
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
    // Restored off the synchronous effect path (react-hooks/set-state-in-effect). Unlike the study
    // page's mode — which is read-only there and so became a useSyncExternalStore value — `mode` and
    // `variety` are OWNED here (the header toggle and the variety picker set them), so they have to
    // stay in state. A lazy initialiser is not an option either: localStorage does not exist during
    // SSR, and the header toggle renders before the drill loads, so the server and client markup
    // would disagree. Deferring by a microtask is behaviour-preserving, since useEffect already runs
    // after the first paint.
    void Promise.resolve().then(() => {
      const m = typeof window !== "undefined" ? window.localStorage.getItem(MODE_KEY) : null;
      if (m === "reverse" || m === "sniper") setMode(m);
      const v = typeof window !== "undefined" ? window.localStorage.getItem(VARIETY_KEY) : null;
      if (v) setVariety(v);
    });
    fetch("/data/stem-autocomplete.json")
      .then((r) => r.json())
      .then((d) => setAuto({ varieties: d.varieties || [], regions: d.regions || [], styles: d.styles || [] }))
      .catch(() => {});
  }, []);

  // Live progress for the drill the candidate is actually waiting on, and for the Layer-B reveal.
  // Fresh generation runs a validate-and-retry loop that can take 20-60s; without this the page
  // showed a single static "Loading drill…" line and a working request looked hung.
  const drillTrace = useProgressStream();
  const notesTrace = useProgressStream();

  // Everything that selects WHICH drill to serve. The prefetch is keyed on the whole object, so
  // adding a filter here is enough to stop a stale warm drill being served for the previous one.
  const filterKey = (f: DrillFilter) => `${f.paper ?? "any"}|${f.variety ?? "any"}`;
  const filterQuery = (f: DrillFilter) => {
    const p = new URLSearchParams();
    if (f.paper) p.set("paper", String(f.paper));
    if (f.variety) p.set("variety", f.variety);
    const q = p.toString();
    return q ? `?${q}` : "";
  };

  // One fetch of a drill. /drill is the unified source: ~90% freshly generated through the shared
  // engine (with a stem key derived on the spot), ~10% from the validated banked pool — though a
  // variety filter always generates fresh, since the bank rarely holds a matching single-grape flight.
  // This is the SILENT variant — used for prefetching the next drill in the background, where
  // there's no UI to report to. The visible fetch goes through /drill/stream (see fetchNext).
  const fetchDrill = useCallback(async (f: DrillFilter): Promise<Drill | null> => {
    try {
      const res = await fetch(`/api/stem-sniper/drill${filterQuery(f)}`);
      return res.ok ? ((await res.json()) as Drill) : null;
    } catch {
      return null;
    }
  }, []);

  // Same drill, streamed: phase labels plus the generating model's own reasoning arrive as the
  // engine works, and the final `result` event carries the identical stem-only payload.
  const streamDrill = useCallback(
    (f: DrillFilter) => drillTrace.run<Drill>(`/api/stem-sniper/drill/stream${filterQuery(f)}`),
    // `run` is stable (useCallback with no deps) — depending on the whole trace object would
    // re-create this on every streamed token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // Client-side prefetch of one drill. Fresh generation takes time, so the moment a drill is shown we
  // warm the NEXT one in the background; by the time the candidate finishes answering it's ready and
  // "Next drill" is near-instant. Keyed by the full filter so changing paper OR variety discards it.
  const prefetchRef = useRef<{ key: string; promise: Promise<Drill | null> } | null>(null);
  const startPrefetch = useCallback(
    (f: DrillFilter) => {
      prefetchRef.current = { key: filterKey(f), promise: fetchDrill(f) };
    },
    [fetchDrill]
  );

  const fetchNext = useCallback(
    async (f: DrillFilter) => {
      setStatus("loading");
      setResult(null);
      setMovement(null);
      setStage1Preds(null);
      setNotes(null);
      // Use a ready/in-flight prefetched drill for this exact filter if we have one (near-instant,
      // nothing to narrate); otherwise generate live through the streaming endpoint so the wait is
      // visible. A variety filter never has a usable prefetch on the first drill after the change,
      // which is the right trade: better a visible 30s wait than the wrong grape instantly.
      let promise: Promise<Drill | null>;
      if (prefetchRef.current && prefetchRef.current.key === filterKey(f)) {
        promise = prefetchRef.current.promise;
        prefetchRef.current = null;
        drillTrace.reset();
      } else {
        promise = streamDrill(f);
      }
      let d = await promise;
      if (!d) d = await streamDrill(f); // prefetch missed (e.g. transient gen failure) — try once live
      if (d && d.questionId) {
        setDrill(d);
        setStatus("drilling");
        startPrefetch(f); // warm the next drill while the candidate works on this one
      } else {
        setDrill(null);
        setStatus("empty");
      }
    },
    // `streamDrill` and the trace's `reset` are stable; listing the trace object would rebuild
    // this callback on every streamed token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchDrill, startPrefetch, streamDrill]
  );

  useEffect(() => {
    if (!user) return;
    // First-time visitors see the how-it-works intro; returning visitors go
    // straight to a drill. The toggle in the header can reopen it anytime.
    const seen = typeof window !== "undefined" && window.localStorage.getItem(INTRO_SEEN_KEY);
    // Both branches reach setState — fetchNext sets status/drill, and the else-branch sets it
    // directly — so the whole decision is deferred off the synchronous effect path rather than each
    // branch separately. Nothing flashes: `status` is already "loading" on first paint, so the
    // candidate sees the spinner either way.
    void Promise.resolve().then(() => {
      if (seen) {
        // Read the saved variety straight from storage rather than from state: the effect that
        // restores it into state is deferred the same way, so `variety` may still be null here.
        fetchNext({ paper, variety: typeof window !== "undefined" ? window.localStorage.getItem(VARIETY_KEY) : null });
      } else {
        setStatus("intro");
      }
    });
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
    fetchNext({ paper, variety });
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
      const data = await notesTrace.run<{ notes: TastingNote[] }>(
        `/api/stem-sniper/notes/stream?questionId=${encodeURIComponent(drill.questionId)}`
      );
      const ns: TastingNote[] = Array.isArray(data?.notes)
        ? data.notes.filter((n: TastingNote) => n.note?.trim())
        : [];
      if (ns.length > 0) {
        setNotes(ns);
        setStatus("tasting");
        return;
      }
    } catch {
      /* fall through to fallback */
    }
    await scoreSniper(preds); // couldn't reveal the glass — score the stem guess
    // `notesTrace.run` is stable; the trace object itself changes on every streamed token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    fetchNext({ paper: p, variety });
  };

  // Choosing a grape restricts every subsequent drill to it. Persisted, so the candidate can drill
  // one variety across a session without re-picking after each reload.
  const selectVariety = (v: string | null) => {
    const next = v && v.trim() ? v.trim() : null;
    setVariety(next);
    if (typeof window !== "undefined") {
      if (next) window.localStorage.setItem(VARIETY_KEY, next);
      else window.localStorage.removeItem(VARIETY_KEY);
    }
    fetchNext({ paper, variety: next });
  };

  if (loading || !user) return null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Stem Sniper</h1>
          <p className="text-sm text-muted mt-1">
            Read the stem, predict grape + country before tasting, and score your blind-deduction instincts.
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
                  ? "bg-success/15 text-success border-success/40"
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
          <div className="flex flex-wrap gap-2 mb-3">
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

          {/* Variety filter. Free text against the same autocomplete the answer fields use, so a
              grape that isn't in the list can still be drilled. Applies on change/Enter/blur. */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-[11px] font-medium text-muted">Grape</span>
            <datalist id="ss-filter-varieties">
              {auto.varieties.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <input
              list="ss-filter-varieties"
              defaultValue={variety ?? ""}
              key={variety ?? ""}
              placeholder="Any grape"
              aria-label="Filter drills by grape variety"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  selectVariety((e.target as HTMLInputElement).value);
                }
              }}
              onBlur={(e) => {
                if ((e.target.value.trim() || null) !== variety) selectVariety(e.target.value);
              }}
              className="bg-background border border-border rounded-full px-3 py-1.5 text-xs w-44 focus:outline-none focus:border-accent/60"
            />
            {variety && (
              <>
                <button
                  onClick={() => selectVariety(null)}
                  className="px-2.5 py-1 rounded-full text-[11px] border border-accent/40 bg-accent/15 text-accent hover:bg-accent/25 transition-colors cursor-pointer"
                  title="Clear the grape filter"
                >
                  {variety} ✕
                </button>
                <span className="text-[10px] text-muted/80">
                  filtered drills are generated live — expect a longer wait
                </span>
              </>
            )}
          </div>

          {/* Both waits are spoiler-gated: the collapsed row shows only our own phase labels
              (never a wine name), and the model's reasoning — which does name the wines — sits
              behind an explicitly-labelled toggle so revealing it is the candidate's choice. */}
          {status === "loading" && (
            <ThinkingTrace
              status={drillTrace.status}
              statuses={drillTrace.statuses}
              thinking={drillTrace.thinking}
              // The panel only mounts while we're genuinely waiting, so keep the pulse alive even
              // for a prefetched drill (no stream, therefore no trace) — dead dots read as hung.
              active={!drillTrace.error}
              error={drillTrace.error}
              spoiler
              idleLabel="Loading drill…"
            />
          )}
          {status === "revealing" && (
            <ThinkingTrace
              status={notesTrace.status}
              statuses={notesTrace.statuses}
              thinking={notesTrace.thinking}
              active={!notesTrace.error}
              error={notesTrace.error}
              spoiler
              idleLabel="Revealing the glass — generating the tasting note…"
            />
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
              // Hedge & Blend is scored by scoreStemSniper (two-axis credits). Reverse Tasting posts
              // to submit-reverse, which still uses the legacy scorer and would grant hedges free.
              allowHedge={mode !== "reverse"}
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
                        movement.delta > 0 ? "text-success" : movement.delta < 0 ? "text-fail" : "text-muted"
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
                onNext={() => fetchNext({ paper, variety })}
              />
              {/* The stem the feedback above is grading. `drill` survives scoring — it's only
                  cleared when the next drill is fetched — so no extra request is needed. */}
              <OriginalStem
                className="mt-4"
                stem={
                  drill
                    ? {
                        questionText: drill.questionText,
                        totalMarks: drill.totalMarks,
                        paper: drill.paper,
                        familyLabel: drill.familyLabel,
                        visuals: drill.visuals,
                      }
                    : null
                }
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
