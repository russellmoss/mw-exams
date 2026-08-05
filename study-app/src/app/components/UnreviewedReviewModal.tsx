"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BinReasonChips } from "./BinReasonChips";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// UnreviewedReviewModal — the one-at-a-time reviewer for the Unreviewed Queue, a modal overlay above
// Bank Health. It self-loads the queue (oldest first, keyset-paginated) and, for each item, the full
// reviewer payload, reusing the batch review card's presentation: paper + family line, verbatim stem,
// a mark-allocation row, and a numbered wine list (identity · region · vintage).
//
// Decisions reuse the SAME endpoints as the batch flow — POST /keep and /bin (bin takes optional
// reason chips + free text). A decision optimistically removes the item and advances; a failure
// re-inserts it at the front and surfaces the real error under the footer. Keyboard: K keep, B bin,
// S skip, Esc done. On the last item the body swaps for an all-clear message + Done.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

const PAPER_LABEL: Record<number, string> = { 1: "Paper 1", 2: "Paper 2", 3: "Paper 3" };

interface QueueItem {
  id: string;
  paper: number;
  family: string;
  wineCount: number;
  createdAt: string;
  stemPreview: string;
}
interface ReviewWine {
  slot: number;
  text: string;
  variety: string | null;
  region: string | null;
  country: string | null;
  vintage: string | null;
}
interface ReviewPayload {
  id: string;
  paper: number;
  family: string;
  familyLabel: string;
  stem: string;
  markBreakdown: { label: string; marks: number }[];
  total: number;
  wines: ReviewWine[];
}

const PAGE_SIZE = 25;

