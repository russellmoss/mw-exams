#!/usr/bin/env node
/**
 * Retroactively reclassify praise that was auto-REJECTED before the `endorsed` status existed
 * (migration 057).
 *
 * Until 2026-08-06 the feedback analyzer's only terminal verdicts were accept/reject/partial, so
 * "this is a good question" was filed as rejected — wrong in the ledger (it inflates the reject
 * rate that we read as a quality signal) and wrong in the UI (the user who complimented a question
 * was told "Auto-rejected"). This script finds those rows and moves them to `endorsed`, flagging
 * the praised question as an exemplar for question generation.
 *
 * SAFETY: only touches rows whose feedback text matches a praise pattern AND whose current status
 * is 'rejected' AND that were decided by 'auto'. A human decision is never overwritten. Dry-run by
 * default — pass --apply to write.
 *
 *   node scripts/backfill-endorsements.mjs            # dry run, prints candidates
 *   node scripts/backfill-endorsements.mjs --apply    # writes
 */
import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");

// Praise the analyzer would now classify Kind: praise. Deliberately conservative — a phrase that
// merely CONTAINS "good" ("not a good question", "would be good to fix X") must not match, so the
// negation guard below runs on every candidate.
const PRAISE = /\b(this is a (really |very |pretty )?(good|great|decent|nice|excellent|strong|fair|solid) question|(good|great|decent|nice|excellent|strong|solid) question\b|i (really )?like (this|the) (question|contrast|flight)|well[- ]designed|nicely done|this one is good)\b/i;
// If any of these appear, it is not pure praise — leave it for a human / the live analyzer.
const NEGATION = /\b(not a good|isn'?t a good|wouldn'?t be a good|bad question|poor question|odd question|strange question|would never|incorrect|wrong|error|mistake)\b/i;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  const rows = await sql`
    /* theory-mode-guard: all-modes -- praise is worth endorsing wherever it was left; a question
       praised in a Stem Sniper drill is as good an exemplar as one praised in a full attempt */
    SELECT a.id, a.user_id, u.name AS user_name, a.question_id, a.user_feedback,
           a.feedback_status, a.feedback_decided_by, a.feedback_admin_note
    FROM user_attempts a
    JOIN users u ON u.id = a.user_id
    WHERE a.user_feedback IS NOT NULL AND length(trim(a.user_feedback)) > 0
      AND a.feedback_status = 'rejected'
      AND a.feedback_decided_by = 'auto'
    ORDER BY a.id
  `;

  const candidates = rows.filter(
    (r) => PRAISE.test(r.user_feedback) && !NEGATION.test(r.user_feedback)
  );

  console.log(`Scanned ${rows.length} auto-rejected rows; ${candidates.length} look like praise.\n`);
  for (const c of candidates) {
    const snippet = c.user_feedback.replace(/\s+/g, " ").slice(0, 140);
    console.log(`  attempt ${c.id} — ${c.user_name} — ${c.question_id}`);
    console.log(`    "${snippet}${c.user_feedback.length > 140 ? "…" : ""}"`);
  }

  if (!APPLY) {
    console.log(`\nDry run. Re-run with --apply to reclassify these ${candidates.length} rows.`);
    return;
  }

  let reclassified = 0;
  let endorsedQuestions = 0;
  for (const c of candidates) {
    // Preserve the original note — a feature-request routing note on a mixed praise+FR row is still
    // true and the admin link stays useful.
    const priorNote = c.feedback_admin_note ? ` (was: ${c.feedback_admin_note})` : "";
    await sql`
      UPDATE user_attempts SET
        feedback_status = 'endorsed',
        feedback_admin_note = ${`Reclassified as positive feedback by the endorsement backfill — question flagged as an exemplar for future generation.${priorNote}`},
        feedback_decided_by = 'auto',
        feedback_reviewed_at = NOW()
      WHERE id = ${c.id} AND feedback_decided_by = 'auto'
    `;
    reclassified++;

    const upd = await sql`
      UPDATE generated_questions g SET
        endorsed_at = NOW(),
        endorsement_note = LEFT(a.user_feedback, 600),
        endorsement_source = ${`user_feedback:${c.id} (retroactive)`}
      FROM user_attempts a
      WHERE a.id = ${c.id} AND g.question_id = a.question_id
      RETURNING g.question_id
    `;
    if (upd.length > 0) endorsedQuestions++;

    // Keep the analysis row consistent so the History badge and the admin panel agree.
    await sql`
      UPDATE feedback_analyses SET recommendation = 'endorse'
      WHERE attempt_id = ${c.id} AND recommendation = 'reject'
    `;
  }

  console.log(
    `\nApplied: ${reclassified} attempts → endorsed; ${endorsedQuestions} questions flagged as exemplars.` +
      (reclassified > endorsedQuestions
        ? `\n(${reclassified - endorsedQuestions} had no matching generated_questions row — historical or deleted question.)`
        : "")
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
