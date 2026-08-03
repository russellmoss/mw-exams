"use client";

import { useState } from "react";

export interface OriginalStemData {
  questionText: string;
  totalMarks?: number;
  paper?: number;
  familyLabel?: string;
  // Paper 3 only — the look of the glass, which is part of what the candidate was given.
  visuals?: { slot: number; appearance: string }[];
}

/**
 * The question stem, reopenable next to the feedback that grades it.
 *
 * Once a drill is scored the stem disappears, so a critique like "you ignored the ageability cue"
 * can't be checked against what was actually asked. This puts it back, collapsed by default so the
 * reveal still leads with the score.
 *
 * Deliberately NOT an overlay: it expands in flow beneath its own header, so nothing it opens over
 * is hidden. Used on the live reveal and in /history.
 */
export function OriginalStem({ stem, className = "" }: { stem: OriginalStemData | null; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!stem?.questionText) return null;

  return (
    <div className={`bg-card border border-border rounded-xl ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left cursor-pointer group"
      >
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="text-xs font-medium text-foreground group-hover:text-accent transition-colors">
            Original stem
          </span>
          <span className="text-[10px] text-muted truncate">
            {[stem.paper ? `Paper ${stem.paper}` : null, stem.familyLabel, stem.totalMarks ? `${stem.totalMarks} marks` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span className={`text-muted text-[10px] transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 border-t border-border">
          {/* The stem is printed exam text — preserve its line breaks rather than reflowing it. */}
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{stem.questionText}</p>

          {stem.visuals && stem.visuals.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border">
              <div className="text-[10px] uppercase tracking-wide text-muted mb-1.5">In the glass</div>
              <ul className="space-y-1">
                {stem.visuals.map((v) => (
                  <li key={v.slot} className="text-xs text-foreground/80">
                    <span className="text-muted mr-1.5">W{v.slot}</span>
                    {v.appearance}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
