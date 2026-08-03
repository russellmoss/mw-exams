import { describe, it, expect } from "vitest";
import { buildFeedbackAnalysisPrompt } from "@/lib/prompts/feedback-analysis-prompt";

/**
 * The feedback analysis used to receive only the question, the wines, the model answer and the
 * candidate's answer. Everything the system GENERATED for the attempt — the tasting notes the
 * candidate actually tasted from, the pre-glass critique, the verbatim grading — never reached the
 * prompt, so "the tasting note said ruby for a white" was adjudicated by inference from the model
 * answer. These tests pin the artifacts into the prompt.
 */

const BASE = {
  questionText: "Wines 1-3 are from the same single grape variety.",
  wines: [
    { slot: 1, fullText: "Wine 1 — Chablis Premier Cru 2021" },
    { slot: 2, fullText: "Wine 2 — Puligny-Montrachet 2020" },
  ],
  paper: 1,
  family: "variety_id",
  familyLabel: "Variety Identification",
  modelAnswer: "Both wines are Chardonnay from Burgundy.",
  userAnswer: "Chardonnay, Burgundy.",
  userFeedback: "The tasting note for wine 2 described it as ruby. It's a white wine.",
};

describe("buildFeedbackAnalysisPrompt — attempt record", () => {
  it("includes the generated tasting notes, one per wine", () => {
    const { user } = buildFeedbackAnalysisPrompt({
      ...BASE,
      attempt: {
        tastingNotes: ["Pale lemon, green apple, wet stone.", "Medium ruby, red cherry, soft tannin."],
      },
    });

    expect(user).toContain("Generated Tasting Notes");
    expect(user).toContain("Pale lemon, green apple, wet stone.");
    expect(user).toContain("Medium ruby, red cherry, soft tannin.");
    expect(user).toContain("**Wine 2:**");
  });

  it("includes the verbatim grading with its verdict and marks", () => {
    const { user } = buildFeedbackAnalysisPrompt({
      ...BASE,
      userFeedback: "This was marked too harshly — I named the variety correctly.",
      attempt: {
        answerFeedback: "You identified Chardonnay but gave no evidence for Burgundy.",
        passEstimate: "borderline",
        marksEstimate: "12/20",
      },
    });

    expect(user).toContain("System's Grading of This Answer");
    expect(user).toContain("You identified Chardonnay but gave no evidence for Burgundy.");
    expect(user).toContain("BORDERLINE");
    expect(user).toContain("12/20");
  });

  it("includes the pre-glass exchange, attempt conditions and the model-answer reasoning trace", () => {
    const { user } = buildFeedbackAnalysisPrompt({
      ...BASE,
      reasoningTrace: "Chose Burgundy because the stem implies a single classic variety.",
      attempt: {
        preGlassReasoning: "Stem says same variety, Paper 1 — likely Chardonnay.",
        preGlassFeedback: "Good narrowing, but consider Chenin.",
        mode: "known-wine",
        stemDetail: "exam_real",
        stemDetailEscalatedTo: "guided",
        appVersion: "a729194",
      },
    });

    expect(user).toContain("Stem says same variety, Paper 1 — likely Chardonnay.");
    expect(user).toContain("Good narrowing, but consider Chenin.");
    expect(user).toContain("mode: known-wine");
    expect(user).toContain("exam_real → escalated to guided");
    expect(user).toContain("build: a729194");
    expect(user).toContain("Chose Burgundy because the stem implies a single classic variety.");
  });

  it("tolerates tasting notes stored as a JSON string by a legacy row", () => {
    const { user } = buildFeedbackAnalysisPrompt({
      ...BASE,
      attempt: { tastingNotes: JSON.stringify(["Pale gold, honeyed, waxy."]) },
    });

    expect(user).toContain("**Wine 1:** Pale gold, honeyed, waxy.");
    expect(user).not.toContain('["Pale gold');
  });

  it("omits the attempt record entirely when the candidate reached no step", () => {
    const { user } = buildFeedbackAnalysisPrompt({
      ...BASE,
      attempt: { tastingNotes: [], answerFeedback: null, preGlassReasoning: "   " },
    });

    expect(user).not.toContain("THE ATTEMPT RECORD");
    expect(user).not.toContain("Generated Tasting Notes");
  });

  it("still builds without any attempt (the pre-migration call shape)", () => {
    const { user, system } = buildFeedbackAnalysisPrompt(BASE);

    expect(user).toContain(BASE.questionText);
    expect(user).not.toContain("THE ATTEMPT RECORD");
    // The instruction to judge the real artifact is unconditional — it also tells the model to say
    // so plainly when the record is absent.
    expect(system).toContain("Judge the artifact, not a reconstruction of it");
  });
});
