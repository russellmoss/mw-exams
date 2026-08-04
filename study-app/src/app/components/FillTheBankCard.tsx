"use client";

import { useState, useEffect, useCallback } from "react";

// Read the NotificationBell deep-link (/admin?review=<batchId>) at first render so the Review row
// auto-expands without a synchronous setState inside an effect.
function initialReviewBatch(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("review");
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// "Fill the Bank" — rendered as ROWS INSIDE the Auto-Apply settings card on /admin (never as a
// standalone sibling card or its own page). Five prior builds shipped it as a top-level card / route
// that the admin never saw; the fix, per spec, is to nest this markup in the SAME JSX block as the
// Auto-Apply toggle so it cannot sit on a separately-gated or unrendered branch.
//
// Row A — Fill the Bank: per-paper banked readout, paper <select>, count input (default 10, 1–50),
//         amber Generate, a muted est-cost + build stamp line, and a live progress bar while a batch
//         runs. Row B — Review: appears only when unreviewed drafts exist and expands IN PLACE (no
//         navigation) into a one-card-at-a-time keep/bin stack. All data comes from the existing
//         admin-guarded /api/admin/bank/* endpoints; kept drafts are promoted into the banked store,
//         pending/binned are never served to candidates.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// Self-evident staleness stamp (spec): if this line is old, the admin is on a stale bundle. Prefer a
// deploy-injected build time; fall back to the stamp updated in the shipping change.
const BUILD_STAMP = process.env.NEXT_PUBLIC_BUILD_TIME || "2026-08-04 12:00";

const PAPER_LABEL: Record<number, string> = { 1: "Paper 1", 2: "Paper 2", 3: "Paper 3" };
const PAPER_OPTION: Record<number, string> = {
  1: "Paper 1 whites",
  2: "Paper 2 reds",
  3: "Paper 3 special",
};

interface PaperStatus {
  paper: number;
  descriptor?: string;
  approved: number;
  pending: number;
  running: { batchId: string; requested: number; generated: number; failed: number } | null;
}

interface Wine {
  slot: number;
  fullText: string;
  appearance: string | null;
}
interface Draft {
  questionId: string;
  paper: number;
  family: string;
  familyLabel: string;
  questionText: string;
  totalMarks: number;
  wines: Wine[];
  status: "pending" | "approved" | "rejected";
}
interface Batch {
  id: string;
  paper: number;
  status: "running" | "ready" | "cancelled" | "error";
  requested: number;
  generated: number;
  failed: number;
  replaceRejected: boolean;
}

export function FillTheBankRows() {
  const [papers, setPapers] = useState<PaperStatus[]>([]);
  const [costPerQuestion, setCostPerQuestion] = useState(0.35);
  const [selectedPaper, setSelectedPaper] = useState(1);
  const [count, setCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Row B (in-place review) state. Seeded from the ?review=<batchId> deep-link so a click in the
  // NotificationBell lands on /admin with the Review row already open.
  const [reviewOpen, setReviewOpen] = useState(() => !!initialReviewBatch());
  const [reviewBatchId, setReviewBatchId] = useState<string | null>(() => initialReviewBatch());
  const [batch, setBatch] = useState<Batch | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [replaceBinned, setReplaceBinned] = useState(true); // default ON (spec)
  const [busy, setBusy] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bank/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setPapers(data.papers || []);
      if (typeof data.costPerQuestion === "number") setCostPerQuestion(data.costPerQuestion);
    } catch {
      /* transient — next poll retries */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      if (alive) await fetchStatus();
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [fetchStatus]);

  const totalPending = papers.reduce((sum, p) => sum + p.pending, 0);
  const current = papers.find((p) => p.paper === selectedPaper);
  const running = current?.running || null;
  const estCost = (count * costPerQuestion).toFixed(2);

  // ── Row B: load the drafts for the newest reviewable batch (or a deep-linked one) ───────────────
  const loadReviewBatch = useCallback(async (batchId: string) => {
    try {
      const res = await fetch(`/api/admin/bank/batch/${batchId}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setBatch(data.batch);
      setDrafts(data.questions || []);
      setReplaceBinned(!!data.batch?.replaceRejected);
    } catch {
      /* transient */
    }
  }, []);

  const openReview = useCallback(async () => {
    setReviewOpen(true);
    let batchId = reviewBatchId;
    if (!batchId) {
      try {
        const res = await fetch("/api/admin/bank/notifications", { cache: "no-store" });
        const data = await res.json();
        batchId = (data.batches || [])[0]?.batchId ?? null;
      } catch {
        /* ignore */
      }
      if (batchId) setReviewBatchId(batchId);
    }
    if (batchId) await loadReviewBatch(batchId);
  }, [reviewBatchId, loadReviewBatch]);

  // Load drafts for a deep-linked batch on mount (the Review row is already open from initial state).
  useEffect(() => {
    let alive = true;
    const deep = initialReviewBatch();
    if (deep) {
      (async () => {
        if (alive) await loadReviewBatch(deep);
      })();
    }
    return () => {
      alive = false;
    };
  }, [loadReviewBatch]);

  // Keep the open review batch fresh while it's still generating.
  useEffect(() => {
    if (!reviewOpen || !reviewBatchId || batch?.status !== "running") return;
    let alive = true;
    const id = reviewBatchId;
    const interval = setInterval(() => {
      if (alive) loadReviewBatch(id);
    }, 3000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [reviewOpen, reviewBatchId, batch?.status, loadReviewBatch]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bank/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Row B's "Replace anything I bin" defaults ON, so the batch is created with it on.
        body: JSON.stringify({ paper: selectedPaper, count, replaceRejected: replaceBinned }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't start generation");
      } else {
        await fetchStatus();
      }
    } catch {
      setError("Network error");
    } finally {
      setGenerating(false);
    }
  };

  const review = async (questionId: string, decision: "keep" | "bin") => {
    setBusy(true);
    setDrafts((prev) =>
      prev.map((q) =>
        q.questionId === questionId
          ? { ...q, status: decision === "keep" ? "approved" : "rejected" }
          : q
      )
    );
    try {
      await fetch("/api/admin/bank/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, decision, batchId: reviewBatchId }),
      });
      if (reviewBatchId) await loadReviewBatch(reviewBatchId);
      await fetchStatus();
    } finally {
      setBusy(false);
    }
  };

  const keepAll = async () => {
    if (!reviewBatchId) return;
    setBusy(true);
    setDrafts((prev) => prev.map((q) => (q.status === "pending" ? { ...q, status: "approved" } : q)));
    try {
      await fetch("/api/admin/bank/keep-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: reviewBatchId }),
      });
      await loadReviewBatch(reviewBatchId);
      await fetchStatus();
    } finally {
      setBusy(false);
    }
  };

  const toggleReplace = async () => {
    if (!reviewBatchId) return;
    const next = !replaceBinned;
    setReplaceBinned(next);
    await fetch("/api/admin/bank/set-replace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: reviewBatchId, replaceRejected: next }),
    });
  };

  const pending = drafts.filter((q) => q.status === "pending");
  const kept = drafts.filter((q) => q.status === "approved");
  const binned = drafts.filter((q) => q.status === "rejected");
  const reviewedCount = kept.length + binned.length;
  const total = drafts.length;
  const card = pending[0] || null;
  const reviewedAll =
    batch != null && batch.status !== "running" && pending.length === 0 && total > 0;

  return (
    <div>
      {/* Row header — Fraunces title + build stamp, so staleness is self-evident. */}
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="font-display text-lg text-foreground">Fill the Bank</h3>
        <span className="text-[11px] text-muted tabular-nums">build {BUILD_STAMP}</span>
      </div>
      <p className="text-xs text-muted mb-3 max-w-xl">
        Generate a fresh batch of practice questions, then keep or bin each one before it reaches
        candidates.
      </p>

      {/* Per-paper banked readout: "Paper 1 · 38 banked · Paper 2 · 24 · Paper 3 · 11" */}
      <p className="text-xs text-foreground/80 tabular-nums mb-4">
        {[1, 2, 3].map((p, i) => {
          const s = papers.find((x) => x.paper === p);
          return (
            <span key={p}>
              {i > 0 && <span className="text-muted"> · </span>}
              <span className="text-muted">{PAPER_LABEL[p]} · </span>
              {s?.approved ?? 0}
              {i === 0 ? <span className="text-muted"> banked</span> : null}
            </span>
          );
        })}
      </p>

      {/* ── Row A: configure + generate ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Segmented P1/P2/P3 paper selector (spec) — one amber-active pill per paper. */}
        <div className="inline-flex rounded-lg border border-border overflow-hidden" role="group" aria-label="Paper">
          {[1, 2, 3].map((p) => {
            const active = selectedPaper === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setSelectedPaper(p)}
                disabled={!!running}
                aria-pressed={active}
                title={PAPER_OPTION[p]}
                className={`text-sm px-3.5 py-2 font-medium transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50 border-l border-border first:border-l-0 ${
                  active
                    ? "bg-accent text-background"
                    : "bg-card text-muted hover:text-foreground hover:bg-card-hover"
                }`}
              >
                P{p}
              </button>
            );
          })}
        </div>

        <input
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => {
            const n = Math.round(Number(e.target.value));
            if (Number.isFinite(n)) setCount(Math.max(1, Math.min(50, n)));
          }}
          disabled={!!running}
          className="text-sm w-20 px-3 py-2 bg-card border border-border rounded-lg text-foreground tabular-nums focus:outline-none focus:border-accent disabled:opacity-50"
          aria-label="How many"
        />

        {running ? (
          <button
            disabled
            className="text-sm px-5 py-2 rounded-lg bg-accent/60 text-background font-medium cursor-default"
          >
            Writing {running.requested} for {PAPER_LABEL[selectedPaper]} ·{" "}
            <span className="tabular-nums">{running.generated + running.failed} done</span>
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {generating ? "Starting…" : "Generate"}
          </button>
        )}
      </div>

      {/* Thin amber progress bar while a batch runs for the selected paper */}
      {running && (
        <div className="mt-3 h-1 rounded-full bg-border overflow-hidden max-w-md">
          <div
            className="h-full bg-accent transition-all"
            style={{
              width: `${Math.min(
                100,
                Math.round(
                  ((running.generated + running.failed) / Math.max(1, running.requested)) * 100
                )
              )}%`,
            }}
          />
        </div>
      )}

      {/* Muted est-cost + build stamp line */}
      <p className="text-xs text-muted mt-3">
        Estimated cost <span className="text-foreground tabular-nums">${estCost}</span> ({count} ×{" "}
        <span className="tabular-nums">${costPerQuestion.toFixed(2)}</span>/question) · build{" "}
        <span className="tabular-nums">{BUILD_STAMP}</span>
      </p>

      {error && <p className="text-xs text-fail mt-2">{error}</p>}

      {/* ── Row B: Review — only when unreviewed drafts exist ───────────────────────────────────── */}
      {(totalPending > 0 || (reviewOpen && total > 0)) && (
        <div className="mt-5 pt-5 border-t border-border">
          <button
            onClick={() => (reviewOpen ? setReviewOpen(false) : openReview())}
            className="flex items-center gap-2 text-sm text-foreground hover:text-accent transition-colors cursor-pointer"
          >
            <svg
              className={`w-4 h-4 text-accent transition-transform ${reviewOpen ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {totalPending > 0 && (
              <span className="w-2 h-2 rounded-full bg-accent shrink-0" aria-hidden />
            )}
            <span className="font-medium">Review</span>
            <span className="text-muted">
              {totalPending > 0 ? `${totalPending} waiting for review` : "review batch"}
            </span>
          </button>

          {reviewOpen && (
            <div className="mt-4">
              {reviewedAll ? (
                /* Empty state after review */
                <div className="rounded-xl border border-success/30 bg-success/5 p-5 text-center">
                  <p className="text-sm text-foreground">
                    All reviewed ·{" "}
                    <span className="text-success font-medium">{kept.length} added to the bank</span>
                    {binned.length > 0 && (
                      <span className="text-muted"> · {binned.length} binned</span>
                    )}
                  </p>
                </div>
              ) : card ? (
                <div className="rounded-xl border border-border bg-card p-5">
                  {/* Progress + paper + family label */}
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-accent/15 text-accent">
                        {PAPER_LABEL[card.paper]}
                      </span>
                      <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-card-hover text-muted border border-border">
                        {card.familyLabel}
                      </span>
                    </div>
                    <span className="text-xs text-muted tabular-nums">
                      Question {Math.min(reviewedCount + 1, total)} of {total}
                    </span>
                  </div>

                  {/* Stem verbatim, exactly as a candidate sees it */}
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                    {card.questionText}
                  </p>

                  {/* Mark breakdown */}
                  <p className="text-xs text-muted mt-3 tabular-nums">
                    {card.wines.length} wine{card.wines.length === 1 ? "" : "s"} · {card.totalMarks}{" "}
                    marks · 25 per wine
                  </p>

                  {/* Bordered wine list — variety / region / country / vintage / price band per wine
                      as served to the candidate (the wine's full text + appearance) */}
                  <ul className="mt-3 rounded-lg border border-border divide-y divide-border/60 overflow-hidden">
                    {card.wines.map((w) => (
                      <li key={w.slot} className="px-3 py-2 text-sm text-foreground/90 leading-relaxed">
                        <span className="text-muted tabular-nums mr-2">{w.slot}.</span>
                        {w.fullText}
                        {w.appearance && (
                          <span className="block text-xs text-muted ml-6 mt-0.5">{w.appearance}</span>
                        )}
                      </li>
                    ))}
                  </ul>

                  {/* Footer: Keep / Bin / Keep all / Replace anything I bin */}
                  <div className="flex flex-wrap items-center gap-3 mt-5">
                    <button
                      onClick={() => review(card.questionId, "keep")}
                      disabled={busy}
                      className="text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Keep
                    </button>
                    <button
                      onClick={() => review(card.questionId, "bin")}
                      disabled={busy}
                      className="text-sm px-4 py-2 rounded-lg border border-border text-muted hover:text-foreground hover:border-muted transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Bin
                    </button>
                    <button
                      onClick={keepAll}
                      disabled={busy || pending.length === 0}
                      className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-40"
                    >
                      Keep all ({pending.length})
                    </button>
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer ml-auto">
                      <input
                        type="checkbox"
                        checked={replaceBinned}
                        onChange={toggleReplace}
                        className="rounded accent-accent"
                      />
                      Replace anything I bin
                    </label>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted">Writing your first questions…</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
