"use client";

import { useState } from "react";
import { BIN_REASON_OPTIONS, MAX_BIN_NOTE_CHARS } from "@/lib/bin-reasons";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// BinReasonPanel — the "Bin with reason" modal (spec §3). Cellar look: warm-stone surface, 1px border,
// NO shadow (deliberately flat, unlike a floating dialog), Fraunces title. Opened from the review
// card's "Bin with reason" control; it captures the fault(s) BEFORE the bin, then the parent bins the
// item with {reasons, note} and shows the 5s undo bar. Cancel makes no state change.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

interface BinReasonPanelProps {
  // One-line item summary: "Paper 2 · 3 wines · same variety · 20 marks".
  summary: string;
  onCancel: () => void;
  onConfirm: (reasons: string[], note: string | null) => void;
}

export function BinReasonPanel({ summary, onCancel, onConfirm }: BinReasonPanelProps) {
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");

  const toggle = (value: string) =>
    setSelected((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );

  const canConfirm = selected.length > 0;

  return (
    // Scrim (the one sanctioned dark overlay) + centred panel. The panel itself keeps the flat Cellar
    // look — border, not shadow — per the spec.
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label="Bin with reason"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — Fraunces title + item summary subline. */}
        <h2 className="text-xl font-bold text-foreground font-display tracking-tight">
          Bin with reason
        </h2>
        <p className="text-xs text-muted mt-1">{summary}</p>

        {/* Reason chips — multi-select. Selected = amber fill/border; unselected = bordered ghost. */}
        <div className="mt-5 flex flex-wrap gap-2">
          {BIN_REASON_OPTIONS.map((opt) => {
            const on = selected.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(opt.value)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                  on
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-border bg-transparent text-muted hover:border-muted hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Optional free-text — "Anything else?", capped at ~500 chars. */}
        <div className="mt-4">
          <label className="block text-xs text-muted mb-1.5" htmlFor="bin-reason-note">
            Anything else?
          </label>
          <textarea
            id="bin-reason-note"
            value={note}
            maxLength={MAX_BIN_NOTE_CHARS}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Optional — what was wrong?"
            className="w-full text-sm px-3 py-2 bg-background/40 border border-border rounded-lg text-foreground placeholder:text-muted focus:outline-none focus:border-accent resize-none"
          />
          <p className="text-[11px] text-muted mt-1 text-right tabular-nums">
            {note.length}/{MAX_BIN_NOTE_CHARS}
          </p>
        </div>

        {/* Footer — Cancel (ghost) + amber confirm (disabled until ≥1 chip). */}
        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="text-sm px-4 py-2 rounded-lg border border-border text-muted hover:text-foreground hover:border-muted transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => onConfirm(selected, note.trim() || null)}
            className="text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Bin with reason
          </button>
        </div>
      </div>
    </div>
  );
}
