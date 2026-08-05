"use client";

import ReactMarkdown from "react-markdown";
import {
  formatMMSS,
  paceBenchmarkLabel,
  paceCoaching,
  type PaceData,
} from "@/lib/pace";
import { SourceList } from "./WineReveal";
import type { WineProvenance } from "@/lib/wine-provenance";

interface PaceReportProps {
  pace: PaceData;
  wines: { slot: number; fullText: string }[];
  /**
   * The session's tasting notes in flight order (index i = wines[i]). When present, each wine row
   * becomes click-to-expand and replays its note. Review-step only — the results-step instance
   * omits this so nothing distracts from the grade.
   */
  tastingNotes?: string[];
  /** Where each note's reference profile came from, in flight order. */
  provenance?: WineProvenance[];
}

// The debrief Pace card — placed ABOVE the graded debrief on the results screen. Rows per wine with
// over-pace times in FAIL red, then the average / flight-total summary and a plain coaching line.
export function PaceReport({ pace, wines, tastingNotes, provenance }: PaceReportProps) {
  const benchmark = pace.benchmarkSeconds;
  const wineCount = wines.length || pace.wineTimes.length || 1;
  const flightBenchmark = benchmark * wineCount;
  const avgOver = pace.avgSeconds > benchmark;
  const expandable = tastingNotes && tastingNotes.length > 0;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h3 className="text-lg font-semibold text-foreground font-display">Pace</h3>
        <span className="text-xs text-muted">{paceBenchmarkLabel(pace.mode, benchmark)}</span>
      </div>

      {expandable && (
        <p className="text-xs text-muted mb-2">
          Click a wine to revisit its tasting note and sources.
        </p>
      )}

      {/* Per-wine rows */}
      <div className="space-y-1.5">
        {wines.map((w, i) => {
          const secs = pace.wineTimes[i] ?? 0;
          const over = secs > benchmark;
          const time = (
            <span className={`font-mono tabular-nums shrink-0 ${over ? "text-fail" : "text-muted"}`}>
              {formatMMSS(secs)}
              {over && <span className="ml-1">+{formatMMSS(secs - benchmark)}</span>}
            </span>
          );
          const note = tastingNotes?.[i];
          if (!note) {
            return (
              <div key={w.slot ?? i} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-foreground min-w-0 truncate">
                  <span className="text-muted">Wine {i + 1}</span>
                  <span className="text-muted"> · </span>
                  {w.fullText}
                </span>
                {time}
              </div>
            );
          }
          return (
            <details key={w.slot ?? i} className="group">
              <summary className="flex items-baseline justify-between gap-3 text-sm cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-card-hover/50 rounded-lg px-1 -mx-1 transition-colors">
                <span className="text-foreground min-w-0 truncate">
                  <span
                    className="text-muted text-xs inline-block transition-transform duration-150 group-open:rotate-90"
                    aria-hidden
                  >
                    ▸
                  </span>
                  <span className="text-muted"> Wine {i + 1}</span>
                  <span className="text-muted"> · </span>
                  {w.fullText}
                </span>
                {time}
              </summary>
              <div className="my-2 rounded-lg border border-border bg-background/40 p-4 font-[family-name:var(--font-geist-mono)] text-sm leading-relaxed">
                <div className="markdown-content">
                  <ReactMarkdown>{note}</ReactMarkdown>
                </div>
                {provenance?.[i] && <SourceList p={provenance[i]} />}
              </div>
            </details>
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
