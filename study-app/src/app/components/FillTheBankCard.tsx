"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";

interface PaperStatus {
  paper: number;
  descriptor?: string;
  approved: number;
  pending: number;
  target?: number;
  gapHint?: string | null;
  running: { batchId: string; requested: number; generated: number; failed: number } | null;
}

const PAPER_LABEL: Record<number, string> = { 1: "Paper 1", 2: "Paper 2", 3: "Paper 3" };
const DEFAULT_TARGET = 50;

/**
 * "Fill the Bank" — admin-only card for bulk question generation. Per-paper bank counts, a paper
 * segmented control, a count stepper (default 10), the estimated cost, and an amber Generate button.
 * While a run is live it shows progress + a Review link; when questions are waiting it shows an amber
 * "Review N questions" button. Polls /api/admin/bank/status every 3s.
 */
export function FillTheBankCard() {
  const [papers, setPapers] = useState<PaperStatus[]>([]);
  const [costPerQuestion, setCostPerQuestion] = useState(0.35);
  const [selectedPaper, setSelectedPaper] = useState(1);
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const anyRunning = useRef(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bank/status");
      if (!res.ok) return;
      const data = await res.json();
      setPapers(data.papers || []);
      if (typeof data.costPerQuestion === "number") setCostPerQuestion(data.costPerQuestion);
      anyRunning.current = (data.papers || []).some((p: PaperStatus) => p.running);
    } catch {
      /* transient — next poll retries */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // A fast 3s cadence while anything is running so progress feels live; back off otherwise.
    const interval = setInterval(() => {
      fetchStatus();
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const current = papers.find((p) => p.paper === selectedPaper);
  const estCost = (count * costPerQuestion).toFixed(2);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bank/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paper: selectedPaper, count, replaceRejected: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't start generation");
      } else {
        setConfirming(false);
        await fetchStatus();
      }
    } catch {
      setError("Network error");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-6 mb-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-bold text-foreground">Fill the Bank</h2>
          <p className="text-xs text-muted mt-1 max-w-xl">
            Generate a fresh batch of practice questions, then keep or bin each one before it reaches
            candidates.
          </p>
        </div>
      </div>

      {/* Per-paper bank health — one row each: label · count · fill bar toward target · gap hint */}
      <div className="flex flex-col divide-y divide-border/60 border-y border-border/60 mb-5">
        {[1, 2, 3].map((p) => {
          const s = papers.find((x) => x.paper === p);
          const approved = s?.approved ?? 0;
          const target = s?.target ?? DEFAULT_TARGET;
          const pct = Math.min(100, Math.round((approved / Math.max(1, target)) * 100));
          return (
            <div key={p} className="flex items-center gap-4 py-3">
              <div className="w-40 shrink-0">
                <p className="text-sm text-foreground">
                  {PAPER_LABEL[p]}
                  {s?.descriptor && <span className="text-muted"> · {s.descriptor}</span>}
                </p>
                <p className="text-[11px] text-muted tabular-nums">
                  {loading ? "—" : `${approved} in bank`}
                  {s && s.pending > 0 && <span className="text-accent"> · {s.pending} to review</span>}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <div className="h-1.5 rounded-full bg-border overflow-hidden" title={`${approved} / ${target}`}>
                  <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
                </div>
                {s?.gapHint && approved < target && (
                  <p className="text-[11px] text-muted mt-1">{s.gapHint}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Paper segmented control */}
      <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-background/40 w-fit mb-4">
        {[1, 2, 3].map((p) => (
          <button
            key={p}
            onClick={() => setSelectedPaper(p)}
            className={`text-sm px-4 py-1.5 rounded-md transition-colors cursor-pointer ${
              selectedPaper === p
                ? "bg-accent text-background font-medium"
                : "text-muted hover:text-foreground"
            }`}
          >
            {PAPER_LABEL[p]}
          </button>
        ))}
      </div>

      {current?.running ? (
        /* Live run for the selected paper */
        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-accent streaming-dot" />
            <p className="text-sm text-foreground">
              Generating{" "}
              <span className="tabular-nums font-medium">
                {current.running.generated + current.running.failed} of {current.running.requested}
              </span>{" "}
              for {PAPER_LABEL[selectedPaper]}…
            </p>
            <Link
              href={`/admin/bank?batch=${current.running.batchId}`}
              className="ml-auto text-sm text-accent hover:text-accent-hover font-medium"
            >
              Review →
            </Link>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-border overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{
                width: `${Math.min(
                  100,
                  Math.round(
                    ((current.running.generated + current.running.failed) /
                      Math.max(1, current.running.requested)) *
                      100
                  )
                )}%`,
              }}
            />
          </div>
        </div>
      ) : current && current.pending > 0 ? (
        /* Questions waiting to be reviewed */
        <div className="flex items-center gap-3">
          <Link
            href="/admin/bank"
            className="text-sm px-5 py-2.5 bg-accent hover:bg-accent-hover text-background rounded-lg transition-colors font-medium"
          >
            Review {current.pending} question{current.pending === 1 ? "" : "s"}
          </Link>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-sm px-4 py-2.5 rounded-lg border border-border text-muted hover:text-foreground hover:border-muted transition-colors cursor-pointer disabled:opacity-50"
          >
            Generate {count} more
          </button>
        </div>
      ) : (
        /* Idle — configure and generate */
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">How many</span>
            <div className="flex items-center rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                className="px-3 py-1.5 text-muted hover:text-foreground hover:bg-card-hover transition-colors cursor-pointer"
                aria-label="Fewer"
              >
                −
              </button>
              <span className="px-4 py-1.5 text-sm text-foreground tabular-nums min-w-[3rem] text-center border-x border-border">
                {count}
              </span>
              <button
                onClick={() => setCount((c) => Math.min(50, c + 1))}
                className="px-3 py-1.5 text-muted hover:text-foreground hover:bg-card-hover transition-colors cursor-pointer"
                aria-label="More"
              >
                +
              </button>
            </div>
          </div>
          {confirming ? (
            /* Inline confirm strip — estimated cost + Cancel / Confirm */
            <div className="flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/5 px-4 py-2">
              <span className="text-sm text-foreground">
                Generate {count} for {PAPER_LABEL[selectedPaper]} · est.{" "}
                <span className="tabular-nums">${estCost}</span>?
              </span>
              <button
                onClick={() => setConfirming(false)}
                disabled={generating}
                className="text-sm px-3 py-1.5 rounded-md border border-border text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="text-sm px-4 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                {generating ? "Starting…" : "Confirm"}
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted">
                Estimated cost <span className="text-foreground tabular-nums">${estCost}</span>
              </p>
              <button
                onClick={() => {
                  setError(null);
                  setConfirming(true);
                }}
                className="text-sm px-5 py-2.5 bg-accent hover:bg-accent-hover text-background rounded-lg transition-colors font-medium cursor-pointer disabled:opacity-50"
              >
                Generate {count}
              </button>
            </>
          )}
        </div>
      )}

      {error && <p className="text-xs text-fail mt-3">{error}</p>}
    </div>
  );
}
