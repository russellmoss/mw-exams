/**
 * The single-question verdict bands — ONE definition, shared by every grader and by the prompt
 * text that tells the model about them.
 *
 * WHY THIS MODULE EXISTS. The bands were previously written out by hand in each place that needed
 * them, and the copies had drifted into two separate defects:
 *
 *   1. A HOLE AT 50–54. `MARKING_PRINCIPLES` said "FAIL < 50, BORDERLINE ≈ 55–64, PASS ≥ 65", so a
 *      script on 52 belonged to no band and the model had to invent one. Two runs of the same
 *      script could land either side of that gap and disagree for no reason a candidate could see.
 *   2. A GRADER CONTRADICTING ITSELF. The Flash Notes prompt said "BORDERLINE 50–64" while also
 *      injecting MARKING_PRINCIPLES, which said "≈55–64" — two different band tables in one
 *      prompt — and its own code used a third boundary in a comment that said "~55–64".
 *
 * THE RESOLUTION, and it is a judgement call worth naming: the band edges follow the IMW's own
 * numbers rather than splitting the difference. The published standard is a ~50% per-paper floor
 * and a 65% average, so 50 is where "not good enough" starts and 65 is where "good enough" starts.
 * 50–54 therefore belongs to BORDERLINE, which is also what the Flash Notes code already did. The
 * "≈55" was the outlier, and nothing was ever well-defined in that gap for this to contradict.
 *
 * These remain a single-question PROXY. The real pass standard is an average across three papers
 * with a floor, and no one question decides it — see EK-0116.
 */

export type MarkingBand = "pass" | "borderline" | "fail";

/** Inclusive lower bounds, as a percentage of the marks available. */
export const BAND_FLOOR = {
  /** The IMW's published pass standard: a 65% average across the three practical papers. */
  pass: 65,
  /** The IMW's published per-paper minimum. Below this, one paper sinks the attempt. */
  borderline: 50,
} as const;

/**
 * The band a percentage falls in. Total, with no gaps — that absence of a gap is the point.
 *
 * Scores are clamped rather than rejected: a grader that returns 104 has made an arithmetic
 * mistake, and refusing to band it would turn a slightly-wrong mark into a failed debrief.
 */
export function bandForScore(pct: number): MarkingBand {
  if (!Number.isFinite(pct)) return "borderline";
  const clamped = Math.min(100, Math.max(0, pct));
  if (clamped >= BAND_FLOOR.pass) return "pass";
  if (clamped >= BAND_FLOOR.borderline) return "borderline";
  return "fail";
}

/**
 * The canonical band sentence for a system prompt. Injected rather than retyped so a prompt can
 * never describe bands the code does not implement — the drift this module was created to end.
 */
export const MARKING_BANDS_PROSE =
  `FAIL below ${BAND_FLOOR.borderline}, BORDERLINE ${BAND_FLOOR.borderline}–${BAND_FLOOR.pass - 1}, ` +
  `PASS ${BAND_FLOOR.pass} and above. These bands are exhaustive and have no gaps: every score ` +
  `falls in exactly one of them, so never invent an intermediate verdict or hedge between two.`;
