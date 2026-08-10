// tier-contrast.test.ts — same-appellation wines must not repeat one quality/sweetness tier under a
// compare-and-contrast ask (reviewer fault cluster, cross-paper: fb_579 / fb_571 / fb_570 / fb_569 /
// fb_568 / fb_559 / fb_531 / fb_518).
//
// The recurring verdict: a flight groups two-or-more wines from the same appellation (or region) at the
// same quality/sweetness tier and then pays marks for "comment on the style, quality and method of
// production" — but two wines at one tier read the same, so the marks have nothing to bite on. The rule
// requires the wines within a same-appellation group to carry DISTINCT tiers, and skips any group whose
// tier metadata is incomplete (fail safe).
import { describe, it, expect } from "vitest";
import { tierContrastViolations, validateQuestion, type QuestionForAudit } from "../src/lib/question-validator";

const q = (
  questionText: string,
  wines: QuestionForAudit["wines"],
  paper = 2,
): QuestionForAudit => ({
  questionId: "x",
  paper,
  family: "F2",
  questionText,
  wines,
});

const COMPARE_ASK =
  "Wines 1 and 2 are from the same region of origin.\n\n" +
  "For each wine:\n" +
  "a) Identify the grape variety and origin as closely as possible. (2 x 8 marks)\n" +
  "b) Comment on the style, quality, and method of production. (2 x 10 marks)";

describe("Rioja ageing tiers", () => {
  it("rejects a two-Rioja-Reserva pair under a compare-and-contrast ask (fb_569 / fb_531)", () => {
    const question = q(COMPARE_ASK, [
      { slot: 1, varieties: ["Tempranillo"], region: "Rioja", country: "Spain", fullText: "Marqués de Murrieta Reserva. Rioja", style_category: "Still red" },
      { slot: 2, varieties: ["Tempranillo"], region: "Rioja", country: "Spain", fullText: "La Rioja Alta Viña Ardanza Reserva. Rioja", style_category: "Still red" },
    ]);
    const hit = tierContrastViolations(question).find((x) => x.rule === "NO_TIER_CONTRAST")!;
    expect(hit).toBeDefined();
    expect(hit.severity).toBe("hard");
    expect(hit.detail).toMatch(/Reserva/);
    expect(validateQuestion(question).ok).toBe(false);
  });

  it("passes the same pair changed to Crianza + Gran Reserva (a real cascade)", () => {
    const question = q(COMPARE_ASK, [
      { slot: 1, varieties: ["Tempranillo"], region: "Rioja", country: "Spain", fullText: "Cune Crianza. Rioja", style_category: "Still red" },
      { slot: 2, varieties: ["Tempranillo"], region: "Rioja", country: "Spain", fullText: "López de Heredia Gran Reserva. Rioja", style_category: "Still red" },
    ]);
    expect(tierContrastViolations(question)).toEqual([]);
  });
});

describe("German Prädikat / VDP dry tiers", () => {
  const FLIGHT_ASK =
    "Wines 1 to 4 are from the same region of origin.\n\n" +
    "For each wine:\n" +
    "a) Identify the grape variety and origin. (4 x 6 marks)\n" +
    "b) Comment on the style, quality and method of production. (4 x 8 marks)";

  it("rejects a four-wine flight of two GG and two Spätlese (fb_579)", () => {
    const question = q(
      FLIGHT_ASK,
      [
        { slot: 1, varieties: ["Riesling"], region: "Rheingau", country: "Germany", fullText: "Robert Weil Grosses Gewächs. Rheingau" },
        { slot: 2, varieties: ["Riesling"], region: "Rheingau", country: "Germany", fullText: "Leitz Grosses Gewächs. Rheingau" },
        { slot: 3, varieties: ["Riesling"], region: "Rheingau", country: "Germany", fullText: "Künstler Spätlese. Rheingau" },
        { slot: 4, varieties: ["Riesling"], region: "Rheingau", country: "Germany", fullText: "Josef Leitz Spätlese. Rheingau" },
      ],
      1,
    );
    const hit = tierContrastViolations(question).find((x) => x.rule === "NO_TIER_CONTRAST")!;
    expect(hit).toBeDefined();
    expect(hit.severity).toBe("hard");
    expect(validateQuestion(question).ok).toBe(false);
  });

  it("passes a Trocken → Kabinett → Spätlese → Auslese ladder (distinct tiers)", () => {
    const question = q(
      FLIGHT_ASK,
      [
        { slot: 1, varieties: ["Riesling"], region: "Rheingau", country: "Germany", fullText: "Künstler Trocken. Rheingau" },
        { slot: 2, varieties: ["Riesling"], region: "Rheingau", country: "Germany", fullText: "Leitz Kabinett. Rheingau" },
        { slot: 3, varieties: ["Riesling"], region: "Rheingau", country: "Germany", fullText: "Robert Weil Spätlese. Rheingau" },
        { slot: 4, varieties: ["Riesling"], region: "Rheingau", country: "Germany", fullText: "Josef Leitz Auslese. Rheingau" },
      ],
      1,
    );
    expect(tierContrastViolations(question)).toEqual([]);
  });
});

