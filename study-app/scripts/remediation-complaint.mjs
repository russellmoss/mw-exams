// remediation-complaint.mjs — the validated complaint, made visible to the regeneration.
//
// A feedback-question quarantine encodes a reviewer's judgment, and until 2026-08-09 the
// regeneration never saw it: remediateOne knew only paper × family, so for a complaint that never
// became a validator rule the "correction" was a fresh draw from the same distribution — free to
// reproduce the exact fault it was replacing. These helpers pull the complaint back out of the
// quarantine flag (and, via the attempt id both quarantine writers stamp into the detail, out of
// the feedback analysis it came from) so the generation prompt can steer away from it.
//
// Pure functions only — no DB, no env. remediate-questions.mjs imports them for the nightly run;
// tests/remediation-complaint.test.ts imports them directly (same pattern as
// close-fixed-bug-reports.mjs).

/** The feedback-question entries on a quarantined row, tolerant of both jsonb shapes. */
export function feedbackQuarantineEntries(invalidReasons) {
  let parsed = invalidReasons;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((r) => r && r.rule === "feedback-question" && typeof r.detail === "string");
}

/**
 * The attempt ids a row's quarantine flags trace back to. Both writers stamp one into the detail —
 * "Quarantined from attempt 123: …" (quarantineAttemptQuestion) and "Cohort quarantine from
 * attempt 123 …" (quarantineCohort) — and that id is the ONLY join key back to the analysis: a
 * cohort sibling has no user_attempts row of its own, so joining on question_id would find the
 * complaint for the one question it was filed against and miss the other fifteen.
 */
export function attemptIdsFromEntries(entries) {
  const ids = new Set();
  for (const e of entries) {
    for (const m of e.detail.matchAll(/attempt (\d+)/g)) ids.add(Number(m[1]));
  }
  return [...ids];
}

/**
 * The prompt block. Rides AFTER paper scope, producer exclusions and bin lessons, and says so —
 * this is context about one replacement, never a licence to break a rule above it.
 *
 * Sizing: quarantine details are already capped at write time (~160 chars of reviewer note inside
 * a sentence of provenance), but the reviewer's own feedback can run long, so both are re-capped
 * here. Three entries and two feedback texts cover every real shape — a single quarantine is one
 * entry, a cohort member carries one cohort entry plus at most its own — without letting a
 * pathological row flood the prompt.
 */
export function buildComplaintBlock(ctx) {
  if (!ctx) return "";
  const entries = Array.isArray(ctx.entries) ? ctx.entries : [];
  const analyses = Array.isArray(ctx.analyses) ? ctx.analyses : [];
  if (entries.length === 0) return "";

  const lines = entries.slice(0, 3).map((e) => `- ${e.detail.slice(0, 400)}`);
  const feedback = analyses
    .map((a) => (a && typeof a.feedback_text === "string" ? a.feedback_text.trim() : ""))
    .filter(Boolean)
    .slice(0, 2)
    .map((t) => `- The reviewer's own words: "${t.slice(0, 600)}"`);

  return `

## WHY THE QUESTION YOU ARE REPLACING WAS PULLED — do not reproduce the fault
You are regenerating a question that left circulation because an expert reviewer's complaint was
validated. The replacement must be a question that could NOT draw the same complaint. If the
complaint below is categorical — a grape, style or category the bank over-uses — do not build the
replacement on that category. This is context for THIS replacement only; it never overrides the
paper scope or any rule above.

${[...lines, ...feedback].join("\n")}`;
}
