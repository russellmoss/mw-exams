import { describe, expect, it } from "vitest";

import {
  GROUND_TRUTH_INDEPENDENT_RULES,
  REVIEWER_EXCLUDED_PRODUCERS,
  applyQuestionRules,
  matchExcludedProducer,
} from "@/lib/question-rules.mjs";

// GROUND_TRUTH_INDEPENDENT_RULES decides which rules the nightly sweep is allowed to ENFORCE on a
// question that has no answer key — 191 of the 409 servable questions on 2026-08-08. Get it wrong in
// one direction and unkeyed questions stay unaudited; get it wrong in the other and the sweep
// quarantines good questions over verdicts it had no evidence for.
//
// The list was derived by validating all 586 keyed questions twice, keyed and with ground truth
// stripped, and keeping only rules that agreed every time. That derivation needs the corpus, so it
// cannot run in the build gate. What CAN run here is the property the derivation was testing: for a
// rule on the list, stripping ground truth must not change its verdict. These fixtures exercise the
// failure mode that made the list necessary — country-diversity fired on 187 keyed questions when
// their ground truth was removed, and on none of them keyed.

const keyed = (over: Partial<Record<string, unknown>> = {}) => ({
  paper: 1,
  questionText:
    "Wines 1 to 3 are from three different countries.\n\nFor each wine:\na) Identify the grape variety and the origin as closely as possible. (10 marks per wine)\nb) Comment on the quality of each wine. (10 marks per wine)",
  totalMarks: 60,
  wines: [
    { slot: 1, varieties: ["Chardonnay"], region: "Burgundy", country: "France", fullText: "Domaine Leflaive, Puligny-Montrachet. Burgundy, France." },
    { slot: 2, varieties: ["Riesling"], region: "Mosel", country: "Germany", fullText: "Dr Loosen, Riesling Kabinett. Mosel, Germany." },
    { slot: 3, varieties: ["Chenin Blanc"], region: "Swartland", country: "South Africa", fullText: "Mullineux, Old Vines White. Swartland, South Africa." },
  ],
  ...over,
});

const strip = (q: ReturnType<typeof keyed>) => ({
  ...q,
  wines: q.wines.map((w) => ({ slot: w.slot, fullText: w.fullText })),
});

// The rule layer's JSDoc types wines as fully resolved, which is exactly the shape an unkeyed
// question does NOT have — the cast is the point of the test, not a workaround around it.
type RuleInput = Parameters<typeof applyQuestionRules>[0];

const rules = (q: unknown) =>
  new Set(
    (applyQuestionRules(q as RuleInput) as { rule: string; severity: string }[])
      .filter((v) => v.severity === "hard")
      .map((v) => v.rule)
  );

describe("the allowlist holds only rules a bare label can decide", () => {
  it("every listed rule gives the same verdict keyed and unkeyed", () => {
    const q = keyed();
    const withKey = rules(q);
    const withoutKey = rules(strip(q));
    for (const rule of GROUND_TRUTH_INDEPENDENT_RULES) {
      expect(
        withKey.has(rule),
        `${rule} fires only when keyed — it cannot be enforced on an unkeyed question`
      ).toBe(withoutKey.has(rule));
    }
  });

  it("excludes country-diversity, the rule that made the allowlist necessary", () => {
    // The concrete regression: this flight satisfies "three different countries" when keyed and
    // cannot be judged at all when stripped. A sweep enforcing it unkeyed quarantines a good question.
    const q = keyed();
    expect(rules(q).has("country-diversity")).toBe(false);
    expect(rules(strip(q)).has("country-diversity")).toBe(true);
    expect(GROUND_TRUTH_INDEPENDENT_RULES).not.toContain("country-diversity");
  });

  it("is sorted and free of duplicates, so a merge cannot quietly add a second entry", () => {
    const sorted = [...GROUND_TRUTH_INDEPENDENT_RULES].sort();
    expect(GROUND_TRUTH_INDEPENDENT_RULES).toEqual(sorted);
    expect(new Set(GROUND_TRUTH_INDEPENDENT_RULES).size).toBe(GROUND_TRUTH_INDEPENDENT_RULES.length);
  });
});

describe("R-PRODUCER catches the reviewer's standing bans on the raw label", () => {
  it("fires on the three labels that actually reached the servable pool", () => {
    for (const label of [
      "Seppeltsfield, Solera Tawny, NV. Barossa Valley, Australia.",
      "Seppeltsfield, Solera Tawny. Barossa Valley, Australia.",
      "Domaine Weinbach, Sylvaner Reserve. Alsace, France.",
    ]) {
      expect(matchExcludedProducer(label), label).not.toBeNull();
    }
  });

  it("matches a banned house that drops its title, since comma-less labels routinely do", () => {
    expect(matchExcludedProducer("Weinbach, Riesling Cuvée Théo. Alsace, France.")).toBe(
      "Domaine Weinbach"
    );
  });

  it("does not fire on an unrelated producer", () => {
    expect(matchExcludedProducer("Domaine Zind-Humbrecht, Riesling. Alsace, France.")).toBeNull();
    expect(matchExcludedProducer("Seppelt, Great Western Shiraz. Victoria, Australia.")).toBeNull();
  });

  it("is enforced as a hard rule with no answer key present", () => {
    const q = keyed({
      wines: [
        { slot: 1, fullText: "Seppeltsfield, Solera Tawny. Barossa Valley, Australia." },
        { slot: 2, fullText: "Dr Loosen, Riesling Kabinett. Mosel, Germany." },
        { slot: 3, fullText: "Mullineux, Old Vines White. Swartland, South Africa." },
      ],
    });
    expect(rules(q).has("excluded-producer")).toBe(true);
    expect(GROUND_TRUTH_INDEPENDENT_RULES).toContain("excluded-producer");
  });

  it("keeps one declaration of the ban list", () => {
    expect(REVIEWER_EXCLUDED_PRODUCERS).toContain("Domaine Weinbach");
    expect(REVIEWER_EXCLUDED_PRODUCERS).toContain("Seppeltsfield");
  });
});
