import { describe, expect, it } from "vitest";
import { listTheoryRubrics } from "@/lib/theory/rubric";

describe("Theory learner catalog", () => {
  it("contains exactly the 243 rubric-backed questions", () => {
    const rubrics = listTheoryRubrics();
    expect(rubrics).toHaveLength(243);
    expect(new Set(rubrics.map((rubric) => rubric.year))).toEqual(
      new Set([2016, 2017, 2018, 2019, 2021, 2022, 2023, 2024, 2025])
    );
  });

  it("never exposes a 2015 or 2026 question", () => {
    expect(listTheoryRubrics().some((rubric) => rubric.year === 2015 || rubric.year === 2026)).toBe(false);
  });
});
