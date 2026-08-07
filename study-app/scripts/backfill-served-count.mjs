#!/usr/bin/env node
// backfill-served-count.mjs — reconcile served_count with what actually reached candidates.
//
//   node scripts/backfill-served-count.mjs [--apply]
//
// Defaults to a DRY RUN. Pass --apply to write.
//
// WHY THIS EXISTS. `api/get-question/produce.ts` — the main study serve path — recorded
// question_views but never called incrementTimesServed, while the banked route and the Live Tasting
// grade route did both. Measured 2026-08-07: the counter claimed 13 total serves against a true 398,
// with 133 questions reading zero despite having been served. The code path is fixed; this
// reconciles the history it lost.
//
// WHY IT MATTERS BEYOND TELEMETRY. `served_count > 0` is the batch-undo reopen rail: a question that
// has already reached a candidate is left kept rather than yanked back into the review queue. With
// the counter stuck near zero that rail was effectively off, so an undo could have pulled back
// questions candidates had already sat an attempt on.
//
// TRUTH SOURCE. The union of `user_attempts` (a candidate started an attempt) and `question_views`
// (the question was served, attempted or not). Being SERVED is the "seen" event per the feature
// spec — abandoning an attempt still burns it — so a view counts even with no attempt behind it.
//
// The backfill takes the MAX of the stored and derived counts, never the derived alone: any serve
// recorded correctly at the time (banked route, Live Tasting) is already in the counter, and
// question_views only started being written at migration 020. Taking the max cannot lose a serve.

import { neon } from "@neondatabase/serverless";

const APPLY = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }
  const sql = neon(process.env.DATABASE_URL);

  const [before] = await sql`
    WITH truth AS (
      SELECT question_id, count(*)::int AS real_serves
      FROM (
        /* theory-mode-guard: all-modes — deliberate. "Served" is mode-agnostic: a Stem Sniper
           drill puts the question in front of a candidate exactly as a full attempt does, and
           question_views is written for both. Theory cannot leak in regardless — theory attempts
           carry theory_question_id and a NULL question_id, and the join below is to the practical
           bank (generated_questions). */
        SELECT question_id FROM user_attempts WHERE question_id IS NOT NULL
        UNION ALL
        SELECT question_id FROM question_views
      ) x GROUP BY question_id
    )
    SELECT
      count(*)::int                                                   AS matched,
      count(*) FILTER (WHERE COALESCE(g.served_count,0) < t.real_serves)::int AS undercounted,
      COALESCE(sum(g.served_count),0)::int                            AS counter_total,
      COALESCE(sum(t.real_serves),0)::int                             AS truth_total,
      count(*) FILTER (WHERE COALESCE(g.served_count,0)=0 AND t.real_serves>0)::int AS zero_but_served
    FROM truth t JOIN generated_questions g ON g.question_id = t.question_id
  `;

  console.log("Before:");
  console.log(`  questions with a serve record   ${before.matched}`);
  console.log(`  under-counted                   ${before.undercounted}`);
  console.log(`  reading ZERO but served         ${before.zero_but_served}`);
  console.log(`  served_count total              ${before.counter_total}`);
  console.log(`  true total                      ${before.truth_total}`);

  if (!APPLY) {
    console.log("\nDRY RUN — nothing written. Re-run with --apply to reconcile.");
    return;
  }

  // GREATEST, never a bare assignment: serves recorded correctly at the time (banked route, Live
  // Tasting) are already counted, and question_views only exists from migration 020 onward.
  // first_served_at is stamped from the earliest evidence, and only where it is currently null.
  const updated = await sql`
    WITH truth AS (
      SELECT question_id,
             count(*)::int AS real_serves,
             min(seen_at)  AS first_seen
      FROM (
        /* theory-mode-guard: all-modes — deliberate. "Served" is mode-agnostic: a Stem Sniper
           drill puts the question in front of a candidate exactly as a full attempt does, and
           question_views is written for both. Theory cannot leak in regardless — theory attempts
           carry theory_question_id and a NULL question_id, and the join below is to the practical
           bank (generated_questions). */
        SELECT question_id, started_at AS seen_at FROM user_attempts WHERE question_id IS NOT NULL
        UNION ALL
        SELECT question_id, first_seen_at AS seen_at FROM question_views
      ) x GROUP BY question_id
    )
    UPDATE generated_questions g SET
      served_count    = GREATEST(COALESCE(g.served_count, 0), t.real_serves),
      times_served    = GREATEST(COALESCE(g.times_served, 0), t.real_serves),
      first_served_at = LEAST(COALESCE(g.first_served_at, t.first_seen), t.first_seen)
    FROM truth t
    WHERE g.question_id = t.question_id
      AND (COALESCE(g.served_count, 0) < t.real_serves OR g.first_served_at IS NULL)
    RETURNING g.question_id
  `;

  const [after] = await sql`
    SELECT COALESCE(sum(served_count),0)::int AS counter_total,
           count(*) FILTER (WHERE served_count > 0)::int AS with_serves
    FROM generated_questions
  `;

  console.log(`\nApplied. ${updated.length} row(s) reconciled.`);
  console.log(`  served_count total now          ${after.counter_total}`);
  console.log(`  questions with a serve now      ${after.with_serves}`);
  console.log(
    "\nNote: questions now reading served_count > 0 are protected by the batch-undo reopen rail,\n" +
      "which is the intended behaviour — they did reach a candidate."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
