"use client";

// PaperFilterPills — the paper-scope selector for Bank Health (/admin/bank-health). A single
// horizontal flex row of four pills that re-scope every statistic on the page to one IMW paper (or the
// aggregate). Cellar system: the active pill is an amber fill with dark stone text and no shadow;
// inactive pills are transparent with a 1px stone border and muted text that lifts to full contrast on
// hover. Rounded-full, px-4 py-1.5, text-sm, 8px gap, wraps on narrow viewports.
//
// Accessible as a radiogroup: roving tabindex, Left/Right/Up/Down arrow navigation that moves and
// selects, Home/End jumps, and an amber focus ring. User-facing labels only.

import { useRef } from "react";

export type PaperValue = 1 | 2 | 3 | null;

const OPTIONS: { value: PaperValue; label: string }[] = [
  { value: null, label: "All papers" },
  { value: 1, label: "Paper 1 · Whites" },
  { value: 2, label: "Paper 2 · Reds" },
  { value: 3, label: "Paper 3 · Special" },
];

// Stable key for the null (all) option so it can index the button ref map.
function keyFor(value: PaperValue): string {
  return value == null ? "all" : String(value);
}

export function PaperFilterPills({
  value,
  onChange,
}: {
  value: PaperValue;
  onChange: (value: PaperValue) => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const activeIndex = Math.max(0, OPTIONS.findIndex((o) => o.value === value));

  const focusIndex = (index: number) => {
    const opt = OPTIONS[index];
    if (!opt) return;
    onChange(opt.value);
    refs.current[keyFor(opt.value)]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case "ArrowRight":
      case "ArrowDown":
        e.preventDefault();
        focusIndex((index + 1) % OPTIONS.length);
        break;
      case "ArrowLeft":
      case "ArrowUp":
        e.preventDefault();
        focusIndex((index - 1 + OPTIONS.length) % OPTIONS.length);
        break;
      case "Home":
        e.preventDefault();
        focusIndex(0);
        break;
      case "End":
        e.preventDefault();
        focusIndex(OPTIONS.length - 1);
        break;
    }
  };

  return (
    <div role="radiogroup" aria-label="Filter by paper" className="flex flex-wrap gap-2">
      {OPTIONS.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={keyFor(opt.value)}
            ref={(el) => {
              refs.current[keyFor(opt.value)] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={i === activeIndex ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`rounded-full px-4 py-1.5 text-sm transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              selected
                ? "bg-accent text-background font-medium"
                : "border border-border bg-transparent text-muted hover:border-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
