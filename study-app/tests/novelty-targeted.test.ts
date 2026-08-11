// novelty-targeted.test.ts — targeted-mode novelty (the per-family Fill-the-Bank top-up).
//
// Why this mode exists: the structural-repeat and family/country/variety rules both gate on
// `sameFamily`. In a run that pins every question to one family that is true by construction, so
// those rules collapse into "is this stem like a recent stem in the same family?" — within one
// family, nearly always yes. The 6-question P2/F4 pilot proved it: 46 Opus calls, 0 questions banked,
// every rejection a structural repeat.
//
// Targeted mode therefore polices the WINES (real papers do reuse stem shapes across years) while
// keeping the exact-stem and exact-wine-set repeats hard in every mode. These tests pin both halves:
// what targeted mode must still block, and what it must now allow.
import { describe, it, expect } from "vitest";
import { validateNoveltyAgainstLatest } from "../src/lib/question-engine";

const wine = (slot: number, fullText: string) => ({ slot, fullText });

// Two flights sharing the same F4 stem shape but built from entirely different wines.
const STEM_A =
  "Wines 1 to 4 are from four different countries. For each wine: a) Identify the country and region of origin as closely as possible. (4 x 5 marks) b) Comment on the style and winemaking. (4 x 8 marks) c) Comment on the quality and commercial position. (4 x 7 marks) d) Comment on the maturity. (4 x 5 marks)";
const STEM_B =
  "Wines 1 to 4 are from four different countries. For each wine: a) Identify the country and region of origin as closely as possible. (4 x 5 marks) b) Comment on the style and winemaking of each wine. (4 x 8 marks) c) Comment on the quality and commercial standing. (4 x 7 marks) d) Comment on the maturity and ageing potential. (4 x 5 marks)";

const FLIGHT_1 = [
  wine(1, "Château Batailley, Pauillac, 2016. Bordeaux, France. (13.5%)"),
  wine(2, "Felton Road, Bannockburn Pinot Noir, 2021. Central Otago, New Zealand. (14.0%)"),
  wine(3, "Produttori del Barbaresco, Barbaresco, 2019. Piedmont, Italy. (14.0%)"),
  wine(4, "Catena Zapata, Adrianna Vineyard Malbec, 2019. Mendoza, Argentina. (14.0%)"),
];
const FLIGHT_2 = [
  wine(1, "Penfolds St Henri Shiraz, 2018. South Australia, Australia. (14.5%)"),
  wine(2, "Domaine Drouhin, Dundee Hills Pinot Noir, 2021. Oregon, USA. (13.5%)"),
  wine(3, "R. López de Heredia, Viña Tondonia Reserva, 2011. Rioja, Spain. (13.0%)"),
  wine(4, "Klein Constantia, Cabernet Sauvignon, 2019. Constantia, South Africa. (14.0%)"),
];

const candidate = (questionText: string, wines: { slot: number; fullText: string }[]) =>
  ({ family: "F4", questionText, wines }) as Parameters<typeof validateNoveltyAgainstLatest>[0];

const recent = (questionText: string, wines: { slot: number; fullText: string }[]) =>
  ({ family: "F4", question_text: questionText, wines }) as Parameters<
    typeof validateNoveltyAgainstLatest
  >[1];

