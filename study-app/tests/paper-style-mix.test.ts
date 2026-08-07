// paper-style-mix.test.ts — the flight's wine-style mix must fit the paper it is set for.
//
// Feedback cluster fb_145 / fb_71 / fb_47 (cross-paper): Paper identity was never constrained by wine
// STYLE, so the generator produced flights that read as the wrong paper — a pair of two still white
// wines on Paper 3 (fb_145; Paper 3 leans heavily on sparkling/sweet/fortified with occasional rosé),
// two sparkling wines in one Paper 1 flight (fb_47), and a sparkling-plus-medium-sweet Paper 1 flight
// crowding out the classics (fb_71). validatePaperStyleMix keys off the paper number and the keyed
// wines' style tags: Paper 3 needs at least half (min one) sparkling/sweet/fortified/rosé; Paper 1
// rejects ANY sparkling and any fortified; Paper 2 is unconstrained.
//
// Paper 1 was "at most one sparkling" until 2026-08-07. It is now zero — see EK-0157 and the note on
// the p1-no-sparkling clause in question-validator.ts.
import { describe, it, expect } from "vitest";
import { validatePaperStyleMix, validatePaperColour, type AuditWine } from "../src/lib/question-validator";

const wine = (slot: number, fullText: string): AuditWine => ({
  slot,
  varieties: [],
  region: "",
  fullText,
});

const stillWhite1 = wine(1, "Viña Tondonia Blanco Reserva, López de Heredia, Rioja, Spain (13%)");
const stillWhite2 = wine(2, "Hunter Valley Semillon, Tyrrell's, Australia (11%)");
const sherry = wine(2, "Fino Sherry, Jerez, Spain (15%)");
const sparkling1 = wine(1, "Champagne Brut, Reims, France (12%)");
const sparkling2 = wine(2, "Franciacorta Brut, Lombardy, Italy (12.5%)");
const port = wine(2, "Vintage Port, Douro, Portugal (20%)");
const rieslingDry = wine(3, "Riesling Trocken, Mosel, Germany (11.5%)");
const chablis = wine(4, "Chablis 1er Cru, Burgundy, France (13%)");

const fired = (v: ReturnType<typeof validatePaperStyleMix>) =>
  v.some((x) => x.rule === "paper-style-mix" && x.severity === "hard");

describe("validatePaperStyleMix — Paper 3", () => {
  it("rejects a flight of two still white wines (fb_145)", () => {
    const v = validatePaperStyleMix(3, [stillWhite1, stillWhite2]);
    expect(fired(v)).toBe(true);
    expect(v[0].detail).toMatch(/PAPER_STYLE_MIX/);
    expect(v[0].detail).toMatch(/p3-min-half-special/);
  });

  it("passes a flight of one still white plus one sherry", () => {
    const v = validatePaperStyleMix(3, [stillWhite1, sherry]);
    expect(v).toEqual([]);
  });
});

describe("validatePaperStyleMix — Paper 1", () => {
  it("rejects a flight with two sparkling wines (fb_47)", () => {
    const v = validatePaperStyleMix(1, [sparkling1, sparkling2, stillWhite1, rieslingDry]);
    expect(fired(v)).toBe(true);
    expect(v.some((x) => /p1-no-sparkling/.test(x.detail))).toBe(true);
  });

  // Policy change 2026-08-07: ZERO sparkling on Paper 1, not "at most one".
  //
  // The previous allowance (`p1-max-one-sparkling`) was already unreachable — R-COLOUR rejects a
  // sparkling wine per-wine on Paper 1, on every generation and serve path — so the two rules
  // disagreed and the stricter silently won. Recording the intent in one place is the point; see
  // EK-0157. If this test ever needs relaxing, relax R-COLOUR too or the disagreement returns.
  it("rejects a flight with ONE sparkling wine", () => {
    const v = validatePaperStyleMix(1, [sparkling1, stillWhite1, rieslingDry, chablis]);
    expect(fired(v)).toBe(true);
    expect(v.some((x) => /p1-no-sparkling/.test(x.detail))).toBe(true);
  });

  it("passes an all-still-white flight", () => {
    expect(validatePaperStyleMix(1, [stillWhite1, rieslingDry, chablis])).toEqual([]);
  });

  it("rejects any fortified wine on Paper 1 (fb_71)", () => {
    const v = validatePaperStyleMix(1, [stillWhite1, port, rieslingDry, chablis]);
    expect(fired(v)).toBe(true);
    expect(v.some((x) => /p1-no-fortified/.test(x.detail))).toBe(true);
  });

  // The two Paper 1 rules must agree. This is the assertion that would have caught the original
  // contradiction, and it is why the policy is stated once rather than in two places.
  it("agrees with R-COLOUR: a single sparkling wine is rejected by BOTH", () => {
    const flight = [sparkling1, stillWhite1, rieslingDry, chablis];
    expect(validatePaperStyleMix(1, flight).length).toBeGreaterThan(0);
    expect(validatePaperColour(1, flight).some((x) => x.rule === "wrong_colour_for_paper")).toBe(true);
  });
});

describe("validatePaperStyleMix — Paper 2 is unconstrained", () => {
  it("passes any style mix on Paper 2", () => {
    expect(validatePaperStyleMix(2, [sparkling1, sparkling2, port])).toEqual([]);
  });
});
