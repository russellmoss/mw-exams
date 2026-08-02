"use client";

import {
  STEM_DETAIL_LEVELS,
  STEM_DETAIL_META,
  type StemDetailLevel,
} from "@/lib/prompts/stemDetail";

// Resolve the stem prose for a level from a served question, falling back to the canonical text.
export function stemForLevel(
  q: { text: string; stemGuided?: string | null; stemExamReal?: string | null; stemBlind?: string | null },
  level: StemDetailLevel
): string {
  if (level === "guided") return q.stemGuided || q.text;
  if (level === "blind") return q.stemBlind || q.text;
  return q.stemExamReal || q.text;
}

// The muted-amber Stem Detail badge (Cellar badge treatment — never the PASS/BORDERLINE/FAIL colours).
export function StemDetailBadge({
  level,
  escalatedFrom,
}: {
  level: StemDetailLevel;
  escalatedFrom?: StemDetailLevel | null;
}) {
  const label = escalatedFrom
    ? `${STEM_DETAIL_META[escalatedFrom].name} → ${STEM_DETAIL_META[level].name}`
    : STEM_DETAIL_META[level].name;
  return (
    <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.06em] px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/25">
      {label}
    </span>
  );
}

// Three-segment control: single row, flat bordered, amber fill on the active segment, transparent on
// inactive. Each segment shows the name plus a one-line muted descriptor.
export function StemDetailSegments({
  value,
  onChange,
  idPrefix = "stem-detail",
}: {
  value: StemDetailLevel;
  onChange: (level: StemDetailLevel) => void;
  idPrefix?: string;
}) {
  return (
    <div className="flex rounded-lg border border-border overflow-hidden" role="radiogroup" aria-label="Stem Detail">
      {STEM_DETAIL_LEVELS.map((level, i) => {
        const active = level === value;
        return (
          <button
            key={level}
            id={`${idPrefix}-${level}`}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(level)}
            className={`flex-1 px-3 py-3 text-left transition-colors cursor-pointer ${
              i > 0 ? "border-l border-border" : ""
            } ${active ? "bg-accent text-background" : "bg-transparent hover:bg-card-hover text-foreground"}`}
          >
            <span className="block text-sm font-semibold">{STEM_DETAIL_META[level].name}</span>
            <span className={`block text-xs mt-0.5 ${active ? "text-background/80" : "text-muted"}`}>
              {STEM_DETAIL_META[level].descriptor}
            </span>
          </button>
        );
      })}
    </div>
  );
}
