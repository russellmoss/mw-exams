// stem-fact-cross-check.test.ts — the stem's variety/blend claims must match the actual flight.
//
// A recurring reviewer bin: the stem asserts a variety/blend fact that contradicts the wines it ships
// with. Barolo (Nebbiolo) + Mencía keyed under a "same single grape variety" stem; a six-wine flight
// promising "each a different variety" that keys two Chenin Blancs; a "single grape variety" stem over
// Beaucastel (a 13-grape Châteauneuf-du-Pape blend) or Port. The shared rule layer trusts the model's
// framing, so these cleared generation and were caught only by a human reviewer. validateQuestion now
// parses the stem's claims and checks them against the resolved wine records.
import { describe, it, expect } from "vitest";
import { validateQuestion, crossCheckStemFacts, type QuestionForAudit } from "../src/lib/question-validator";

const q = (questionText: string, wines: QuestionForAudit["wines"]): QuestionForAudit => ({
  questionId: "x",
  paper: 2,
  family: "F3",
  questionText,
  wines,
});

describe("(1) same-variety stem over two different varieties", () => {
  // The reviewer note: "barolo is nebbiolo and mencia is mencia — two different varieties but stem
  // says same variety".
  const question = q("Wines 1 and 2 are made from the same single grape variety and are from different countries. Identify the grape variety.", [
    { slot: 1, varieties: ["Nebbiolo"], region: "Barolo", country: "Italy", fullText: "G.D. Vajra, Barolo Albe, 2019. Piedmont, Italy. (14.5%)" },
    { slot: 2, varieties: ["Mencía"], region: "Bierzo", country: "Spain", fullText: "Descendientes de J. Palacios, Pétalos, 2021. Bierzo, Spain. (14%)" },
  ]);

  it("is a hard reject naming the offending wine and the clause", () => {
    const res = validateQuestion(question);
    expect(res.ok).toBe(false);
    const hit = res.violations.find((v) => v.rule === "stem-fact-same-variety")!;
    expect(hit.severity).toBe("hard");
    expect(hit.detail).toMatch(/wine 2/i);
    expect(hit.detail).toMatch(/mencia/i);
  });

  it("still fires when synonyms would otherwise hide the clash (Shiraz vs Grenache)", () => {
    const res = crossCheckStemFacts(q("The wines share the same grape variety.", [
      { slot: 1, varieties: ["Shiraz"], region: "Barossa", country: "Australia" },
      { slot: 2, varieties: ["Garnacha"], region: "Rioja", country: "Spain" },
    ]));
    expect(res.some((v) => v.rule === "stem-fact-same-variety")).toBe(true);
  });
});

describe("(2) different-variety stem with a duplicate variety", () => {
  // "multiple wines in this flight are made from chenin blanc but the stem says different varieties".
  const question = q(
    "Wines 1 to 6 are from the same country but from different regions. Each wine is made predominantly from a different single grape variety. Identify the grape variety.",
    [
      { slot: 1, varieties: ["Cabernet Sauvignon"], region: "Stellenbosch", country: "South Africa" },
      { slot: 2, varieties: ["Chenin Blanc"], region: "Swartland", country: "South Africa" },
      { slot: 3, varieties: ["Syrah"], region: "Swartland", country: "South Africa" },
      { slot: 4, varieties: ["Pinotage"], region: "Stellenbosch", country: "South Africa" },
      { slot: 5, varieties: ["Chenin Blanc"], region: "Paarl", country: "South Africa" },
      { slot: 6, varieties: ["Cinsault"], region: "Darling", country: "South Africa" },
    ]
  );

  it("is a hard reject naming both Chenin Blanc slots", () => {
    const res = validateQuestion(question);
    expect(res.ok).toBe(false);
    const hit = res.violations.find((v) => v.rule === "stem-fact-distinct-variety")!;
    expect(hit.severity).toBe("hard");
    expect(hit.detail).toMatch(/wine 5/);
    expect(hit.detail).toMatch(/wine 2/);
    expect(hit.detail).toMatch(/chenin blanc/i);
  });

  it("treats Shiraz and Syrah as the same duplicate", () => {
    const res = crossCheckStemFacts(q("Wines 1 and 2 are each made from a different grape variety.", [
      { slot: 1, varieties: ["Syrah"], region: "Hermitage", country: "France" },
      { slot: 2, varieties: ["Shiraz"], region: "Barossa", country: "Australia" },
    ]));
    expect(res.some((v) => v.rule === "stem-fact-distinct-variety")).toBe(true);
  });
});

