"use client";

import {
  benchmarkFor,
  formatMMSS,
  paceStripPillLabel,
  type PaceMode,
  type SpeedSeconds,
} from "@/lib/pace";

interface PaceStripProps {
  wineCount: number;
  // Total flight elapsed (the always-counting-up clock).
  totalElapsed: number;
  // Final seconds for each already-banked wine, in wine order.
  bankedWineTimes: number[];
  // The total-elapsed value at which the current wine's clock started.
  activeWineStart: number;
  paceMode: PaceMode;
  speedSeconds: SpeedSeconds;
  // Pills lock once the flight is underway (first wine banked) to avoid mid-flight benchmark changes.
  locked: boolean;
  onSelectPace: (mode: PaceMode) => void;
  onNextWine: () => void;
}

function PacePill({
  mode,
  active,
  locked,
  label,
  onClick,
}: {
  mode: PaceMode;
  active: boolean;
  locked: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      title={locked ? "Pace is locked once the flight is underway." : undefined}
      aria-pressed={active}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
        locked ? "cursor-default opacity-60" : "cursor-pointer"
      } ${
        active
          ? "border-accent text-accent"
          : "border-border text-muted hover:text-foreground hover:border-muted"
      }`}
      data-pace={mode}
    >
      {label}
    </button>
  );
}

export function PaceStrip({
  wineCount,
  totalElapsed,
  bankedWineTimes,
  activeWineStart,
  paceMode,
  speedSeconds,
  locked,
  onSelectPace,
  onNextWine,
}: PaceStripProps) {
  const benchmark = benchmarkFor(paceMode, speedSeconds);
  const activeIndex = Math.min(bankedWineTimes.length, wineCount);
  const flightComplete = bankedWineTimes.length >= wineCount;
  const activeElapsed = Math.max(0, totalElapsed - activeWineStart);
  const isFinalWine = activeIndex === wineCount - 1;
  const activeOver = activeElapsed > benchmark;
  const remaining = benchmark - activeElapsed;
  const lastMinute = remaining > 0 && remaining <= 60;

  return (
    <div className="border-b border-border bg-card/40">
      <div className="max-w-4xl mx-auto px-6 py-3">
        {/* Top row: benchmark pills */}
        <div className="flex items-center gap-2">
          <PacePill
            mode="exam"
            active={paceMode === "exam"}
            locked={locked}
            label={paceStripPillLabel("exam", speedSeconds)}
            onClick={() => onSelectPace("exam")}
          />
          <PacePill
            mode="speed"
            active={paceMode === "speed"}
            locked={locked}
            label={paceStripPillLabel("speed", speedSeconds)}
            onClick={() => onSelectPace("speed")}
          />
          {locked && (
            <span className="text-[10px] text-muted/70 ml-1">Pace locked</span>
          )}
        </div>

        {/* Bottom row: wine chips + live clock + next-wine control */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {Array.from({ length: wineCount }).map((_, i) => {
              const banked = i < bankedWineTimes.length;
              const isActive = i === activeIndex && !flightComplete;
              let secs = 0;
              let cls = "border-border/60 text-muted/50"; // upcoming
              if (banked) {
                secs = bankedWineTimes[i];
                cls = secs > benchmark
                  ? "border-border text-fail" // banked over
                  : "border-border text-muted"; // banked on-pace
              } else if (isActive) {
                secs = activeElapsed;
                cls = activeOver
                  ? "border-fail text-fail" // active over
                  : lastMinute
                    ? "border-accent text-accent" // active on-pace, under-1-min warning
                    : "border-accent text-accent"; // active on-pace
              }
              return (
                <span
                  key={i}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium tabular-nums transition-colors ${cls}`}
                >
                  <span>Wine {i + 1}</span>
                  {(banked || isActive) && (
                    <span className="font-mono">{formatMMSS(secs)}</span>
                  )}
                </span>
              );
            })}
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {/* Large live clock */}
            <div
              className={`font-mono tabular-nums text-lg font-semibold ${
                flightComplete
                  ? "text-muted"
                  : activeOver
                    ? "text-fail"
                    : lastMinute
                      ? "text-accent"
                      : "text-foreground"
              }`}
            >
              {flightComplete ? (
                formatMMSS(totalElapsed)
              ) : activeOver ? (
                <span>
                  {formatMMSS(benchmark)}{" "}
                  <span className="text-sm font-medium">+ {formatMMSS(activeElapsed - benchmark)} over</span>
                </span>
              ) : (
                formatMMSS(activeElapsed)
              )}
            </div>

            {/* Next wine / Finish flight — banks the active wine's elapsed seconds */}
            {!flightComplete && (
              <button
                type="button"
                onClick={onNextWine}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-accent text-accent hover:bg-accent/10 transition-colors cursor-pointer whitespace-nowrap"
              >
                {isFinalWine ? "Finish flight" : "Next wine"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
