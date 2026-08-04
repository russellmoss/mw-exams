"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BinUndoBar } from "./BinUndoBar";
import { BinReasonPanel } from "./BinReasonPanel";
import { RecentBatchesStrip } from "./RecentBatchesStrip";
import { BankReviewBadge } from "./BankReviewBadge";

// Read the NotificationBell deep-link (/admin?review=<batchId>) at first render so the review pane
// auto-expands at the batch's first pending question without a synchronous setState inside an effect.
function initialReviewBatch(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("review");
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// "Fill the Bank" — rendered as a SECTION INSIDE the Auto-Apply settings card on /admin (never a
// standalone card or its own page). Admin-only bulk question generation with a human review gate.
//
//   RESTING  — per-paper banked stat pairs, a paper <select>, a count input, a live muted cost range,
//              and the amber Generate button. A quiet amber link "N waiting for review" sits at the
//              row end when a batch is waiting.
//   RUNNING  — controls collapse to "Writing N of M… you can close this tab." + a thin amber bar.
//   REVIEW   — the section expands into a review pane: one question at a time, Keep / Bin / Keep all.
//              Bin is immediate and permanent (the row is hard-deleted server-side). When the queue
//              empties the pane collapses back to the resting row with a brief "Batch reviewed · N
//              kept" line.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const PAPER_LABEL: Record<number, string> = { 1: "Paper 1", 2: "Paper 2", 3: "Paper 3" };
const PAPER_OPTION: Record<number, string> = {
  1: "Paper 1 · Whites",
  2: "Paper 2 · Reds",
  3: "Paper 3 · Special",
};

interface Running {
  batchId: string;
  generatedCount: number;
  requestedCount: number;
  skipped: number;
}
interface Stalled {
  batchId: string;
  keptForReview: number;
}
interface Done {
  batchId: string;
  written: number;
  requested: number;
  skipped: number;
  pending: number;
  cancelled: boolean;
}
interface PaperStatus {
  paper: number;
  descriptor: string;
  keptCount: number;
  pendingCount: number;
  running: Running | null;
  stalled: Stalled | null;
  done: Done | null;
  reviewBatchId: string | null;
  // "Learned from your bins" — top bin-reason tag for this paper over the last 30 days; null = none.
  learnedFrom: { label: string; count: number } | null;
}
interface ReviewWine {
  slot: number;
  text: string;
  variety: string | null;
  region: string | null;
  country: string | null;
  vintage: string | null;
  priceBand: string | null;
}
// Producer Spread review flag — one per over-used producer in the flight (spec §3).
interface ProducerFlag {
  producer_display: string;
  appearance_number: number;
  paper: number;
}
interface ReviewQuestion {
  id: string;
  paper: number;
  family: string;
  familyLabel: string;
  difficulty: string | null;
  stem: string;
  markBreakdown: { label: string; marks: number }[];
  total: number;
  wines: ReviewWine[];
  producerFlags: ProducerFlag[];
}
interface Violation {
  rule: string;
  severity: "hard" | "soft";
  detail: string;
}
// The hard-validator verdict for the question on screen. null = no answer key yet, so no verdict can
// be computed — shown as "not available" rather than passed off as a clean bill of health.
interface Verdict {
  ok: boolean;
  hard: Violation[];
  soft: Violation[];
}
// A pending question plus its own hard-validator verdict — the review card renders one at a time from
// a LOCAL queue so Bin/Keep advance optimistically without a per-card server round-trip.
interface ReviewCard extends ReviewQuestion {
  verdict: Verdict | null;
}
interface ReviewData {
  batchId: string;
  paper: number;
  replaceBinned: boolean;
  status: string;
  keptCount: number;
  remaining: number;
  position: { n: number; total: number };
  question: ReviewQuestion | null;
  verdict: Verdict | null;
  // How many of the still-pending questions fail hard validation — "Keep all" accepts them too.
  failingRemaining: number;
  // Full pending queue (each with verdict) — drives optimistic local navigation.
  questions: ReviewCard[];
}

// Live cost range: per-question average × count, widened ±35%, rounded to whole dollars.
function costRange(count: number, perQuestion: number): string {
  const mid = count * perQuestion;
  const min = Math.max(0, Math.floor(mid * 0.65));
  const max = Math.max(min, Math.ceil(mid * 1.35));
  return min === max ? `roughly $${max}` : `roughly $${min}–${max}`;
}

// "1st / 2nd / 3rd / 4th …" for the producer-flag chip's appearance number.
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// Small inline spinner for an in-flight review button — amber ring on a transparent track.
function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 rounded-full border-2 border-transparent border-t-current animate-spin"
    />
  );
}

