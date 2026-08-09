// old-world-anchor.test.ts — R-OW-ANCHOR: a cross-country same-variety flight of a classic variety
// must carry an Old World anchor from the variety's home region.
//
// Mike Juergens rejected a four-wine Chardonnay flight (Mendoza + Coonawarra + Casablanca +
// Marlborough — four New World countries, no Burgundy, no Napa): "if you had a four-wine question that
// was Chardonnay-based, you would expect to see at least one banker in there, which would be either
// from Burgundy or from Napa … having four curveballs would be weird." EK-0169 (STRONG SIGNAL): every
// multi-country same-variety Chardonnay flight in the 2011–2026 corpus carries a Burgundian anchor; an
// all-New-World quartet is unattested. The validator now hard-rejects that shape.
import { describe, it, expect } from "vitest";
import { validateOldWorldAnchor, validateQuestion, type AuditWine } from "../src/lib/question-validator";

const q = (wines: AuditWine[], text?: string) => ({
  questionId: "test",
  paper: 1,
  family: "F1",
  questionText:
    text ??
    "Wines 3 to 6 are made from the same single grape variety, from four different countries. " +
      "a) Identify the grape variety. b) Identify the origin as closely as possible. " +
      "c) Comment on the style, quality, and commercial position of the wine.",
  wines: wines.map((w, i) => ({ ...w, slot: i + 3 })),
});

// The rejected flight: Catena Mendoza / Bellwether Coonawarra / Montes Casablanca / Seresin Marlborough.
const ALL_NEW_WORLD_CHARD: AuditWine[] = [
  { slot: 3, varieties: ["Chardonnay"], region: "Mendoza", country: "Argentina", fullText: "Catena, Mendoza Chardonnay" },
  { slot: 4, varieties: ["Chardonnay"], region: "Coonawarra", country: "Australia", fullText: "Bellwether, Coonawarra Chardonnay" },
  { slot: 5, varieties: ["Chardonnay"], region: "Casablanca Valley", country: "Chile", fullText: "Montes, Casablanca Chardonnay" },
  { slot: 6, varieties: ["Chardonnay"], region: "Marlborough", country: "New Zealand", fullText: "Seresin, Marlborough Chardonnay" },
];

describe("R-OW-ANCHOR", () => {
  it("hard-rejects an all-New-World same-variety Chardonnay quartet", () => {
    const v = validateOldWorldAnchor(q(ALL_NEW_WORLD_CHARD));
    expect(v.some((x) => x.rule === "old-world-anchor" && x.severity === "hard")).toBe(true);
  });

  it("passes once one wine is a Burgundian anchor", () => {
    const withBurgundy: AuditWine[] = [
      { slot: 3, varieties: ["Chardonnay"], region: "Chablis Premier Cru", country: "France", fullText: "Chablis 1er Cru Côte de Léchet" },
      ...ALL_NEW_WORLD_CHARD.slice(1),
    ];
    expect(validateOldWorldAnchor(q(withBurgundy))).toHaveLength(0);
  });

  it("a New World Chardonnay does NOT satisfy the Burgundy requirement (Napa notwithstanding)", () => {
    const withNapa: AuditWine[] = [
      { slot: 3, varieties: ["Chardonnay"], region: "Napa Valley", country: "USA", fullText: "Napa Chardonnay" },
      ...ALL_NEW_WORLD_CHARD.slice(1),
    ];
    // Chardonnay's home is Burgundy specifically — Napa is a New World country and cannot anchor.
    expect(validateOldWorldAnchor(q(withNapa)).some((x) => x.rule === "old-world-anchor")).toBe(true);
  });

  it("does not fire on a 2-wine pair", () => {
    expect(validateOldWorldAnchor(q(ALL_NEW_WORLD_CHARD.slice(0, 2)))).toHaveLength(0);
  });

  it("does not fire on a same-country flight", () => {
    const sameCountry = ALL_NEW_WORLD_CHARD.map((w) => ({ ...w, country: "Australia", region: "Coonawarra" }));
    const text =
      "Wines 3 to 6 are made from the same single grape variety, from the same country. a) Identify the grape variety.";
    expect(validateOldWorldAnchor(q(sameCountry, text))).toHaveLength(0);
  });

  it("does not fire on a different-varieties flight (no shared anchor)", () => {
    const text = "Wines 3 to 6 are each made from a different grape variety, from four different countries.";
    expect(validateOldWorldAnchor(q(ALL_NEW_WORLD_CHARD, text))).toHaveLength(0);
  });

  it("wires into validateQuestion as a hard failure (ok === false)", () => {
    const res = validateQuestion(q(ALL_NEW_WORLD_CHARD));
    expect(res.ok).toBe(false);
    expect(res.violations.some((x) => x.rule === "old-world-anchor" && x.severity === "hard")).toBe(true);
  });

  it("does NOT fire on an all-New-World Pinot Noir trio — the exam sets these (2018 P2 Q2)", () => {
    // R-OW-ANCHOR is scoped to classic WHITES. The real corpus sets all-New-World Pinot flights
    // (2018 P2 Q2: Russian River + Central Otago + Willamette), so a hard gate on reds would reject
    // the exam itself. Reds fall through untouched.
    const allNewWorldPinot: AuditWine[] = [
      { slot: 3, varieties: ["Pinot Noir"], region: "Russian River Valley", country: "USA" },
      { slot: 4, varieties: ["Pinot Noir"], region: "Central Otago", country: "New Zealand" },
      { slot: 5, varieties: ["Pinot Noir"], region: "Willamette Valley", country: "USA" },
    ];
    const p2 = { ...q(allNewWorldPinot), paper: 2 };
    expect(validateOldWorldAnchor(p2)).toHaveLength(0);
  });

  it("fires on other classic whites too — an all-New-World Riesling trio has no Old World anchor", () => {
    const allNewWorldRiesling: AuditWine[] = [
      { slot: 3, varieties: ["Riesling"], region: "Clare Valley", country: "Australia" },
      { slot: 4, varieties: ["Riesling"], region: "Marlborough", country: "New Zealand" },
      { slot: 5, varieties: ["Riesling"], region: "Finger Lakes", country: "USA" },
    ];
    expect(validateOldWorldAnchor(q(allNewWorldRiesling)).some((x) => x.rule === "old-world-anchor")).toBe(true);
  });
});
