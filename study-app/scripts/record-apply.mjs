// Writes the auto-feedback pipeline result back to feedback_analyses.
// Invoked by the GitHub Action (.github/workflows/auto-feedback.yml).
// Reads config from env: DATABASE_URL, ANALYSIS_ID, APPLY_STATUS, COMMIT_SHA, PR_URL,
// DEPLOY_STATE, APPLY_ERROR. Only non-empty fields are written (COALESCE).
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const analysisId = Number(process.env.ANALYSIS_ID);

if (!analysisId || Number.isNaN(analysisId)) {
  console.error("record-apply: ANALYSIS_ID missing/invalid; nothing to do");
  process.exit(0);
}

const v = (x) => (x && String(x).length > 0 ? String(x) : null);

const applyStatus = v(process.env.APPLY_STATUS);
const commitSha = v(process.env.COMMIT_SHA);
const prUrl = v(process.env.PR_URL);
const deployState = v(process.env.DEPLOY_STATE);
const applyError = v(process.env.APPLY_ERROR);

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
