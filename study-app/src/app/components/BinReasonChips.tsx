"use client";

import { BIN_REASON_OPTIONS } from "@/lib/bin-reasons";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// BinReasonChips — the multi-select fault toggles inside the "Bin with reason" panel (spec §3).
//
// A controlled, presentational component: the parent owns the selected set and the note; this just
// renders the FIXED chip set as toggle pills and reports each toggle. Cellar look: small bordered
// pills — unselected = border + muted text, selected = amber border + amber text. Keyboard accessible
// (each chip is a real <button> with aria-pressed). No network here — confirming the bin is the
// parent's job; zero chips is a valid selection ("Bin it" is always enabled).
// ─────────────────────────────────────────────────────────────────────────────────────────────────

interface BinReasonChipsProps {
  // The currently-selected fault codes.
  selected: string[];
  // Toggle one code on/off.
  onToggle: (value: string) => void;
}

export function BinReasonChips({ selected, onToggle }: BinReasonChipsProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Bin reasons">
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
                ? "border-accent text-accent"
                : "border-border text-muted hover:border-muted hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