// onClose reports how many keep/bin decisions landed this session, so the parent can refresh the
// Bank Health headline counts only when the numbers actually moved (a look-and-close reports 0).
export function UnreviewedReviewModal({ onClose }: { onClose: (decisionsMade: number) => void }) {
  // The loaded, still-undecided queue (oldest first) + keyset cursor + starting total.
  const [items, setItems] = useState<QueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [listLoaded, setListLoaded] = useState(false);
  const fetchingRef = useRef(false);
  // Mirrors reviewedCount for the close handlers, which fire from stable closures (keyboard, backdrop).
  const reviewedRef = useRef(0);
  const close = useCallback(() => onClose(reviewedRef.current), [onClose]);

  // Full payload for the item on screen (items[0]).
  const [payload, setPayload] = useState<ReviewPayload | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  // Bin with reason (inline expander).
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const current = items[0] ?? null;
  // Only trust the payload when it matches the item on screen — otherwise show the skeleton.
  const activePayload = current && payload && payload.id === current.id ? payload : null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1400);
  }, []);

  // Fetch one page and append (deduped). Guarded by a ref (not state) so it is safe to invoke from an
  // effect with no synchronous setState. The first call (no cursor) seeds total + the first page.
  const fetchPage = useCallback(async (cursor: string | null) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    try {
      const qs = new URLSearchParams({ limit: String(PAGE_SIZE) });
      if (cursor) qs.set("cursor", cursor);
      const res = await fetch(`/api/admin/bank/unreviewed?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTotal(data.total ?? 0);
      setNextCursor(data.nextCursor ?? null);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        const add = (data.items as QueueItem[]).filter((i) => !seen.has(i.id));
        return [...prev, ...add];
      });
    } catch {
      setError("Couldn't load the queue — try again.");
    } finally {
      fetchingRef.current = false;
      setListLoaded(true);
    }
  }, []);

  // Initial load.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) await fetchPage(null);
    })();
    return () => {
      alive = false;
    };
  }, [fetchPage]);

  // Top up the loaded queue as it drains, so the next item is always ready.
  useEffect(() => {
    if (!listLoaded) return;
    if (items.length <= 5 && nextCursor) {
      const c = nextCursor;
      void (async () => {
        await fetchPage(c);
      })();
    }
  }, [items.length, nextCursor, listLoaded, fetchPage]);

  // Load the full payload for the current item whenever it changes (no synchronous setState — the
  // skeleton is derived from `activePayload`, so nothing needs clearing up front).
  useEffect(() => {
    if (!current || (payload && payload.id === current.id)) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/bank/item/${encodeURIComponent(current.id)}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (alive) setPayload(data.question as ReviewPayload);
      } catch {
        if (alive) setError("Couldn't load this question — try again.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [current, payload]);

  const resetReasonPanel = () => {
    setReasonOpen(false);
    setReasons([]);
    setNote("");
  };

  // Fire a decision. Optimistically drop the card and advance; on failure re-insert it at the front and
  // surface the real error. Both endpoints are id-scoped + idempotent, so a replayed request is safe.
  const decide = useCallback(
    async (kind: "keep" | "bin", binReasons: string[] = [], binNote: string | null = null) => {
      const card = items[0];
      if (!card) return;
      setError(null);
      resetReasonPanel();
      // Optimistic advance.
      setItems((prev) => prev.filter((i) => i.id !== card.id));
      setReviewedCount((c) => c + 1);
      showToast(kind === "keep" ? "Kept" : "Binned");
      try {
        reviewedRef.current += 1;
        const url = `/api/admin/bank/item/${encodeURIComponent(card.id)}/${kind}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body:
            kind === "bin" ? JSON.stringify({ reasons: binReasons, note: binNote }) : JSON.stringify({}),
        });
        if (!res.ok) {
          let message = `The server rejected the ${kind} (HTTP ${res.status}).`;
          const detail = await res.text().catch(() => "");
          if (detail) {
            try {
              const parsed = JSON.parse(detail);
              if (parsed && typeof parsed.error === "string" && parsed.error.trim())
                message = parsed.error.trim();
            } catch {
              /* keep the status-line message */
            }
          }
          throw new Error(message);
        }
      } catch (err) {
        // Roll back: put the card back at the front and re-enable the actions.
        setItems((prev) => (prev.some((i) => i.id === card.id) ? prev : [card, ...prev]));
        reviewedRef.current = Math.max(0, reviewedRef.current - 1);
        setReviewedCount((c) => Math.max(0, c - 1));
        setToast(null);
        setError(err instanceof Error ? err.message : `The ${kind} request failed.`);
      }
    },
    [items, showToast]
  );

  // Skip — no decision; rotate the current item to the back so it comes round again.
  const skip = useCallback(() => {
    setError(null);
    resetReasonPanel();
    setItems((prev) => (prev.length > 1 ? [...prev.slice(1), prev[0]] : prev));
  }, []);

  const confirmBinWithReason = () => {
    const trimmed = note.trim();
    void decide("bin", reasons, trimmed.length > 0 ? trimmed : null);
  };

  const toggleReason = (value: string) =>
    setReasons((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  const allClear = listLoaded && items.length === 0 && !nextCursor;

  // Keyboard: K keep · B bin · S skip · Esc done. Ignore letter keys while typing in the note field;
  // Esc closes the reason expander first, then the modal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (reasonOpen) setReasonOpen(false);
        else close();
        return;
      }
      const el = e.target as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      if (typing || !current || allClear) return;
      const k = e.key.toLowerCase();
      if (k === "k") {
        e.preventDefault();
        void decide("keep");
      } else if (k === "b") {
        e.preventDefault();
        void decide("bin");
      } else if (k === "s") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, allClear, reasonOpen, decide, skip, close]);

  const position = Math.min(reviewedCount + 1, Math.max(total, 1));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      <div className="relative w-full max-w-2xl rounded-xl border border-border bg-card shadow-2xl my-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-lg text-foreground">Reviewing</h2>
            {!allClear && total > 0 && (
              <span className="text-sm text-muted tabular-nums">
                {position} of {total}
              </span>
            )}
          </div>
          <button
            onClick={close}
            className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {allClear ? (
            <div className="py-10 text-center">
              <p className="font-display text-lg text-foreground">Nothing waiting.</p>
              <p className="text-sm text-muted mt-2">
                Every question in the bank has been reviewed.
              </p>
              <button
                onClick={close}
                className="mt-6 text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer"
              >
                Back to Bank Health
              </button>
            </div>
          ) : !activePayload ? (
            <div className="space-y-3">
              <div className="h-4 w-40 rounded bg-card-hover animate-pulse" />
              <div className="h-24 w-full rounded bg-card-hover animate-pulse" />
              <div className="h-16 w-full rounded bg-card-hover animate-pulse" />
            </div>
          ) : (
            <>
              {/* Paper + family line */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[11px] px-2 py-0.5 rounded bg-card-hover text-muted border border-border">
                  {PAPER_LABEL[activePayload.paper]}
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-card-hover text-muted border border-border">
                  {activePayload.familyLabel}
                </span>
              </div>

              {/* Stem — verbatim candidate-facing text */}
              <div className="rounded-lg border border-border bg-background/40 p-4">
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {activePayload.stem}
                </p>
              </div>

              {/* Mark allocation */}
              <div className="mt-4 max-w-sm">
                <ul className="text-sm">
                  {activePayload.markBreakdown.map((m, i) => (
                    <li key={i} className="flex justify-between py-1 border-b border-border/50">
                      <span className="text-muted">{m.label}</span>
                      <span className="text-foreground tabular-nums">{m.marks}</span>
                    </li>
                  ))}
                  <li className="flex justify-between py-1 font-medium">
                    <span className="text-foreground">Total</span>
                    <span className="text-foreground tabular-nums">{activePayload.total}</span>
                  </li>
                </ul>
              </div>

              {/* Numbered wine list — identity · region · vintage */}
              <ol className="mt-4 space-y-2">
                {activePayload.wines.map((w) => (
                  <li key={w.slot} className="flex gap-2 text-sm">
                    <span className="text-muted tabular-nums shrink-0">{w.slot}.</span>
                    <div className="min-w-0">
                      <p className="text-foreground leading-snug">{w.text}</p>
                      <p className="text-xs text-muted mt-0.5">
                        {[w.variety, w.region, w.vintage].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>

        {/* Footer */}
        {!allClear && (
          <div className="px-6 py-4 border-t border-border">
            <div className="flex flex-wrap items-center gap-3">
              {/* Skip — quiet text link on the left. */}
              <button
                onClick={skip}
                className="text-sm text-muted hover:text-foreground underline underline-offset-2 transition-colors cursor-pointer mr-auto"
              >
                Skip
              </button>
              <button
                onClick={() => void decide("keep")}
                disabled={!activePayload}
                className="text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                Keep
              </button>
              <button
                onClick={() => void decide("bin")}
                disabled={!activePayload}
                className="text-sm px-4 py-2 rounded-lg border border-border text-foreground hover:border-muted transition-colors cursor-pointer disabled:opacity-50"
              >
                Bin
              </button>
              <button
                onClick={() => setReasonOpen((o) => !o)}
                disabled={!activePayload}
                aria-expanded={reasonOpen}
                className={`text-sm px-4 py-2 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 ${
                  reasonOpen
                    ? "border-accent text-accent"
                    : "border-border text-foreground hover:border-muted"
                }`}
              >
                Bin with reason
              </button>
            </div>

            {/* Bin with reason — inline multi-select chips + optional note + amber Confirm bin. */}
            {reasonOpen && (
              <div className="mt-3 rounded-lg border border-border bg-background/40 p-4">
                <p className="text-[11px] uppercase tracking-wide text-muted mb-2">Why bin this?</p>
                <BinReasonChips selected={reasons} onToggle={toggleReason} />
                <input
                  type="text"
                  value={note}
                  maxLength={200}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note"
                  aria-label="Optional note"
                  className="mt-3 w-full text-sm px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
                />
                <div className="mt-3">
                  <button
                    onClick={confirmBinWithReason}
                    className="text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer"
                  >
                    Confirm bin
                  </button>
                </div>
              </div>
            )}

            {/* Errors — inline red line under the footer; the actions above stay enabled. */}
            {error && <p className="text-xs text-fail mt-3">{error}</p>}
          </div>
        )}

        {/* Brief inline toast (Kept / Binned). */}
        {toast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-lg border border-border bg-card px-4 py-2 text-sm text-foreground shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
