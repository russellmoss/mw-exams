import { describe, it, expect } from "vitest";
import { crossCheckStemFacts } from "@/lib/question-validator";

const rule = "singular-variety-ask-over-blend";

type Draft = Pick<Parameters<typeof crossCheckStemFacts>[0], "paper" | "questionText" | "wines">;

/** questionId/family are required by the audit type but unread by this rule — stubbed, not asserted. */
const fired = (q: Draft) =>
  crossCheckStemFacts({ questionId: "t", family: "F1", ...q } as Parameters<
    typeof crossCheckStemFacts
  >[0]).filter((v) => v.rule === rule);

describe("singular-variety-ask-over-blend", () => {
  it("rejects an unhedged singular ask over a flight containing a blend", () => {
    const v = fired({
      paper: 2,
      questionText:
        "Wines 1 and 2 are from different countries.\n\nFor each wine:\na) Identify the grape variety and region of origin as closely as possible. (2 x 10 marks)\nb) Comment on quality. (2 x 15 marks)",
      wines: [
        { slot: 1, varieties: ["Cabernet Sauvignon", "Merlot"], region: "Médoc", country: "France" },
        { slot: 2, varieties: ["Malbec"], region: "Mendoza", country: "Argentina" },
      ],
    });
    expect(v).toHaveLength(1);
    expect(v[0].severity).toBe("hard");
    expect(v[0].detail).toContain("wine 1");
    expect(v[0].detail).toContain("grape variety or varieties");
  });

  it("accepts the hedge the real papers print", () => {
    for (const ask of [
      "a) Identify the grape variety or varieties. (2 x 10 marks)",
      "a) Identify the grape variety(ies) used. (2 x 10 marks)",
      "a) Identify the grape variety/ies as closely as possible. (2 x 10 marks)",
    ]) {
      expect(
        fired({
          paper: 2,
          questionText: `Wines 1 and 2 are from different countries.\n\nFor each wine:\n${ask}`,
          wines: [
            { slot: 1, varieties: ["Grenache", "Syrah", "Mourvèdre"], region: "Châteauneuf-du-Pape" },
            { slot: 2, varieties: ["Grenache"], region: "Navarra" },
          ],
        })
      ).toHaveLength(0);
    }
  });

  it("accepts a qualified ask — 'the principal grape variety' concedes the blend", () => {
    expect(
      fired({
        paper: 2,
        questionText:
          "Wines 1 and 2 are from different countries.\n\nFor each wine:\na) Identify the predominant grape variety. (2 x 8 marks)",
        wines: [
          { slot: 1, varieties: ["Tempranillo", "Garnacha"], region: "Rioja" },
          { slot: 2, varieties: ["Malbec"], region: "Mendoza" },
        ],
      })
    ).toHaveLength(0);
  });

  /**
   * The load-bearing case. 2022 P2 Q1 is a REAL paper: three monovarietal wines asked singularly, and a
   * fourth wine the stem declares a blend, handled by its own parts. A flight-wide blend test would
   * reject it — the scoped test must not.
   */
  it("does not fire on 2022 P2 Q1, whose singular ask is scoped to wines 1-3", () => {
    expect(
      fired({
        paper: 2,
        questionText:
          "Wines 1-3 are from different countries and are each made from a different, single grape variety. Wine 4 is a blend of all three of these varieties.\n\nFor each wine 1-3:\n\na) Identify the grape variety and the origin as closely as possible. (3 x 15 marks)\n\nb) Comment on the style, considering possible reasons for not blending the variety used for this wine. (3 x 10 marks)\n\nFor wine 4:\n\nc) Comment on the purpose of blending these varieties with reference to balance and quality. (15 marks)\n\nd) Identify the origin as closely as possible. (10 marks)",
        wines: [
          { slot: 1, varieties: ["Cabernet Sauvignon"], region: "Napa Valley" },
          { slot: 2, varieties: ["Merlot"], region: "Pomerol" },
          { slot: 3, varieties: ["Cabernet Franc"], region: "Chinon" },
          { slot: 4, varieties: ["Cabernet Sauvignon", "Merlot", "Cabernet Franc"], region: "Margaux" },
        ],
      })
    ).toHaveLength(0);
  });

  /**
   * The other real paper the rule must survive. 2025 P2 Q1 hedges in the STEM and then asks flatly.
   * Quarantining a printed past paper is the one outcome a wording rule may never produce.
   */
  it("does not fire when the stem already carries the hedge (2025 P2 Q1)", () => {
    expect(
      fired({
        paper: 2,
        questionText:
          "Wines 1-3 are from the same single grape variety or predominant grape variety.\n\nFor each wine:\na) Identify the grape variety. (12 marks)\nb) Comment on the style and quality. (3 x 10 marks)",
        wines: [
          { slot: 1, varieties: ["Grenache"], region: "Priorat" },
          { slot: 2, varieties: ["Grenache", "Syrah", "Carignan"], region: "Southern Rhône" },
          { slot: 3, varieties: ["Grenache"], region: "McLaren Vale" },
        ],
      })
    ).toHaveLength(0);
  });

  /** A key that resolved ONE grape beats the appellation: white Rioja is Viura, not a blend. */
  it("trusts a single keyed variety over a blending appellation's name", () => {
    expect(
      fired({
        paper: 1,
        questionText:
          "Wines 1 and 2 are from the same country.\n\nFor each wine:\na) Identify the grape variety and origin as closely as possible. (2 x 8 marks)",
        wines: [
          {
            slot: 1,
            varieties: ["Viura"],
            region: "Rioja",
            fullText: "R. López de Heredia, Viña Gravonia Crianza Blanco, 2015. Rioja, Spain.",
          },
          { slot: 2, varieties: ["Albariño"], region: "Rías Baixas" },
        ],
      })
    ).toHaveLength(0);
  });

  it("does not fire on an all-monovarietal flight", () => {
    expect(
      fired({
        paper: 2,
        questionText:
          "Wines 1 and 2 are both made from the same single grape variety, from different countries.\n\nFor both wines:\na) Identify the grape variety. (10 marks)",
        wines: [
          { slot: 1, varieties: ["Syrah"], region: "Walla Walla Valley" },
          { slot: 2, varieties: ["Syrah"], region: "Cornas" },
        ],
      })
    ).toHaveLength(0);
  });

  it("does not read a back-reference as an ask", () => {
    expect(
      fired({
        paper: 2,
        questionText:
          "Wines 1 and 2 are from different countries.\n\nFor each wine:\na) Comment on the style, considering possible reasons for not blending the variety used for this wine. (2 x 12 marks)",
        wines: [
          { slot: 1, varieties: ["Grenache", "Syrah"], region: "Châteauneuf-du-Pape" },
          { slot: 2, varieties: ["Malbec"], region: "Cahors" },
        ],
      })
    ).toHaveLength(0);
  });
});
