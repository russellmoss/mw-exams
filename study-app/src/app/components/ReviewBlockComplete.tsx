"use client";

// Shown when a paper × family block runs out.
//
// The alternative — rolling silently into the next block — defeats the point of grouping. If the
// header quietly changes from "Same variety" to "Same origin" mid-flow, the reviewer carries the
// previous block's frame of reference into the next one, which is precisely the context switch the
// grouped walk exists to prevent. A deliberate stop makes the boundary impossible to miss and gives
// a natural place to stop for the day.

import { PAPER_LABELS, type ReviewBlock } from "@/lib/question-review-shared";

interface Props {
  /** The block just finished, with its final tally for this reviewer. */
  completed: ReviewBlock;
  tally: { up: number; down: number; skipped: number };
  /** The next block in the walk, or null when the whole selection is done. */
  next: ReviewBlock | null;
  onContinue: () => void;
  onPick: () => void;
}

export function ReviewBlockComplete({ completed, tally, next, onContinue, onPick }: Props) {
  return (
    <div className="rounded-xl border border-accent/30 bg-card px-6 py-10 text-center">
      <p className="text-xs font-medium uppercase tracking-wide text-accent">Block complete</p>

      <h2 className="mt-2 font-display text-2xl text-foreground">
        Paper {completed.paper} · {completed.familyLabel}
      </h2>
      <p className="mt-1 text-xs text-muted">
        {PAPER_LABELS[completed.paper]} · {completed.family}
      </p>

      <div className="mt-5 flex items-center justify-center gap-5 text-sm">
        <span className="text-success">
          <span className="tabular-nums font-semibold">{tally.up}</span> approved
        </span>
        <span className="text-fail">
          <span className="tabular-nums font-semibold">{tally.down}</span> rejected
        </span>
        <span className="text-muted">
          <span className="tabular-nums font-semibold">{tally.skipped}</span> skipped
        </span>
      </div>

      {next ? (
        <>
          <p className="mt-7 text-sm text-muted">
            Next up: <span className="text-foreground">Paper {next.paper} · {next.familyLabel}</span>{" "}
            <span className="tabular-nums">({next.remaining} to review)</span>
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={onContinue}
              autoFocus
              className="rounded-lg border border-accent/40 bg-accent/15 px-5 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/25 cursor-pointer"
            >
              Start Paper {next.paper} · {next.family}
            </button>
            <button
              type="button"
              onClick={onPick}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-card-hover hover:text-foreground cursor-pointer"
            >
              Pick another block
            </button>
          </div>
          <p className="mt-3 text-[11px] text-muted">
            <kbd className="font-mono">↵</kbd> to continue
          </p>
        </>
      ) : (
        <>
          <p className="mt-7 text-sm text-muted">
            That&rsquo;s everything in your current selection.
          </p>
          <button
            type="button"
            onClick={onPick}
            autoFocus
            className="mt-4 rounded-lg border border-accent/40 bg-accent/15 px-5 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/25 cursor-pointer"
          >
            Choose what to review next
          </button>
        </>
      )}
    </div>
  );
}
