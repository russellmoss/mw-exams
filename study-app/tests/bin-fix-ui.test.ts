import { describe, it, expect } from "vitest";
import { binFixActionErrorMessage, binFixMineErrorMessage } from "@/lib/bin-fix-ui";

/**
 * The "Root-cause fixes" card used to swallow dispatch/reject failures entirely — a 500 from a
 * missing GITHUB_TOKEN or a 409 not_dispatchable made the button do nothing (bin_fix_proposals
 * id 8, 2026-08-06). These pin the message derivation the component now renders on failure.
 */

describe("binFixActionErrorMessage", () => {
  it("passes a server error message through, labeled with the action", () => {
    expect(binFixActionErrorMessage("dispatch", "GITHUB_TOKEN not configured")).toBe(
      "Dispatch failed: GITHUB_TOKEN not configured"
    );
    expect(binFixActionErrorMessage("dispatch", "GitHub dispatch failed: 401 Bad credentials")).toBe(
      "Dispatch failed: GitHub dispatch failed: 401 Bad credentials"
    );
    expect(binFixActionErrorMessage("reject", "boom")).toBe("Reject failed: boom");
  });

  it("translates the not_dispatchable_from_<status> 409 code", () => {
    expect(binFixActionErrorMessage("dispatch", "not_dispatchable_from_dispatched")).toBe(
      "Already dispatched — reload to see its current state."
    );
    expect(binFixActionErrorMessage("dispatch", "not_dispatchable_from_pr_opened")).toBe(
      "Already pr opened — reload to see its current state."
    );
  });

  it("translates not_found", () => {
    expect(binFixActionErrorMessage("dispatch", "not_found")).toBe(
      "Proposal no longer exists — reload the page."
    );
  });

  it("falls back to a generic retry line when the body carried no error string", () => {
    expect(binFixActionErrorMessage("dispatch", undefined)).toBe("Dispatch failed — try again.");
    expect(binFixActionErrorMessage("dispatch", "")).toBe("Dispatch failed — try again.");
    expect(binFixActionErrorMessage("reject", { weird: true })).toBe("Reject failed — try again.");
    expect(binFixActionErrorMessage("dispatch", null)).toBe("Dispatch failed — try again.");
  });
});

describe("binFixMineErrorMessage", () => {
  it("surfaces the server's error when present, else stays generic", () => {
    expect(binFixMineErrorMessage("API key required")).toBe("Mining failed: API key required");
    expect(binFixMineErrorMessage(undefined)).toBe("Mining failed — try again.");
    expect(binFixMineErrorMessage(null)).toBe("Mining failed — try again.");
  });
});
