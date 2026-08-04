import { describe, it, expect } from "vitest";
import { validateMarkTypeMix } from "../src/lib/question-engine";

/**
 * The ID share is counted full-credit-per-hit: a sub-question that mentions identification at all
 * has ALL of its marks counted as identification. That is the corpus method and it is fine — but the
 * generation prompt did not say so, so the model kept merging identification into every sub-question
 * and reading back as 100% ID. Telemetry caught it firing on 4 of 5 consecutive drafts as the only
 * violation.
 *
 * These cases are the worked example now written into question-generation-prompt.ts. If the counting
 * changes, this fails and the prompt is stale — which is the point.
 */

const SEPARATED = `Wines 1 and 2 are from the same country but different regions.

a) Identify the grape variety and region of origin as closely as possible. (2 x 12 marks)
b) Comment on the style and the key winemaking decisions behind each wine. (2 x 8 marks)
c) Assess quality, maturity and commercial position. (2 x 5 marks)`;

const MERGED = `Wines 1 and 2 are from the same country but different regions.

a) Identify the variety and region, and assess the quality and commercial appeal. (2 x 25 marks)`;

describe("validateMarkTypeMix", () => {
  it("passes the separated allocation the prompt tells the model to write", () => {
    // 24 ID of 50 total = 48%.
    expect(validateMarkTypeMix(SEPARATED).valid).toBe(true);
  });

  it("rejects the merged allocation that looks half-and-half but scores 100% ID", () => {
    const r = validateMarkTypeMix(MERGED);
    expect(r.valid).toBe(false);
    expect(r.violations[0]).toContain("100%");
  });

  it("reports the share so the redraft has something to act on", () => {
    // b) mentions no identification, so only a) counts: 30 of 50 = 60%, just over the 55% cap.
    const r = validateMarkTypeMix(`a) Identify the variety. (30 marks)
b) Comment on quality and commercial position. (20 marks)`);
    expect(r.valid).toBe(false);
    expect(r.violations[0]).toContain("60%");
  });

  it("stays quiet when no marks can be parsed rather than failing the draft", () => {
    expect(validateMarkTypeMix("Identify the variety and region.").valid).toBe(true);
  });
});
