const REPO = "russellmoss/mw-exams";

// NOTE: GitHub repository_dispatch caps client_payload at 10 top-level properties, so
// question context is consolidated into a single `context` string.
export interface AutoFeedbackPayload {
  attemptId: number;
  analysisId: number;
  appliedBy: string; // 'auto' | 'admin:{id}'
  workBranch: string;
  context: string; // paper / family / question / user feedback, preformatted
  analysisText: string; // full analysis text (contains the "Proposed Change" section)
  allowedPaths?: string; // newline-separated path prefixes the change must stay within (feature isolation); empty = repo-wide
  reviewOnly?: string; // "true" = high-stakes (generation/validator) — open a PR for review even if in-scope, never auto-merge
}

/**
 * Generic `repository_dispatch` sender. Uses the fine-grained PAT in GITHUB_TOKEN.
 * client_payload is capped at 64KB / 10 top-level properties by GitHub.
 */
export async function dispatchRepositoryEvent(
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not configured");

  const res = await fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ event_type: eventType, client_payload: payload }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub dispatch failed: ${res.status} ${body.slice(0, 300)}`);
  }
}

/**
 * Fires the verify-and-ship Action (event_type `auto-feedback`).
 * client_payload is capped at 64KB by GitHub — analysisText is at most ~20KB.
 */
export async function dispatchAutoFeedback(payload: AutoFeedbackPayload): Promise<void> {
  await dispatchRepositoryEvent("auto-feedback", payload as unknown as Record<string, unknown>);
}

export interface FeatureBuildPayload {
  featureRequestId: number;
  title: string;
  technicalSpec: string; // the authoritative build brief (what to build, UX, naming, data, workflow)
  appliedBy: string; // 'admin:{id}'
}

/**
 * Fires the feature-build Action (event_type `feature-build`) that implements a confirmed Feature
 * Request against the real repo, CI-gates it, and (on green) auto-merges to master. Mirrors the
 * auto-feedback pipeline but is admin-triggered and driven by a stored spec, with no path isolation.
 */
export async function dispatchFeatureBuild(payload: FeatureBuildPayload): Promise<void> {
  await dispatchRepositoryEvent("feature-build", payload as unknown as Record<string, unknown>);
}
