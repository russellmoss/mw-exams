"use client";

// GrapeBalanceSection — the "Grape Balance" card on /admin/bank-health (rendered directly below
// Country Balance). It reads the derived variety tally (/api/admin/bank-health/varieties) and shows,
// per paper, how the bank's dominant-variety coverage compares with the historical shape of the exam:
// a thin two-tone bar (amber fill = current bank share, muted outline marker = expected share), the
// "bank% vs ~expected%" figures, and a Short / Heavy chip. Short rows carry a one-click "Fill the gap"
// ghost-amber button that queues a grape-targeted generation batch and then polls the bank status so
// the row reads Generating… → Ready to review.
//
// Cellar look: flat bordered card on warm-stone, single amber accent, Fraunces title over Geist body —
// matching CountryBalanceSection and the sibling Bank Health cards.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { PaperFilterPills, type PaperValue } from "./PaperFilterPills";

type VarietyStatus = "short" | "heavy" | "ok";

interface VarietyRow {
  variety: string;
  label: string;
  paper: number;
  bankCount: number;
  blendCount: number;
  bankSharePct: number;
  expectedSharePct: number;
  shortfallWines: number;
  status: VarietyStatus;
}
interface VarietyPayload {
  paperTotals: Record<number, number>;
  rows: VarietyRow[];
  version: string;
}

const TOP_ROWS = 10;
const FILL_CAP = 12; // count = min(shortfallWines, 12)

const PAPER_TAG: Record<number, string> = { 1: "P1", 2: "P2", 3: "P3" };

// Per-row generation lifecycle after "Fill the gap".
type QueuePhase = "queuing" | "generating" | "ready" | "error";
interface QueueState {
  phase: QueuePhase;
  count: number;
  batchId?: string;
  paper: number;
}

function rowKey(row: VarietyRow): string {
  return `${row.paper}:${row.variety}`;
}

