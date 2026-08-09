// apply-deferred-feedback.ts — re-fire the accepted feedback that Auto-Apply DEFERRED.
//
// The duplicate-PR guard in applyFeedbackChange lets at most one AUTO auto-feedback PR be in flight
// at a time: the second accept is annotated and left in the open queue rather than dispatched. That
// is the right default — two overlapping auto-fix PRs on the same file once merge-conflicted — but
// nothing re-fires the deferred ones when the in-flight PR clears, so a review session that produces
// several accepts leaves a queue only a human can drain.
//
// This drains it ONE AT A TIME, as 'auto', so the guard still applies: the dispatch happens only if
// nothing is in flight, and the next one waits for the previous PR to merge. That ordering is the
// point, not an inconvenience — each change is generated against a master that already contains the
// previous one, so overlapping proposals for one root cause collapse instead of duplicating.
//
// Run from study-app/ with DATABASE_URL and GITHUB_TOKEN set:
//
//   npx esbuild scripts/apply-deferred-feedback.ts --bundle --platform=node --format=cjs \
//     "--alias:@=./src" --outfile=.tmp/apply-deferred-feedback.cjs
//   node .tmp/apply-deferred-feedback.cjs [attemptId]
//
// With no argument it reports the queue and dispatches the oldest deferred item. With an attemptId
// it dispatches that one. Either way it dispatches at most one per run.

import { neon } from "@neondatabase/serverless";
import { applyFeedbackChange } from "@/lib/apply-change";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set");
  if (!process.env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN must be set (the dispatch needs it)");

  // No reconcile pass here on purpose: the guard inside applyFeedbackChange already asks GitHub what
  // happened to each apparently-open PR before deciding to defer, so a PR merged by hand does not
  // block its successors. Duplicating that here would just be a second opinion on the same question.
  const sql = neon(process.env.DATABASE_URL);
  const inFlight = (await sql`
    SELECT id, attempt_id, apply_status, pr_url FROM feedback_analyses
    WHERE apply_status IN ('dispatched', 'pr_opened') AND updated_at > now() - interval '7 days'
  `) as { id: number; attempt_id: number; apply_status: string; pr_url: string | null }[];
  const deferred = (await sql`
    SELECT fa.id, fa.attempt_id FROM feedback_analyses fa
    WHERE fa.apply_status = 'deferred' ORDER BY fa.applied_at ASC
  `) as { id: number; attempt_id: number }[];

  console.log(`in flight: ${inFlight.length ? inFlight.map((r) => `#${r.id} (attempt ${r.attempt_id}, ${r.apply_status}${r.pr_url ? ` ${r.pr_url}` : ""})`).join(", ") : "none"}`);
  console.log(`deferred:  ${deferred.length ? deferred.map((r) => `#${r.id} (attempt ${r.attempt_id})`).join(", ") : "none"}`);

  // Reported, not enforced: the row may be a PR that was merged by hand, which the guard resolves
  // against GitHub when it runs. Dispatch anyway and let the guard have the final say.
  if (inFlight.length) console.log("(the guard will re-check these against GitHub before deferring)");
  if (!deferred.length) {
    console.log("\nNothing deferred. Queue is drained.");
    return;
  }

  const arg = process.argv[2] ? parseInt(process.argv[2], 10) : null;
  const target = arg ? deferred.find((d) => d.attempt_id === arg) : deferred[0];
  if (!target) throw new Error(`attempt ${arg} is not in the deferred queue`);

  console.log(`\ndispatching attempt ${target.attempt_id} (analysis #${target.id})...`);
  const result = await applyFeedbackChange({ attemptId: target.attempt_id, appliedBy: "auto" });
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
