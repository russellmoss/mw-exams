import { describe, it, expect } from "vitest";
import { binFixActionErrorMessage, binFixMineErrorMessage, evidenceMixLabel, parseProposalId } from "@/lib/bin-fix-ui";

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

describe("parseProposalId", () => {
  it("accepts a number and the neon int8-as-string shape alike", () => {
    // bin_fix_proposals.id is BIGSERIAL; the neon driver serialises int8 as a string, so the
    // client round-trips {proposalId: "8"} — the strict typeof check 400'd it ("Missing
    // proposalId"), which was the actual dead Dispatch button.
    expect(parseProposalId(8)).toBe(8);
    expect(parseProposalId("8")).toBe(8);
  });

  it("rejects everything that is not a positive integer id", () => {
    expect(parseProposalId(undefined)).toBeNull();
    expect(parseProposalId(null)).toBeNull();
    expect(parseProposalId("")).toBeNull();
    expect(parseProposalId("abc")).toBeNull();
    expect(parseProposalId("8; DROP TABLE")).toBeNull();
    expect(parseProposalId(0)).toBeNull();
    expect(parseProposalId(-3)).toBeNull();
    expect(parseProposalId(2.5)).toBeNull();
    expect(parseProposalId(true)).toBeNull();
    expect(parseProposalId({})).toBeNull();
  });
});

describe("evidenceMixLabel", () => {
  it("labels pure-bin, pure-feedback and mixed evidence", () => {
    expect(evidenceMixLabel(["gen_p1_F2_1", "gen_p2_F1_2", "gen_p3_F5_3"])).toBe("3 bins");
    expect(evidenceMixLabel(["fb_1", "fb_2", "fb_3"])).toBe("3 feedback");
    expect(evidenceMixLabel(["gen_p1_F2_1", "fb_2"])).toBe("1 bin · 1 feedback");
    expect(evidenceMixLabel([])).toBe("no evidence");
  });
});

describe("binFixMineErrorMessage", () => {
  it("surfaces the server's error when present, else stays generic", () => {
    expect(binFixMineErrorMessage("API key required")).toBe("Mining failed: API key required");
    expect(binFixMineErrorMessage(undefined)).toBe("Mining failed — try again.");
    expect(binFixMineErrorMessage(null)).toBe("Mining failed — try again.");
  });
});
