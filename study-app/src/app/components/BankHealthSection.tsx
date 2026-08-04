"use client";

// BankHealthSection — "Bank Health" rendered INLINE on /admin, immediately below the bank counts
// card (never a standalone route: a prior /admin/bank-health page 404'd in production even though
// the release pipeline reported success). This is a collapsible Cellar card: the header carries the
// summary read (total in bank, unserved, keep rate, and an amber "N slices need attention" pill);
// expanding it reveals every benchmarked slice, each row a thin two-tone bar (amber = bank, muted =
// benchmark) with the numeric percentages as the primary read.
//
// Clicking a row opens a right-hand slide-over of the actual banked questions (paginated by "Load
// more"); "Generate more like this" — and the inline "Generate more" on any thin row — opens a small
// confirm step that queues targeted generation into the normal review queue via the existing
// /api/admin/bank/generate. No new generation pipeline; no new route.

import { useState, useEffect, useCallback, useMemo } from "react";

// ── Payload shape (mirrors src/lib/bank-health/aggregate.ts) ──────────────────────────────────────
type Flag = "on" | "over" | "thin";

interface HealthRow {
  key: string;
  label: string;
  count: number;
  bankPct: number;
  benchmarkPct: number;
  flag: Flag;
}
interface HealthSlice {
  id: string;
  label: string;
  rows: HealthRow[];
  layout?: "table" | "coverage";
}
interface BankHealthPayload {
  totals: {
    total: number;
    unserved: number;
    servedPct: number;
    keepRate: number | null;
    binnedRate: number | null;
    topBinReasons: { reason: string; count: number }[];
  };
  slices: HealthSlice[];
  benchmarkYears: number[];
  benchmarkVersion: string;
  generatedAt: string;
}

interface SliceItem {
  id: string;
  paper: number;
  questionNumber: number | null;
  stemSnippet: string;
  wines: string[];
  marks: number;
  served: boolean;
  createdAt: string;
}

// ── Flag → user-facing label + verdict colour (green / amber / red per DESIGN.md) ─────────────────
const FLAG_LABEL: Record<Flag, string> = { on: "On target", over: "Over-weighted", thin: "Thin" };
const FLAG_CLASS: Record<Flag, string> = {
  on: "bg-success/15 text-success",
  over: "bg-borderline/15 text-borderline",
  thin: "bg-fail/15 text-fail",
};

