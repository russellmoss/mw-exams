import { describe, it, expect } from "vitest";
import { buildModelAnswerPrompt } from "@/lib/prompts/model-answer-prompt";

/**
 * The model answer used to be written from the wine's NAME alone. Wine enrichment (Tavily-researched
 * critic notes / tech sheets, gaps filled from model knowledge) ran CONCURRENTLY with it in
 * question-engine.ts and was handed only to the tasting-note generator — so the candidate read a
 * glass description anchored to real research, then compared their answer against an exemplar
 * anchored to the model's recall of that producer. The two were free to disagree about the wine in
 * front of them, and the exemplar was the less well-sourced of the pair.
 *
 * These tests pin the profiles into the prompt, and pin the two constraints that keep the exemplar
 * usable: it must stay silent about HAVING the profiles (the candidate has no label and no critic),
 * and a question with no profiles must produce the pre-existing prompt unchanged.
 */

const WINES = [
  { slot: 1, fullText: "Domaine Leflaive, Puligny-Montrachet 2020. Burgundy, France" },
  { slot: 2, fullText: "Ridge, Monte Bello 2018. Santa Cruz Mountains, USA" },
];

const PROFILES = {
  "1": {
    tasting_profile: {
      appearance: "medium lemon-gold, clear, medium viscosity",
      nose_summary: "medium(+) intensity. White peach, hazelnut, struck match",
      palate_summary: "Citrus pith, oatmeal, subtle toast. Finish: long.",
      structural_summary: "Sweetness: dry. Acid: high. Tannin: n/a. Body: medium(+). Alcohol: medium.",
    },
  },
};

describe("buildModelAnswerPrompt — researched wine profiles", () => {
  it("renders each profiled wine's appearance, nose, palate and structure", () => {
    const { user } = buildModelAnswerPrompt("Assess wines 1-2.", WINES, 1, undefined, null, PROFILES);
    expect(user).toContain("RESEARCHED PROFILE");
    expect(user).toContain("medium lemon-gold, clear, medium viscosity");
    expect(user).toContain("White peach, hazelnut, struck match");
    expect(user).toContain("Citrus pith, oatmeal, subtle toast");
    expect(user).toContain("Acid: high");
  });

  it("leaves an unprofiled wine as a bare identity line", () => {
    const { user } = buildModelAnswerPrompt("Assess wines 1-2.", WINES, 1, undefined, null, PROFILES);
    const wine2 = user.split("Wine 2:")[1].split("\n")[0];
    expect(wine2).not.toContain("RESEARCHED PROFILE");
  });

  it("forbids the answer from revealing that it has the profiles", () => {
    const { user } = buildModelAnswerPrompt("Assess wines 1-2.", WINES, 1, undefined, null, PROFILES);
    expect(user).toContain("USING THE RESEARCHED PROFILES");
    // The exemplar must model reasoning the candidate can reproduce blind.
    expect(user).toMatch(/no citations/i);
    expect(user).toMatch(/Reason FORWARD from the sensory evidence/);
  });

  it("is unchanged when no profiles are supplied", () => {
    const withoutArg = buildModelAnswerPrompt("Assess wines 1-2.", WINES, 1, undefined, null);
    const withEmpty = buildModelAnswerPrompt("Assess wines 1-2.", WINES, 1, undefined, null, {});
    expect(withoutArg.user).toBe(withEmpty.user);
    expect(withoutArg.user).not.toContain("RESEARCHED PROFILE");
    expect(withoutArg.user).not.toContain("USING THE RESEARCHED PROFILES");
  });

  it("ignores a profile whose tasting_profile is null (bank hit with no prose)", () => {
    const { user } = buildModelAnswerPrompt("Assess wines 1-2.", WINES, 1, undefined, null, {
      "1": { tasting_profile: null },
    });
    expect(user).not.toContain("RESEARCHED PROFILE");
    expect(user).not.toContain("USING THE RESEARCHED PROFILES");
  });
});