describe("targeted mode allows what blocked the pilot", () => {
  it("accepts a same-family, same-shape stem when the wines are all different", () => {
    const r = validateNoveltyAgainstLatest(
      candidate(STEM_B, FLIGHT_2),
      recent(STEM_A, FLIGHT_1),
      [recent(STEM_A, FLIGHT_1)!],
      { targeted: true }
    );
    expect(r.valid).toBe(true);
  });

  it("UNTARGETED mode now accepts it too — the asymmetry was the bug, not the feature", () => {
    // This assertion was `valid: false` until 2026-08-11, pinning untargeted mode as the contrast
    // case. The asymmetry was never justified: this file's own header already says "real papers do
    // reuse stem shapes across years", and that is as true of untargeted generation as of a targeted
    // fill. Measured over the 126 real past-paper questions, the untargeted rule rejected 11.9% of
    // them — the anchor rule was reverted at 13.1% — and 2013 P1 Q1 and Q2 are the same template word
    // for word in one real paper, signature overlap 1.00, different wines.
    //
    // Cost of the asymmetry, measured: a 38-attempt run on 2026-08-11 produced 10 questions and fell
    // back to a banked one 28 times, this rule accounting for 40 of the attempt failures — the same
    // shape as the P2/F4 pilot (46 calls, 0 banked) that prompted targeted mode in the first place.
    const r = validateNoveltyAgainstLatest(
      candidate(STEM_B, FLIGHT_2),
      recent(STEM_A, FLIGHT_1),
      [recent(STEM_A, FLIGHT_1)!],
      { targeted: false }
    );
    expect(r.valid).toBe(true);
  });

  it("untargeted mode still blocks the same shape when the wines substantially overlap", () => {
    // The rule still exists and still does work — three of four wines carried over, 75% > the 50% bar.
    const mostlyShared = [FLIGHT_1[0], FLIGHT_1[1], FLIGHT_1[2], FLIGHT_2[3]];
    const r = validateNoveltyAgainstLatest(
      candidate(STEM_B, mostlyShared),
      recent(STEM_A, FLIGHT_1),
      [recent(STEM_A, FLIGHT_1)!],
      { targeted: false }
    );
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/structural template/i);
  });
});

// The opener rule is calibrated on the real corpus: comparing openers of real questions that share a
// framing CONCEPT gives median 0.50 and p90 0.80 similarity, so ordinary examiner rewording must
// pass. Only near-verbatim reuse (>= 0.90) is rejected.
describe("framing-sentence reuse", () => {
  const STEM_A_OPENER = STEM_A; // "Wines 1 to 4 are from four different countries…"

  it("blocks a verbatim-identical opening even when every wine is new", () => {
    // Exactly what the pilot did: two of six shared this sentence word for word.
    const r = validateNoveltyAgainstLatest(
      candidate(STEM_A_OPENER.replace("(4 x 5 marks)", "(4 x 6 marks)"), FLIGHT_2),
      recent(STEM_A_OPENER, FLIGHT_1),
      [recent(STEM_A_OPENER, FLIGHT_1)!],
      { targeted: true }
    );
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/same framing sentence/i);
  });

  it("treats a changed flight size alone as the same wording", () => {
    const threeWine = STEM_A_OPENER.replace("Wines 1 to 4", "Wines 1 to 3").replace(
      "four different countries",
      "three different countries"
    );
    const r = validateNoveltyAgainstLatest(
      candidate(threeWine, FLIGHT_2),
      recent(STEM_A_OPENER, FLIGHT_1),
      [recent(STEM_A_OPENER, FLIGHT_1)!],
      { targeted: true }
    );
    expect(r.valid).toBe(false);
  });

  it("allows a genuine rewording of the same premise — how the real papers vary", () => {
    // Both assert "different countries, one variety each"; the sentences differ as real ones do.
    const reworded =
      "Each of the four wines below comes from a different country, and no grape variety is repeated across the flight.\n\nFor each wine:\na) Identify the country and region of origin as closely as possible. (4 x 5 marks)";
    const r = validateNoveltyAgainstLatest(
      candidate(reworded, FLIGHT_2),
      recent(STEM_A_OPENER, FLIGHT_1),
      [recent(STEM_A_OPENER, FLIGHT_1)!],
      { targeted: true }
    );
    expect(r.valid).toBe(true);
  });

  // Scoping added after the on-grid fill: unscoped, this rule was 26 of the validator rejections,
  // because a fill walks family to family and F4/F5/F7 all legitimately open "Wines 1 to 4 are from
  // four different countries". Within a family it does real work; across families it was friction.
  it("does not fire across DIFFERENT families", () => {
    const otherFamily = { family: "F5", question_text: STEM_A, wines: FLIGHT_1 } as Parameters<
      typeof validateNoveltyAgainstLatest
    >[1];
    const r = validateNoveltyAgainstLatest(
      candidate(STEM_A.replace("(4 x 5 marks)", "(4 x 6 marks)"), FLIGHT_2), // family F4
      otherFamily,
      [otherFamily!],
      { targeted: true }
    );
    expect(r.valid).toBe(true);
  });

  // NOTE: no relaxation valve. An earlier draft of this fix let the rule stand down on relaxed
  // attempts, but TARGETED_OPENER_WINDOW already brings real-corpus rejection back to ~5.9% — close
  // to the 3.6% the threshold was designed for — so a third loosening would under-enforce it.
  it("still blocks the WINES regardless — that guarantee has no window and no valve", () => {
    const r = validateNoveltyAgainstLatest(
      candidate("A completely different opening sentence entirely.", FLIGHT_1),
      recent(STEM_A, FLIGHT_1),
      [recent(STEM_A, FLIGHT_1)!],
      { targeted: true, lenient: true }
    );
    expect(r.valid).toBe(false);
  });

  it("does not apply the opener rule outside targeted mode", () => {
    // Untargeted generation is governed by the structural rule; this must not change its verdicts.
    const r = validateNoveltyAgainstLatest(
      candidate(STEM_A_OPENER, FLIGHT_2),
      recent("A completely unrelated stem about fortified wines.", FLIGHT_1),
      [recent("A completely unrelated stem about fortified wines.", FLIGHT_1)!],
      { targeted: false }
    );
    expect(r.valid).toBe(true);
  });
});

