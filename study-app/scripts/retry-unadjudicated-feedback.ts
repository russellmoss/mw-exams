// retry-unadjudicated-feedback.ts — one-off recovery (2026-08-09) for feedback that WAS analysed but
// never got a verdict, and so can never be reached again by sweepStrandedFeedback (which keys on
// auto_analysis_id IS NULL).
//
// Three such rows existed at the time of writing: attempts 433, 438 and 442, all down-votes from the
// 2026-08-08 Question Review session, all analysed on Opus 5 against the old 4000-token ceiling and
// all cut off before the "Recommendation:" line. See retryUnadjudicatedFeedback for the full chain.
//
// This is a THIN WRAPPER — it selects nothing itself. The predicate, the one-retry-ever bound and the
// Sonnet pin all live in the library function that the nightly sweep also calls, so this run and the
// automatic one can never diverge.
//
// It spends real tokens (~$0.23 per attempt on Sonnet), writes production rows, and — because
// auto_apply_enabled is ON — an "accept" verdict will fire a repository_dispatch that opens a PR.
// Run from study-app/ with DATABASE_URL, ANTHROPIC_API_KEY and GITHUB_TOKEN set:
//
//   npx esbuild scripts/retry-unadjudicated-feedback.ts --bundle --platform=node --format=cjs \
//     "--alias:@=./src" --outfile=.tmp/retry-unadjudicated-feedback.cjs
//   node .tmp/retry-unadjudicated-feedback.cjs [limit]
//
// Safe to re-run: an attempt that now has a verdict no longer matches, and one that failed twice is
// excluded by the retry bound.

import { retryUnadjudicatedFeedback } from "@/lib/feedback-analysis";

async function main() {
  if (!process.env.DATABASE_URL || !process.env.ANTHROPIC_API_KEY) {
    throw new Error("DATABASE_URL and ANTHROPIC_API_KEY must be set");
  }
  if (!process.env.GITHUB_TOKEN) {
    // Not fatal: only an 'accept' needs it. But a missing token turns an accept into a caught
    // "auto-apply dispatch failed" that leaves the attempt open — worth knowing before, not after.
    console.warn("GITHUB_TOKEN is not set — an 'accept' verdict will not be able to dispatch.");
  }

  const limit = parseInt(process.argv[2] || "3", 10);
  const { retried, results } = await retryUnadjudicatedFeedback(limit);

  for (const r of results) {
    console.log(`  attempt ${r.attemptId}: ${r.status}${r.recommendation ? ` → ${r.recommendation}` : ""}`);
  }
  console.log(`\n${retried} attempt(s) retried`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
