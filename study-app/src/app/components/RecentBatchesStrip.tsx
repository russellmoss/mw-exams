"use client";

import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// Batch Undo — "Recent batches" strip at the top of the Bank Review area. Bordered flat card
// (Cellar), serif title + right-aligned muted "N awaiting review". Each row shows when a bulk run
// landed, how many questions it made, a plain-English resolution summary, and either an amber outline
// "Reopen all" (when there are never-reviewed auto-kept items left to reverse) or a muted status line.
//
// "Reopen all" opens an inline confirm panel INSIDE the row (never a modal-over-modal) that splits the
// action into reopen vs skipped (already-served items stay kept) and lists the skipped wine labels.
// On success the row re-renders and the parent's queue/status refetch via onReopened.
// Never exposes batch ids or internal state names.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

interface SkippedItem {
  id: string;
  label: string;
}
interface RecentBatch {
  kind: "batch" | "window";
  id: string;
  paper: number | null;
  createdAt: string;
  generated: number;
  kept: number;
  binned: number;
  pending: number;
  autoKept: number;
  servedInBatch: number;
  reopenable: number;
  skipped: number;
  skippedItems: SkippedItem[];
  resolverName: string | null;
  reopenedAt: string | null;
  canReopen: boolean;
  window?: { from: string; to: string };
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// Plain resolution summary — kept / binned / still-awaiting counts, no internal state names.
function summaryText(b: RecentBatch): string {
  const parts: string[] = [];
  if (b.kept > 0) parts.push(`${b.kept} kept`);
  if (b.binned > 0) parts.push(`${b.binned} binned`);
  if (b.pending > 0) parts.push(`${b.pending} awaiting review`);
  return parts.length > 0 ? parts.join(" · ") : "Nothing kept yet";
}

// Plain, id-free label for the review-queue notice, e.g. "the 5 Aug batch".
function batchLabel(b: RecentBatch): string {
  const d = formatDate(b.createdAt);
  return d ? `the ${d} batch` : "this batch";
}

export function RecentBatchesStrip({
  onReopened,
  onSentBack,
}: {
  onReopened?: () => void;
  onSentBack?: (info: { movedCount: number; label: string }) => void;
}) {
  const [batches, setBatches] = useState<RecentBatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [reopeningId, setReopeningId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // "Send back to review" per-row state — the id currently sending, ids sent back (→ muted confirm),
  // and per-row inline error.
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentBackIds, setSentBackIds] = useState<Set<string>>(new Set());
  const [sendErrorId, setSendErrorId] = useState<string | null>(null);

  const sendBack = async (b: RecentBatch) => {
    setSendingId(b.id);
    setSendErrorId(null);
    try {
      const res = await fetch(`/api/admin/bank/batch/${encodeURIComponent(b.id)}/send-back`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b.kind === "window" && b.window ? { window: b.window } : {}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { movedCount: number };
      const moved = data.movedCount ?? 0;
      // Optimistic card update: auto-approved → 0, pending += movedCount, kept -= movedCount, and the
      // one-shot Reopen control disappears with its auto-kept pool.
      setBatches((prev) =>
        prev.map((x) =>
          x.id === b.id
            ? {
                ...x,
                autoKept: 0,
                reopenable: 0,
                canReopen: false,
                pending: x.pending + moved,
                kept: Math.max(0, x.kept - moved),
              }
            : x,
        ),
      );
      setSentBackIds((prev) => new Set(prev).add(b.id));
      // Refresh every pending-count consumer in the same tick: the parent card's status counter, the
      // global pending-count source, and the NotificationBell / badge (via a window event it listens for).
      void fetch("/api/admin/bank/pending-count", { cache: "no-store" }).catch(() => {});
      window.dispatchEvent(new CustomEvent("mw-bank-refresh"));
      onReopened?.();
      onSentBack?.({ movedCount: moved, label: batchLabel(b) });
    } catch {
      setSendErrorId(b.id);
    } finally {
      setSendingId(null);
    }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/bank/batch/recent?limit=10", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setBatches(Array.isArray(data.batches) ? data.batches : []);
    } catch {
      /* transient — the strip just keeps its last state */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) await load();
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const awaiting = batches.reduce((s, b) => s + b.pending, 0);

  const confirmReopen = async (b: RecentBatch) => {
    setReopeningId(b.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/bank/batch/${encodeURIComponent(b.id)}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(b.kind === "window" && b.window ? { window: b.window } : {}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setExpandedId(null);
      setToast({
        id: b.id,
        text:
          data.skipped > 0
            ? `Reopened ${data.reopened} for review · ${data.skipped} already served kept`
            : `Reopened ${data.reopened} for review`,
      });
      await load();
      onReopened?.();
    } catch {
      setError("Couldn't reopen — try again.");
    } finally {
      setReopeningId(null);
    }
  };

  // Nothing to show once loaded → render nothing (keeps the review area clean).
  if (loaded && batches.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="font-display text-lg text-foreground">Recent batches</h3>
        {awaiting > 0 && (
          <span className="text-xs text-muted tabular-nums">{awaiting} awaiting review</span>
        )}
      </div>

      {!loaded ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-card-hover animate-pulse" />
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {batches.map((b) => {
            const expanded = expandedId === b.id;
            return (
              <li key={b.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-foreground">
                      {formatDateTime(b.createdAt)}
                      <span className="text-muted"> · </span>
                      <span className="tabular-nums">{b.generated}</span> question
                      {b.generated === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-muted mt-0.5">{summaryText(b)}</p>
                    {/* ── SEND BACK TO REVIEW ── secondary action, shown only while the batch still holds
                        auto-approved (never-reviewed) items. Transparent fill, thin amber border/text —
                        never the primary amber fill. */}
                    {b.autoKept > 0 &&
                      (sentBackIds.has(b.id) ? (
                        <p className="text-xs text-muted mt-1.5">Sent back to review</p>
                      ) : (
                        <div className="mt-1.5">
                          <button
                            onClick={() => sendBack(b)}
                            disabled={sendingId === b.id}
                            className="text-xs px-3 py-1 rounded-lg border border-accent/60 text-accent bg-transparent hover:bg-accent/10 hover:border-accent transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-default"
                          >
                            {sendingId === b.id ? "Sending…" : "Send back to review"}
                          </button>
                          {sendErrorId === b.id && (
                            <p className="text-xs text-fail mt-1.5">
                              Couldn&rsquo;t send back &mdash; try again.
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                  <div className="shrink-0">
                    {b.canReopen ? (
                      <button
                        onClick={() => {
                          setError(null);
                          setExpandedId(expanded ? null : b.id);
                        }}
                        className="text-xs px-3 py-1.5 rounded-lg border border-accent text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                      >
                        Reopen all
                      </button>
                    ) : b.reopenedAt ? (
                      <span className="text-xs text-muted">Reopened {formatDate(b.reopenedAt)}</span>
                    ) : b.resolverName ? (
                      <span className="text-xs text-muted">Reviewed by {b.resolverName}</span>
                    ) : (
                      <span className="text-xs text-muted">Reviewed</span>
                    )}
                  </div>
                </div>

                {toast?.id === b.id && !expanded && (
                  <p className="text-xs text-success mt-2">{toast.text}</p>
                )}

                {expanded && b.canReopen && (
                  <div className="mt-3 rounded-lg border border-border bg-background/40 p-4">
                    <p className="text-sm text-foreground">
                      Reopen <span className="tabular-nums">{b.reopenable}</span> for review.
                      {b.skipped > 0 && (
                        <span className="text-muted">
                          {" "}
                          <span className="tabular-nums">{b.skipped}</span> already served will stay
                          kept.
                        </span>
                      )}
                    </p>
                    {b.skippedItems.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {b.skippedItems.map((it) => (
                          <li key={it.id} className="text-xs text-muted leading-snug">
                            · {it.label}
                          </li>
                        ))}
                      </ul>
                    )}
                    {error && <p className="text-xs text-fail mt-2">{error}</p>}
                    <div className="flex items-center gap-3 mt-4">
                      <button
                        onClick={() => confirmReopen(b)}
                        disabled={reopeningId === b.id || b.reopenable === 0}
                        className="text-sm px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {reopeningId === b.id
                          ? "Reopening…"
                          : `Reopen ${b.reopenable} for review`}
                      </button>
                      <button
                        onClick={() => setExpandedId(null)}
                        disabled={reopeningId === b.id}
                        className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