describe("(3) singular-variety stem over a blend", () => {
  // "chateauneuf is almost always a blend, beaucastel is a blend of 13 grapes, question should read
  // variety(ies) as it is misleading".
  const beaucastel = q(
    "Wines 1 and 2 are from the same country but from different regions. Identify the grape variety and region of origin as closely as possible.",
    [
      {
        slot: 1,
        varieties: ["Grenache", "Mourvèdre", "Syrah"],
        region: "Châteauneuf-du-Pape",
        country: "France",
        is_blend: true,
        fullText: "Château de Beaucastel, Châteauneuf-du-Pape, 2019. Rhône, France. (15%)",
      },
      { slot: 2, varieties: ["Syrah"], region: "Hermitage", country: "France" },
    ]
  );

  it("is a hard reject naming the blend wine", () => {
    // The stem here does NOT say "single grape variety", so drive assertion 3 via the appellation.
    const singular = q(
      "Wines 1 and 2 are each made from a single grape variety. Identify the grape variety and region.",
      beaucastel.wines
    );
    const res = validateQuestion(singular);
    expect(res.ok).toBe(false);
    const hit = res.violations.find((v) => v.rule === "stem-fact-singular-variety-blend")!;
    expect(hit.severity).toBe("hard");
    expect(hit.detail).toMatch(/wine 1/);
    expect(hit.detail).toMatch(/grape variety or varieties/);
  });

  it("fires on a 'predominantly … grape variety' stem over Port", () => {
    // "also typically port is a blend of many grapes".
    const res = crossCheckStemFacts(q(
      "Wines 1-4 are from four different countries. Each is made predominantly from a different grape variety.",
      [
        { slot: 1, varieties: ["Touriga Nacional"], region: "Douro", country: "Portugal", style: "Vintage Port" },
        { slot: 2, varieties: ["Riesling"], region: "Mosel", country: "Germany" },
        { slot: 3, varieties: ["Malbec"], region: "Mendoza", country: "Argentina" },
        { slot: 4, varieties: ["Nebbiolo"], region: "Barolo", country: "Italy" },
      ]
    ));
    expect(res.some((v) => v.rule === "stem-fact-singular-variety-blend" && /wine 1/.test(v.detail))).toBe(true);
  });

  it("does not flag the Australian region Port Phillip", () => {
    const res = crossCheckStemFacts(q("Each wine is made from a single grape variety.", [
      { slot: 1, varieties: ["Pinot Noir"], region: "Mornington Peninsula", country: "Australia", fullText: "Ten Minutes by Tractor Pinot Noir, 2021. Port Phillip, Victoria, Australia." },
    ]));
    expect(res).toHaveLength(0);
  });
});

describe("a matching single-variety flight passes", () => {
  it("three Rieslings under a same-single-variety stem is clean", () => {
    const question = q(
      "Wines 1-3 are all made from the same, single grape variety. Identify the grape variety.",
      [
        { slot: 1, varieties: ["Riesling"], region: "Mosel", country: "Germany" },
        { slot: 2, varieties: ["Riesling"], region: "Clare Valley", country: "Australia" },
        { slot: 3, varieties: ["Riesling"], region: "Alsace", country: "France" },
      ]
    );
    const res = validateQuestion(question);
    expect(res.ok).toBe(true);
    expect(res.violations.filter((v) => v.rule.startsWith("stem-fact-"))).toHaveLength(0);
  });
});
