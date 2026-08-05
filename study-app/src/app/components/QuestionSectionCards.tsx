"use client";

import { markPhrase, type QuestionSection } from "@/lib/question-sections";

/**
 * Split Sections — the two bordered Cellar cards a mixed-scope question renders under. One card per
 * scope (flight → per_wine), each with a Fraunces heading left and its mark subtotal right in muted
 * mono. Sub-part letters are the question's own continuous letters — never renumbered per section.
 *
 * Used by QuestionDisplay (live) and HistoryView (replay) so the study screen and history render the
 * same shape. A wineCount is required to phrase per-wine marks as "N per wine (N total)".
 */
export function QuestionSectionCards({
  sections,
  wineCount,
}: {
  sections: QuestionSection[];
  wineCount: number;
}) {
  return (
    <div className="space-y-4 mb-8">
      {sections.map((section) => (
        <div key={section.scope} className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Header: serif heading left, subtotal right (amber-emphasised mono per the Cellar system). */}
          <div className="px-8 py-5 flex items-baseline justify-between gap-4 border-b border-border/50">
            <h3 className="font-display text-lg text-foreground">{section.heading}</h3>
            <span className="text-sm font-mono text-accent tabular-nums shrink-0">
              {section.subtotal} marks
            </span>
          </div>
          <div>
            {section.subParts.map((sq, i) => (
              <div
                key={sq.label}
                className={`px-8 py-5 flex gap-4 ${
                  i < section.subParts.length - 1 ? "border-b border-border/30" : ""
                }`}
              >
                <span className="text-accent font-mono text-sm font-semibold shrink-0 mt-0.5">
                  {sq.label})
                </span>
                <div className="flex-1">
                  <p className="text-[15px] text-foreground/90 leading-relaxed">{sq.text}</p>
                </div>
                <span className="text-xs text-muted font-mono shrink-0 mt-0.5 whitespace-nowrap tabular-nums">
                  {markPhrase(sq, wineCount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
