"use client";

import { FAMILY_LABELS } from "@/lib/question-loader";

const FAMILY_DESCRIPTIONS: Record<string, string> = {
  F1: "All wines share one grape variety across different origins or styles",
  F2: "Wines from the same country or region, testing internal diversity",
  F3: "Blended wines where composition and component roles are key",
  F4: "Each wine is independent — tests breadth of identification",
  F5: "Focus on how the wine was made: sparkling, fortified, or sweet mechanisms",
  F6: "Wines grouped by a structural axis: maturity, sweetness, or style",
  F7: "Wines at different tiers within a legal classification system",
};

interface FamilyFilterProps {
  paper: number;
  counts: Record<string, number>;
  onSelect: (family: string) => void;
  onBack: () => void;
}

export function FamilyFilter({
  paper,
  counts,
  onSelect,
  onBack,
}: FamilyFilterProps) {
  const paperLabel =
    paper === 1
      ? "Paper 1 -- Whites"
      : paper === 2
        ? "Paper 2 -- Reds"
        : "Paper 3 -- Special";

  const families = ["any", "F1", "F2", "F3", "F4", "F5", "F6", "F7"];

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="text-muted hover:text-foreground transition-colors text-sm cursor-pointer"
        >
          &larr; Back
        </button>
        <h2 className="text-xl font-semibold">{paperLabel}</h2>
      </div>
      <p className="text-muted text-sm mb-6">
        Choose a question family to focus on, or pick &quot;Any&quot; for a
        random question.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {families.map((f) => {
          const count = counts[f] || 0;

          const label = f === "any" ? "Any Family" : FAMILY_LABELS[f] || f;
          const desc =
            f === "any"
              ? "Random across all question types"
              : FAMILY_DESCRIPTIONS[f] || "";

          const countLabel =
            count > 0
              ? `${count} in bank`
              : "generates fresh";

          return (
            <button
              key={f}
              onClick={() => onSelect(f)}
              className={`group text-left rounded-lg border border-border p-4 transition-all duration-200 cursor-pointer hover:border-accent/60 hover:bg-card-hover ${
                f === "any" ? "sm:col-span-2 bg-card-hover border-accent/30" : "bg-card"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-foreground">
                  {f !== "any" && (
                    <span className="text-accent text-xs font-mono mr-2">
                      {f}
                    </span>
                  )}
                  {label}
                </span>
                <span className="text-xs text-muted tabular-nums">
                  {countLabel}
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed">{desc}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
