import { describe, it, expect } from "vitest";
import { buildFeedbackAnalysisPrompt } from "@/lib/prompts/feedback-analysis-prompt";
import { extractRecommendation } from "@/lib/feedback-analysis";

/**
 * Praise used to have no bucket: the analyzer's only terminal verdicts were accept/reject/partial,
 * so "this is a good question" was auto-REJECTED — it polluted the reject rate we read as a quality
 * signal, told the complimenting user "Auto-rejected", and threw away the pipeline's only positive
 * training signal. These tests pin the `endorse` path end to end at the parse + prompt layer.
 */

const BASE = {
  questionText: "Wines 1-2 are Grenache-based. Compare origin and quality.",
  wines: [
    { slot: 1, fullText: "Wine 1 — Châteauneuf-du-Pape 2019" },
    { slot: 2, fullText: "Wine 2 — Priorat 2018" },
  ],
  paper: 2,
  family: "F1",
  familyLabel: "Variety Identification",
  modelAnswer: "Both Grenache-dominant; Rhône vs Catalonia.",
  userAnswer: "Grenache, southern Rhône.",
  userFeedback: "this is a good question",
};

describe("extractRecommendation", () => {
  it("parses every terminal verdict, including endorse", () => {
    expect(extractRecommendation("Recommendation: ACCEPT")).toBe("accept");
    expect(extractRecommendation("Recommendation: **REJECT**")).toBe("reject");
    expect(extractRecommendation("recommendation: partial")).toBe("partial");
    expect(extractRecommendation("Recommendation: ENDORSE")).toBe("endorse");
  });

  it("falls back to pending when no verdict line is present", () => {
    expect(extractRecommendation("The wines are both Grenache.")).toBe("pending");
  });

  it("does not mistake prose containing a verdict word for a verdict line", () => {
    expect(extractRecommendation("I would accept that the user has a point.")).toBe("pending");
  });
});

describe("feedback-analysis prompt — praise handling", () => {
  it("offers praise as its own Kind with an endorse recommendation", () => {
    const { system } = buildFeedbackAnalysisPrompt(BASE);

    expect(system).toContain("Kind: praise");
    expect(system).toContain("recommendation: endorse");
    // The old prompt only ever offered ACCEPT / REJECT / PARTIAL.
    expect(system).toContain("ACCEPT, REJECT, PARTIAL, or ENDORSE");
  });

  it("tells the model never to reject praise", () => {
    const { system } = buildFeedbackAnalysisPrompt(BASE);
    expect(system).toContain("never REJECT praise");
  });

  it("routes a praise-plus-suggestion to endorse, not to a defect verdict", () => {
    const { system } = buildFeedbackAnalysisPrompt({
      ...BASE,
      userFeedback:
        "I think this is a decent question, I like the contrast. One thought — one of them could be New World for another dimension of contrast.",
    });
    // The embedded design idea must survive as a Suggestion line rather than being discarded
    // (or, worse, treated as a defect).
    expect(system).toContain("Suggestion:");
    expect(system).toMatch(/do NOT treat a design musing as a defect/i);
  });

  it("keeps a mixed praise + feature request from rejecting the praise half", () => {
    const { system } = buildFeedbackAnalysisPrompt({
      ...BASE,
      userFeedback: "good question, would be nice to see model answers",
    });
    expect(system).toContain("Endorse: yes");
  });
});
