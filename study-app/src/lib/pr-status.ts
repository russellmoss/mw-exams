// Live PR state, pulled from GitHub.
//
// The build pipelines (auto-feedback, feature-build) write `pr_opened` when they open a PR and then
// never hear about it again — nothing pushes the merge back to us. So a PR a human merged days ago
// still reads "PR OPENED" in the admin dashboard, still shows "Couldn't verify — PR opened for
// review" in a user's history, and still trips the auto-feedback in-flight guard. We pull instead:
// whenever a surface that shows PR state is loaded, ask GitHub about the handful of rows we still
// believe are open, and write the answer back.

const PR_URL_RE = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i;

export type PrState = "merged" | "closed" | "open";

// Never fan out further than this in one reconcile pass — the repo is public, so unauthenticated
// requests are capped at 60/hr per IP when GITHUB_TOKEN isn't set.
const MAX_LOOKUPS = 20;

/**
 * Current state of a PR, or null when we can't tell (bad URL, API error, rate limit). Null always
 * means "leave the stored status alone" — never downgrade a row on a failed lookup.
 */
export async function fetchPrState(prUrl: string): Promise<PrState | null> {
  const m = PR_URL_RE.exec(prUrl || "");
  if (!m) return null;
  const [, owner, repo, number] = m;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
      headers,
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("pr-status: GitHub lookup failed", prUrl, res.status);
      return null;
    }
    const pr = (await res.json()) as { state?: string; merged_at?: string | null };
    if (pr.merged_at) return "merged";
    return pr.state === "closed" ? "closed" : "open";
  } catch (err) {
    console.error("pr-status: GitHub lookup errored", prUrl, err);
    return null;
  }
}

/** Look up several PRs at once, de-duplicated by URL. Unknown/failed lookups are simply absent. */
export async function fetchPrStates(prUrls: (string | null | undefined)[]): Promise<Map<string, PrState>> {
  const unique = [...new Set(prUrls.filter((u): u is string => !!u))].slice(0, MAX_LOOKUPS);
  const out = new Map<string, PrState>();
  await Promise.all(
    unique.map(async (url) => {
      const state = await fetchPrState(url);
      if (state) out.set(url, state);
    })
  );
  return out;
}

/**
 * Reconcile rows we still believe are open against GitHub, persisting anything that has since been
 * merged or closed. Returns a map of row id → the status now stored, so the caller can patch the
 * objects it's about to serialise without a second read.
 *
 * `persist` is what writes the new status for that table (feature_requests vs feedback_analyses
 * spell it differently), and is only ever called for a row whose state actually changed.
 */
export async function reconcileOpenPrs<T extends { id: number; pr_url?: string | null }>(
  rows: T[],
  isOpenLocally: (row: T) => boolean,
  persist: (row: T, state: "merged" | "closed") => Promise<void>
): Promise<Map<number, "merged" | "closed">> {
  const stale = rows.filter((r) => r.pr_url && isOpenLocally(r));
  const resolved = new Map<number, "merged" | "closed">();
  if (!stale.length) return resolved;

  const states = await fetchPrStates(stale.map((r) => r.pr_url));
  await Promise.all(
    stale.map(async (row) => {
      const state = states.get(row.pr_url!);
      if (state !== "merged" && state !== "closed") return; // still open, or unknown — leave it
      try {
        await persist(row, state);
        resolved.set(row.id, state);
      } catch (err) {
        console.error("pr-status: failed to persist reconciled state for row", row.id, err);
      }
    })
  );
  return resolved;
}
