"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BinUndoBar } from "./BinUndoBar";
import { BinReasonChips } from "./BinReasonChips";
import { RecentBatchesStrip } from "./RecentBatchesStrip";
import { BankReviewBadge, LengthCheckChip, AnswerLengthChip } from "./BankReviewBadge";

// Read the NotificationBell deep-link (/admin?review=<batchId>) at first render so the review pane
// auto-expands at the batch's first pending question without a synchronous setState inside an effect.
function initialReviewBatch(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("review");
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// "Bank Review" — rendered as a SECTION INSIDE the Auto-Apply settings card on /admin (never a
// standalone card or its own page). Admin-only human review gate over questions already in the bank.
//
// This WAS "Fill the Bank", which also generated questions in bulk. Every generation path was removed
// (2026-08-08): bulk runs were the largest line in the model bill by a wide margin, and the bank
// already holds far more questions than the pilot can work through, so the honest next step is to
// judge what exists rather than buy more of it. New questions now come only from "New question" in
// Study, one at a time, at a candidate's request. What is left here is the review half of the old
// feature: nothing in this section can spend money.
//
//   RESTING  — per-paper banked / awaiting-review stat pairs. A quiet amber link "N waiting for
//              review" sits at the row end when anything is queued.
//   REVIEW   — the section expands into a review pane: one question at a time. The per-card action row
//              is primary amber Keep, then plain Bin and Bin with reason (plus Keep all / Bin all for
//              bulk). "Bin" is immediate with empty reasons; "Bin with reason" expands an inline panel
//              (multi-select fault chips + optional note) confirmed with "Bin it". Every bin is
//              soft-deleted server-side so a 5s Undo bar can reverse it (restoring its reasons too).
//              When the queue empties the pane collapses back with a brief "Batch reviewed · N kept".
//
// The pane is also the queue for candidate-flagged questions (?review=flagged:candidate from the
// NotificationBell) and over-used-producer flags (?review=flagged:producer) — which is why it
// outlives the generator that it shipped alongside.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const PAPER_LABEL: Record<number, string> = { 1: "Paper 1", 2: "Paper 2", 3: "Paper 3" };

interface PaperStatus {
  paper: number;
  descriptor: string;
  keptCount: number;
  pendingCount: number;
  reviewBatchId: string | null;
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
// Length Check (feature) — the auto-repair audit + before/after diff stored on a reviewed question.
interface LengthBullet {
  index: number;
  marks: number;
  wordCount: number;
  askCount: number;
  violations: string[];
}
interface LengthChange {
  bulletIndex: number;
  before: string;
  after: string;
}
interface LengthCheck {
  totalWords: number;
  bullets: LengthBullet[];
  changes: LengthChange[];
  summary: string;
}
// Answer Length (migration 039) — the model answer's mark-proportional word budget. Mirrors
// StoredAnswerLength in lib/answer-length.ts.
interface AnswerLengthAttempt {
  attempt: number;
  wordCount: number;
  verdict: "ok" | "over" | "under";
}
interface AnswerLength {
  wordCount: number;
  totalMarks: number;
  target: number;
  min: number;
  max: number;
  wordsPerMark: number;
  attempts: AnswerLengthAttempt[];
  summary: string;
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
  // 'clean' | 'trimmed' | 'over' | null — NULL / 'clean' shows no chip.
  lengthCheckStatus: "clean" | "trimmed" | "over" | null;
  lengthCheck: LengthCheck | null;
  // Answer Length — the model ANSWER's verdict, independent of the stem's above.
  answerLengthStatus: "clean" | "corrected" | "over" | "under" | null;
  answerWordCount: number | null;
  answerLength: AnswerLength | null;
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

// "1st / 2nd / 3rd / 4th …" for the producer-flag chip's appearance number.
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

// A short human wine descriptor for the Undo bar ("Binned — Chablis 1er Cru, Burgundy, France").
// Prefers the verbatim descriptor of the flight's first wine; falls back to variety/region/country.
function cardLabel(card: ReviewCard | null): string | null {
  const w = card?.wines?.[0];
  if (!w) return null;
  const text = (w.text || "").trim();
  if (text) return text.length > 70 ? `${text.slice(0, 70)}…` : text;
  const parts = [w.variety, w.region, w.country].filter((p): p is string => !!p && p.trim().length > 0);
  return parts.length > 0 ? parts.join(", ") : null;
}

// Length Check (feature) — the inline expanding panel beneath the question text. Titled "Length
// check". For 'trimmed' it shows the one-line summary and, per changed bullet, a muted "Before" block
// (subtle red left border) and a normal "After" block (amber left border) with word / ask labels. For
// 'over' it lists the unresolved violations and the offending bullets with word / ask counts and NO
// after block. Collapses via the chip or the small "Close" text button. Keep / Bin are unaffected.
function LengthCheckPanel({
  status,
  data,
  onClose,
}: {
  status: "trimmed" | "over";
  data: LengthCheck | null;
  onClose: () => void;
}) {
  const bulletById = new Map<number, LengthBullet>();
  for (const b of data?.bullets ?? []) bulletById.set(b.index, b);
  const offenders = (data?.bullets ?? []).filter((b) => b.violations.length > 0);

  return (
    <div className="mt-3 rounded-lg border border-border bg-card-hover/40 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="font-display text-sm text-foreground">Length check</h4>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted hover:text-foreground underline underline-offset-2 transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>

      {/* One-line summary (both variants). */}
      {data?.summary && (
        <p className="text-xs text-foreground leading-relaxed mb-3">{data.summary}</p>
      )}

      {status === "trimmed" ? (
        // Per changed bullet: Before (muted, red left border) then After (normal, amber left border).
        <div className="space-y-3">
          {(data?.changes ?? []).map((c, i) => {
            const before = bulletById.get(c.bulletIndex);
            return (
              <div key={i} className="space-y-1.5">
                <div className="border-l-2 border-fail/50 pl-3">
                  <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">
                    Before
                    {before && (
                      <span className="ml-2 tabular-nums">
                        {before.wordCount} words · {before.askCount} ask
                        {before.askCount === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">{c.before}</p>
                </div>
                <div className="border-l-2 border-accent pl-3">
                  <div className="text-[10px] uppercase tracking-wide text-accent mb-0.5">After</div>
                  <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap">{c.after}</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // 'over' — unresolved violations + the offending bullets (word / ask counts), no after block.
        <div className="space-y-3">
          {offenders.map((b) => (
            <div key={b.index} className="border-l-2 border-fail/50 pl-3">
              <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">
                Bullet {b.index}
                <span className="ml-2 tabular-nums">
                  {b.marks} marks · {b.wordCount} words · {b.askCount} ask
                  {b.askCount === 1 ? "" : "s"}
                </span>
              </div>
              <ul className="space-y-0.5">
                {b.violations.map((v, i) => (
                  <li key={i} className="text-xs text-fail leading-relaxed">
                    {v}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Answer Length panel — the model ANSWER's word budget, opened by the "Answer …" chip.
//
// Deliberately NOT a diff panel like LengthCheckPanel above. The stem's repair edits a bullet, so a
// before/after is the useful view. The answer's repair rewrites prose the reviewer is about to read
// in full anyway; what they cannot see by reading it is whether it is on budget FOR ITS MARKS and how
// it got there. So this shows the measurement and the attempt trail instead.
function AnswerLengthPanel({
  status,
  data,
  wordCount,
  onClose,
}: {
  status: "corrected" | "over" | "under";
  data: AnswerLength | null;
  wordCount: number | null;
  onClose: () => void;
}) {
  const words = data?.wordCount ?? wordCount ?? 0;
  const attempts = data?.attempts ?? [];

  return (
    <div className="mt-3 rounded-lg border border-border bg-card-hover/40 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h4 className="font-display text-sm text-foreground">Answer length</h4>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-muted hover:text-foreground underline underline-offset-2 transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>

      {data?.summary && (
        <p className="text-xs text-foreground leading-relaxed mb-3">{data.summary}</p>
      )}

      {/* The measurement. Numbers are tabular so the four cells line up. */}
      {data && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2 mb-3">
          {[
            { k: "Measured", v: `${words}` },
            { k: "Target", v: `${data.target}` },
            { k: "Band", v: `${data.min}–${data.max}` },
            { k: "Per mark", v: `${data.wordsPerMark}` },
          ].map((cell) => (
            <div key={cell.k}>
              <dt className="text-[10px] uppercase tracking-wide text-muted">{cell.k}</dt>
              <dd
                className={`text-sm tabular-nums ${
                  cell.k === "Measured" && status !== "corrected" ? "text-fail" : "text-foreground"
                }`}
              >
                {cell.v}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {/* The attempt trail — what generation produced, then each rewrite. One row means the gate
          measured once and did not need to act. */}
      {attempts.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wide text-muted mb-1">
            Attempts ({attempts.length})
          </div>
          <ul className="space-y-0.5">
            {attempts.map((a) => (
              <li key={a.attempt} className="text-xs leading-relaxed flex items-baseline gap-2">
                <span className="text-muted tabular-nums w-14 shrink-0">
                  {a.attempt === 1 ? "generated" : `rewrite ${a.attempt - 1}`}
                </span>
                <span className="tabular-nums text-foreground">{a.wordCount}w</span>
                <span className={a.verdict === "ok" ? "text-success" : "text-fail"}>
                  {a.verdict === "ok" ? "in band" : a.verdict}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status !== "corrected" && (
        <p className="text-xs text-muted leading-relaxed mt-3">
          The rewrite passes did not bring this inside the band; the closest attempt was kept. The
          answer is still usable — this flags it for a read, not for binning.
        </p>
      )}
    </div>
  );
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

export function BankReviewSection() {
  const [papers, setPapers] = useState<PaperStatus[]>([]);

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
  // Bin GENUINELY failed → the card is restored in place, the count is unchanged, and this renders the
  // ACTUAL server error message (spec §4 — no generic "Bin failed" string) plus a Retry that re-fires
  // the same request.
  const [binError, setBinError] = useState<{ card: ReviewCard; index: number; message: string } | null>(
    null
  );
  // The card is mid grey-out + slide-out (spec §1b) — its wrapper animates and its buttons lock while
  // this holds the id of the exiting card. Cleared once the card is spliced out (or a fast failure
  // rolls it back).
  const [exitingId, setExitingId] = useState<string | null>(null);
  const exitTimerRef = useRef<number | null>(null);
  // Inline "Bin all N? · Confirm / Cancel" — single confirm before a bulk bin (spec §5).
  const [confirmBinAll, setConfirmBinAll] = useState(false);

  // Length Check (feature): which card's "Length check" panel is expanded (by question id), or null.
  // Only the card on screen ever shows a chip, so a single id is enough; toggled by the chip / Close.
  const [lengthPanelId, setLengthPanelId] = useState<string | null>(null);
  // Separate from lengthPanelId on purpose: the stem and answer verdicts are independent, and a
  // reviewer comparing "the stem was trimmed" against "the answer runs long" wants both open.
  const [answerLengthPanelId, setAnswerLengthPanelId] = useState<string | null>(null);
  // Brief "Batch reviewed · N kept" line shown after the queue empties.
  const [summary, setSummary] = useState<{ kept: number } | null>(null);
  // One-line amber notice atop the review list, shown only immediately after a "Send back to review"
  // action (client state, never persisted). Cleared when the review pane closes.
  const [sentBackNotice, setSentBackNotice] = useState<{ movedCount: number; label: string } | null>(null);

  // ── UNDO STACK ── binned items awaiting the 5s window, each with its original index and the
  // reasons/note it was binned with (so Undo restores the item AND its reasons — survive undo→re-bin).
  const [undoStack, setUndoStack] = useState<
    { card: ReviewCard; index: number; reasons: string[]; note: string | null }[]
  >([]);
  // Bumped on every new bin — restarts the countdown + drain animation inside BinUndoBar.
  const [resetToken, setResetToken] = useState(0);

  // ── BIN WITH REASON (spec §3) ── the inline panel state. `reasonPanelId` is the card id whose
  // reason panel is open (null = closed); `panelReasons`/`panelNote` are the in-progress selection.
  const [reasonPanelId, setReasonPanelId] = useState<string | null>(null);
  const [panelReasons, setPanelReasons] = useState<string[]>([]);
  const [panelNote, setPanelNote] = useState("");
  // Retain a card's reasons/note client-side keyed by id, so an Undo→re-open of "Bin with reason"
  // re-populates the panel with what it was last binned with (reasons must survive undo→re-bin).
  const reasonDraft = useRef<Map<string, { reasons: string[]; note: string | null }>>(new Map());
  // The reason panel container — focused on open so Esc-to-cancel works without tabbing in first.
  const reasonPanelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (reasonPanelId) reasonPanelRef.current?.focus();
  }, [reasonPanelId]);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bank/review-queue/status", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setPapers(data.papers || []);
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
      const res = await fetch(`/api/admin/bank/review-queue?${query}`, {
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
  // Batch to review = the first paper with pending work (there is no paper selector any more, since
  // nothing here targets a paper — the queue is worked in whatever order it arrived).
  const pendingPaper = papers.find((p) => p.pendingCount > 0);
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
    setConfirmBinAll(false);
    clearUndo();
    decidedAny.current = false;
    setReviewOpen(true);
    const id = nextReviewBatchId;
    if (id) {
      setReviewBatchId(id);
      await loadReview(id);
    }
  };

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
        console.error(`[bank-review]undo (unbin) failed for ${card.id}:`, err);
      }
    },
    [fetchStatus]
  );

  // Undo EVERY item on the stack, in original queue order; restore the queue, navigate to the first
  // restored item, reverse each bin server-side, and dismiss the bar.
  const handleUndo = useCallback(() => {
    // A card may still be mid-exit (timer pending, not yet spliced) — cancel it so the reinsertion
    // below doesn't duplicate it.
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setExitingId(null);
    const items = [...undoStack].sort((a, b) => a.index - b.index);
    if (items.length === 0) {
      clearUndo();
      return;
    }
    setQueue((q) => {
      const copy = q.slice();
      for (const it of items) {
        if (copy.some((c) => c.id === it.card.id)) continue; // still present (exit hadn't removed it)
        copy.splice(Math.min(it.index, copy.length), 0, it.card);
      }
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

  // Roll back a bin the server genuinely refused (spec §4): reinsert the card at its original index
  // (exactly once — it may not have been spliced out yet if the failure beat the exit animation),
  // leave the count unchanged, cancel any pending exit, and surface the ACTUAL server error + Retry.
  const revertBin = useCallback((card: ReviewCard, index: number, message: string) => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setExitingId(null);
    setUndoStack((s) => s.filter((x) => x.card.id !== card.id));
    setQueue((q) => {
      if (q.some((c) => c.id === card.id)) return q; // still present — the exit hadn't removed it
      const copy = q.slice();
      copy.splice(Math.min(index, copy.length), 0, card);
      return copy;
    });
    setCursor(index);
    setBinError({ card, index, message });
  }, []);

  // Fire the bin request in the background with its reason payload (spec §4) — { reasons, note }.
  // A plain "Bin" sends empty reasons + null note; "Bin with reason" sends the panel's selection. On a
  // genuine failure the real server error message is extracted and shown; the optimistic removal is
  // rolled back.
  const fireBin = useCallback(
    async (card: ReviewCard, index: number, reasons: string[], note: string | null) => {
      try {
        const res = await fetch(`/api/admin/bank/item/${encodeURIComponent(card.id)}/bin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reasons, note }),
        });
        if (!res.ok) {
          // Prefer a structured { error } message; fall back to raw text, then a bare status line.
          let message = `The server rejected the bin (HTTP ${res.status}).`;
          const detail = await res.text().catch(() => "");
          if (detail) {
            try {
              const parsed = JSON.parse(detail);
              if (parsed && typeof parsed.error === "string" && parsed.error.trim()) {
                message = parsed.error.trim();
              } else if (detail.trim()) {
                message = detail.trim();
              }
            } catch {
              message = detail.trim() || message;
            }
          }
          throw new Error(message);
        }
        await fetchStatus();
      } catch (err) {
        console.error(`[bank-review]bin failed for ${card.id}:`, err);
        revertBin(card, index, err instanceof Error ? err.message : "The bin request failed.");
      }
    },
    [fetchStatus, revertBin]
  );

  // BIN — a single, immediate, optimistic action (spec §2). Fire the bin at once with its reasons/note
  // and register the item on the undo stack, then grey-out + slide-out the card over ~220ms before
  // splicing it and advancing. The exit is timer-driven so the animation is visible; a fast failure
  // cancels it in revertBin.
  const binCard = (card: ReviewCard, index: number, reasons: string[] = [], note: string | null = null) => {
    decidedAny.current = true;
    setBinError(null);
    // Close the reason panel if it was open for this card, and retain the payload for undo→re-bin.
    if (reasonPanelId === card.id) setReasonPanelId(null);
    if (reasons.length > 0 || note) reasonDraft.current.set(card.id, { reasons, note });
    setExitingId(card.id);
    setUndoStack((s) => [...s, { card, index, reasons, note }]);
    setResetToken((t) => t + 1);
    void fireBin(card, index, reasons, note);
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      setQueue((qq) => qq.filter((c) => c.id !== card.id));
      setCursor((c) => (index < c ? c - 1 : c));
      setExitingId(null);
    }, 220);
  };
  // Plain "Bin" — immediate, empty reasons (spec §2).
  const binCurrent = () => {
    if (exitingId) return; // ignore taps mid-exit
    const idx = Math.min(cursor, queue.length - 1);
    const card = queue[idx];
    if (card) binCard(card, idx, [], null);
  };

  // "Bin with reason" (spec §3) — open the inline panel, pre-filled from any retained draft so an
  // Undo→re-open restores the prior selection.
  const openReasonPanel = (card: ReviewCard) => {
    if (exitingId) return;
    const draft = reasonDraft.current.get(card.id);
    setPanelReasons(draft?.reasons ?? []);
    setPanelNote(draft?.note ?? "");
    setReasonPanelId(card.id);
  };
  const closeReasonPanel = () => setReasonPanelId(null);
  const toggleReason = (value: string) =>
    setPanelReasons((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  // Confirm — bin the current card with the panel's selection (always allowed, even with zero chips).
  const confirmBinWithReason = () => {
    const idx = Math.min(cursor, queue.length - 1);
    const card = queue[idx];
    if (!card) return;
    const note = panelNote.trim();
    binCard(card, idx, panelReasons, note.length > 0 ? note : null);
  };

  // BIN ALL (spec §5) — bin every remaining pending item in one shot. Each is fired independently and
  // pushed onto the undo stack (so the same Undo bar reads "N binned · Undo" and restores them all).
  const binAll = () => {
    const items = queue.map((card, index) => ({ card, index, reasons: [] as string[], note: null }));
    if (items.length === 0) return;
    decidedAny.current = true;
    setConfirmBinAll(false);
    setReasonPanelId(null);
    setBinError(null);
    setExitingId(null);
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    setQueue([]);
    setCursor(0);
    setUndoStack((s) => [...s, ...items]);
    setResetToken((t) => t + 1);
    items.forEach((it) => void fireBin(it.card, it.index, [], null));
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
        const res = await fetch(`/api/admin/bank/item/${encodeURIComponent(card.id)}/keep`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        await fetchStatus();
      } catch (err) {
        console.error(`[bank-review]keep failed for ${card.id}:`, err);
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
      const res = await fetch("/api/admin/bank/review-queue", {
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
        setSentBackNotice(null);
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
      setSentBackNotice(null);
      decidedAny.current = false;
    }
  }, [queue.length, undoStack.length, review, reviewOpen]);

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
          Bank Review
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
          onSentBack={(info) => {
            setSentBackNotice(info);
            if (reviewOpen && reviewBatchId) void loadReview(reviewBatchId, true);
          }}
        />
      </div>

      {/* ── RESTING ROW ── per-paper counts + the opener. No controls: nothing here generates. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {/* Compact per-paper stat pairs — banked (servable) and, when non-zero, awaiting review. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums">
          {[1, 2, 3].map((p) => {
            const s = papers.find((x) => x.paper === p);
            return (
              <span key={p} className="text-foreground/80">
                <span className="text-muted">{PAPER_LABEL[p]} · </span>
                {s?.keptCount ?? 0}
                <span className="text-muted"> banked</span>
                {(s?.pendingCount ?? 0) > 0 && (
                  <>
                    <span className="text-muted"> · </span>
                    {s!.pendingCount}
                    <span className="text-muted"> to review</span>
                  </>
                )}
              </span>
            );
          })}
        </div>

        <div className="flex-1" />

        {totalPending > 0 && !reviewOpen && (
          <button
            onClick={openReview}
            className="text-sm text-accent underline underline-offset-2 hover:text-accent-hover transition-colors cursor-pointer"
          >
            {totalPending} waiting for review
          </button>
        )}
      </div>

      {/* Says plainly why there is no Generate button, so the next person to open /admin doesn't go
          looking for one or quietly rebuild it. */}
      <p className="text-xs text-muted mt-3 max-w-xl">
        Bulk generation was removed. New questions are written one at a time, on request, from “New
        question” in Study — this section only decides what stays in the bank.
      </p>

      {summary && !reviewOpen && (
        <p className="text-xs text-muted mt-3">
          Batch reviewed · <span className="text-foreground tabular-nums">{summary.kept} kept</span>
        </p>
      )}

      {/* ── REVIEW PANE ─────────────────────────────────────────────────────────────────────────── */}
      {reviewOpen && (
        <div className="mt-5 pt-5 border-t border-border">
          {/* One-line notice after a "Send back to review" action — amber-bordered, client-only. */}
          {sentBackNotice && (
            <div className="mb-4 rounded-lg border border-accent/50 bg-accent/5 px-3 py-2">
              <p className="text-sm text-foreground">
                <span className="tabular-nums">{sentBackNotice.movedCount}</span>{" "}
                {sentBackNotice.movedCount === 1 ? "question" : "questions"} sent back to review from{" "}
                {sentBackNotice.label}.
              </p>
            </div>
          )}
          {q ? (
            <div
              className={`transition-all duration-200 ease-out ${
                exitingId === q.id
                  ? "opacity-40 translate-x-8 pointer-events-none"
                  : "opacity-100 translate-x-0"
              }`}
            >
              {/* Header: "Question n of total" + Bin all + paper / family / difficulty chips */}
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground tabular-nums">
                    Question {positionN} of {total}
                  </span>
                  {/* ── BIN ALL (spec §5) ── amber-outlined; a single inline confirm before it bins
                      every remaining pending item and shows the same Undo bar. */}
                  {queue.length > 0 &&
                    (confirmBinAll ? (
                      <span className="flex items-center gap-2 text-xs">
                        <span className="text-foreground tabular-nums">Bin all {queue.length}?</span>
                        <span className="text-muted">·</span>
                        <button
                          onClick={binAll}
                          className="text-accent hover:text-accent-hover underline underline-offset-2 transition-colors cursor-pointer"
                        >
                          Confirm
                        </button>
                        <span className="text-muted">/</span>
                        <button
                          onClick={() => setConfirmBinAll(false)}
                          className="text-muted hover:text-foreground underline underline-offset-2 transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => setConfirmBinAll(true)}
                        disabled={busy || !!exitingId}
                        className="text-xs px-3 py-1 rounded-lg border border-accent text-accent hover:bg-accent/10 transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Bin all
                      </button>
                    ))}
                </div>
                <div className="flex items-center gap-2">
                  {/* Every item in the review queue is by definition never-reviewed until decided. */}
                  <BankReviewBadge reviewed={false} />
                  {/* Length Check (feature): amber "Trimmed" / red "Runs long" chip; nothing for
                      clean/NULL. Clicking toggles the inline "Length check" panel below the stem. */}
                  <LengthCheckChip
                    status={q.lengthCheckStatus}
                    open={lengthPanelId === q.id}
                    onClick={() => setLengthPanelId((cur) => (cur === q.id ? null : q.id))}
                  />
                  {/* Answer Length: amber "Answer rewritten" / red "Answer runs long|short"; nothing
                      for clean/NULL. Sits next to the stem chip — they flag different artifacts. */}
                  <AnswerLengthChip
                    status={q.answerLengthStatus}
                    words={q.answerWordCount}
                    open={answerLengthPanelId === q.id}
                    onClick={() => setAnswerLengthPanelId((cur) => (cur === q.id ? null : q.id))}
                  />

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

              {/* Length check panel (feature) — inline expanding panel (NOT a modal), beneath the
                  question text inside the same review card. Opened by the Trimmed / Runs long chip. */}
              {lengthPanelId === q.id &&
                (q.lengthCheckStatus === "trimmed" || q.lengthCheckStatus === "over") && (
                  <LengthCheckPanel
                    status={q.lengthCheckStatus}
                    data={q.lengthCheck}
                    onClose={() => setLengthPanelId(null)}
                  />
                )}

              {/* Answer length panel — same inline-expanding treatment, opened by the Answer chip. */}
              {answerLengthPanelId === q.id &&
                (q.answerLengthStatus === "corrected" ||
                  q.answerLengthStatus === "over" ||
                  q.answerLengthStatus === "under") && (
                  <AnswerLengthPanel
                    status={q.answerLengthStatus}
                    data={q.answerLength}
                    wordCount={q.answerWordCount}
                    onClose={() => setAnswerLengthPanelId(null)}
                  />
                )}

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

              {/* Footer: the three-button action row + Keep all, right-aligned. Primary amber Keep,
                  then two plain bordered Bin / Bin with reason (spec §1). The "Replace anything I
                  bin" toggle that used to sit on the left is gone with bulk generation — a bin is now
                  purely a removal. */}
              <div className="flex flex-wrap items-center justify-end gap-3 mt-5">
                {binError ? (
                  /* The bin GENUINELY failed → the card was restored with the count unchanged. Show
                     the ACTUAL server error (spec §4) with a Retry that re-fires the same request. */
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-fail">{binError.message}</span>
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
                    {/* Keep — primary amber (spec §1). */}
                    <button
                      onClick={keepCurrent}
                      disabled={busy || !!exitingId}
                      className="text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Keep
                    </button>
                    {/* Bin — immediate, empty reasons, no modal (spec §2). */}
                    <button
                      onClick={binCurrent}
                      disabled={busy || !!exitingId}
                      className="text-sm px-4 py-2 rounded-lg border border-border text-foreground hover:border-muted transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Bin
                    </button>
                    {/* Bin with reason — toggles the inline reason panel (spec §3). */}
                    <button
                      onClick={() =>
                        reasonPanelId === q.id ? closeReasonPanel() : openReasonPanel(q)
                      }
                      disabled={busy || !!exitingId}
                      aria-expanded={reasonPanelId === q.id}
                      className={`text-sm px-4 py-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
                        reasonPanelId === q.id
                          ? "border-accent text-accent"
                          : "border-border text-foreground hover:border-muted"
                      }`}
                    >
                      Bin with reason
                    </button>
                  </>
                )}
                <button
                  onClick={keepAll}
                  disabled={busy || queue.length === 0}
                  className="text-sm px-4 py-2 rounded-lg border border-border text-foreground hover:border-muted transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {inFlight === "keepAll" && <Spinner />}
                  Keep all
                </button>
              </div>

              {/* ── BIN WITH REASON PANEL (spec §3) ── inline, INSIDE the card (no modal). Multi-select
                  fault chips + an optional single-line note, then amber "Bin it" (always enabled) and
                  plain "Cancel". Keyboard accessible; Esc cancels. */}
              {reasonPanelId === q.id && (
                <div
                  ref={reasonPanelRef}
                  tabIndex={-1}
                  role="group"
                  aria-label="Bin with reason"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      e.preventDefault();
                      closeReasonPanel();
                    }
                  }}
                  className="mt-3 rounded-lg border border-border bg-background/40 p-4 focus:outline-none"
                >
                  <p className="text-[11px] uppercase tracking-wide text-muted mb-2">Why bin this?</p>
                  <BinReasonChips selected={panelReasons} onToggle={toggleReason} />
                  <input
                    type="text"
                    value={panelNote}
                    maxLength={200}
                    onChange={(e) => setPanelNote(e.target.value)}
                    placeholder="Optional note"
                    aria-label="Optional note"
                    className="mt-3 w-full text-sm px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
                  />
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={confirmBinWithReason}
                      disabled={busy || !!exitingId}
                      className="text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Bin it
                    </button>
                    <button
                      onClick={closeReasonPanel}
                      className="text-sm px-4 py-2 rounded-lg border border-border text-foreground hover:border-muted transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

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

      {/* ── UNDO BAR (spec: Undo) ── fixed at the viewport bottom-centre while binned items sit inside
          the 5s window, with a 1px amber progress line draining left→right. Reads "Binned — <wine>"
          for a single bin (the last one binned) or "N binned" for a bulk bin. Undo restores every item
          on the stack AND its reasons/note. */}
      {reviewOpen && undoStack.length > 0 && (
        <BinUndoBar
          count={undoStack.length}
          label={cardLabel(undoStack[undoStack.length - 1]?.card ?? null)}
          resetToken={resetToken}
          onUndo={handleUndo}
          onExpire={handleExpire}
        />
      )}
    </div>
  );
}
