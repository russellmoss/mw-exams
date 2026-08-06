"use client";

// ProducerSpreadSection — the "Producer Spread" card for Bank Health (spec §4). It reads the derived
// producer tally (/api/admin/bank-health/producers) and shows, per paper: a three-stat summary strip,
// paper filter chips, and a ranked producer table with a thin bar scaled to the heaviest row. Rows the
// over-used rule flags get an amber "Over-used" chip and an amber bar; the 'watch' band gets a muted
// "Watch" chip. Admin-facing only — no normalisation internals are ever shown.
//
// Cellar system: flat bordered card on warm-stone dark, single amber accent, no shadows, Fraunces title
// over Geist body. Matches the sibling Bank Health slice cards.

import { useState, useEffect, useCallback } from "react";

type Status = "over-used" | "watch" | "ok";

interface ProducerRow {
  producer_key: string;
  producer_display: string;
  region: string | null;
  country: string | null;
  count: number;
  share: number;
  status: Status;
}
interface ProducerPayload {
  paper: "all" | number;
  total_wines: number;
  distinct_producers: number;
  widest_share: number;
  flagged_count: number;
  rows: ProducerRow[];
  truncated: boolean;
}

type PaperFilter = "all" | "1" | "2" | "3";
const PAPER_CHIPS: { key: PaperFilter; label: string }[] = [
  { key: "all", label: "All papers" },
  { key: "1", label: "Paper 1" },
  { key: "2", label: "Paper 2" },
  { key: "3", label: "Paper 3" },
];

function pctLabel(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function ProducerSpreadSection() {
  const [paper, setPaper] = useState<PaperFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [data, setData] = useState<ProducerPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0); // bumped by Retry to force a re-fetch

  const fetchData = useCallback(async (p: PaperFilter, all: boolean) => {
    const params = new URLSearchParams({ paper: p });
    if (all) params.set("all", "1");
    const res = await fetch(`/api/admin/bank-health/producers?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as ProducerPayload;
  }, []);

  // Re-fetch whenever the paper filter or the expand toggle changes.
  useEffect(() => {
    let alive = true;
    (async () => {
      // Inside the async body, not the effect body. A synchronous setState during an effect forces
      // an immediate second render pass before paint (react-hooks/set-state-in-effect); moving it
      // here defers it by a microtask, so the spinner still appears on the very next paint.
      setLoading(true);
      try {
        const payload = await fetchData(paper, showAll);
        if (alive) {
          setData(payload);
          setError(null);
        }
      } catch {
        if (alive) setError("Couldn't load producer spread.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [fetchData, paper, showAll, nonce]);

  // Reset the expand when switching papers so a new paper starts from the top 12.
  const selectPaper = (p: PaperFilter) => {
    if (p === paper) return;
    setShowAll(false);
    setPaper(p);
  };

  const widest = data && data.rows.length > 0 ? data.rows[0].count : 0;
  const empty = !loading && !error && data != null && data.rows.length === 0;

  return (
    <div className="rounded-xl border border-border bg-card p-6 mb-6">
      {/* Title + one-line subtitle */}
      <div className="mb-4">
        <h2 className="font-display text-lg font-bold text-foreground tracking-tight">Producer Spread</h2>
        <p className="text-[11px] text-muted mt-1">
          How concentrated the banked wines are on any one producer.
        </p>
      </div>

      {/* Summary strip — three stat blocks */}
      <div className="grid grid-cols-3 gap-4 rounded-lg border border-border bg-background/30 p-4 mb-4">
        <Stat label="Wines in bank" value={data ? data.total_wines.toLocaleString() : "—"} />
        <Stat label="Distinct producers" value={data ? data.distinct_producers.toLocaleString() : "—"} />
        <Stat label="Widest share" value={data ? pctLabel(data.widest_share) : "—"} />
      </div>

      {/* Paper filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PAPER_CHIPS.map((c) => {
          const selected = c.key === paper;
          return (
            <button
              key={c.key}
              onClick={() => selectPaper(c.key)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors cursor-pointer ${
                selected
                  ? "border-accent bg-accent text-background font-medium"
                  : "border-border text-muted hover:text-foreground hover:border-muted"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {loading && <TableSkeleton />}

      {error && !loading && (
        <p className="text-sm text-foreground">
          Couldn&apos;t load producer spread.{" "}
          <button
            onClick={() => setPaper((p) => p)}
            className="text-accent hover:text-accent-hover underline underline-offset-2 cursor-pointer"
          >
            Retry
          </button>
        </p>
      )}

      {empty && (
        <p className="text-sm text-muted py-4">Not enough wines in the bank yet to judge spread.</p>
      )}

      {!loading && !error && data && data.rows.length > 0 && (
        <>
          <div className="divide-y divide-border/60">
            {data.rows.map((row) => (
              <ProducerRowView key={row.producer_key} row={row} widest={widest} />
            ))}
          </div>

          {(data.truncated || showAll) && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-3 text-xs text-accent hover:text-accent-hover underline underline-offset-2 cursor-pointer"
            >
              {showAll ? "Show fewer producers" : "Show all producers"}
            </button>
          )}

          {/* Flagged-items deep-link — hidden when nothing is flagged. Opens the review queue filtered
              to producer flags via a full navigation so the review card picks up the query param. */}
          {data.flagged_count > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <a
                href="/admin?review=flagged:producer"
                className="text-sm text-accent hover:text-accent-hover font-medium transition-colors"
              >
                {data.flagged_count} flagged item{data.flagged_count === 1 ? "" : "s"} awaiting review →
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-2xl font-bold text-foreground tabular-nums tracking-tight">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}

// One producer row: name (bold) + region · country muted, a thin bar scaled to the heaviest row, then
// count / share, and a status chip for over-used / watch. Over-used rows get an amber bar.
function ProducerRowView({ row, widest }: { row: ProducerRow; widest: number }) {
  const barWidth = `${widest > 0 ? Math.max(2, (row.count / widest) * 100) : 0}%`;
  const place = [row.region, row.country].filter(Boolean).join(" · ");
  const overUsed = row.status === "over-used";
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-foreground">{row.producer_display}</span>
          {overUsed && (
            <span className="shrink-0 rounded-md border border-accent/60 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
              Over-used
            </span>
          )}
          {row.status === "watch" && (
            <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted">
              Watch
            </span>
          )}
        </div>
        {place && <p className="truncate text-xs text-muted mt-0.5">{place}</p>}
        {/* Thin bar scaled to the widest row. */}
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-border/40 overflow-hidden" aria-hidden>
          <div
            className={`h-full ${overUsed ? "bg-accent" : "bg-muted"}`}
            style={{ width: barWidth }}
          />
        </div>
      </div>
      <div className="shrink-0 w-16 text-right">
        <div className="text-sm text-foreground tabular-nums">{row.count.toLocaleString()}</div>
        <div className="text-[11px] text-muted tabular-nums">{pctLabel(row.share)}</div>
      </div>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-8 w-full rounded bg-card-hover animate-pulse" />
      ))}
    </div>
  );
}
