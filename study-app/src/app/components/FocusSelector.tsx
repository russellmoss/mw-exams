"use client";

// FocusSelector — the ONLY candidate-facing surface of the Paper 3 weighted-sampling layer. It lets
// a candidate optionally bias a session toward one style family when they want to drill a weakness
// ("I keep fumbling fortified").
//
// It deliberately reveals nothing about the engine behind it: no percentages, no exam-frequency
// data, no hint that a default weighting exists. "Balanced" reads simply as "a mix of Paper 3
// styles", which is a fact about Paper 3 the candidate already knows.
//
// Session-only: the parent holds the value in React state and it starts at 'balanced' on every page
// load. Nothing is persisted, so a focused session can never silently become the candidate's
// permanent diet.

export type FocusValue =
  | "balanced"
  | "sparkling"
  | "sweet"
  | "fortified"
  | "rose"
  | "oxidative";

// value → chip label + the helper line shown when it is selected.
const CHIPS: { value: FocusValue; label: string; helper: string }[] = [
  { value: "balanced", label: "Balanced", helper: "A mix of Paper 3 styles." },
  { value: "sparkling", label: "Sparkling", helper: "You'll mostly see sparkling wines this session." },
  { value: "sweet", label: "Sweet", helper: "You'll mostly see sweet wines this session." },
  { value: "fortified", label: "Fortified", helper: "You'll mostly see fortified wines this session." },
  { value: "rose", label: "Rosé", helper: "You'll mostly see rosé wines this session." },
  { value: "oxidative", label: "Oxidative", helper: "You'll mostly see oxidative wines this session." },
];

interface FocusSelectorProps {
  value: FocusValue;
  onChange: (value: FocusValue) => void;
}

export function FocusSelector({ value, onChange }: FocusSelectorProps) {
  const active = CHIPS.find((c) => c.value === value) ?? CHIPS[0];

  return (
    <div className="bg-card border border-border rounded-xl p-5 mb-6">
      <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-1">Focus</p>
      <p className="text-xs text-muted mb-3">Optional — bias this session toward one style.</p>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Session focus">
        {CHIPS.map((chip) => {
          const selected = chip.value === value;
          return (
            <button
              key={chip.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(chip.value)}
              className={`rounded-full px-4 py-1.5 text-sm border transition-colors cursor-pointer ${
                selected
                  ? "bg-accent border-accent text-background font-medium"
                  : "bg-transparent border-border text-muted hover:text-foreground hover:border-muted"
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      {/* Always rendered so selecting a chip never shifts the mode buttons below it. */}
      <p className="text-xs text-muted mt-3">{active.helper}</p>
    </div>
  );
}
