// rarity-budget.test.ts — the P3 "ultra-rare / no-precedent fortified & oxidative fillers" cluster.
//
// Three validated signals (fb_254, fb_241, fb_55) drive validateRarityBudget():
//   • Rule 1 (rarity-budget)               at most ONE tier-3 (niche) wine per flight — the six-wine
//                                           ladder with TWO Jura oxidative wines (25%) must fail.
//   • Rule 2 (rarity-no-precedent)          a category with no MW-exam precedent in ten years
//                                           (flor-aged Australian apera) is rejected anywhere it sits.
//   • Rule 3 (fortified-category-integrity) a mandatory-blend fortified style (tawny port) keyed as a
//                                           single grape variety is a category error.
import { describe, it, expect } from "vitest";
import { validateRarityBudget, validateQuestion } from "../src/lib/question-validator";
import type { AuditWine, QuestionForAudit } from "../src/lib/question-validator";

function classic(slot: number): AuditWine {
  return { slot, varieties: ["chardonnay"], region: "Chablis", country: "France", fullText: `Chablis, France (${slot})` };
}
function jura(slot: number): AuditWine {
  return {
    slot,
    varieties: ["savagnin"],
    region: "Jura",
    country: "France",
    style_category: "Vin Jaune",
    fullText: `Vin Jaune, Château-Chalon, Jura, France (${slot})`,
  };
}
const q = (wines: AuditWine[], questionText = "Wines are from different countries."): QuestionForAudit => ({
  questionId: "test",
  paper: 3,
  family: "fortified",
  questionText,
  wines,
});

describe("Rule 1 — rarity budget (at most one tier-3 wine per flight)", () => {
  it("rejects a six-wine ladder with TWO Jura oxidative/flor-aged wines (25% of the flight)", () => {
    const wines = [classic(1), classic(2), classic(3), classic(4), jura(5), jura(6)];
    const v = validateRarityBudget(q(wines));
    expect(v.some((x) => x.rule === "rarity-budget" && x.severity === "hard")).toBe(true);
  });

  it("passes the same six-wine flight with only ONE Jura wine", () => {
    const wines = [classic(1), classic(2), classic(3), classic(4), classic(5), jura(6)];
    expect(validateRarityBudget(q(wines))).toEqual([]);
  });
});

describe("Rule 2 — no exam precedent (rejected outright, anywhere)", () => {
  const apera: AuditWine = {
    slot: 2,
    varieties: ["palomino"],
    region: "Rutherglen",
    country: "Australia",
    style_category: "Apera (fino style)",
    fullText: "Apera (fino style), Australia",
  };

  it("rejects a flor-aged Australian apera sitting in an otherwise classic flight", () => {
    const wines = [classic(1), apera, classic(3)];
    const v = validateRarityBudget(q(wines));
    expect(v.some((x) => x.rule === "rarity-no-precedent" && x.severity === "hard")).toBe(true);
  });

  it("rejects the apera as a lone wine too", () => {
    const v = validateRarityBudget(q([{ ...apera, slot: 1 }]));
    expect(v.some((x) => x.rule === "rarity-no-precedent" && x.severity === "hard")).toBe(true);
  });
});

describe("Rule 3 — fortified category integrity (mandatory-blend styles)", () => {
  const stem =
    "Wines 1 to 4 are each from a different country. Each is made predominantly from a different, single grape variety or varieties.";

  it("rejects a single-variety tawny port keyed under a 'single grape variety' stem", () => {
    const tawny: AuditWine = {
      slot: 2,
      varieties: ["touriga nacional"],
      is_blend: false,
      region: "Douro",
      country: "Portugal",
      style_category: "Port",
      fullText: "10 Year Old Tawny Port, Douro, Portugal",
    };
    const v = validateRarityBudget(q([classic(1), tawny, classic(3), classic(4)], stem));
    expect(v.some((x) => x.rule === "fortified-category-integrity" && x.severity === "hard")).toBe(true);
  });

  it("does NOT flag a legitimately single-varietal Palomino oloroso sherry", () => {
    const oloroso: AuditWine = {
      slot: 2,
      varieties: ["palomino"],
      is_blend: false,
      region: "Jerez",
      country: "Spain",
      style_category: "Sherry",
      fullText: "Oloroso Sherry, Jerez, Spain",
    };
    expect(validateRarityBudget(q([classic(1), oloroso, classic(3), classic(4)], stem))).toEqual([]);
  });
});

describe("integration — validateQuestion surfaces the rarity rules", () => {
  it("marks a two-Jura six-wine ladder invalid via the full validator", () => {
    const wines = [classic(1), classic(2), classic(3), classic(4), jura(5), jura(6)];
    const res = validateQuestion(q(wines));
    expect(res.ok).toBe(false);
    expect(res.violations.some((x) => x.rule === "rarity-budget")).toBe(true);
  });
});
