import { describe, it, expect } from "vitest";
import { extractCohort, COHORT_MAX_SHARE, COHORT_MAX_ABSOLUTE } from "@/lib/feedback-analysis";
import { buildFeedbackAnalysisPrompt } from "@/lib/prompts/feedback-analysis-prompt";

/**
 * A reviewer rejecting "another sparkling Syrah question" is not ruling on one question — they are
 * ruling on every question that does the same thing. Until the Cohort line existed, each sibling had
 * to be found and rejected separately, and the only path from "this is wrong" to "the others are gone"
 * ran through analysis → rule PR → merge → corpus re-audit, which takes hours.
 *
 * On 2026-08-09 a reviewer binned five sparkling-Shiraz flights in three minutes, with escalating
 * profanity, while eleven more sat in his queue. Measured: the style appears ONCE in the 2011-2026
 * corpus against sixteen in the servable bank.
 */

const BASE = {
  questionText: "Wines 1-3 are sparkling. Identify the method of production.",
  wines: [
    { slot: 1, fullText: "Pierre Gimonnet & Fils, Cuis 1er Cru Blanc de Blancs Brut, NV. Champagne, France." },
    { slot: 2, fullText: "Nino Franco, Rustico Valdobbiadene Prosecco Superiore Brut, NV. Veneto, Italy." },
    { slot: 3, fullText: "Rockford, Black Shiraz, NV. Barossa Valley, Australia." },
  ],
  paper: 3,
  family: "F4",
  familyLabel: "Method of production",
  modelAnswer: "Traditional method, tank method, and a sparkling red.",
  userAnswer: "",
  userFeedback: "Stop putting sparkling Syrah questions in. It's irrelevant.",
};

describe("extractCohort", () => {
  it("reads the phrases the analysis named", () => {
    const text = "### Cohort: sparkling shiraz, sparkling syrah, black queen, black shiraz\n\nKind: generation";
    expect(extractCohort(text)).toEqual(["sparkling shiraz", "sparkling syrah", "black queen", "black shiraz"]);
  });

  it("returns nothing when the analysis did not emit one — which is most analyses", () => {
    expect(extractCohort("### Recommendation: ACCEPT\n\nThe marks do not total 75.")).toEqual([]);
  });

  it("drops fragments too short to be an identification", () => {
    // A two-character phrase matches half the bank as a substring. That is a parse artefact, not a
    // cohort, and it must never reach the LIKE.
    expect(extractCohort("Cohort: sparkling shiraz, a, of, nv")).toEqual(["sparkling shiraz"]);
  });

  it("discards single-word phrases — a category, not a thing", () => {
    // THE load-bearing guard, and the count cap cannot do this job. Measured against the live bank:
    // "brut" matches 51 of 547 servable questions (the cap refuses it) but "shiraz" matches 20, which
    // sails under any cap loose enough to permit a real cohort. Two words is the line between naming
    // a grape and naming a wine.
    expect(extractCohort("Cohort: shiraz, sparkling, riesling, sparkling shiraz")).toEqual([
      "sparkling shiraz",
    ]);
  });

  it("caps how many phrases one analysis can hand over", () => {
    const many = Array.from({ length: 12 }, (_, i) => `phrase number ${i}`).join(", ");
    expect(extractCohort(`Cohort: ${many}`)).toHaveLength(6);
  });

  it("tolerates the quoting and trailing punctuation models add", () => {
    expect(extractCohort('Cohort: "sparkling shiraz", `black queen`, sparkling syrah.')).toEqual([
      "sparkling shiraz",
      "black queen",
      "sparkling syrah",
    ]);
  });

  it("de-duplicates", () => {
    expect(extractCohort("Cohort: sparkling shiraz, Sparkling Shiraz, sparkling shiraz")).toEqual([
      "sparkling shiraz",
    ]);
  });
});

describe("the blast-radius ceiling", () => {
  it("is small enough that a category escaping into the matcher quarantines nothing", () => {
    // Sparkling Shiraz was 16 of ~570 servable questions — 2.8%. A phrase taking out a fifth of the
    // bank is "brut" or "riesling" leaking through, and the right answer is to apply nothing.
    expect(COHORT_MAX_SHARE).toBeLessThanOrEqual(0.15);
    expect(COHORT_MAX_SHARE).toBeGreaterThan(0.028);
    expect(COHORT_MAX_ABSOLUTE).toBeLessThanOrEqual(25);
  });
});

describe("the prompt teaches the cohort line", () => {
  const internal = () => {
    const { system } = buildFeedbackAnalysisPrompt(BASE);
    return system.slice(system.indexOf("### Cohort"));
  };

  it("asks for label-matchable phrases", () => {
    expect(internal()).toMatch(/appear in the WINE LABEL/i);
  });

  it("warns against the category-swallowing phrase, by name, and demands two words", () => {
    // The failure mode that matters: "shiraz" alone retires every Barossa red, "sparkling" alone
    // retires Champagne. The instruction names both, and states the two-word rule the parser enforces
    // — so a model that follows the prompt and a parser that does not trust it agree.
    const t = internal();
    expect(t).toMatch(/"shiraz" alone/);
    expect(t).toMatch(/"sparkling" alone/);
    expect(t).toMatch(/AT LEAST TWO WORDS/);
  });

  it("tells it to omit the line for non-recurring complaints", () => {
    expect(internal()).toMatch(/OMIT the line entirely/);
    expect(internal()).toMatch(/Most analyses should NOT emit it/i);
  });
});
