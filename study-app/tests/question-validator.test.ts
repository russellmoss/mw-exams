// question-validator.test.ts — the "stem must not pre-announce the discriminator" hard rule.
//
// Admin-reviewer bin cluster (cross-paper, 11 bins): stems that state the contrast, the quality gap
// or the ageing regime outright hand the candidate the deduction they should make from the glass, and
// get binned "too easy" / "not exam-realistic". The rule scans the STEM ONLY (sub-questions may name
// a mechanism to *comment on*), hard-rejects any banned phrase, and caps stem length at 40 words. The
// neutral framings the exam genuinely uses are whitelisted so they never trip the scan.
import { describe, it, expect } from "vitest";
import { stemPreannouncesDiscriminator, validateQuestion } from "../src/lib/question-validator";

describe("stemPreannouncesDiscriminator — one banned phrase per fixture rejects", () => {
  it.each([
    ["different approach(es) (to|in)", "The two wines took a different approach to fermentation."],
    ["contrasting production", "These wines show contrasting production techniques."],
    ["very different route", "Each wine arrived by a very different route in the winery."],
    ["handled (very) differently", "The wines were handled very differently in the cellar."],
    ["made using (a) different", "Each wine was made using a different maturation vessel."],
    ["different official quality categories", "The wines belong to different official quality categories."],
    ["biological ageing", "Wine 1 undergoes biological ageing under a veil of flor."],
    ["oxidative ageing", "Wine 2 undergoes oxidative ageing in a wooden cask."],
    ["lees contact", "Wine 1 has had extended lees contact before bottling."],
    ["exposure to oxygen", "Wine 2 has had significant exposure to oxygen in maturation."],
    ["residual sugar ... by", "The wine's residual sugar has been achieved by stopping the fermentation."],
  ])("rejects: %s", (_label, stem) => {
    const v = stemPreannouncesDiscriminator(stem);
    expect(v.some((x) => x.rule === "stem-preannounces-discriminator" && x.severity === "hard")).toBe(true);
  });
});

describe("stemPreannouncesDiscriminator — stem length cap", () => {
  it("rejects a 42-word stem", () => {
    const stem = Array.from({ length: 42 }, (_, i) => `word${i + 1}`).join(" ") + ".";
    const v = stemPreannouncesDiscriminator(stem);
    expect(v.some((x) => x.rule === "stem-too-wordy" && x.severity === "hard")).toBe(true);
  });

  it("passes a 40-word stem (boundary)", () => {
    const stem = Array.from({ length: 40 }, (_, i) => `word${i + 1}`).join(" ") + ".";
    expect(stemPreannouncesDiscriminator(stem)).toEqual([]);
  });
});

describe("stemPreannouncesDiscriminator — clean stems pass", () => {
  it("passes the neutral factual frame 'Wines 1 to 4 are from four different countries.'", () => {
    expect(stemPreannouncesDiscriminator("Wines 1 to 4 are from four different countries.")).toEqual([]);
  });

  it("passes whitelisted framings ('both have residual sugar', 'from the same country')", () => {
    expect(
      stemPreannouncesDiscriminator("Wines 1 and 2 both have residual sugar and come from the same country.")
    ).toEqual([]);
    expect(
      stemPreannouncesDiscriminator("Wines 1 and 2 are made from the same single grape variety.")
    ).toEqual([]);
  });

  it("scans the stem only — a banned phrase inside a sub-question does not fire", () => {
    const q =
      "Wines 1 and 2 are from the same country.\n\n" +
      "b) Compare the method of production, with reference to biological ageing. (2 x 10 marks)";
    expect(stemPreannouncesDiscriminator(q)).toEqual([]);
  });
});

describe("validateQuestion wiring", () => {
  it("marks a pre-announcing stem as not ok", () => {
    const res = validateQuestion({
      questionId: "t1",
      paper: 1,
      family: "F5",
      questionText: "The wines were handled very differently in the cellar.",
      wines: [],
    });
    expect(res.ok).toBe(false);
    expect(res.violations.some((x) => x.rule === "stem-preannounces-discriminator")).toBe(true);
  });
});
