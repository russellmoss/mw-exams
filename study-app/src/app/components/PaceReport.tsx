"use client";

import {
  formatMMSS,
  paceBenchmarkLabel,
  paceCoaching,
  type PaceData,
} from "@/lib/pace";

interface PaceReportProps {
  pace: PaceData;
  wines: { slot: number; fullText: string }[];
}

// The debrief Pace card — placed ABOVE the graded debrief on the results screen. Rows per wine with
// over-pace times in FAIL red, then the average / flight-total summary and a plain coaching line.
export function PaceReport({ pace, wines }: PaceReportProps) {
  const benchmark = pace.benchmarkSeconds;
  const wineCount = wines.length || pace.wineTimes.length || 1;
  const flightBenchmark = benchmark * wineCount;
  const avgOver = pace.avgSeconds > benchmark;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-foreground font-display">Pace</h3>
        <span className="text-xs text-muted">{paceBenchmarkLabel(pace.mode, benchmark)}</span>
      </div>

      {/* Per-wine rows */}
      <div className="space-y-1.5">
        {wines.map((w, i) => {
          const secs = pace.wineTimes[i] ?? 0;
          const over = secs > benchmark;
          return (
            <div key={w.slot ?? i} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-foreground min-w-0 truncate">
                <span className="text-muted">Wine {i + 1}</span>
                <span className="text-muted"> · </span>
                {w.fullText}
              </span>
              <span className={`font-mono tabular-nums shrink-0 ${over ? "text-fail" : "text-muted"}`}>
                {formatMMSS(secs)}
                {over && <span className="ml-1">+{formatMMSS(secs - benchmark)}</span>}
              </span>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border my-4" />

      {/* Summary */}
      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted">Average per wine</span>
          <span className={`font-mono tabular-nums text-2xl font-semibold ${avgOver ? "text-fail" : "text-accent"}`}>
            {formatMMSS(pace.avgSeconds)}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-muted">Flight total</span>
          <span className="text-sm text-foreground font-mono tabular-nums">
            {formatMMSS(pace.totalSeconds)}
            <span className="text-muted ml-2 font-sans">vs {formatMMSS(flightBenchmark)} benchmark</span>
          </span>
        </div>
      </div>

      <p className="text-sm text-muted mt-4">{paceCoaching(pace)}</p>
    </div>
  );
}