describe("Piedmont regional vs sub-zone (fb_570)", () => {
  it("rejects two Langhe-level Nebbiolos grouped together (a Barolo belonged)", () => {
    const question = q(
      "Wines 1 to 3 are from the same region of origin.\n\n" +
        "For each wine:\n" +
        "a) Identify the grape variety and origin. (3 x 8 marks)\n" +
        "b) Comment on the style, quality and maturity. (3 x 6 marks)",
      [
        { slot: 1, varieties: ["Nebbiolo"], region: "Langhe", country: "Italy", fullText: "Vietti, Langhe Nebbiolo. Langhe" },
        { slot: 2, varieties: ["Nebbiolo"], region: "Langhe", country: "Italy", fullText: "G.D. Vajra, Langhe Nebbiolo. Langhe" },
        { slot: 3, varieties: ["Nebbiolo"], region: "Barolo", country: "Italy", fullText: "G.D. Vajra, Barolo. Barolo" },
      ],
    );
    const hit = tierContrastViolations(question).find((x) => x.rule === "NO_TIER_CONTRAST")!;
    expect(hit).toBeDefined();
    expect(hit.detail).toMatch(/regional/);
  });
});

describe("guards", () => {
  it("leaves wines from different appellations untouched", () => {
    const question = q(COMPARE_ASK, [
      { slot: 1, varieties: ["Tempranillo"], region: "Rioja", country: "Spain", fullText: "Cune Reserva. Rioja" },
      { slot: 2, varieties: ["Tempranillo"], region: "Ribera del Duero", country: "Spain", fullText: "Vega Sicilia Reserva. Ribera del Duero" },
    ]);
    expect(tierContrastViolations(question)).toEqual([]);
  });

  it("skips the check when a wine in the group has no resolvable tier (fail safe)", () => {
    const question = q(COMPARE_ASK, [
      { slot: 1, varieties: ["Tempranillo"], region: "Rioja", country: "Spain", fullText: "Cune Reserva. Rioja" },
      { slot: 2, varieties: ["Tempranillo"], region: "Rioja", country: "Spain", fullText: "Some unclassified Rioja" },
    ]);
    expect(tierContrastViolations(question)).toEqual([]);
  });

  it("does not fire without a compare/contrast ask on style/quality/method/maturity", () => {
    const question = q(
      "Wines 1 and 2 are from the same region of origin.\n\n" +
        "For each wine:\n" +
        "a) Identify the grape variety and origin as closely as possible. (2 x 12 marks)",
      [
        { slot: 1, varieties: ["Tempranillo"], region: "Rioja", country: "Spain", fullText: "Cune Reserva. Rioja" },
        { slot: 2, varieties: ["Tempranillo"], region: "Rioja", country: "Spain", fullText: "La Rioja Alta Reserva. Rioja" },
      ],
    );
    expect(tierContrastViolations(question)).toEqual([]);
  });
});
