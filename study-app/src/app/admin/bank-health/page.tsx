"use client";

// /admin/bank-health — "Bank Health": how the generated question bank stacks up against the last
// seven years of real IMW papers, sliced every way the examiners vary a flight. Admin-only; the
// aggregation + benchmarks live server-side (src/lib/bank-health/*, /api/admin/bank-health). This
// page is the Cellar-styled read surface: an overview of benchmarked slices (Screen 1) and a
// per-slice slide-over of the actual banked questions (Screen 2). A third screen used to size a
// targeted generation batch; bulk generation was removed (2026-08-08), so the page now reports where
// the bank is off its benchmark without offering to buy more of anything.

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PaperFilterPills, type PaperValue } from "@/app/components/PaperFilterPills";
import { CountryBalanceSection, type CountryBalance } from "@/app/components/CountryBalanceSection";
import { GrapeBalanceSection } from "@/app/components/GrapeBalanceSection";
import { UnreviewedQueueSection } from "@/app/components/UnreviewedQueueSection";

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
  // Country Balance (always-on): the bank's country mix against the historical shape of the exam.
  // Bank-wide, so it does not re-scope with the paper filter.
  countryBalance?: CountryBalance;
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

// User-facing paper names for the caption line under the filter pills (mirrors PaperFilterPills).
const PAPER_CAPTION_LABEL: Record<number, string> = {
  1: "Paper 1 · Whites",
  2: "Paper 2 · Reds",
  3: "Paper 3 · Special",
};

