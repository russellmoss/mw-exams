"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// BinUndoBar — the fixed bottom-centre bar shown while binned items sit inside the Undo window
// (spec §2). Reason capture is now DECOUPLED from the bin and happens AFTER success, as the one-tap
// chips rendered directly beneath this bar (spec §3) — passed in as `children` so the whole cluster
// (bar + chips) shares this one fixed container and lifetime. This component itself is purely the
// reversal affordance: a warm-stone surface (bg-card), 1px border, NO shadow, reading "Binned · Undo"
// with an amber Undo link, plus a 2px amber line that drains left→right over the window. The parent
// owns the undo stack; this component owns the countdown. Each new bin bumps `resetToken`, restarting
// both the timer and the drain.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// Undo window: ~10s (spec §2).
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
  // Optional reason-chip cluster, rendered directly beneath the bar (spec §3).
  children?: ReactNode;
}

export function BinUndoBar({ count, resetToken, onUndo, onExpire, children }: BinUndoBarProps) {
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
    // Fixed at the viewport bottom-centre, constrained to the review column width and above the cards.
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="mx-auto max-w-3xl pointer-events-auto">
        {/* ── UNDO BAR ── warm-stone surface (bg-card), 1px border, no shadow, Geist. Reads
            "Binned · Undo" with the Undo as the one amber link. aria-live announces the count. */}
        <div
          role="status"
          aria-live="polite"
          className="relative overflow-hidden rounded-lg border border-border bg-card px-4 py-3 flex items-center justify-center gap-2"
        >
          <DrainLine key={resetToken} durationMs={UNDO_WINDOW_MS} />
          <span className="text-sm text-foreground">{label}</span>
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

        {/* ── REASON CHIPS (spec §3) ── optional, non-blocking; rendered beneath the bar. */}
        {children}
      </div>
    </div>
  );
}
