// Writes the feature-build pipeline result back to feature_requests.
// Invoked by the GitHub Action (.github/workflows/feature-build.yml).
// Reads config from env: DATABASE_URL, FEATURE_REQUEST_ID, STATUS, APPLY_STATUS, COMMIT_SHA,
// PR_URL, APPLY_ERROR. Only non-empty fields are written (COALESCE). Mirrors record-apply.mjs.
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);
const featureRequestId = Number(process.env.FEATURE_REQUEST_ID);

if (!featureRequestId || Number.isNaN(featureRequestId)) {
  console.error("record-feature-apply: FEATURE_REQUEST_ID missing/invalid; nothing to do");
  process.exit(0);
}

const v = (x) => (x && String(x).length > 0 ? String(x) : null);

const status = v(process.env.STATUS); // built | pr_opened | failed
const applyStatus = v(process.env.APPLY_STATUS);
const commitSha = v(process.env.COMMIT_SHA);
const prUrl = v(process.env.PR_URL);
const applyError = v(process.env.APPLY_ERROR);

await sql`
  UPDATE feature_requests SET
    status       = COALESCE(${status}::text, status),
    apply_status = COALESCE(${applyStatus}::text, apply_status),
    commit_sha   = COALESCE(${commitSha}::text, commit_sha),
    pr_url       = COALESCE(${prUrl}::text, pr_url),
    apply_error  = COALESCE(${applyError}::text, apply_error),
    updated_at   = NOW()
  WHERE id = ${featureRequestId}
`;

console.log("record-feature-apply: updated feature_request", featureRequestId, {
  status,
  applyStatus,
  commitSha,
  prUrl,
  applyError,
});
