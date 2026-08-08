"use client";

// The block picker: which papers and families are in scope, and in what order.
//
// Collapsed by default. The whole point of the default walk is that a reviewer shouldn't have to
// think about scope — they open /review and start at P1 F1 — so the controls are one click away
// rather than occupying the top of the screen above the question.

import {
  REVIEW_PAPERS,
  REVIEW_FAMILIES,
  FAMILY_LABELS,
  PAPER_LABELS,
  isDefaultFilter,
  DEFAULT_REVIEW_FILTER,
  type ReviewFilter,
  type ReviewBlock,
} from "@/lib/question-review-shared";

interface Props {
  filter: ReviewFilter;
  blocks: ReviewBlock[];
  /** The block the current card belongs to, so the walk can mark where the reviewer is. */
  currentBlock: { paper: number; family: string } | null;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (next: ReviewFilter) => void;
  busy: boolean;
}

function summarize(filter: ReviewFilter, blocks: ReviewBlock[]): string {
  const remaining = blocks.reduce((n, b) => n + b.remaining, 0);
  if (isDefaultFilter(filter)) return `Whole bank in order · ${remaining} left`;
  const papers =
    filter.papers.length === REVIEW_PAPERS.length
      ? "All papers"
      : filter.papers.map((p) => `P${p}`).join(", ");
  const families =
    filter.families.length === REVIEW_FAMILIES.length
      ? "all families"
      : filter.families.join(", ");
  const order = filter.order === "random" ? " · shuffled" : "";
  return `${papers} · ${families}${order} · ${remaining} left`;
}

export function ReviewBlockPicker({
  filter, blocks, currentBlock, open, onToggleOpen, onChange, busy,
}: Props) {
  // Unticking the last item means "all", never "none" — an empty queue is indistinguishable on
  // screen from a finished one, and one of those is alarming. sanitizeReviewFilter enforces the same
  // rule server-side; this just keeps the checkboxes honest about it.
  const togglePaper = (p: number) => {
    const next = filter.papers.includes(p)
      ? filter.papers.filter((x) => x !== p)
      : [...filter.papers, p];
    onChange({ ...filter, papers: next.length ? next.sort() : [...DEFAULT_REVIEW_FILTER.papers] });
  };
  const toggleFamily = (f: string) => {
    const next = filter.families.includes(f)
      ? filter.families.filter((x) => x !== f)
      : [...filter.families, f];
    onChange({
      ...filter,
      families: next.length ? REVIEW_FAMILIES.filter((x) => next.includes(x)) : [...DEFAULT_REVIEW_FILTER.families],
    });
  };

  return (
    <div className="mb-5 rounded-xl border border-border bg-card">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left cursor-pointer hover:bg-card-hover transition-colors"
      >
        <span className="text-xs">
          <span className="font-medium text-foreground">Reviewing:</span>{" "}
          <span className="text-muted">{summarize(filter, blocks)}</span>
        </span>
        <span className="flex items-center gap-2 text-xs text-muted">
          {open ? "Done" : "Change"}
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">Papers</p>
            <div className="flex flex-wrap gap-1.5">
              {REVIEW_PAPERS.map((p) => {
                const on = filter.papers.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    disabled={busy}
                    aria-pressed={on}
                    onClick={() => togglePaper(p)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors cursor-pointer disabled:opacity-40 ${
                      on ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    Paper {p} <span className="opacity-70">· {PAPER_LABELS[p]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-foreground">Families</p>
            <div className="flex flex-wrap gap-1.5">
              {REVIEW_FAMILIES.map((f) => {
                const on = filter.families.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    disabled={busy}
                    aria-pressed={on}
                    onClick={() => toggleFamily(f)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors cursor-pointer disabled:opacity-40 ${
                      on ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:text-foreground"
                    }`}
                  >
                    {f} <span className="opacity-70">· {FAMILY_LABELS[f]}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-foreground">Order</p>
            <div className="flex flex-wrap gap-1.5">
              {([
                ["grouped", "In order", "P1 F1 → P3 F7, one block at a time"],
                ["random", "Shuffled", "Ignores blocks; a stable shuffle across your whole selection"],
              ] as const).map(([value, label, hint]) => (
                <button
                  key={value}
                  type="button"
                  disabled={busy}
                  aria-pressed={filter.order === value}
                  title={hint}
                  onClick={() => onChange({ ...filter, order: value })}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors cursor-pointer disabled:opacity-40 ${
                    filter.order === value
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border text-muted hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
              {!isDefaultFilter(filter) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onChange({ ...DEFAULT_REVIEW_FILTER })}
                  className="ml-auto rounded-md border border-border px-2.5 py-1 text-xs text-muted transition-colors hover:text-foreground cursor-pointer disabled:opacity-40"
                >
                  Reset to whole bank
                </button>
              )}
            </div>
          </div>

          {/* The walk itself. Shows every block in scope with a tick against the finished ones, so a
              reviewer can see how far through the sequence they are and jump if they want to. */}
          {filter.order === "grouped" && blocks.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-foreground">
                The walk <span className="font-normal text-muted">— {blocks.length} blocks</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {blocks.map((b) => {
                  const isCurrent =
                    currentBlock?.paper === b.paper && currentBlock?.family === b.family;
                  const done = b.remaining === 0;
                  return (
                    <button
                      key={`${b.paper}-${b.family}`}
                      type="button"
                      disabled={busy || done}
                      title={`Paper ${b.paper} · ${b.familyLabel} — ${b.done}/${b.total} reviewed`}
                      onClick={() => onChange({ ...filter, papers: [b.paper], families: [b.family] })}
                      className={`rounded border px-1.5 py-0.5 text-[11px] tabular-nums transition-colors ${
                        isCurrent
                          ? "border-accent bg-accent/15 text-accent"
                          : done
                            ? "border-border/50 text-muted/50 line-through cursor-default"
                            : "border-border text-muted hover:text-foreground cursor-pointer"
                      }`}
                    >
                      P{b.paper} {b.family}
                      <span className="ml-1 opacity-70">
                        {b.done}/{b.total}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