describe("targeted mode still blocks genuine repeats", () => {
  it("blocks an exact wine-set repeat", () => {
    const r = validateNoveltyAgainstLatest(
      candidate(STEM_B, FLIGHT_1),
      recent(STEM_A, FLIGHT_1),
      [recent(STEM_A, FLIGHT_1)!],
      { targeted: true }
    );
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/repeats a recent wine set/i);
  });

  it("blocks an exact stem repeat even when the wines differ", () => {
    const r = validateNoveltyAgainstLatest(
      candidate(STEM_A, FLIGHT_2),
      recent(STEM_A, FLIGHT_1),
      [recent(STEM_A, FLIGHT_1)!],
      { targeted: true }
    );
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/repeats a recent question stem/i);
  });

  it("blocks a flight that reuses more than half a recent flight's wines", () => {
    const threeShared = [FLIGHT_1[0], FLIGHT_1[1], FLIGHT_1[2], FLIGHT_2[3]];
    const r = validateNoveltyAgainstLatest(
      candidate(STEM_B, threeShared),
      recent(STEM_A, FLIGHT_1),
      [recent(STEM_A, FLIGHT_1)!],
      { targeted: true }
    );
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/75% of a recent question's wines/i);
  });

  it("allows exactly half shared — the boundary is > 50%, not >=", () => {
    const twoShared = [FLIGHT_1[0], FLIGHT_1[1], FLIGHT_2[2], FLIGHT_2[3]];
    const r = validateNoveltyAgainstLatest(
      candidate(STEM_B, twoShared),
      recent(STEM_A, FLIGHT_1),
      [recent(STEM_A, FLIGHT_1)!],
      { targeted: true }
    );
    expect(r.valid).toBe(true);
  });

  it("treats the same wine in a different vintage as the same wine", () => {
    const revintaged = FLIGHT_1.map((w, i) =>
      i < 3 ? wine(w.slot, w.fullText.replace(/\b20\d{2}\b/, "2015")) : FLIGHT_2[3]
    );
    const r = validateNoveltyAgainstLatest(
      candidate(STEM_B, revintaged),
      recent(STEM_A, FLIGHT_1),
      [recent(STEM_A, FLIGHT_1)!],
      { targeted: true }
    );
    expect(r.valid).toBe(false);
    expect(r.violations.join(" ")).toMatch(/of a recent question's wines/i);
  });
});