function FlagPill({ flag }: { flag: Flag }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${FLAG_CLASS[flag]}`}>
      {FLAG_LABEL[flag]}
    </span>
  );
}

interface Selection { slice: HealthSlice; row: HealthRow }

export default function BankHealthPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [data, setData] = useState<BankHealthPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paper scope for every region on the page. Default is All papers on a fresh visit; a shared
  // `?paper=N` link opens on that paper (spec: shareable, not persisted). Reflected back into the URL
  // via router.replace so the address stays copy-able without a reload.
  const [selectedPaper, setSelectedPaper] = useState<PaperValue>(() => {
    if (typeof window === "undefined") return null;
    const p = new URLSearchParams(window.location.search).get("paper");
    return p === "1" || p === "2" || p === "3" ? (Number(p) as PaperValue) : null;
  });
  const firstLoadRef = useRef(true);

  // Bumped whenever the Unreviewed reviewer closes after making decisions, so the headline counts
  // (banked total, never-served, keep rate) re-read the numbers those keeps/bins just moved.
  const [refreshTick, setRefreshTick] = useState(0);

  const handlePaperChange = useCallback(
    (p: PaperValue) => {
      setSelectedPaper(p);
      router.replace(p ? `/admin/bank-health?paper=${p}` : "/admin/bank-health", { scroll: false });
    },
    [router]
  );

  // Screen 2 (slide-over) and Screen 3 (confirm modal) selections.
  const [panel, setPanel] = useState<Selection | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Gate: signed-out OR non-admin → home (spec: non-admins redirect to /).
  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) router.push("/");
  }, [authLoading, user, router]);

  // Refetch on mount and on every paper switch. The first load shows the skeleton; later switches keep
  // the current stats mounted and fade them (refetching) instead of unmounting, so there's no layout
  // shift. A slow response for an old selection can't overwrite a newer one — AbortController cancels
  // the in-flight request the moment the paper changes again.
  useEffect(() => {
    if (!user?.isAdmin) return;
    const controller = new AbortController();
    if (firstLoadRef.current) setLoading(true);
    else setRefetching(true);
    (async () => {
      try {
        const qs = selectedPaper ? `?paper=${selectedPaper}` : "";
        const res = await fetch(`/api/admin/bank-health${qs}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const payload: BankHealthPayload = await res.json();
        setData(payload);
        setError(null);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError("Couldn't read bank health right now.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefetching(false);
          firstLoadRef.current = false;
        }
      }
    })();
    return () => controller.abort();
  }, [user?.isAdmin, selectedPaper, refreshTick]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 4500);
  }, []);

  // Auth still resolving, or bounce in flight.
  if (authLoading || !user || !user.isAdmin) {
    return (
      <div className="flex flex-col flex-1">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center text-sm text-muted">Loading…</div>
      </div>
    );
  }

  const empty = !loading && !error && data && data.totals.total === 0;

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Bank Health</h1>
            <p className="text-sm text-muted mt-1">
              Benchmark: last 7 years of real papers
              {data?.benchmarkYears?.length
                ? ` (${data.benchmarkYears[0]}–${data.benchmarkYears[data.benchmarkYears.length - 1]})`
                : ""}
            </p>
          </div>
          <Link
            href="/admin"
            className="shrink-0 text-sm text-muted hover:text-foreground transition-colors"
          >
            ← Admin
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* ── Paper filter — re-scopes every region below to one paper or the aggregate ── */}
          <div className="mb-6">
            <PaperFilterPills value={selectedPaper} onChange={handlePaperChange} />
            {data && (
              <p className="text-sm text-muted mt-2">
                {selectedPaper == null
                  ? `Showing all three papers — ${data.totals.total.toLocaleString()} questions banked.`
                  : `Showing ${PAPER_CAPTION_LABEL[selectedPaper]} — ${data.totals.total.toLocaleString()} questions banked.`}
              </p>
            )}
          </div>

          {error && (
            <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-6">
              <p className="text-sm text-fail">{error}</p>
            </div>
          )}

          {loading && <OverviewSkeleton />}

          {empty && (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-sm text-foreground">No questions banked yet</p>
              <p className="text-xs text-muted mt-2">
                Generate questions from the{" "}
                <Link href="/admin" className="text-accent hover:text-accent-hover underline underline-offset-2">
                  bank card
                </Link>{" "}
                to start tracking health.
              </p>
            </div>
          )}

          {!loading && !error && data && data.totals.total > 0 && (
            <div
              className={`space-y-6 transition-opacity duration-150 ${refetching ? "opacity-50" : "opacity-100"}`}
              aria-busy={refetching}
            >
              {/* ── Headline stat row (one bordered card, 3-up) ── */}
              <div className="rounded-xl border border-border bg-card p-6">
                <div className="grid grid-cols-3 gap-4">
                  <Stat label="Banked questions" value={data.totals.total.toLocaleString()} />
                  <Stat
                    label="Never served"
                    value={data.totals.unserved.toLocaleString()}
                    sub={`${100 - data.totals.servedPct}% of the bank`}
                  />
                  <Stat
                    label="Keep rate"
                    value={data.totals.keepRate == null ? "—" : `${data.totals.keepRate}%`}
                    sub={data.totals.keepRate == null ? "no reviewed batches yet" : "kept vs binned"}
                  />
                </div>
              </div>

              {/* ── Slice cards ── */}
              {data.slices.map((slice) => (
                <SliceCard
                  key={slice.id}
                  slice={slice}
                  onOpenRow={(row) => setPanel({ slice, row })}
                />
              ))}

              {/* ── Country Balance (always-on read; bank-wide, no controls) ── */}
              {data.countryBalance && <CountryBalanceSection balance={data.countryBalance} />}

              {/* ── Grape Balance (variety coverage vs. expected exam frequency; own paper scope) ── */}
              <GrapeBalanceSection />
            </div>
          )}

          {/* ── Unreviewed Queue ── a standing review surface for banked questions never explicitly
              kept or binned. Bank-wide and deliberately NOT re-scoped by the paper filter; shown
              alongside the benchmark sections regardless of whether any are populated. */}
          <div className="mt-6">
            <UnreviewedQueueSection onReviewed={() => setRefreshTick((t) => t + 1)} />
          </div>
        </div>
      </main>

      {panel && (
        <SlicePanel
          key={`${panel.slice.id}:${panel.row.key}:${selectedPaper ?? "all"}`}
          selection={panel}
          scopePaper={selectedPaper}
          onClose={() => setPanel(null)}
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


function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-3xl font-bold text-foreground tabular-nums tracking-tight">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
      {sub && <div className="text-[11px] text-muted/70 mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Slice card ────────────────────────────────────────────────────────────────────────────────────
function SliceCard({
  slice,
  onOpenRow,
}: {
  slice: HealthSlice;
  onOpenRow: (row: HealthRow) => void;
}) {
  // Over-representation reads as a healthy "nothing running hot" state when empty; every other
  // slice always has benchmark rows, so an empty one is just noise and is dropped.
  if (slice.rows.length === 0) {
    if (slice.id !== "overRepetition") return null;
    return (
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-bold text-foreground mb-2">{slice.label}</h2>
        <p className="text-sm text-muted">Nothing running more than 3× its share in real papers.</p>
      </section>
    );
  }

  if (slice.layout === "coverage") {
    const mostUsed = slice.rows.filter((r) => r.count > 0).slice(0, 10);
    const thin = slice.rows.filter((r) => r.flag === "thin");
    return (
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-bold text-foreground mb-4">{slice.label}</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Most used</h3>
            <div className="divide-y divide-border/60">
              {mostUsed.map((row) => (
                <SliceRow key={row.key} row={row} onOpenRow={onOpenRow} />
              ))}
              {mostUsed.length === 0 && <p className="text-xs text-muted py-2">Nothing banked yet.</p>}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Thin or missing</h3>
            <div className="divide-y divide-border/60">
              {thin.map((row) => (
                <SliceRow key={row.key} row={row} onOpenRow={onOpenRow} />
              ))}
              {thin.length === 0 && <p className="text-xs text-muted py-2">Full coverage — nothing thin.</p>}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <h2 className="font-bold text-foreground mb-3">{slice.label}</h2>
      <div className="divide-y divide-border/60">
        {slice.rows.map((row) => (
          <SliceRow key={row.key} row={row} onOpenRow={onOpenRow} />
        ))}
      </div>
    </section>
  );
}

// A single clickable slice row: label · our % (count) · benchmark % · flag. The whole row opens the
// slide-over; hover raises a subtle amber edge.
function SliceRow({
  row,
  onOpenRow,
}: {
  row: HealthRow;
  onOpenRow: (row: HealthRow) => void;
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
      <span className="w-24 text-right text-sm text-foreground tabular-nums">
        {row.bankPct}%
        <span className="text-muted"> ({row.count.toLocaleString()})</span>
      </span>
      <span className="w-20 text-right text-xs text-muted tabular-nums">{row.benchmarkPct}%</span>
      <FlagPill flag={row.flag} />
    </div>
  );
}

// ── Screen 1 loading skeleton ──────────────────────────────────────────────────────────────────────
function OverviewSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="grid grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <div className="h-8 w-16 rounded bg-card-hover animate-pulse" />
              <div className="h-3 w-24 rounded bg-card-hover animate-pulse mt-2" />
            </div>
          ))}
        </div>
      </div>
      {[0, 1, 2].map((c) => (
        <div key={c} className="rounded-xl border border-border bg-card p-6">
          <div className="h-4 w-32 rounded bg-card-hover animate-pulse mb-4" />
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
  scopePaper,
  onClose,
}: {
  selection: Selection;
  scopePaper: PaperValue;
  onClose: () => void;
}) {
  const { slice, row } = selection;
  const [items, setItems] = useState<SliceItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  // Keyed by (slice, row, paper) at the call site, so this component remounts per selection — `loading`
  // starts true from initial state and this effect runs once, no synchronous setState needed. The
  // drill-down list stays scoped to the page's selected paper.
  useEffect(() => {
    let alive = true;
    const params = new URLSearchParams({ slice: slice.id, key: row.key, limit: "50" });
    if (scopePaper) params.set("paper", String(scopePaper));
    fetch(`/api/admin/bank-health/slice?${params.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        if (alive) setItems(d.items || []);
      })
      .catch(() => alive && setItems([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [slice.id, row.key, scopePaper]);

  // Paper for targeted generation: the modal question set's most common paper, else the row's guess.
  const paper = useMemo(() => {
    if (slice.id === "paper") return Number(row.key) || 1;
    if (!items || items.length === 0) return 1;
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
            <p className="text-xs text-muted">{slice.label}</p>
            <h2 className="text-lg font-bold text-foreground truncate">{row.label}</h2>
            <div className="flex items-center gap-2 mt-2">
              <FlagPill flag={row.flag} />
              <span className="text-xs text-muted tabular-nums">
                {row.bankPct}% of the bank vs {row.benchmarkPct}% in real papers
              </span>
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

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && (
            <>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-card-hover animate-pulse" />
              ))}
            </>
          )}
          {!loading && items && items.length === 0 && (
            <p className="text-sm text-muted">No banked questions in this slice yet.</p>
          )}
          {!loading &&
            items &&
            items.map((it) => (
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
                    {it.served ? "Served" : "Unserved"}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-snug">{it.stemSnippet}</p>
                {it.wines.length > 0 && (
                  <p className="text-xs text-muted mt-1.5 leading-snug">{it.wines.join(" · ")}</p>
                )}
              </div>
            ))}
        </div>
      </aside>
    </div>
  );
}