export function FillTheBankRows() {
  const [papers, setPapers] = useState<PaperStatus[]>([]);
  const [costPerQuestion, setCostPerQuestion] = useState(0.35);
  const [selectedPaper, setSelectedPaper] = useState(1);
  const [count, setCount] = useState(10);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [reviewBatchId, setReviewBatchId] = useState<string | null>(() => initialReviewBatch());
  const [reviewOpen, setReviewOpen] = useState(() => !!initialReviewBatch());
  // Batch-level metadata (status, kept count, replace flag, failing-remaining). The per-card queue is
  // held separately so a bin/keep can advance instantly and locally.
  const [review, setReview] = useState<ReviewData | null>(null);
  // LOCAL review queue + cursor. Binning splices the current card out and pushes it onto undoStack.
  const [queue, setQueue] = useState<ReviewCard[]>([]);
  const [cursor, setCursor] = useState(0);
  const seenIds = useRef<Set<string>>(new Set());
  const decidedAny = useRef(false);
  // Keep-all is the only remaining blocking action, so it keeps a spinner + shared disable.
  const [inFlight, setInFlight] = useState<null | "keepAll">(null);
  const busy = inFlight !== null;
  // Inline error beneath the card when Keep / Keep-all fails. Cleared on the next action.
  const [actionError, setActionError] = useState<string | null>(null);
  // Bin failed → the card is restored and this renders an inline "Couldn't bin — retry" row in place
  // of the Keep/Bin buttons, with a Retry that re-fires the same request.
  const [binError, setBinError] = useState<{ card: ReviewCard; index: number } | null>(null);
  // Brief "Batch reviewed · N kept" line shown after the queue empties.
  const [summary, setSummary] = useState<{ kept: number } | null>(null);

  // ── UNDO STACK (spec §2) ── binned items awaiting the 5s window, each with its original index.
  const [undoStack, setUndoStack] = useState<{ card: ReviewCard; index: number }[]>([]);
  // Bumped on every new bin — restarts the countdown + drain animation inside BinUndoBar.
  const [resetToken, setResetToken] = useState(0);
  // "Bin with reason" modal target (spec §3) — the card whose fault is being captured before it's
  // binned. null = panel closed. Reason capture happens up-front here rather than in the undo bar.
  const [reasonPanel, setReasonPanel] = useState<{ card: ReviewCard; index: number } | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/fill-bank/status", { cache: "no-store" });
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

  // Load a batch's review payload. On a fresh open (merge=false) the local queue is (re)seeded from the
  // server; while the batch is still generating we MERGE — appending only questions we haven't seen —
  // so a background poll can't reset the cursor or drop items sitting on the undo stack.
  const loadReview = useCallback(async (batchId: string, merge = false) => {
    try {
      // Producer-flag deep-link (?review=flagged:producer) opens the cross-batch flagged queue instead
      // of a single batch. Keep/Bin still act per-item, so the rest of the flow is unchanged.
      const query = batchId.startsWith("flagged:")
        ? "flagged=producer"
        : `batch=${encodeURIComponent(batchId)}`;
      const res = await fetch(`/api/admin/fill-bank/review?${query}`, {
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data: ReviewData = await res.json();
      setReview(data);
      const incoming = data.questions || [];
      if (merge) {
        setQueue((prev) => {
          const add = incoming.filter((c) => !seenIds.current.has(c.id));
          add.forEach((c) => seenIds.current.add(c.id));
          return add.length ? [...prev, ...add] : prev;
        });
      } else {
        seenIds.current = new Set(incoming.map((c) => c.id));
        setQueue(incoming);
        setCursor(0);
      }
      return data;
    } catch {
      return null;
    }
  }, []);

  // Load the deep-linked batch on mount (the pane is already open from initial state).
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
    const deep = initialReviewBatch();
    if (!deep) return;
    let alive = true;
    (async () => {
      if (alive) await loadReview(deep);
    })();
    return () => {
      alive = false;
    };
  }, [loadReview]);

  // Keep the open review pane fresh while its batch is still generating.
  useEffect(() => {
    if (!reviewOpen || !reviewBatchId || review?.status !== "running") return;
    const id = reviewBatchId;
    const interval = setInterval(() => loadReview(id, true), 3000);
    return () => clearInterval(interval);
  }, [reviewOpen, reviewBatchId, review?.status, loadReview]);

  const totalPending = papers.reduce((s, p) => s + p.pendingCount, 0);
  const current = papers.find((p) => p.paper === selectedPaper);
  const running = current?.running || null;
  const stalled = current?.stalled || null;
  const done = current?.done || null;
  // Batch to review = the selected paper's, else any paper with pending work.
  const pendingPaper = current?.pendingCount ? current : papers.find((p) => p.pendingCount > 0);
  const nextReviewBatchId = reviewBatchId || pendingPaper?.reviewBatchId || null;

  // Dismiss the undo cluster (on undo, on expiry, or when the pane closes).
  const clearUndo = useCallback(() => {
    setUndoStack([]);
  }, []);

  // Plain function (not useCallback): it is only ever an onClick target, so it needs no stable
  // identity, and the React Compiler memoizes it automatically.
  const openReview = async () => {
    setSummary(null);
    setActionError(null);
    setBinError(null);
    clearUndo();
    decidedAny.current = false;
    setReviewOpen(true);
    const id = nextReviewBatchId;
    if (id) {
      setReviewBatchId(id);
      await loadReview(id);
    }
  };

  const startGeneration = useCallback(
    async (paper: number, howMany: number) => {
      setGenerating(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/fill-bank", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paper, count: howMany, replaceBinned: true }),
        });
        const data = await res.json();
        if (!res.ok) setError(data.error || "Couldn't start generation");
        else await fetchStatus();
      } catch {
        setError("Network error");
      } finally {
        setGenerating(false);
      }
    },
    [fetchStatus]
  );

  const handleGenerate = () => startGeneration(selectedPaper, count);

  // "Write N more" — top up a done batch's skipped items for that paper.
  const writeMore = (paper: number, n: number) => startGeneration(paper, Math.max(1, n));

  // Cancel the running batch. Keeps everything generated so far.
  const handleCancel = useCallback(
    async (batchId: string) => {
      try {
        await fetch("/api/admin/fill-bank/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchId }),
        });
        await fetchStatus();
      } catch {
        /* transient — the next poll reflects the cancel */
      }
    },
    [fetchStatus]
  );

  // Reverse a bin server-side (best-effort — the local restore already happened).
  const fireUnbin = useCallback(
    async (card: ReviewCard) => {
      try {
        const res = await fetch(`/api/admin/bank/item/${encodeURIComponent(card.id)}/bin`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchStatus();
      } catch (err) {
        console.error(`[fill-bank] undo (unbin) failed for ${card.id}:`, err);
      }
    },
    [fetchStatus]
  );

  // Undo EVERY item on the stack, in original queue order; restore the queue, navigate to the first
  // restored item, reverse each bin server-side, and dismiss the bar.
  const handleUndo = useCallback(() => {
    const items = [...undoStack].sort((a, b) => a.index - b.index);
    if (items.length === 0) {
      clearUndo();
      return;
    }
    setQueue((q) => {
      const copy = q.slice();
      for (const it of items) copy.splice(Math.min(it.index, copy.length), 0, it.card);
      return copy;
    });
    setCursor(Math.max(0, items[0].index));
    items.forEach((it) => void fireUnbin(it.card));
    clearUndo();
  }, [undoStack, clearUndo, fireUnbin]);

  // Window expired: the bins stand (already persisted). Flush the stack and fade the bar away.
  const handleExpire = useCallback(() => {
    clearUndo();
  }, [clearUndo]);

  // Reinsert a card the server refused to bin, back at its original index, and surface the retry row.
  const revertBin = useCallback((card: ReviewCard, index: number) => {
    setUndoStack((s) => s.filter((x) => x.card.id !== card.id));
    setQueue((q) => {
      const copy = q.slice();
      copy.splice(Math.min(index, copy.length), 0, card);
      return copy;
    });
    setCursor(index);
    setBinError({ card, index });
  }, []);

  // Fire the bin request in the background. The visible copy on failure stays "Couldn't bin — retry";
  // the real server message/status is logged for diagnosis. An optional reason (captured up-front in
  // the BinReasonPanel) rides in the POST body so it's attached to the bin the moment it lands.
  const fireBin = useCallback(
    async (card: ReviewCard, index: number, reason?: { tags: string[]; note: string | null }) => {
      try {
        const res = await fetch(`/api/admin/bank/item/${encodeURIComponent(card.id)}/bin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            reason ? { reasonTags: reason.tags, reasonNote: reason.note } : {}
          ),
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          throw new Error(`HTTP ${res.status} ${detail}`.trim());
        }
        await fetchStatus();
      } catch (err) {
        console.error(`[fill-bank] bin failed for ${card.id}:`, err);
        revertBin(card, index);
      }
    },
    [fetchStatus, revertBin]
  );

  // BIN — optimistic. Splice the card out, advance, push it onto the undo stack, reset the 5s timer,
  // and fire in the background. An optional reason (from "Bin with reason") is attached to the bin.
  const binCard = (card: ReviewCard, index: number, reason?: { tags: string[]; note: string | null }) => {
    decidedAny.current = true;
    setBinError(null);
    setQueue((q) => q.filter((_, i) => i !== index));
    setCursor((c) => (index < c ? c - 1 : c));
    setUndoStack((s) => [...s, { card, index }]);
    setResetToken((t) => t + 1);
    void fireBin(card, index, reason);
  };
  const binCurrent = () => {
    const idx = Math.min(cursor, queue.length - 1);
    const card = queue[idx];
    if (card) binCard(card, idx);
  };

  // "Bin with reason" — open the modal for the current card; confirming bins it WITH the reason.
  const openReasonPanel = () => {
    const idx = Math.min(cursor, queue.length - 1);
    const card = queue[idx];
    if (card) setReasonPanel({ card, index: idx });
  };
  const confirmReasonBin = (tags: string[], note: string | null) => {
    const target = reasonPanel;
    setReasonPanel(null);
    if (target) binCard(target.card, target.index, { tags, note });
  };

  // KEEP — optimistic single-card. On failure the card is restored with an inline message.
  const keepCurrent = () => {
    const index = Math.min(cursor, queue.length - 1);
    const card = queue[index];
    if (!card || !review) return;
    decidedAny.current = true;
    setActionError(null);
    setQueue((q) => q.filter((_, i) => i !== index));
    setReview((r) => (r ? { ...r, keptCount: r.keptCount + 1 } : r));
    (async () => {
      try {
        const res = await fetch("/api/admin/fill-bank/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: card.id, action: "keep" }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchStatus();
      } catch (err) {
        console.error(`[fill-bank] keep failed for ${card.id}:`, err);
        setReview((r) => (r ? { ...r, keptCount: Math.max(0, r.keptCount - 1) } : r));
        setQueue((q) => {
          const copy = q.slice();
          copy.splice(Math.min(index, copy.length), 0, card);
          return copy;
        });
        setCursor(index);
        setActionError("Couldn't keep this one — try again.");
      }
    })();
  };

  // KEEP ALL — bulk, blocking; reconciles by reloading the batch.
  const keepAll = async () => {
    if (!review) return;
    decidedAny.current = true;
    setInFlight("keepAll");
    setActionError(null);
    try {
      const res = await fetch("/api/admin/fill-bank/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: review.batchId, action: "keepAll" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      clearUndo();
      const next = await loadReview(review.batchId);
      await fetchStatus();
      if (next && (next.questions || []).length === 0 && next.status !== "running") {
        setSummary({ kept: next.keptCount });
        setReviewOpen(false);
        setReviewBatchId(null);
      }
    } catch {
      setActionError("Couldn't keep these — try again.");
    } finally {
      setInFlight(null);
    }
  };

  // Queue emptied, nothing left on the undo stack, nothing still generating → collapse with a summary.
  useEffect(() => {
    if (!reviewOpen || !review) return;
    if (
      queue.length === 0 &&
      undoStack.length === 0 &&
      review.status !== "running" &&
      decidedAny.current
    ) {
      setSummary({ kept: review.keptCount });
      setReviewOpen(false);
      setReviewBatchId(null);
      decidedAny.current = false;
    }
  }, [queue.length, undoStack.length, review, reviewOpen]);

  const toggleReplace = async () => {
    if (!review) return;
    const nextVal = !review.replaceBinned;
    setReview({ ...review, replaceBinned: nextVal });
    await fetch("/api/admin/bank/set-replace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId: review.batchId, replaceRejected: nextVal }),
    });
  };

  const safeCursor = queue.length === 0 ? 0 : Math.min(cursor, queue.length - 1);
  const q = queue[safeCursor] || null;
  const total = review ? review.keptCount + queue.length : queue.length;
  const positionN = review ? review.keptCount + safeCursor + 1 : safeCursor + 1;

  return (
    <div>
      {/* Section label — Geist, small-caps label weight (NOT a serif heading; the card title stays).
          Bank Health now renders as its own inline section below this card, so no cross-link here. */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
          Fill the Bank
        </h3>
      </div>

      {/* ── RECENT BATCHES (Batch Undo) ── bordered strip at the top of the review area. Lets an admin
          reverse a bulk auto-keep, returning never-reviewed items to the queue. On reopen we refetch
          per-paper status and (if open) the current review queue. */}
      <div className="mb-5">
        <RecentBatchesStrip
          onReopened={() => {
            void fetchStatus();
            if (reviewBatchId) void loadReview(reviewBatchId);
          }}
        />
      </div>

      {/* ── RESTING ROW ─────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* Compact per-paper stat pairs */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
          {[1, 2, 3].map((p) => {
            const s = papers.find((x) => x.paper === p);
            return (
              <span key={p} className="text-foreground/80">
                <span className="text-muted">{PAPER_LABEL[p]} · </span>
                {s?.keptCount ?? 0}
                <span className="text-muted"> banked</span>
              </span>
            );
          })}
        </div>

        <div className="flex-1" />

        {running ? (
          /* ── RUNNING STATE ── controls collapse to a progress line + thin amber bar + Cancel */
          <div className="w-full">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm text-foreground">
                Writing {running.requestedCount} for {PAPER_LABEL[selectedPaper]} ·{" "}
                <span className="tabular-nums">
                  {Math.min(running.generatedCount + 1, running.requestedCount)}
                </span>{" "}
                of <span className="tabular-nums">{running.requestedCount}</span>
              </p>
              <div className="flex items-center gap-4">
                {current!.pendingCount > 0 && !reviewOpen && (
                  <button
                    onClick={openReview}
                    className="text-sm text-accent underline underline-offset-2 hover:text-accent-hover transition-colors cursor-pointer"
                  >
                    {current!.pendingCount} ready to review
                  </button>
                )}
                {/* Cancel is always visible on the running row (plain text, spec §2). */}
                <button
                  onClick={() => handleCancel(running.batchId)}
                  className="text-sm text-muted hover:text-foreground underline underline-offset-2 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
            <div className="mt-2 h-1 rounded-full bg-border overflow-hidden max-w-md">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((running.generatedCount / Math.max(1, running.requestedCount)) * 100)
                  )}%`,
                }}
              />
            </div>
          </div>
        ) : (
          /* ── RESTING CONTROLS ── */
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={selectedPaper}
              onChange={(e) => setSelectedPaper(Number(e.target.value))}
              className="text-sm px-3 py-2 bg-card border border-border rounded-lg text-foreground focus:outline-none focus:border-accent cursor-pointer"
              aria-label="Paper"
            >
              {[1, 2, 3].map((p) => (
                <option key={p} value={p}>
                  {PAPER_OPTION[p]}
                </option>
              ))}
            </select>

            <input
              type="number"
              min={1}
              value={count}
              onChange={(e) => {
                const n = Math.round(Number(e.target.value));
                if (Number.isFinite(n)) setCount(Math.max(1, n));
              }}
              className="text-sm w-20 px-3 py-2 bg-card border border-border rounded-lg text-foreground tabular-nums focus:outline-none focus:border-accent"
              aria-label="How many questions"
            />

            <span className="text-xs text-muted tabular-nums">{costRange(count, costPerQuestion)}</span>

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {generating ? "Starting…" : "Generate"}
            </button>

            {totalPending > 0 && !reviewOpen && (
              <button
                onClick={openReview}
                className="text-sm text-accent underline underline-offset-2 hover:text-accent-hover transition-colors cursor-pointer"
              >
                {totalPending} waiting for review
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── LEARNED-FROM LINE ── top bin reason for the selected paper over the last 30 days. Hidden
          when this paper has no tagged bins in the window. */}
      {current?.learnedFrom && (
        <p className="text-xs text-muted mt-3">
          Learned from your bins · Most common reason:{" "}
          {current.learnedFrom.label.toLowerCase()}{" "}
          <span className="tabular-nums">({current.learnedFrom.count})</span>
        </p>
      )}

      {/* ── STALLED / AUTO-RELEASED NOTE ── grey note; Generate above is re-enabled by the else branch */}
      {!running && stalled && (
        <p className="text-xs text-muted mt-3">
          Previous run stalled and was released
          {stalled.keptForReview > 0 && (
            <>
              {" · "}
              <span className="text-foreground tabular-nums">{stalled.keptForReview}</span> kept for review
            </>
          )}
        </p>
      )}

      {/* ── DONE STATE ── "9 of 10 written · 1 skipped", with Write N more + Review N */}
      {!running && !stalled && done && (
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <p className="text-xs text-muted">
            <span className="text-foreground tabular-nums">{done.written}</span> of{" "}
            <span className="tabular-nums">{done.requested}</span> written
            {done.skipped > 0 && (
              <>
                {" · "}
                <span className="text-foreground tabular-nums">{done.skipped}</span> skipped
              </>
            )}
            {done.cancelled && " · cancelled"}
          </p>
          {done.skipped > 0 && (
            <button
              onClick={() => writeMore(selectedPaper, done.skipped)}
              disabled={generating}
              className="text-xs px-3 py-1.5 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              {done.skipped === 1 ? "Write 1 more" : `Write ${done.skipped} more`}
            </button>
          )}
          {done.pending > 0 && !reviewOpen && (
            <button
              onClick={openReview}
              className="text-xs text-accent underline underline-offset-2 hover:text-accent-hover transition-colors cursor-pointer"
            >
              Review {done.pending}
            </button>
          )}
        </div>
      )}

      {error && <p className="text-xs text-fail mt-2">{error}</p>}
      {summary && !reviewOpen && (
        <p className="text-xs text-muted mt-3">
          Batch reviewed · <span className="text-foreground tabular-nums">{summary.kept} kept</span>
        </p>
      )}

      {/* ── REVIEW PANE ─────────────────────────────────────────────────────────────────────────── */}
      {reviewOpen && (
        <div className="mt-5 pt-5 border-t border-border">
          {q ? (
            <div>
              {/* Header: "Question n of total" + paper / family / difficulty chips */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-sm font-medium text-foreground tabular-nums">
                  Question {positionN} of {total}
                </span>
                <div className="flex items-center gap-2">
                  {/* Every item in the review queue is by definition never-reviewed until decided. */}
                  <BankReviewBadge reviewed={false} />
                  <span className="text-[11px] px-2 py-0.5 rounded bg-card-hover text-muted border border-border">
                    {PAPER_LABEL[q.paper]}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-card-hover text-muted border border-border">
                    {q.familyLabel}
                  </span>
                  {q.difficulty && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-card-hover text-muted border border-border">
                      {q.difficulty}
                    </span>
                  )}
                </div>
              </div>

              {/* Validator verdict — sits ABOVE the stem because it should be read before the
                  question is, and it is the one thing here a reviewer cannot derive by eye. A hard
                  violation means the stem contradicts its own wines and the question is unanswerable
                  as framed; bin it. */}
              {q.verdict === null ? (
                <p className="text-xs text-muted mb-3">
                  Validator: no answer key yet — verdict unavailable for this question.
                </p>
              ) : q.verdict.hard.length > 0 ? (
                <div className="rounded-lg border border-fail bg-fail/10 p-3 mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-fail">
                    Fails validation · bin this
                  </p>
                  <ul className="mt-2 space-y-1">
                    {q.verdict.hard.map((v, i) => (
                      <li key={i} className="text-xs text-foreground leading-relaxed">
                        <span className="text-fail">{v.rule}</span> — {v.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : q.verdict.soft.length > 0 ? (
                <div className="rounded-lg border border-borderline/60 p-3 mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-borderline">
                    Worth a look
                  </p>
                  <ul className="mt-2 space-y-1">
                    {q.verdict.soft.map((v, i) => (
                      <li key={i} className="text-xs text-foreground leading-relaxed">
                        <span className="text-borderline">{v.rule}</span> — {v.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-success mb-3">Passes all hard validators.</p>
              )}

              {/* Stem — verbatim candidate-facing text in a bordered inset block */}
              <div className="rounded-lg border border-border bg-background/40 p-4">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{q.stem}</p>
              </div>

              {/* Mark breakdown — two-column list with a total row */}
              <div className="mt-4 max-w-sm">
                <ul className="text-sm">
                  {q.markBreakdown.map((m, i) => (
                    <li key={i} className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted">{m.label}</span>
                      <span className="text-foreground tabular-nums">{m.marks}</span>
                    </li>
                  ))}
                  <li className="flex justify-between py-1 font-medium">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground tabular-nums">{q.total}</span>
                  </li>
                </ul>
              </div>

              {/* Wines — compact bordered table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-card-hover text-muted text-left">
                      <th className="px-3 py-2 font-medium">Wine</th>
                      <th className="px-3 py-2 font-medium">Variety</th>
                      <th className="px-3 py-2 font-medium">Region</th>
                      <th className="px-3 py-2 font-medium">Country</th>
                      <th className="px-3 py-2 font-medium">Vintage</th>
                      <th className="px-3 py-2 font-medium">Price band</th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.wines.map((w) => (
                      <tr key={w.slot} className="border-t border-border/60 text-foreground/90 align-top">
                        <td className="px-3 py-2 tabular-nums">{w.slot}</td>
                        <td className="px-3 py-2">{w.variety || <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-2">{w.region || <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-2">{w.country || <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-2 tabular-nums">{w.vintage || <span className="text-muted">—</span>}</td>
                        <td className="px-3 py-2">{w.priceBand || <span className="text-muted">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* The verbatim wine descriptor, exactly as a candidate reads it. */}
                <ul className="mt-2 space-y-0.5">
                  {q.wines.map((w) => (
                    <li key={w.slot} className="text-xs text-muted leading-relaxed">
                      <span className="tabular-nums mr-1">{w.slot}.</span>
                      {w.text}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Producer Spread flags (spec §3) — one amber bordered chip per over-used producer,
                  stacked, sitting directly above the Keep/Bin controls. Admin-only heads-up; it never
                  blocks a keep. */}
              {q.producerFlags && q.producerFlags.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  {q.producerFlags.map((f, i) => (
                    <div
                      key={`${f.producer_display}-${i}`}
                      className="flex items-center gap-2 rounded-md border border-accent/60 bg-accent/10 px-3 py-1.5 text-xs text-accent"
                    >
                      <span className="font-medium">Over-used producer</span>
                      <span className="text-muted">·</span>
                      <span className="text-foreground">
                        {f.producer_display}, {ordinal(f.appearance_number)} appearance
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer: replace toggle left · Bin / Keep / Keep all right */}
              <div className="flex flex-wrap items-center gap-3 mt-5">
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer mr-auto">
                  <input
                    type="checkbox"
                    checked={review!.replaceBinned}
                    onChange={toggleReplace}
                    className="rounded accent-accent"
                  />
                  Replace anything I bin
                </label>
                {binError ? (
                  /* Bin failed → the card was restored; the retry row takes the Keep/Bin slot. The
                     visible copy is fixed at "Couldn't bin — retry"; the real error is in the console. */
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-fail">Couldn&apos;t bin — retry</span>
                    <button
                      onClick={() => {
                        setBinError(null);
                        binCurrent();
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg border border-border text-foreground hover:border-muted transition-colors cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <>
                    {/* Bin is a single, unconditional, optimistic action — no reason gating. */}
                    <button
                      onClick={binCurrent}
                      disabled={busy}
                      className="text-sm px-4 py-2 rounded-lg border border-border text-fail hover:border-fail transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Bin
                    </button>
                    {/* "Bin with reason" — opens the modal that captures the fault before binning. */}
                    <button
                      onClick={openReasonPanel}
                      disabled={busy}
                      className="text-sm px-4 py-2 rounded-lg border border-border text-fail hover:border-fail transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Bin with reason
                    </button>
                    <button
                      onClick={keepCurrent}
                      disabled={busy}
                      className="text-sm px-4 py-2 rounded-lg border border-border text-foreground hover:border-muted transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Keep
                    </button>
                  </>
                )}
                <button
                  onClick={keepAll}
                  disabled={busy || queue.length === 0}
                  className="text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {inFlight === "keepAll" && <Spinner />}
                  Keep all
                </button>
              </div>

              {/* Inline failure text for Keep / Keep-all — verdict-FAIL red, beneath the card. */}
              {actionError && <p className="text-xs text-fail mt-3">{actionError}</p>}

              {/* "Keep all" accepts every remaining question, not just the one on screen — say how
                  many of those would fail validation so it isn't a blind bulk approve. */}
              {review!.failingRemaining > 0 && (
                <p className="text-xs text-fail mt-2 text-right">
                  {review!.failingRemaining} of the {review!.remaining} remaining{" "}
                  {review!.failingRemaining === 1 ? "fails" : "fail"} validation — “Keep all” would
                  accept {review!.failingRemaining === 1 ? "it" : "them"} too.
                </p>
              )}
            </div>
          ) : undoStack.length > 0 ? (
            /* Last card binned but the Undo window is still open — hold the pane until it resolves. */
            <p className="text-sm text-muted">Reviewing…</p>
          ) : review?.status === "running" ? (
            <p className="text-sm text-muted">Writing your first questions…</p>
          ) : (
            <p className="text-sm text-muted">Nothing waiting for review.</p>
          )}
        </div>
      )}

      {/* ── UNDO BAR (spec §2) ── fixed at the viewport bottom while binned items sit inside the 5s
          window. Reason capture happens up-front in the BinReasonPanel, so this bar is purely undo. */}
      {reviewOpen && undoStack.length > 0 && (
        <BinUndoBar
          count={undoStack.length}
          resetToken={resetToken}
          onUndo={handleUndo}
          onExpire={handleExpire}
        />
      )}

      {/* ── BIN WITH REASON (spec §3) ── modal over the card; confirm bins WITH the captured reason. */}
      {reasonPanel && (
        <BinReasonPanel
          summary={reasonSummary(reasonPanel.card)}
          onCancel={() => setReasonPanel(null)}
          onConfirm={confirmReasonBin}
        />
      )}
    </div>
  );
}

// One-line item summary for the BinReasonPanel subline: paper · wines · sub-question · marks.
function reasonSummary(card: ReviewCard): string {
  const wines = `${card.wines.length} ${card.wines.length === 1 ? "wine" : "wines"}`;
  return `Paper ${card.paper} · ${wines} · ${card.familyLabel} · ${card.total} marks`;
}
