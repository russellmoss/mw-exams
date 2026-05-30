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
 * Fires a GitHub `repository_dispatch` (event_type `auto-feedback`) that triggers the
 * verify-and-ship Action. Uses the fine-grained PAT in GITHUB_TOKEN.
 * client_payload is capped at 64KB by GitHub — analysisText is at most ~20KB.
 */
export async function dispatchAutoFeedback(payload: AutoFeedbackPayload): Promise<void> {
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
    body: JSON.stringify({ event_type: "auto-feedback", client_payload: payload }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GitHub dispatch failed: ${res.status} ${body.slice(0, 300)}`);
  }
}
