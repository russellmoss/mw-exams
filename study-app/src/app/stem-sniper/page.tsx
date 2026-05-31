"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { StemSniperCard, type Drill, type Prediction } from "../components/StemSniperCard";
import { StemSniperResult, type ScoreResult, type Revealed } from "../components/StemSniperResult";
import { StemSniperIntro } from "../components/StemSniperIntro";
import { FeedbackButton } from "../components/FeedbackButton";

type Status = "intro" | "loading" | "drilling" | "result" | "empty";
const INTRO_SEEN_KEY = "stem-sniper-intro-seen";
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
  const [submitting, setSubmitting] = useState(false);
  const [paper, setPaper] = useState<number | null>(null);
  const [auto, setAuto] = useState<{ varieties: string[]; regions: string[]; styles: string[] }>({
    varieties: [],
    regions: [],
    styles: [],
  });

  useEffect(() => {
    if (!loading && !user) router.push("/login");
  }, [loading, user, router]);

  useEffect(() => {
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

  const startDrilling = () => {
    if (typeof window !== "undefined") window.localStorage.setItem(INTRO_SEEN_KEY, "1");
    fetchNext(paper);
  };

  const onSubmit = async (preds: Prediction[]) => {
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
      {status === "result" && result && (
        <StemSniperResult
          result={result.result}
          revealed={result.revealed}
          submitting={status !== "result"}
          onNext={() => fetchNext(paper)}
        />
      )}
      </>
      )}

      {/* Always available — bottom-left. Works before a question is submitted so a
          broken/problematic drill can be reported (and auto-corrected) without
          having to attempt it. Uses the live attempt once submitted, otherwise
          creates one on-demand from the current drill's question. */}
      <FeedbackButton
        attemptId={result?.attemptId ?? null}
        questionId={drill?.questionId ?? null}
        userId={user.id}
        step="stem-sniper"
      />
    </div>
  );
}
