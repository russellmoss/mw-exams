import { describe, it, expect } from "vitest";
import {
  ANALYSIS_MAX_TOKENS,
  extractRecommendation,
  isTerminalRecommendation,
} from "@/lib/feedback-analysis";

/**
 * Six analyses were filed as 'complete' carrying no verdict, and three of them are still sitting at
 * feedback_status = NULL months later with nothing in the system able to reach them again.
 *
 * The mechanism, end to end: `max_tokens` was 4000; the verdict line is the last thing the prompt
 * asks for; a model that spends output tokens on thinking (Opus 5 returns 1.37 characters of saved
 * text per billed output token, against Sonnet 4.6's 3.98) hits the ceiling mid-analysis; the line
 * never gets written; extractRecommendation returns "pending"; applyRecommendation has no branch for
 * "pending"; and the sweeper can't re-reach the attempt because auto_analysis_id is stamped.
 *
 * Two links in that chain are pure and can be pinned here. The rest is DB-bound.
 */

describe("feedback analysis — the verdict gate", () => {
  it("treats only the four applicable verdicts as terminal", () => {
    for (const verdict of ["accept", "reject", "partial", "endorse"]) {
      expect(isTerminalRecommendation(verdict)).toBe(true);
    }
  });

  it("does NOT treat 'pending' as terminal — it is the no-verdict sentinel", () => {
    // If this ever flips true, a truncated run resumes being filed as a finished one.
    expect(isTerminalRecommendation("pending")).toBe(false);
    expect(isTerminalRecommendation(extractRecommendation("Analysis cut off mid-sen"))).toBe(false);
  });
});

describe("feedback analysis — output ceiling", () => {
  it("leaves room for a full analysis plus a thinking budget", () => {
    // The largest analysis this pipeline has produced is 11,856 characters (~3k tokens). 4000 was the
    // value that lost six verdicts; anything in that neighbourhood is the same bug.
    expect(ANALYSIS_MAX_TOKENS).toBeGreaterThanOrEqual(12000);
  });
});
