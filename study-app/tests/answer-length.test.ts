import { describe, it, expect } from "vitest";
import {
  answerWordBudget,
  classifyAnswerLength,
  countAnswerBodyWords,
  distanceOutsideBand,
  marksForWineCount,
  buildStoredAnswerLength,
  WORDS_PER_MARK_TARGET,
  WORDS_PER_MARK_MIN,
  WORDS_PER_MARK_MAX,
} from "@/lib/answer-length";
import { buildCitationBlock } from "@/lib/knowledge/context";
import { parseModelAnswerSections } from "@/lib/prompts/model-answer-prompt";

// Answer Length — the model answer's word budget is measured in code, never self-reported.
// See lib/answer-length.ts for why (the self-report was fabricated on ~half the banked corpus).

describe("answerWordBudget", () => {
  it("scales with marks at the calibrated rate", () => {
    expect(WORDS_PER_MARK_TARGET).toBe(6.5);
    expect(WORDS_PER_MARK_MIN).toBe(4.5);
    expect(WORDS_PER_MARK_MAX).toBe(8.5);

    expect(answerWordBudget(50)).toEqual({ totalMarks: 50, target: 325, min: 225, max: 425 });
    expect(answerWordBudget(100)).toEqual({ totalMarks: 100, target: 650, min: 450, max: 850 });
    expect(answerWordBudget(150)).toEqual({ totalMarks: 150, target: 975, min: 675, max: 1275 });
  });

  it("falls back to a 100-mark budget when marks are missing or nonsense", () => {
    for (const bad of [null, undefined, 0, -25, NaN]) {
      expect(answerWordBudget(bad as number).totalMarks).toBe(100);
    }
  });

  it("infers marks from the flight at 25 per wine (EK-0001)", () => {
    expect(marksForWineCount(4)).toBe(100);
    expect(marksForWineCount(6)).toBe(150);
    expect(marksForWineCount(0)).toBe(100); // fallback, not zero
  });
});

describe("countAnswerBodyWords", () => {
  it("excludes YAML frontmatter", () => {
    const body = "One two three four five.";
    expect(countAnswerBodyWords(body)).toBe(5);
    expect(countAnswerBodyWords(`---\nyear: 2024\npaper: 1\ntotal_marks: 100\n---\n\n${body}`)).toBe(5);
  });

  it("excludes markdown headers and horizontal rules", () => {
    const text = [
      "# Mock answer — Paper 2, four-wine flight",
      "",
      "## a) Identify the grape variety (20 marks)",
      "",
      "Syrah. The cracked pepper and violet lift settle it.",
      "",
      "---",
      "",
      "## b) Origin (4 x 8 marks)",
      "",
      "Northern Rhone.",
    ].join("\n");
    // "Syrah. The cracked pepper and violet lift settle it." = 9 words; "Northern Rhone." = 2.
    expect(countAnswerBodyWords(text)).toBe(11);
  });

  it("excludes the citation block that buildCitationBlock actually appends", () => {
    // This is the coupling test: countAnswerBodyWords keys on a literal marker string, so if
    // buildCitationBlock's wording ever changes, the sources would silently start counting as prose.
    const body = "One two three four five six seven eight nine ten.";
    const citations = buildCitationBlock([
      {
        documentId: "doc-1",
        publisher: "AWRI",
        canonicalTitle: "Identifying objective measures for Barossa Valley Shiraz grapes",
        canonicalUrl: "https://example.org/a.pdf",
      },
      {
        documentId: "doc-2",
        publisher: "WBI Freiburg",
        canonicalTitle: null,
        canonicalUrl: "https://example.org/b.pdf",
      },
      // Relevance context matches the fixture doc (the citation gate would rightly drop a Barossa
      // Shiraz reference under any other flight, leaving no block to test).
    ] as Parameters<typeof buildCitationBlock>[0], "Wines 1-2 are Barossa Valley Shiraz. Penfolds, Shiraz, 2020. Barossa Valley, Australia.");

    expect(citations).not.toBe(""); // guard: the fixture must actually produce a block
    expect(countAnswerBodyWords(body + citations)).toBe(10);
  });

  it("is safe on empty / missing input", () => {
    expect(countAnswerBodyWords("")).toBe(0);
    expect(countAnswerBodyWords(null)).toBe(0);
    expect(countAnswerBodyWords(undefined)).toBe(0);
  });

  it("does not count a self-reported figure as truth", () => {
    // Regression on the real failure: gen_p2_F3_1779900893323 declared 441 while running far longer.
    const answer = `---\ntotal_marks: 100\nactual_word_count: 441\n---\n\n${"word ".repeat(700).trim()}`;
    expect(countAnswerBodyWords(answer)).toBe(700);
  });
});

