// blend-permitting-appellation.test.ts — a wine keyed as ONE variety, over an appellation that
// permits blending, must not sit under a "single grape variety" stem.
//
// Paper 2 recurring cluster (6 validated signals): Morellino di Scansano (×2), a standard Bordeaux
// blend, two GSMs, a non-dominant "Syrah", a generic "Cuvée Rosso". Each keyed a single grape, so the
// flight passed the stem-vs-key variety check — yet the stem's "single grape variety" claim is
// factually false because the appellation blends. The fix is a data-backed registry
// (BLEND_PERMITTING_APPELLATIONS in db.ts) read by arm (8) of crossCheckStemFacts.
import { describe, it, expect } from "vitest";
import { crossCheckStemFacts, type QuestionForAudit } from "../src/lib/question-validator";

const RULE = "blend-permitting-appellation-single-variety";

const q = (questionText: string, wines: QuestionForAudit["wines"]): QuestionForAudit => ({
  questionId: "x",
  paper: 2,
  family: "F2",
  questionText,
  wines,
});

const SINGLE_STEM =
  "Wines 5 and 6 are from the same country and are made from different, single grape varieties. For each wine: a) Identify the grape variety and origin as closely as possible. (2 x 8 marks)";

const HEDGED_STEM =
  "Wines 5 and 6 are from the same country and are made from a different grape variety or varieties. For each wine: a) Identify the grape variety or varieties and origin as closely as possible. (2 x 8 marks)";

describe("blend-permitting appellation keyed as a single variety", () => {
  it("fails on a Morellino di Scansano keyed as Sangiovese under a single-variety stem", () => {
    const res = crossCheckStemFacts(
      q(SINGLE_STEM, [
        { slot: 5, varieties: ["Sangiovese"], region: "Morellino di Scansano", country: "Italy", fullText: "Fattoria Le Pupille, Morellino di Scansano, 2021. Tuscany, Italy. (13.5%)" },
        { slot: 6, varieties: ["Nebbiolo"], region: "Barolo", country: "Italy" },
      ]),
    );
    const hit = res.find((v) => v.rule === RULE)!;
    expect(hit).toBeDefined();
    expect(hit.severity).toBe("hard");
    expect(hit.detail).toMatch(/wine 5/);
    expect(hit.detail).toMatch(/morellino/i);
    expect(hit.detail).toMatch(/grape variety or varieties/);
  });

  it("fails on a standard Bordeaux blend keyed as a single variety under a single-variety stem", () => {
    const res = crossCheckStemFacts(
      q(
        "Wines 3 to 6 are from four different countries, each made from a different, single grape variety. For each wine: a) Identify the grape variety. (4 x 6 marks)",
        [
          { slot: 3, varieties: ["Cabernet Sauvignon"], region: "Margaux", country: "France", fullText: "Château Example, Margaux, 2016. Bordeaux, France. (13.5%)" },
          { slot: 4, varieties: ["Malbec"], region: "Mendoza", country: "Argentina" },
          { slot: 5, varieties: ["Riesling"], region: "Mosel", country: "Germany" },
          { slot: 6, varieties: ["Nebbiolo"], region: "Barolo", country: "Italy" },
        ],
      ),
    );
    const hit = res.find((v) => v.rule === RULE)!;
    expect(hit).toBeDefined();
    expect(hit.detail).toMatch(/wine 3/);
    expect(hit.detail).toMatch(/bordeaux/i);
  });

  it("passes both wines under a 'grape variety or varieties' stem", () => {
    const res = crossCheckStemFacts(
      q(HEDGED_STEM, [
        { slot: 5, varieties: ["Sangiovese"], region: "Morellino di Scansano", country: "Italy", fullText: "Fattoria Le Pupille, Morellino di Scansano, 2021. Tuscany, Italy. (13.5%)" },
        { slot: 6, varieties: ["Cabernet Sauvignon"], region: "Margaux", country: "France", fullText: "Château Example, Margaux, 2016. Bordeaux, France. (13.5%)" },
      ]),
    );
    expect(res.some((v) => v.rule === RULE)).toBe(false);
  });

  it("still passes a Barossa Shiraz keyed as Shiraz under a single-variety stem", () => {
    const res = crossCheckStemFacts(
      q(SINGLE_STEM, [
        { slot: 5, varieties: ["Shiraz"], region: "Barossa Valley", country: "Australia", fullText: "Example Estate, Shiraz, 2019. Barossa Valley, Australia. (14.5%)" },
        { slot: 6, varieties: ["Nebbiolo"], region: "Barolo", country: "Italy" },
      ]),
    );
    expect(res.some((v) => v.rule === RULE)).toBe(false);
  });

  it("fails a GSM keyed as Grenache but not a Barossa Shiraz alongside it", () => {
    const res = crossCheckStemFacts(
      q(
        "Wines 1 to 4 are from four different countries. Each is made predominantly from a different, single red grape variety. For each wine: a) Identify the grape variety.",
        [
          { slot: 1, varieties: ["Grenache"], region: "Barossa Valley", country: "Australia", fullText: "Example Estate, GSM, 2019. Barossa Valley, Australia. (14.5%)" },
          { slot: 2, varieties: ["Shiraz"], region: "Hunter Valley", country: "Australia", fullText: "Other Estate, Shiraz, 2019. Hunter Valley, Australia. (14%)" },
          { slot: 3, varieties: ["Grenache"], region: "Châteauneuf-du-Pape", country: "France", fullText: "Domaine Example, Châteauneuf-du-Pape, 2018. Rhône, France. (15%)" },
          { slot: 4, varieties: ["Malbec"], region: "Mendoza", country: "Argentina" },
        ],
      ),
    );
    const offenders = res.filter((v) => v.rule === RULE).map((v) => v.detail);
    expect(offenders.some((d) => /wine 1/.test(d))).toBe(true);
    expect(offenders.some((d) => /wine 3/.test(d))).toBe(true);
    expect(offenders.some((d) => /wine 2/.test(d))).toBe(false);
  });

  it("does not second-guess an unresolved key (2013 P1 Q1 plural white Rioja, keyed [])", () => {
    const res = crossCheckStemFacts(
      q(
        "Wines 1 and 2 are from the same country, but from different regions and different single grape varieties. For each wine: a) Identify the origin and grape variety.",
        [
          { slot: 1, varieties: [], region: "Rioja", country: "Spain", fullText: "Vina Gravonia, Lopez de Heredia. 2003, Rioja, Spain" },
          { slot: 2, varieties: ["Albariño"], region: "Rías Baixas", country: "Spain" },
        ],
      ),
    );
    expect(res.some((v) => v.rule === RULE)).toBe(false);
  });

  it("exempts a genuinely monovarietal white Rioja (keyed Viura)", () => {
    const res = crossCheckStemFacts(
      q(SINGLE_STEM, [
        { slot: 5, varieties: ["Viura"], region: "Rioja", country: "Spain", fullText: "Lopez de Heredia, Viña Gravonia, 2013. Rioja, Spain." },
        { slot: 6, varieties: ["Albariño"], region: "Rías Baixas", country: "Spain" },
      ]),
    );
    expect(res.some((v) => v.rule === RULE)).toBe(false);
  });
});
