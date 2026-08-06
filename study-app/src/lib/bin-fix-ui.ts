// Error-message derivation for the "Root-cause fixes" admin card (BinFixProposalsSection).
//
// Kept out of the component so it can be unit-tested without a DOM (same pattern as chip-input).
// The API returns machine codes (`not_found`, `not_dispatchable_from_<status>`) on 409s and a raw
// server message on 500s (e.g. "GITHUB_TOKEN not configured", "GitHub dispatch failed: 401 …");
// all of them must surface to the admin — a swallowed failure here looks like a dead button.

const CODE_MESSAGES: Record<string, string> = {
  not_found: "Proposal no longer exists — reload the page.",
};

export function binFixActionErrorMessage(action: "dispatch" | "reject", error: unknown): string {
  const verb = action === "dispatch" ? "Dispatch" : "Reject";
  if (typeof error === "string" && error.length > 0) {
    if (CODE_MESSAGES[error]) return CODE_MESSAGES[error];
    const notDispatchable = error.match(/^not_dispatchable_from_(.+)$/);
    if (notDispatchable) {
      return `Already ${notDispatchable[1].replace(/_/g, " ")} — reload to see its current state.`;
    }
    return `${verb} failed: ${error}`;
  }
  return `${verb} failed — try again.`;
}

export function binFixMineErrorMessage(error: unknown): string {
  return typeof error === "string" && error.length > 0
    ? `Mining failed: ${error}`
    : "Mining failed — try again.";
}
