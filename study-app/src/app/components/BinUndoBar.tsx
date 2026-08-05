"use client";

import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// BinUndoBar — the fixed bottom-centre bar shown while binned items sit inside the Undo window
// (spec: Undo). A purely reversal affordance: a warm-stone surface (bg-card), 1px border, NO shadow,
// reading "Binned — <wine> · Undo" with an amber Undo link, plus a 1px amber line that drains
// left→right over the 5s window. The parent owns the undo stack; this component owns the countdown.
// Each new bin bumps `resetToken`, restarting both the timer and the drain.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// Undo window: 5s (spec — reduced from the previous 10s).
export const UNDO_WINDOW_MS = 5000;

// A 1px amber line that drains left→right over the window. Keyed by resetToken in the parent so a new
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
      className="absolute top-0 left-0 h-px bg-accent"
      style={{ width: `${w}%`, transition: `width ${durationMs}ms linear` }}
    />
  );
}

interface BinUndoBarProps {
  count: number;
  // A short wine descriptor for the single-item case (e.g. "Chablis 1er Cru, Burgundy, France").
  label: string | null;
  resetToken: number;
  onUndo: () => void;
  onExpire: () => void;
}

export function BinUndoBar({ count, label, resetToken, onUndo, onExpire }: BinUndoBarProps) {
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

  // Single bin reads "Binned — <wine>"; a bulk bin reads "N binned".
  const text = count === 1 ? (label ? `Binned — ${label}` : "Binned") : `${count} binned`;

  return (
    // Fixed at the viewport bottom-centre, constrained to the review column width and above the cards.
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="mx-auto max-w-3xl pointer-events-auto">
        {/* ── UNDO BAR ── warm-stone surface (bg-card), 1px border, no shadow, Geist. Reads
            "Binned — <wine> · Undo" with the Undo as the one amber link. aria-live announces it. */}
        <div
          role="status"
          aria-live="polite"
          className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-center gap-2"
        >
          <DrainLine key={resetToken} durationMs={UNDO_WINDOW_MS} />
          <span className="text-sm text-foreground">{text}</span>
          <span aria-hidden className="text-sm text-muted">
            ·
          </span>
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