export function GrapeBalanceSection() {
  const [paper, setPaper] = useState<PaperValue>(null); // null = All
  const [showAll, setShowAll] = useState(false);
  const [data, setData] = useState<VarietyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0); // bumped by Retry to force a re-fetch

  // Queued "Fill the gap" batches, keyed by paper:variety, kept across re-fetches so a queued row
  // doesn't lose its Generating…/Ready state when the tally refreshes.
  const [queued, setQueued] = useState<Record<string, QueueState>>({});

  // ── Load the tally ────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const qs = paper ? `?paper=${paper}` : "";
        const res = await fetch(`/api/admin/bank-health/varieties${qs}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const payload = (await res.json()) as VarietyPayload;
        if (alive) {
          setData(payload);
          setError(null);
        }
      } catch {
        if (alive) setError("Couldn't load grape coverage.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [paper, nonce]);

  const selectPaper = (p: PaperValue) => {
    if (p === paper) return;
    setShowAll(false);
    setPaper(p);
  };

  // ── Poll bank status while any queued batch is still running ──────────────────────────────────
  const anyRunning = useMemo(
    () => Object.values(queued).some((q) => q.phase === "generating" || q.phase === "queuing"),
    [queued]
  );
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!anyRunning) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch("/api/admin/bank/status", { cache: "no-store" });
        if (!res.ok) return;
        const body = (await res.json()) as {
          papers: { paper: number; running: { batchId: string } | null }[];
        };
        const running = new Set(
          body.papers.map((p) => p.running?.batchId).filter(Boolean) as string[]
        );
        if (!alive) return;
        setQueued((prev) => {
          let changed = false;
          const next = { ...prev };
          for (const [k, q] of Object.entries(prev)) {
            if (q.phase === "generating" && q.batchId && !running.has(q.batchId)) {
              next[k] = { ...q, phase: "ready" };
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      } catch {
        /* transient — keep polling */
      }
    };
    void tick();
    pollRef.current = setInterval(tick, 4000);
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [anyRunning]);

  // ── Fill the gap ──────────────────────────────────────────────────────────────────────────────
  const fillGap = useCallback(async (row: VarietyRow) => {
    const count = Math.max(1, Math.min(FILL_CAP, row.shortfallWines));
    const key = rowKey(row);
    setQueued((prev) => ({ ...prev, [key]: { phase: "queuing", count, paper: row.paper } }));
    try {
      const res = await fetch("/api/admin/bank/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, paper: row.paper, varietyFocus: row.variety }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || String(res.status));
      setQueued((prev) => ({
        ...prev,
        [key]: { phase: "generating", count, paper: row.paper, batchId: body.batchId },
      }));
    } catch {
      setQueued((prev) => ({ ...prev, [key]: { phase: "error", count, paper: row.paper } }));
    }
  }, []);

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const visible = showAll ? rows : rows.slice(0, TOP_ROWS);
  // Bar scale: the largest bank-or-expected share across the visible rows, floored at 1.
  const scale = Math.max(1, ...visible.map((r) => Math.max(r.bankSharePct, r.expectedSharePct)));

  // Full list is grouped by status (short → heavy → ok), ok rows dimmed.
  const grouped = useMemo(() => {
    if (!showAll) return null;
    const order: VarietyStatus[] = ["short", "heavy", "ok"];
    return order
      .map((s) => ({ status: s, items: rows.filter((r) => r.status === s) }))
      .filter((g) => g.items.length > 0);
  }, [showAll, rows]);

  const empty = !loading && !error && data != null && rows.length === 0;

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      {/* Header: title + subtitle, with the paper-scope pills right-aligned. */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg text-foreground">Grape Balance</h2>
          <p className="text-sm text-muted mt-1">Bank coverage vs. expected exam frequency.</p>
        </div>
        <div className="shrink-0">
          <PaperFilterPills value={paper} onChange={selectPaper} />
        </div>
      </div>

      {loading && <RowsSkeleton />}

      {error && !loading && (
        <p className="mt-6 text-sm text-foreground">
          Couldn&apos;t load grape coverage.{" "}
          <button
            onClick={() => setNonce((n) => n + 1)}
            className="text-accent hover:text-accent-hover underline underline-offset-2 cursor-pointer"
          >
            Retry
          </button>
        </p>
      )}

      {empty && (
        <p className="mt-6 text-sm text-muted">Not enough wines banked yet to read grape coverage.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <>
          {grouped ? (
            <div className="mt-5 space-y-5">
              {grouped.map((g) => (
                <div key={g.status}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1">
                    {g.status === "short" ? "Short" : g.status === "heavy" ? "Heavy" : "On track"}
                  </h3>
                  <div className="divide-y divide-border/60">
                    {g.items.map((row) => (
                      <GrapeRow
                        key={rowKey(row)}
                        row={row}
                        scale={scale}
                        dim={row.status === "ok"}
                        queue={queued[rowKey(row)]}
                        onFill={fillGap}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 divide-y divide-border/60">
              {visible.map((row) => (
                <GrapeRow
                  key={rowKey(row)}
                  row={row}
                  scale={scale}
                  queue={queued[rowKey(row)]}
                  onFill={fillGap}
                />
              ))}
            </div>
          )}

          {rows.length > TOP_ROWS && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-4 text-xs text-accent hover:text-accent-hover underline underline-offset-2 cursor-pointer"
            >
              {showAll ? "Show fewer" : "Show all varieties"}
            </button>
          )}
        </>
      )}
    </section>
  );
}

// One variety row: name + paper tag, a two-tone bar (amber bank share, muted outline marker at the
// expected share), the "bank% vs ~expected%" figures, a status chip, and — on short rows — either a
// "Fill the gap" button or its queued/generating/ready state.
function GrapeRow({
  row,
  scale,
  dim,
  queue,
  onFill,
}: {
  row: VarietyRow;
  scale: number;
  dim?: boolean;
  queue?: QueueState;
  onFill: (row: VarietyRow) => void;
}) {
  const bankW = Math.min(100, (row.bankSharePct / scale) * 100);
  const expectedW = Math.min(100, (row.expectedSharePct / scale) * 100);
  return (
    <div className={`flex items-center gap-3 py-2.5 ${dim ? "opacity-60" : ""}`}>
      <div className="w-[132px] shrink-0 min-w-0">
        <span className="truncate text-sm font-medium text-foreground">{row.label}</span>
        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-card-hover text-muted border border-border align-middle">
          {PAPER_TAG[row.paper] ?? `P${row.paper}`}
        </span>
        {row.blendCount > 0 && (
          <span className="block text-[10px] text-muted mt-0.5">+{row.blendCount} in blends</span>
        )}
      </div>

      {/* Two-tone track: amber fill = bank share; muted outline marker = expected share. */}
      <div className="relative h-1.5 flex-1 rounded-full bg-card-hover overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-accent/50"
          style={{ width: `${bankW}%` }}
        />
        {row.expectedSharePct > 0 && (
          <div
            className="absolute inset-y-0 w-0.5 bg-muted"
            style={{ left: `${expectedW}%` }}
            aria-hidden
          />
        )}
      </div>

      <span className="w-[92px] shrink-0 text-right text-xs text-muted tabular-nums">
        <span className="text-foreground">{row.bankSharePct}%</span> vs ~{row.expectedSharePct}%
      </span>

      {/* Right-hand action / status: the queue state takes over once "Fill the gap" is clicked. */}
      <div className="w-[128px] shrink-0 flex items-center justify-end gap-2">
        {queue ? (
          <QueueView queue={queue} />
        ) : (
          <>
            <StatusChip status={row.status} />
            {row.status === "short" && (
              <button
                onClick={() => onFill(row)}
                className="shrink-0 text-[11px] px-2 py-0.5 rounded-md border border-accent/60 text-accent bg-transparent hover:bg-accent/10 hover:border-accent transition-colors cursor-pointer"
              >
                Fill the gap
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: VarietyStatus }) {
  if (status === "short") {
    return (
      <span className="shrink-0 rounded-full border border-accent/60 bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent">
        Short
      </span>
    );
  }
  if (status === "heavy") {
    return (
      <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted">
        Heavy
      </span>
    );
  }
  return null;
}

function QueueView({ queue }: { queue: QueueState }) {
  if (queue.phase === "error") {
    return <span className="text-[11px] text-fail">Couldn&apos;t queue</span>;
  }
  if (queue.phase === "queuing") {
    return <span className="text-[11px] text-muted">Queuing…</span>;
  }
  // Queued (generating) / ready: top line names the queued batch, second line tracks its progress and
  // links through to the batch review surface.
  const phaseLabel = queue.phase === "generating" ? "Generating…" : "Ready to review";
  return (
    <div className="text-right leading-tight">
      <span className="block text-[11px] text-foreground tabular-nums">
        Queued · {queue.count} wines
      </span>
      <span className="block text-[11px]">
        <span className={queue.phase === "ready" ? "text-success" : "text-muted"}>{phaseLabel}</span>
        <a
          href="/admin"
          className="ml-1 text-accent hover:text-accent-hover underline underline-offset-2"
        >
          View batch
        </a>
      </span>
    </div>
  );
}

function RowsSkeleton() {
  return (
    <div className="mt-6 space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-4 w-[132px] rounded bg-card-hover animate-pulse" />
          <div className="h-1.5 flex-1 rounded-full bg-card-hover animate-pulse" />
          <div className="h-4 w-[92px] rounded bg-card-hover animate-pulse" />
        </div>
      ))}
    </div>
  );
}