function FlagPill({ flag }: { flag: Flag }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${FLAG_CLASS[flag]}`}>
      {FLAG_LABEL[flag]}
    </span>
  );
}

// The soft generation targets for a slice row. paper is required by /api/admin/bank/generate; it's
// the row's own paper for the paper slice, otherwise the modal fills it from the slice's questions.
function targetingFor(sliceId: string, key: string, paper: number): Record<string, string | number> {
  const t: Record<string, string | number> = { paper };
  switch (sliceId) {
    case "questionType": t.questionType = key; break;
    case "curveball": t.curveball = key; break;
    case "flightSize": t.flightSize = key; break;
    case "priceBand": t.priceBand = key; break;
    case "grapeCoverage":
    case "overRepetition": t.grape = key; break;
    case "regionCoverage": t.region = key; break;
    // paper / markFocus carry no extra field — paper alone targets the run.
  }
  return t;
}

// Best-guess paper for a slice row before its questions load: the paper slice's own key, else P1.
function paperGuess(slice: HealthSlice, row: HealthRow): number {
  if (slice.id === "paper") return Number(row.key) || 1;
  return 1;
}

interface Selection { slice: HealthSlice; row: HealthRow }

// A slice "needs attention" when any of its rows is off the benchmark (over-weighted or thin).
function needsAttention(slice: HealthSlice): boolean {
  return slice.rows.some((r) => r.flag !== "on");
}

// Read the persisted open state at first render (default collapsed). Window-guarded for SSR, mirroring
// FillTheBankCard's initialReviewBatch pattern.
function initialOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("bankHealth.open") === "1";
  } catch {
    return false;
  }
}

export function BankHealthSection() {
  // Default collapsed; open/closed persists per-user in localStorage (spec key: bankHealth.open).
  const [open, setOpen] = useState(initialOpen);
  const [data, setData] = useState<BankHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Screen 2 (slide-over) and Screen 3 (confirm modal) selections.
  const [panel, setPanel] = useState<Selection | null>(null);
  const [confirm, setConfirm] = useState<{ selection: Selection; paper: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("bankHealth.open", next ? "1" : "0");
      } catch {
        /* private-mode / disabled storage — session-only */
      }
      return next;
    });
  }, []);

  // Pure fetch — returns the payload, writes no state — so the effect owns every setState in its own
  // async continuation (matching SlicePanel below and the codebase's effect conventions).
  const fetchHealth = useCallback(async (): Promise<BankHealthPayload> => {
    const res = await fetch("/api/admin/bank-health", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as BankHealthPayload;
  }, []);

  // Fetch on mount regardless of open state — the header summary + attention pill read from it, and
  // the endpoint is memoised server-side for 60s so this is cheap. `loading` starts true.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const payload = await fetchHealth();
        if (alive) {
          setData(payload);
          setError(null);
        }
      } catch {
        if (alive) setError("Couldn't load bank health.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchHealth]);

  // Retry link — runs on click (never inside an effect), so setState here is fine.
  const retry = useCallback(() => {
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const payload = await fetchHealth();
        setData(payload);
        setError(null);
      } catch {
        setError("Couldn't load bank health.");
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchHealth]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 4500);
  }, []);

  const attentionCount = useMemo(
    () => (data ? data.slices.filter(needsAttention).length : 0),
    [data]
  );

  const empty = !loading && !error && data != null && data.totals.total === 0;

  return (
    <div className="rounded-xl border border-border bg-card mb-6">
      {/* ── Header row — always visible; the summary read + the expand/collapse chevron ── */}
      <button
        onClick={toggleOpen}
        aria-expanded={open}
        className="w-full flex items-center gap-4 p-5 text-left cursor-pointer"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h2 className="font-display text-lg font-bold text-foreground tracking-tight">Bank Health</h2>
            {data && data.totals.total > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted tabular-nums">
                <span>
                  <span className="text-foreground">{data.totals.total.toLocaleString()}</span> in bank
                </span>
                <span>
                  <span className="text-foreground">{data.totals.unserved.toLocaleString()}</span> unserved
                </span>
                <span>
                  Keep rate{" "}
                  <span className="text-foreground">
                    {data.totals.keepRate == null ? "—" : `${data.totals.keepRate}%`}
                  </span>
                </span>
              </div>
            )}
            {attentionCount > 0 && (
              <span className="shrink-0 rounded-full bg-accent/15 text-accent px-2.5 py-0.5 text-[11px] font-medium">
                {attentionCount} slice{attentionCount === 1 ? "" : "s"} need attention
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted mt-1">
            Benchmarked against the last 7 real papers · all-time bank view
          </p>
        </div>
        <svg
          className={`w-5 h-5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Expanded body ── */}
      {open && (
        <div className="px-5 pb-5 border-t border-border pt-5">
          {loading && <OverviewSkeleton />}

          {error && !loading && (
            <div className="rounded-lg border border-border p-4 text-sm text-foreground">
              Couldn&apos;t load bank health.{" "}
              <button
                onClick={retry}
                className="text-accent hover:text-accent-hover underline underline-offset-2 cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {empty && (
            <p className="text-sm text-muted py-4">No questions in the bank yet.</p>
          )}

          {!loading && !error && data && data.totals.total > 0 && (
            <div className="space-y-5">
              {data.slices.map((slice) => (
                <SliceCard
                  key={slice.id}
                  slice={slice}
                  onOpenRow={(row) => setPanel({ slice, row })}
                  onGenerate={(row) => setConfirm({ selection: { slice, row }, paper: paperGuess(slice, row) })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {panel && (
        <SlicePanel
          key={`${panel.slice.id}:${panel.row.key}`}
          selection={panel}
          onClose={() => setPanel(null)}
          onGenerate={(paper) => setConfirm({ selection: panel, paper })}
        />
      )}

      {confirm && (
        <GenerateModal
          selection={confirm.selection}
          paper={confirm.paper}
          onClose={() => setConfirm(null)}
          onQueued={(n) => {
            setConfirm(null);
            showToast(`Queued ${n} question${n === 1 ? "" : "s"} · they'll appear in review`);
          }}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

// ── A thin two-tone bar: amber = bank share, muted stone = benchmark share (scaled to the slice's
// largest value so small shares stay legible). Numbers remain the primary read. ────────────────────
function TwoToneBar({ bankPct, benchmarkPct, scaleMax }: { bankPct: number; benchmarkPct: number; scaleMax: number }) {
  const w = (p: number) => `${Math.min(100, (p / Math.max(1, scaleMax)) * 100)}%`;
  return (
    <div className="w-20 shrink-0 space-y-1" aria-hidden>
      <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
        <div className="h-full bg-accent" style={{ width: w(bankPct) }} />
      </div>
      <div className="h-1.5 rounded-full bg-border/40 overflow-hidden">
        <div className="h-full bg-muted" style={{ width: w(benchmarkPct) }} />
      </div>
    </div>
  );
}

// ── Slice card ────────────────────────────────────────────────────────────────────────────────────
function SliceCard({
  slice,
  onOpenRow,
  onGenerate,
}: {
  slice: HealthSlice;
  onOpenRow: (row: HealthRow) => void;
  onGenerate: (row: HealthRow) => void;
}) {
  const scaleMax = useMemo(
    () => Math.max(1, ...slice.rows.map((r) => Math.max(r.bankPct, r.benchmarkPct))),
    [slice.rows]
  );

  // Over-representation reads as a healthy "nothing running hot" state when empty; every other
  // slice always has benchmark rows, so an empty one is just noise and is dropped.
  if (slice.rows.length === 0) {
    if (slice.id !== "overRepetition") return null;
    return (
      <section className="rounded-lg border border-border bg-background/30 p-4">
        <h3 className="font-medium text-foreground mb-1">{slice.label}</h3>
        <p className="text-sm text-muted">Nothing running well over its share in real papers.</p>
      </section>
    );
  }

  if (slice.layout === "coverage") {
    const mostUsed = slice.rows.filter((r) => r.count > 0).slice(0, 10);
    const thin = slice.rows.filter((r) => r.flag === "thin");
    return (
      <section className="rounded-lg border border-border bg-background/30 p-4">
        <h3 className="font-medium text-foreground mb-3">{slice.label}</h3>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Most used</h4>
            <div className="divide-y divide-border/60">
              {mostUsed.map((row) => (
                <SliceRow key={row.key} row={row} scaleMax={scaleMax} onOpenRow={onOpenRow} onGenerate={onGenerate} />
              ))}
              {mostUsed.length === 0 && <p className="text-xs text-muted py-2">Nothing banked yet.</p>}
            </div>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Thin or missing</h4>
            <div className="divide-y divide-border/60">
              {thin.map((row) => (
                <SliceRow key={row.key} row={row} scaleMax={scaleMax} onOpenRow={onOpenRow} onGenerate={onGenerate} />
              ))}
              {thin.length === 0 && <p className="text-xs text-muted py-2">Full coverage — nothing thin.</p>}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-background/30 p-4">
      <h3 className="font-medium text-foreground mb-2">{slice.label}</h3>
      <div className="divide-y divide-border/60">
        {slice.rows.map((row) => (
          <SliceRow key={row.key} row={row} scaleMax={scaleMax} onOpenRow={onOpenRow} onGenerate={onGenerate} />
        ))}
      </div>
    </section>
  );
}

// A single clickable slice row: label · two-tone bar · our % (count) · benchmark % · flag. Thin rows
// carry an inline compact "Generate more" button that opens the confirm step directly. The whole row
// opens the slide-over; hover raises a subtle amber edge.
function SliceRow({
  row,
  scaleMax,
  onOpenRow,
  onGenerate,
}: {
  row: HealthRow;
  scaleMax: number;
  onOpenRow: (row: HealthRow) => void;
  onGenerate: (row: HealthRow) => void;
}) {
  return (
    <div
      onClick={() => onOpenRow(row)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpenRow(row);
        }
      }}
      className="group flex items-center gap-3 py-2.5 pl-3 -ml-3 border-l-2 border-transparent hover:border-accent hover:bg-card-hover/40 cursor-pointer transition-colors"
    >
      <span className="flex-1 min-w-0 truncate text-sm text-foreground">{row.label}</span>
      <TwoToneBar bankPct={row.bankPct} benchmarkPct={row.benchmarkPct} scaleMax={scaleMax} />
      <span className="w-20 text-right text-sm text-foreground tabular-nums">
        {row.bankPct}%
        <span className="text-muted"> ({row.count.toLocaleString()})</span>
      </span>
      <span className="w-14 text-right text-xs text-muted tabular-nums">{row.benchmarkPct}%</span>
      <FlagPill flag={row.flag} />
      {row.flag === "thin" && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onGenerate(row);
          }}
          className="shrink-0 text-xs text-accent hover:text-accent-hover underline underline-offset-2 transition-colors cursor-pointer"
        >
          Generate more
        </button>
      )}
    </div>
  );
}

// ── Loading skeleton (rows inside the expanded card) ────────────────────────────────────────────────
function OverviewSkeleton() {
  return (
    <div className="space-y-5">
      {[0, 1, 2].map((c) => (
        <div key={c} className="rounded-lg border border-border bg-background/30 p-4">
          <div className="h-4 w-32 rounded bg-card-hover animate-pulse mb-3" />
          <div className="space-y-3">
            {[0, 1, 2, 3].map((r) => (
              <div key={r} className="h-4 w-full rounded bg-card-hover animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Screen 2: right-hand slide-over listing the banked questions in one slice bucket ──────────────
function SlicePanel({
  selection,
  onClose,
  onGenerate,
}: {
  selection: Selection;
  onClose: () => void;
  onGenerate: (paper: number) => void;
}) {
  const { slice, row } = selection;
  const [items, setItems] = useState<SliceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [initialised, setInitialised] = useState(false);

  const fetchPage = useCallback(
    async (next: string | null) => {
      const params = new URLSearchParams({ slice: slice.id, key: row.key, limit: "50" });
      if (next) params.set("cursor", next);
      const res = await fetch(`/api/admin/bank-health/slice?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) return { items: [] as SliceItem[], nextCursor: null as string | null };
      const d = await res.json();
      return { items: (d.items || []) as SliceItem[], nextCursor: (d.nextCursor ?? null) as string | null };
    },
    [slice.id, row.key]
  );

  // Keyed by (slice, row) at the call site, so this component remounts per selection.
  useEffect(() => {
    let alive = true;
    (async () => {
      const page = await fetchPage(null);
      if (!alive) return;
      setItems(page.items);
      setCursor(page.nextCursor);
      setLoading(false);
      setInitialised(true);
    })();
    return () => {
      alive = false;
    };
  }, [fetchPage]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const page = await fetchPage(cursor);
    setItems((prev) => [...prev, ...page.items]);
    setCursor(page.nextCursor);
    setLoadingMore(false);
  };

  // Paper for targeted generation: the loaded question set's most common paper, else the row's guess.
  const paper = useMemo(() => {
    if (slice.id === "paper") return Number(row.key) || 1;
    if (items.length === 0) return 1;
    const tally = new Map<number, number>();
    for (const it of items) tally.set(it.paper, (tally.get(it.paper) || 0) + 1);
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }, [items, slice.id, row.key]);

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-[480px] max-w-full bg-card border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-foreground truncate">
              {slice.label} · {row.label}
            </h2>
            <p className="text-xs text-muted mt-1 tabular-nums">
              {row.count.toLocaleString()} question{row.count === 1 ? "" : "s"} · {row.bankPct}% of bank · benchmark{" "}
              {row.benchmarkPct}%
            </p>
            <div className="mt-2">
              <FlagPill flag={row.flag} />
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-5 border-b border-border">
          <button
            onClick={() => onGenerate(paper)}
            className="w-full text-sm px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer"
          >
            Generate more like this
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && (
            <>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-card-hover animate-pulse" />
              ))}
            </>
          )}
          {initialised && items.length === 0 && (
            <p className="text-sm text-muted">No banked questions in this slice yet.</p>
          )}
          {items.map((it) => (
            <div key={it.id} className="rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-[11px] px-2 py-0.5 rounded bg-card-hover text-muted border border-border">
                  Paper {it.paper}
                </span>
                <span
                  className={`text-[11px] px-2 py-0.5 rounded-full ${
                    it.served ? "bg-success/15 text-success" : "bg-muted/20 text-muted"
                  }`}
                >
                  {it.served ? "Served" : "Never served"}
                </span>
              </div>
              <p className="text-sm text-foreground leading-snug line-clamp-2">{it.stemSnippet}</p>
              {it.wines.length > 0 && (
                <p className="text-xs text-muted mt-1.5 leading-snug">{it.wines.join(" · ")}</p>
              )}
            </div>
          ))}
          {cursor && !loading && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full text-sm py-2 rounded-lg border border-border text-muted hover:text-foreground hover:border-muted transition-colors cursor-pointer disabled:opacity-50"
            >
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

// ── Screen 3: centred confirm modal — pick a batch size and queue targeted generation ─────────────
const COUNT_OPTIONS = [5, 10, 25];

function GenerateModal({
  selection,
  paper,
  onClose,
  onQueued,
}: {
  selection: Selection;
  paper: number;
  onClose: () => void;
  onQueued: (count: number) => void;
}) {
  const { slice, row } = selection;
  const [count, setCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/bank/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count, targeting: targetingFor(slice.id, row.key, paper) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Couldn't queue generation.");
        setBusy(false);
        return;
      }
      onQueued(count);
    } catch {
      setError("Network error — try again.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={busy ? undefined : onClose} />
      <div className="relative w-[360px] max-w-full rounded-xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-foreground">Generate more like this</h2>
        <p className="text-sm text-muted mt-1">
          {slice.label} · <span className="text-foreground">{row.label}</span>
        </p>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Batch size</p>
          <div className="flex gap-2">
            {COUNT_OPTIONS.map((n) => (
              <button
                key={n}
                onClick={() => setCount(n)}
                disabled={busy}
                className={`flex-1 text-sm py-2 rounded-lg border tabular-nums transition-colors cursor-pointer disabled:opacity-50 ${
                  count === n
                    ? "border-accent bg-accent/10 text-foreground"
                    : "border-border text-muted hover:text-foreground hover:border-muted"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted mt-4">Generated questions go to the review queue as usual.</p>
        {error && <p className="text-xs text-fail mt-2">{error}</p>}

        <div className="flex items-center justify-end gap-3 mt-5">
          <button
            onClick={onClose}
            disabled={busy}
            className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy ? "Queuing…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
