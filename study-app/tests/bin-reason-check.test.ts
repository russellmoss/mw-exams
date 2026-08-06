import { describe, it, expect } from "vitest";
import { binReasonFingerprint, parseBinReasonVerdict } from "@/lib/bin-reason-check";
import { buildBinReasonCheckPrompt } from "@/lib/prompts/bin-reason-check-prompt";

/**
 * Bin-reason pushback (migration 041): a reasoned bin is adjudicated against the corpus/EK before
 * the reason feeds the generation prompts. These tests pin the pure pieces — the idempotency
 * fingerprint (reasons are re-applied per chip tap), the strict verdict parse (anything malformed
 * must degrade to 'uncertain', which feeds forward like today — never to a fabricated challenge),
 * and the prompt carrying the question, the wines, and the stated reason.
 */

describe("binReasonFingerprint", () => {
  it("is order-insensitive over tags (chip tap order must not force a re-check)", () => {
    expect(binReasonFingerprint(["weak_stem", "too_easy"], "note")).toBe(
      binReasonFingerprint(["too_easy", "weak_stem"], "note")
    );
  });

  it("treats null and empty as the same absence", () => {
    expect(binReasonFingerprint(null, null)).toBe(binReasonFingerprint([], "  "));
  });

  it("changes when the note changes", () => {
    expect(binReasonFingerprint(["too_easy"], "a")).not.toBe(binReasonFingerprint(["too_easy"], "b"));
  });
});

describe("parseBinReasonVerdict", () => {
  it("parses the strict first line, case-insensitively and with bold markers", () => {
    expect(parseBinReasonVerdict("Verdict: INVALID\n\nBecause…")).toBe("invalid");
    expect(parseBinReasonVerdict("verdict: **Valid**\n\nChecks out.")).toBe("valid");
    expect(parseBinReasonVerdict("Verdict: UNCERTAIN\n\nCannot verify.")).toBe("uncertain");
  });

  it("degrades malformed output to 'uncertain', never to a challenge", () => {
    expect(parseBinReasonVerdict("The reason seems wrong to me.")).toBe("uncertain");
    expect(parseBinReasonVerdict("")).toBe("uncertain");
  });

  it("takes the LAST verdict when several appear (verdict-last format is authoritative)", () => {
    // The verdict is emitted after the reasoning; an earlier echo of the format must not win.
    expect(
      parseBinReasonVerdict(
        "The format asks for Verdict: VALID or invalid.\nThe claim fails against 2019 P3.\nVerdict: INVALID"
      )
    ).toBe("invalid");
  });
});

describe("buildBinReasonCheckPrompt", () => {
  const prompt = buildBinReasonCheckPrompt({
    paper: 2,
    familyLabel: "Same origin",
    questionText: "Wines 1-4 are from the same single grape variety.",
    wines: [
      { slot: 1, fullText: "Barolo DOCG 2018, Piedmont, Italy." },
      { slot: 2, fullText: "Bierzo, Mencía 2019, Spain." },
    ],
    totalMarks: 25,
    tags: ["factually_wrong"],
    note: "barolo is nebbiolo and mencia is mencia - stem says same variety",
    empiricalKnowledge: "EK-0001: test entry.",
  });

  it("carries the question, wines, marks and the stated reason", () => {
    expect(prompt.user).toContain("Wines 1-4 are from the same single grape variety.");
    expect(prompt.user).toContain("Barolo DOCG 2018");
    expect(prompt.user).toContain("25 marks");
    expect(prompt.user).toContain("barolo is nebbiolo");
    // Tags are rendered as their user-facing labels, not internal codes.
    expect(prompt.user).toContain("Factually wrong");
    expect(prompt.user).not.toContain("factually_wrong");
  });

  it("demands the strict verdict line and defaults toward the reviewer", () => {
    expect(prompt.system).toContain("Verdict: VALID");
    expect(prompt.system).toContain("Default to VALID");
  });

  it("injects the live empirical knowledge when supplied", () => {
    expect(prompt.system).toContain("EK-0001: test entry.");
  });
});
