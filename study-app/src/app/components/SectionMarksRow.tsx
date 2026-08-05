"use client";

import { SECTION_A_TAIL, SECTION_B_TAIL } from "@/lib/question-sections";

// Split Sections — the debrief's per-section mark row. The evaluate-full grader emits a machine tag
// (parsed here) carrying the marks it awarded to each section; this renders as a row ABOVE the
// competency breakdown, each number coloured by the per-question verdict thresholds applied to the
// section's own ratio (proxy bands EK-0116: PASS ≥65% / BORDERLINE ≥55% / FAIL below).

export interface SectionScore {
  awarded: number;
  outOf: number;
}

export interface SectionMarks {
  sectionA?: SectionScore | null;
  sectionB?: SectionScore | null;
}

const TAG = /<!--\s*SECTION_MARKS\s*(\{[\s\S]*?\})\s*-->/;

/** Pull the section-marks tag out of a debrief. Returns null when absent or malformed. */
export function parseSectionMarks(feedback: string | null | undefined): SectionMarks | null {
  if (!feedback) return null;
  const m = feedback.match(TAG);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[1]) as SectionMarks;
    const ok = (s?: SectionScore | null) =>
      s && Number.isFinite(s.awarded) && Number.isFinite(s.outOf) && s.outOf > 0;
    const sectionA = ok(raw.sectionA) ? raw.sectionA : null;
    const sectionB = ok(raw.sectionB) ? raw.sectionB : null;
    if (!sectionA && !sectionB) return null;
    return { sectionA, sectionB };
  } catch {
    return null;
  }
}

/** Remove the machine tag so it never renders in the human-facing markdown. */
export function stripSectionMarksTag(feedback: string): string {
  return feedback.replace(TAG, "").trimEnd();
}

function verdictColor(ratio: number): string {
  if (ratio >= 0.65) return "var(--success)";
  if (ratio >= 0.55) return "var(--borderline)";
  return "var(--fail)";
}

function Cell({ tail, score }: { tail: string; score: SectionScore }) {
  const ratio = score.awarded / score.outOf;
  return (
    <div className="flex items-baseline justify-between gap-4 flex-1 min-w-[180px]">
      <span className="text-sm text-muted">{tail}</span>
      <span
        className="text-lg font-mono font-semibold tabular-nums shrink-0"
        style={{ color: verdictColor(ratio) }}
      >
        {score.awarded}/{score.outOf}
      </span>
    </div>
  );
}

export function SectionMarksRow({ marks }: { marks: SectionMarks | null }) {
  if (!marks || (!marks.sectionA && !marks.sectionB)) return null;
  return (
    <div className="bg-card rounded-xl border border-border p-6 mb-6">
      <div className="flex flex-wrap gap-x-10 gap-y-3">
        {marks.sectionA && <Cell tail={`Section A · ${SECTION_A_TAIL}`} score={marks.sectionA} />}
        {marks.sectionB && <Cell tail={`Section B · ${SECTION_B_TAIL}`} score={marks.sectionB} />}
      </div>
    </div>
  );
}
