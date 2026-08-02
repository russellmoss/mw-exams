// Age assessment for a retrieved knowledge passage.
//
// Ported from the Wine-inventory knowledge stack, with the WARNINGS REWRITTEN. That rewrite is the
// whole point of the file existing separately, so it is worth being explicit about.
//
// The source system's warnings are about pesticide guidance: registrations get cancelled, application
// rates and re-entry intervals are amended, resistance ratings move, and an assistant citing 2015 spray
// guidance in the present tense sends someone into a vineyard with wrong information. Those warnings
// would be nonsense in an MW exam answer, and worse than nonsense — a model told to hedge about
// "re-entry intervals" while explaining lees ageing produces incoherent prose and burns marks.
//
// The MW risk is different and milder. Production fundamentals barely move: how autolysis works, why
// malolactic fermentation softens acidity, what happens in a solera. What DOES move is regulation
// (permitted additions, dosage categories, appellation rules) and prevailing commercial practice. So
// the thresholds are looser than the source system's and the warning names a different class of risk.
//
// DESIGN, retained from the source: the age is a DETERMINISTIC computation attached to every passage,
// not a line in the prompt. A prose instruction ("mention the date if it's old") is advisory and gets
// dropped under a long context. Computing it server-side puts the age in the tool result as data the
// model has to actively contradict rather than merely forget.

/** Below this, treated as current. Looser than the source system's 5 — enology fundamentals age slowly. */
export const AGING_YEARS = 10;
/** At or beyond this, called out as genuinely old. */
export const STALE_YEARS = 20;

export type PassageAgeLevel = "current" | "aging" | "stale" | "unknown";

export interface PassageAge {
  level: PassageAgeLevel;
  /** Whole years since publication; null when the document carries no trustworthy date. */
  ageYears: number | null;
  /** Warning for the model to weigh, or null when the passage is current. */
  warning: string | null;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Assess how current a passage is.
 *
 * `publishedAt` must be a DECLARED publication date. Do not pass a sitemap lastmod: that records when
 * a page was last touched — a theme migration, a category re-tag — and treating it as a publication
 * date presents a 2009 document as current. retrieve.ts keeps the two separate for this reason.
 *
 * A null date yields "unknown" WITH a warning, deliberately: an undated document is not the same as a
 * fresh one, and silently treating it as fine is how stale guidance gets laundered into confident prose.
 */
export function assessPassageAge(publishedAt: Date | null | undefined, now: Date = new Date()): PassageAge {
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) {
    return {
      level: "unknown",
      ageYears: null,
      warning:
        "Publication date unknown. Safe to rely on for established production principles; do not " +
        "present it as evidence of CURRENT regulation or prevailing commercial practice.",
    };
  }

  const ageYears = Math.floor((now.getTime() - publishedAt.getTime()) / MS_PER_YEAR);
  // A slightly-future stamp (timezone edge, a source that post-dates an issue) is not a warning case.
  if (ageYears < AGING_YEARS) return { level: "current", ageYears: Math.max(ageYears, 0), warning: null };

  const stamp = publishedAt.toISOString().slice(0, 7);
  if (ageYears >= STALE_YEARS) {
    return {
      level: "stale",
      ageYears,
      warning:
        `Published ${stamp}, about ${ageYears} years ago. Production mechanism described here is ` +
        "likely still sound, but treat any statement about what is PERMITTED, what is TYPICAL, or " +
        "what the market does as out of date.",
    };
  }
  return {
    level: "aging",
    ageYears,
    warning:
      `Published ${stamp}, about ${ageYears} years ago. Fine for mechanism; verify anything about ` +
      "current regulation or prevailing practice.",
  };
}

/**
 * Summarize a whole result set, so the model gets one signal alongside the per-passage notes.
 * Returns null when every passage is current (nothing worth saying).
 */
export function summarizeCorpusAge(ages: PassageAge[]): string | null {
  const stale = ages.filter((a) => a.level === "stale").length;
  const unknown = ages.filter((a) => a.level === "unknown").length;
  const aging = ages.filter((a) => a.level === "aging").length;
  if (!stale && !unknown && !aging) return null;

  const parts: string[] = [];
  if (stale) parts.push(`${stale} over 20 yrs`);
  if (aging) parts.push(`${aging} 10-20 yrs`);
  if (unknown) parts.push(`${unknown} undated`);
  return `Source currency — of ${ages.length} passage(s): ${parts.join(", ")}.`;
}
