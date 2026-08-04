"use client";

import { useEffect, useRef, useState } from "react";
import { BIN_REASON_OPTIONS } from "@/lib/bin-reasons";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// BinUndoBar — the fixed cluster shown while binned items sit inside the 10s Undo window (spec §2/§3).
//
// It is DECOUPLED from the bin itself: binning is optimistic and unconditional; this bar only offers a
// reversal and OPTIONAL, non-blocking reason capture. Two stacked pieces, one fixed cluster at the
// viewport bottom, spanning the review column:
//   • a wrapped row of reason chips (multi-select, "Other…" opens one free-text input), and
//   • the amber "N binned · Undo" bar with a 2px amber progress line draining left→right over 10s.
//
// The parent owns the undo stack and the reason payload; this component owns the countdown. Each new
// bin bumps `resetToken`, which restarts both the timer and the drain animation.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

export const UNDO_WINDOW_MS = 10000;

// A 2px amber line that drains left→right over the window. Keyed by resetToken in the parent so a new
// bin remounts it from 0%. Uses a mount→100% width transition rather than a keyframe so it needs no
// global CSS.
function DrainLine({ durationMs }: { durationMs: number }) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setW(100));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      aria-hidden
      className="absolute top-0 left-0 h-0.5 bg-accent"
      style={{ width: `${w}%`, transition: `width ${durationMs}ms linear` }}
    />
  );
}

interface BinUndoBarProps {
  count: number;
  resetToken: number;
  onUndo: () => void;
  onExpire: () => void;
  // Reason state (lifted to the parent so it can attach to every id on the undo stack).
  selected: string[];
  onToggle: (value: string) => void;
  otherOpen: boolean;
  onToggleOther: () => void;
  note: string;
  onNoteChange: (v: string) => void;
  onNoteSubmit: () => void;
}

export function BinUndoBar({
  count,
  resetToken,
  onUndo,
  onExpire,
  selected,
  onToggle,
  otherOpen,
  onToggleOther,
  note,
  onNoteChange,
  onNoteSubmit,
}: BinUndoBarProps) {
  // Keep the latest onExpire without re-arming the timer on every parent render.
  const expireRef = useRef(onExpire);
  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  // Arm / re-arm the countdown on each new bin. On expiry the parent flushes the stack and dismisses.
  useEffect(() => {
    const id = window.setTimeout(() => expireRef.current(), UNDO_WINDOW_MS);
    return () => window.clearTimeout(id);
  }, [resetToken]);

  const label = count === 1 ? "Binned" : `${count} binned`;

  return (
    // Fixed at the viewport bottom, constrained to the review column width and above the cards.
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="mx-auto max-w-3xl flex flex-col gap-2 pointer-events-auto">
        {/* ── REASON CHIPS ── optional, non-blocking; directly above the bar (spec §3). */}
        <div>
          <div className="flex flex-wrap gap-2">
            {BIN_REASON_OPTIONS.map((opt) => {
              const on = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => onToggle(opt.value)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                    on
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border bg-transparent text-muted hover:border-muted"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            {/* "Other…" is the ONLY chip that opens text entry. */}
            <button
              type="button"
              aria-pressed={otherOpen}
              onClick={onToggleOther}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                otherOpen
                  ? "border-accent bg-accent/10 text-accent"
                  : "border-border bg-transparent text-muted hover:border-muted"
              }`}
            >
              Other…
            </button>
          </div>
          {otherOpen && (
            <input
              type="text"
              autoFocus
              value={note}
              placeholder="What was wrong?"
              onChange={(e) => onNoteChange(e.target.value)}
              onBlur={onNoteSubmit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onNoteSubmit();
                }
              }}
              className="mt-2 w-full text-sm px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
            />
          )}
        </div>

        {/* ── UNDO BAR ── warm-stone surface, 1px border, no shadow, Geist. aria-live for the count. */}
        <div
          role="status"
          aria-live="polite"
          className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-between gap-4"
        >
          <DrainLine key={resetToken} durationMs={UNDO_WINDOW_MS} />
          <span className="text-sm text-foreground">{label}</span>
          <button
            type="button"
            onClick={onUndo}
            className="text-sm font-medium text-accent hover:text-accent-hover transition-colors cursor-pointer"
          >
            Undo
          </button>
        </div>
      </div>
    </div>
  );
}
