import { describe, it, expect } from "vitest";
import {
  wordBudgetForMarks,
  MAX_ASKS_PER_BULLET,
  PREFERRED_ASKS,
  NUMERICAL_MAX_WORDS,
  NUMERICAL_ASKS,
  MAX_TOTAL_WORDS,
} from "@/lib/length-check";

// Length Check — the word-budget ladder scales with marks (spec §1). These are the exact thresholds
// the validator prompt and the repair call enforce, so lock them down.
describe("wordBudgetForMarks", () => {
  it("caps <=5-mark sub-bullets at 25 words", () => {
    expect(wordBudgetForMarks(2)).toBe(25);
    expect(wordBudgetForMarks(5)).toBe(25);
  });
  it("caps 6-12-mark sub-bullets at 35 words", () => {
    expect(wordBudgetForMarks(6)).toBe(35);
    expect(wordBudgetForMarks(12)).toBe(35);
  });
  it("caps 13-24-mark sub-bullets at 45 words", () => {
    expect(wordBudgetForMarks(13)).toBe(45);
    expect(wordBudgetForMarks(24)).toBe(45);
  });
  it("caps >=25-mark sub-bullets at 60 words", () => {
    expect(wordBudgetForMarks(25)).toBe(60);
    expect(wordBudgetForMarks(36)).toBe(60);
  });
});

describe("length-check constants", () => {
  it("matches the spec's ask + whole-question limits", () => {
    expect(MAX_ASKS_PER_BULLET).toBe(3);
    expect(PREFERRED_ASKS).toBe(2);
    expect(NUMERICAL_MAX_WORDS).toBe(15);
    expect(NUMERICAL_ASKS).toBe(1);
    expect(MAX_TOTAL_WORDS).toBe(140);
  });
});
