// Writes the auto-feedback pipeline result back to the row that dispatched it.
// Invoked by the GitHub Action (.github/workflows/auto-feedback.yml).
// Reads config from env: DATABASE_URL, ANALYSIS_ID, BIN_PROPOSAL_ID, APPLY_STATUS, COMMIT_SHA,
// PR_URL, DEPLOY_STATE, APPLY_ERROR. Only non-empty fields are written (COALESCE).
//
// Two dispatch sources share the Action:
//   - feedback (ANALYSIS_ID set)     → feedback_analyses
//   - bin-fix miner (BIN_PROPOSAL_ID set) → bin_fix_proposals (migration 042). Status maps onto the
//     proposal lifecycle: merged / pr_opened / failed. Retirement of the evidence rows happens
//     app-side (reconcileBinFixProposals), never here — this script only records what the run did.
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const analysisId = Number(process.env.ANALYSIS_ID);
const binProposalId = Number(process.env.BIN_PROPOSAL_ID);

const v = (x) => (x && String(x).length > 0 ? String(x) : null);

const applyStatus = v(process.env.APPLY_STATUS);
const commitSha = v(process.env.COMMIT_SHA);
const prUrl = v(process.env.PR_URL);
const deployState = v(process.env.DEPLOY_STATE);
const applyError = v(process.env.APPLY_ERROR);

if (binProposalId && !Number.isNaN(binProposalId)) {
  // 'merged' should not normally occur (bin fixes are always reviewOnly), but record it faithfully
  // if it ever does — the app-side reconcile turns merged into shipped + retired.
  const status =
    applyStatus === "merged" ? "merged" : applyStatus === "pr_opened" ? "pr_opened" : "failed";
  // A rejection wins over a late Action result. The admin may reject a dispatched proposal while its
  // build is still running — that is the normal way a duplicate is caught, since you usually only see
  // the duplication by reading the PR the build produces. Without this guard the run's write-back
  // would flip 'rejected' straight back to 'pr_opened' and the proposal would silently return to the
  // review queue. (Proposal 10 was in exactly that state on 2026-08-08.)
  const updated = await sql`
    UPDATE bin_fix_proposals SET
      status = ${status},
      pr_url = COALESCE(${prUrl}::text, pr_url),
      apply_error = COALESCE(${applyError}::text, apply_error),
      updated_at = NOW()
    WHERE id = ${binProposalId} AND status <> 'rejected'
    RETURNING id
  `;
  if (updated.length === 0)
    console.log("record-apply: proposal", binProposalId, "was rejected while this run was in flight — status left as 'rejected'; close the PR if one was opened");
  console.log("record-apply: updated bin_fix_proposals", binProposalId, { status, prUrl, applyError });
} else if (analysisId && !Number.isNaN(analysisId)) {
  await sql`
    UPDATE feedback_analyses SET
      apply_status = COALESCE(${applyStatus}::text, apply_status),
      commit_sha   = COALESCE(${commitSha}::text, commit_sha),
      pr_url       = COALESCE(${prUrl}::text, pr_url),
      deploy_state = COALESCE(${deployState}::text, deploy_state),
      apply_error  = COALESCE(${applyError}::text, apply_error),
      updated_at   = NOW()
    WHERE id = ${analysisId}
  `;
  console.log("record-apply: updated analysis", analysisId, {
    applyStatus,
    commitSha,
    prUrl,
    deployState,
    applyError,
  });
} else {
  console.error("record-apply: neither ANALYSIS_ID nor BIN_PROPOSAL_ID set; nothing to do");
  process.exit(0);
}