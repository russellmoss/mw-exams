import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import {
  isOfficialUrl,
  validateReviewBatch,
} from "../scripts/refresh-theory-temporal.mjs";

const officialSource = {
  index: 0,
  publisher: "ec.europa.eu",
  title: "Current rule",
  url: "https://ec.europa.eu/example",
  publishedAt: "2027-01-15",
  content: "The former mandatory requirement was repealed and no longer applies to producers.",
};
const batch = [{
  id: "th_fixture",
  questionText: "Discuss the current rule.",
  requirements: [{ index: 0, element: "Address the former mandatory requirement", currentClass: "year_bound" }],
  sources: [officialSource],
}];

function response(overrides = {}) {
  return {
    questions: [{
      id: "th_fixture",
      requirements: [{
        index: 0,
        temporal_class: "superseded",
        rationale: "The official rule directly repeals the underlying demand.",
        source_index: 0,
        quote: "The former mandatory requirement was repealed and no longer applies to producers.",
        ...overrides,
      }],
    }],
  };
}

describe("automated six-month temporal refresh", () => {
  it("accepts supersession only with exact dated tier-1 evidence", () => {
    const decisions = validateReviewBatch(batch, response());
    expect(decisions[0].temporalClass).toBe("superseded");
    expect(decisions[0].source.tier).toBe(1);
  });

  it("rejects an undated or non-verbatim supersession", () => {
    expect(() => validateReviewBatch([{ ...batch[0], sources: [{ ...officialSource, publishedAt: null }] }], response()))
      .toThrow(/dated tier-1 evidence/);
    expect(() => validateReviewBatch(batch, response({ quote: "A paraphrase not in the source." })))
      .toThrow(/not verbatim/);
  });

  it("rejects non-official URLs", () => {
    expect(isOfficialUrl("https://example.com/blog")).toBe(false);
    expect(isOfficialUrl("https://www.oiv.int/official")).toBe(true);
  });

  it("is scheduled exactly twice yearly with no approval job", () => {
    const workflow = readFileSync(
      join(process.cwd(), "..", ".github", "workflows", "theory-temporal-refresh.yml"),
      "utf-8"
    );
    expect(workflow).toContain('cron: "0 6 6 2,8 *"');
    expect(workflow).not.toMatch(/pull_request:|environment:\s*production/i);
    expect(workflow).toMatch(/git push origin HEAD:master/);
    expect(workflow).toMatch(/study-app\/public\/data\/theory-grading-index\.json/);
  });
});
