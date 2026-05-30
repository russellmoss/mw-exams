"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { StemSniperCard, type Drill, type Prediction } from "../components/StemSniperCard";
import { StemSniperResult, type ScoreResult, type Revealed } from "../components/StemSniperResult";
import { FeedbackButton } from "../components/FeedbackButton";

type Status = "loading" | "drilling" | "result" | "empty";
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

  const fetchNext = useCallback(async (p: number | null) => {
    setStatus("loading");
    setResult(null);
    try {
      const res = await fetch(`/api/stem-sniper/next${p ? `?paper=${p}` : ""}`);
      if (res.ok) {
        setDrill(await res.json());
        setStatus("drilling");
      } else {
        setDrill(null);
        setStatus("empty");
      }
    } catch {
      setDrill(null);
      setStatus("empty");
    }
  }, []);

  useEffect(() => {
    if (user) fetchNext(paper);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Stem Sniper</h1>
        <p className="text-sm text-muted mt-1">
          Read the stem, predict variety + origin before tasting, and score your blind-deduction instincts.
        </p>
      </div>

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
