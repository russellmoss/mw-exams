"use client";

import { useState, useEffect, useCallback } from "react";
import { UnreviewedReviewModal } from "./UnreviewedReviewModal";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// UnreviewedQueueSection — a standing section on /admin/bank-health for banked questions that have
// never been explicitly kept or binned. Bordered flat Cellar card, amber accent: a Fraunces heading
// with an amber count pill, an amber "Start reviewing" primary button, and a lazy-loaded list (pages
// of 25) of clickable rows. Any row — or Start reviewing — opens the one-at-a-time reviewer modal.
// When the modal closes, the count + list refetch so the section reflects the work just done.
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

// Relative "generated" date — coarse, calm, no seconds. Falls back to an empty string on a parse miss.
function relativeDate(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

// onReviewed — fired when the reviewer closes after at least one keep/bin, so the parent Bank Health
// page can re-read its headline counts (banked total, never-served, keep rate) alongside this section.
export function UnreviewedQueueSection({ onReviewed }: { onReviewed?: () => void }) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // (Re)load the first page. No synchronous setState — everything is set after the fetch resolves — so
  // this is safe to call from an effect (initial mount) as well as an event handler (modal close).
  const fetchFirstPage = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bank/unreviewed?limit=25", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setError(null);
      setTotal(data.total ?? 0);
      setItems(data.items ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      setError("Couldn't load the unreviewed queue.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) await fetchFirstPage();
    })();
    return () => {
      alive = false;
    };
  }, [fetchFirstPage]);

  // "Load more" — appends the next keyset page. Only ever an onClick, so a synchronous setState is fine.
  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const qs = new URLSearchParams({ limit: "25", cursor: nextCursor });
      const res = await fetch(`/api/admin/bank/unreviewed?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setTotal(data.total ?? total);
      setNextCursor(data.nextCursor ?? null);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...(data.items as QueueItem[]).filter((i) => !seen.has(i.id))];
      });
    } catch {
      setError("Couldn't load more.");
    } finally {
      setLoadingMore(false);
    }
  }, [nextCursor, loadingMore, total]);

  const closeModal = useCallback(
    (decisionsMade: number) => {
      setModalOpen(false);
      setLoading(true);
      void fetchFirstPage();
      // Only nudge the page's headline counts when a keep/bin actually moved them; a look-and-close
      // (or pure skips) leaves the bank untouched, so there's nothing to re-read.
      if (decisionsMade > 0) onReviewed?.();
    },
    [fetchFirstPage, onReviewed]
  );

  // Empty state — a calm centred card. No button (spec).
  if (!loading && !error && total === 0) {
    return (
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-lg text-foreground mb-4">Unreviewed</h2>
        <div className="py-8 text-center">
          <p className="text-sm text-foreground">Nothing waiting.</p>
          <p className="text-xs text-muted mt-1">Every question in the bank has been reviewed.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="font-display text-lg text-foreground flex items-center gap-2">
            Unreviewed
            {total > 0 && (
              <span className="rounded-full bg-accent/15 text-accent text-xs font-medium px-2 py-0.5 tabular-nums">
                {total.toLocaleString()}
              </span>
            )}
          </h2>
          <p className="text-sm text-muted mt-1">
            Questions that have never been approved or binned.
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          disabled={total === 0}
          className="shrink-0 text-sm px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
        >
          Start reviewing
        </button>
      </div>

      {error && <p className="text-sm text-fail mb-3">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-card-hover animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="divide-y divide-border/60">
            {items.map((it) => (
              <div
                key={it.id}
                onClick={() => setModalOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setModalOpen(true);
                  }
                }}
                className="group flex items-center gap-3 py-3 pl-3 -ml-3 border-l-2 border-transparent hover:border-accent hover:bg-card-hover/40 cursor-pointer transition-colors"
              >
                <span className="shrink-0 text-[11px] px-2 py-0.5 rounded bg-card-hover text-muted border border-border">
                  {PAPER_LABEL[it.paper]}
                </span>
                <span className="shrink-0 text-xs text-muted w-32 truncate">{it.family}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums w-14">
                  {it.wineCount} wine{it.wineCount === 1 ? "" : "s"}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm text-foreground">
                  {it.stemPreview}
                </span>
                <span className="shrink-0 text-xs text-muted tabular-nums hidden sm:inline">
                  {relativeDate(it.createdAt)}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setModalOpen(true);
                  }}
                  className="shrink-0 text-xs px-3 py-1 rounded-lg border border-border text-muted group-hover:text-foreground group-hover:border-muted transition-colors cursor-pointer"
                >
                  Review
                </button>
              </div>
            ))}
          </div>

          {nextCursor && (
            <div className="mt-4 text-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="text-sm px-4 py-2 rounded-lg border border-border text-muted hover:text-foreground hover:border-muted transition-colors cursor-pointer disabled:opacity-50"
              >
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </>
      )}

      {modalOpen && <UnreviewedReviewModal onClose={closeModal} />}
    </section>
  );
}
