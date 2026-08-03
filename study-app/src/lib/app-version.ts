/**
 * The build this server process is running.
 *
 * Stamped onto every attempt (user_attempts.app_version) so a bug report can be pinned to the exact
 * code that produced it — which is the difference between "this is still broken" and "this was fixed
 * three deploys ago". It also separates preview traffic from production, since preview deployments
 * share the production database and are otherwise indistinguishable in the data.
 *
 * Vercel injects VERCEL_GIT_COMMIT_SHA into the runtime environment for every deployment. Local dev
 * has no sha, and that is fine: NULL reads as "not a deployed build".
 */
export function getAppVersion(): string | null {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT_SHA;
  return sha ? sha.slice(0, 7) : null;
}
