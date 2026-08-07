// single-wine-flight.test.ts — a one-wine flight must be a curveball asked for style/quality/
// commercial, never variety/origin ID; and no flight may use the fb_98 subset+solo hybrid structure.
//
// Three validated feedbacks say the same thing (fb_354 + fb_355, the same served single-wine Chinon
// question; fb_98, a P3 Madeira-shaped flight): one-wine flights are RARE on the MW exam, and when
// they appear the wine is a big curveball and the paper does NOT ask the candidate to name the grape
// variety or the region/origin — it asks for style, quality, method or commercial evaluation
// ("a Qvevri from Georgia, or an Orange wine … variety and origin would not be asked"). fb_98 also
// binned the hybrid structure where wines 1–2 share a sub-part block and wine 3 gets its own private
// block. A frequency cap (question-engine) keeps single-wine flights at most 1 in 20 per paper.
import { describe, it, expect } from "vitest";
import {
  validateSingleWineFlight,
  validateQuestion,
  type AuditWine,
  type QuestionForAudit,
} from "../src/lib/question-validator";
import {
  singleWineFrequencyExceeded,
  SINGLE_WINE_FREQUENCY_CAP,
} from "../src/lib/question-engine";

// A big curveball — a Georgian Qvevri orange wine (fb_98's own archetype). Classifies as a curveball
// (no BANKER_SIGNALS match), so a lone wine may legitimately be keyed on it.
const CURVEBALL_WINE: AuditWine = {
  slot: 1,
  varieties: ["Rkatsiteli"],
  region: "Kakheti",
  country: "Georgia",
  style: "Qvevri orange wine",
  fullText: "Pheasant's Tears Rkatsiteli Qvevri, Kakheti, Georgia (orange wine)",
};

// A banker — a benchmark expression (Marlborough Sauvignon Blanc). A lone wine may not be a banker.
const BANKER_WINE: AuditWine = {
  slot: 1,
  varieties: ["Sauvignon Blanc"],
  region: "Marlborough",
  country: "New Zealand",
};

const q = (questionText: string, wines: AuditWine[]): QuestionForAudit => ({
  questionId: "test",
  paper: 3,
  family: "F5",
  questionText,
  wines,
});

describe("validateSingleWineFlight — one-wine flights", () => {
  it("rejects a single-wine flight that asks for grape variety and region of origin", () => {
    const text = `Wine 1 is made from a single grape variety.
a) Identify the grape variety and region of origin as closely as possible. (8 marks)
b) Comment on the method of production. (10 marks)`;
    const v = validateSingleWineFlight(q(text, [CURVEBALL_WINE]));
    expect(v.some((x) => x.rule === "single-wine-flight" && /variety/.test(x.detail))).toBe(true);
    // And the whole suite hard-rejects it.
    expect(validateQuestion(q(text, [CURVEBALL_WINE])).ok).toBe(false);
  });

  it("passes a single-wine flight with style/quality/commercial parts on a curveball wine", () => {
    const text = `Wine 1 is presented on its own.
a) Comment on the style and key characteristics of the wine. (8 marks)
b) Assess the quality of the wine. (8 marks)
c) Evaluate the commercial position of the wine. (9 marks)`;
    expect(validateSingleWineFlight(q(text, [CURVEBALL_WINE]))).toEqual([]);
  });

  it("rejects a single-wine flight keyed on a banker even without an ID ask", () => {
    const text = `Wine 1 is presented on its own.
a) Comment on the style and key characteristics of the wine. (12 marks)
b) Assess the quality of the wine. (13 marks)`;
    const v = validateSingleWineFlight(q(text, [BANKER_WINE]));
    // Its own rule name, because the engine drops this one (and only this one) in pinned mode.
    expect(v.some((x) => x.rule === "single-wine-flight-banker" && /banker/.test(x.detail))).toBe(true);
  });
});

describe("validateSingleWineFlight — fb_98 hybrid structure", () => {
  const THREE: AuditWine[] = [
    { slot: 1, varieties: ["Sercial"], region: "Madeira", country: "Portugal" },
    { slot: 2, varieties: ["Sercial"], region: "Madeira", country: "Portugal" },
    { slot: 3, varieties: ["Palomino"], region: "Jerez", country: "Spain" },
  ];

  it("rejects a 3-wine flight where wines 1-2 share a block and wine 3 gets its own private block", () => {
    const text = `Wines 1 and 2 are from the same region and made from the same single grape variety. Wine 3 is from a different country.
For wines 1 and 2:
a) Comment on the style and key characteristics. (11 marks)
b) Comment on the method of production. (14 marks)
For wine 3:
c) Assess the quality of the wine. (25 marks)`;
    const v = validateSingleWineFlight(q(text, THREE));
    expect(v.some((x) => x.rule === "single-wine-flight" && /private block/.test(x.detail))).toBe(true);
  });

  it("passes a 4-wine explicit paired comparison (2+2)", () => {
    const FOUR = [...THREE, { slot: 4, varieties: ["Palomino"], region: "Jerez", country: "Spain" }];
    const text = `Wines 1 to 4 form two pairs: wines 1 and 2, and wines 3 and 4.
For wines 1 and 2:
a) Comment on the style. (25 marks)
For wines 3 and 4:
b) Comment on the style. (25 marks)`;
    expect(validateSingleWineFlight(q(text, FOUR))).toEqual([]);
  });

  it("leaves a plain per-wine 3-flight (each wine its own block) alone", () => {
    const text = `Wines 1 to 3 are from three different countries.
For wine 1:
a) Comment on the style. (25 marks)
For wine 2:
b) Comment on the style. (25 marks)
For wine 3:
c) Comment on the style. (25 marks)`;
    expect(validateSingleWineFlight(q(text, THREE))).toEqual([]);
  });
});

describe("singleWineFrequencyExceeded — at most 1 in 20 per paper", () => {
  it("uses a 1-in-20 cap", () => {
    expect(SINGLE_WINE_FREQUENCY_CAP).toBe(1 / 20);
  });

  it("never fires for multi-wine flights", () => {
    expect(singleWineFrequencyExceeded(3, { single: 99, total: 100 })).toBe(false);
  });

  it("blocks a single-wine draft that would exceed the cap", () => {
    // (2+1)/(40+1) = 7.3% > 5%.
    expect(singleWineFrequencyExceeded(1, { single: 2, total: 40 })).toBe(true);
  });

  it("allows a single-wine draft that stays within the cap", () => {
    // (0+1)/(40+1) = 2.4% <= 5%.
    expect(singleWineFrequencyExceeded(1, { single: 0, total: 40 })).toBe(false);
  });
});