describe("classifyAnswerLength", () => {
  const budget = answerWordBudget(100); // 450-850, target 650

  it("accepts the band inclusively", () => {
    expect(classifyAnswerLength(450, budget)).toBe("ok");
    expect(classifyAnswerLength(650, budget)).toBe("ok");
    expect(classifyAnswerLength(850, budget)).toBe("ok");
  });

  it("flags both directions", () => {
    expect(classifyAnswerLength(449, budget)).toBe("under");
    expect(classifyAnswerLength(851, budget)).toBe("over");
  });

  it("measures distance outside the band, zero when inside", () => {
    expect(distanceOutsideBand(650, budget)).toBe(0);
    expect(distanceOutsideBand(900, budget)).toBe(50);
    expect(distanceOutsideBand(400, budget)).toBe(50);
  });

  it("catches what the old flat 420 ceiling got backwards", () => {
    // A 50-mark two-wine answer at 457 words (the corpus median for that size) read as roughly
    // on-target under a flat 420; per mark it is padded.
    expect(classifyAnswerLength(457, answerWordBudget(50))).toBe("over");
    // A 150-mark six-wine answer at 442 words passed a flat 420 ceiling as merely "a bit long";
    // per mark it is starved.
    expect(classifyAnswerLength(442, answerWordBudget(150))).toBe("under");
  });
});

describe("buildStoredAnswerLength", () => {
  it("records the measurement and explains the verdict", () => {
    const budget = answerWordBudget(50);
    const stored = buildStoredAnswerLength(500, budget, [{ attempt: 1, wordCount: 500, verdict: "over" }]);
    expect(stored).toMatchObject({ wordCount: 500, totalMarks: 50, target: 325, min: 225, max: 425, wordsPerMark: 10 });
    expect(stored.summary).toContain("over");
    expect(stored.attempts).toHaveLength(1);
  });
});

describe("parseModelAnswerSections", () => {
  const pkg = [
    "---",
    "total_marks: 100",
    "---",
    "",
    "# Mock answer",
    "",
    "Alpha bravo charlie delta echo.",
    "",
    "## 2. Proposed Annotation",
    "",
    "The examiner is testing structural deduction over aromatics.",
    "",
    "## 3. Reasoning Trace",
    "",
    "Stem signals: same variety.",
    "",
    "## 4. Study Diagram Assist",
    "",
    "Layer A routes to the peppery-red branch.",
  ].join("\n");

  it("returns a computed word count for the answer body only", () => {
    const parsed = parseModelAnswerSections(pkg);
    // "Alpha bravo charlie delta echo." — the annotation/trace/diagram sections must not be counted.
    expect(parsed.modelAnswerWordCount).toBe(5);
    expect(parsed.proposedAnnotation).toContain("structural deduction");
  });

  it("agrees with countAnswerBodyWords on its own output", () => {
    const parsed = parseModelAnswerSections(pkg);
    expect(parsed.modelAnswerWordCount).toBe(countAnswerBodyWords(parsed.modelAnswer));
  });
});
