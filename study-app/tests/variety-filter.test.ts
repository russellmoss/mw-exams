import { describe, it, expect } from "vitest";
import { validateVarietyFilter } from "../src/lib/question-engine";

/**
 * The variety drill filter is deliberately one-sided: it blocks a wine we positively identified as
 * the WRONG grape, and stays quiet when the grape can't be read out of the wine name at all.
 * Tightening it would make the filter unusable — most fine wine is labelled by place, not grape.
 */

const w = (slot: number, fullText: string) => ({ slot, fullText });

describe("validateVarietyFilter", () => {
  it("passes through when no variety filter is set", () => {
    for (const v of [null, undefined, "", "   "]) {
      const r = validateVarietyFilter(v, [w(1, "Penfolds Grange 2016. South Australia, Australia. (14.5%)")]);
      expect(r.valid).toBe(true);
    }
  });

  it("accepts a flight where every wine names the requested grape", () => {
    const r = validateVarietyFilter("Riesling", [
      w(1, "Dr Loosen Riesling Kabinett 2019. Mosel, Germany. (8%)"),
      w(2, "Grosset Polish Hill Riesling 2021. Clare Valley, Australia. (12.5%)"),
    ]);
    expect(r.valid).toBe(true);
  });

  it("rejects a wine positively identified as another grape", () => {
    const r = validateVarietyFilter("Riesling", [
      w(1, "Dr Loosen Riesling Kabinett 2019. Mosel, Germany. (8%)"),
      w(2, "Cloudy Bay Sauvignon Blanc 2022. Marlborough, New Zealand. (13%)"),
    ]);
    expect(r.valid).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toContain("Wine 2");
    expect(r.violations[0]).toContain("Riesling");
  });

  it("resolves the grape from an appellation that never names it", () => {
    // Chablis is Chardonnay; Gevrey is Pinot Noir. A filter that missed these would be useless.
    expect(validateVarietyFilter("Pinot Noir", [w(1, "Domaine X Gevrey-Chambertin 2018. Burgundy, France. (13%)")]).valid).toBe(true);
    expect(validateVarietyFilter("Nebbiolo", [w(1, "Produttori del Barbaresco 2017. Piedmont, Italy. (14%)")]).valid).toBe(true);
    expect(validateVarietyFilter("Nebbiolo", [w(1, "Domaine X Gevrey-Chambertin 2018. Burgundy, France. (13%)")]).valid).toBe(false);
  });

  it("stays quiet when the grape cannot be detected at all", () => {
    const r = validateVarietyFilter("Riesling", [w(1, "Quinta do Nowhere Reserva 2015. Somewhere, Portugal. (13%)")]);
    expect(r.valid).toBe(true);
  });

  it("treats synonyms as the same grape", () => {
    // Each of these wines DETECTS a grape, so the pass proves synonym folding rather than the
    // "undetectable → skip" escape hatch.
    expect(validateVarietyFilter("Syrah", [w(1, "Henschke Hill of Grace Shiraz 2016. Eden Valley, Australia. (14.5%)")]).valid).toBe(true);
    expect(validateVarietyFilter("Shiraz", [w(1, "Domaine Jamet Syrah 2018. Northern Rhône, France. (13%)")]).valid).toBe(true);
    expect(validateVarietyFilter("Grenache", [w(1, "Bodegas X Garnacha 2020. Campo de Borja, Spain. (14%)")]).valid).toBe(true);
    // …and the synonym still blocks a genuine mismatch.
    expect(validateVarietyFilter("Shiraz", [w(1, "Cloudy Bay Sauvignon Blanc 2022. Marlborough, New Zealand. (13%)")]).valid).toBe(false);
  });

  it("matches an accented request against the unaccented detected token", () => {
    const r = validateVarietyFilter("Sémillon", [w(1, "Tyrrell's Vat 1 Semillon 2013. Hunter Valley, Australia. (11%)")]);
    expect(r.valid).toBe(true);
  });

  it("accepts a blend whose base is the requested grape", () => {
    // Sauternes resolves to "semillon blend" — still a Sémillon-centred flight.
    const r = validateVarietyFilter("Semillon", [w(1, "Château Rieussec 2015. Sauternes, France. (13.5%)")]);
    expect(r.valid).toBe(true);
  });

  it("reports every offending wine, not just the first", () => {
    const r = validateVarietyFilter("Chardonnay", [
      w(1, "Cloudy Bay Sauvignon Blanc 2022. Marlborough, New Zealand. (13%)"),
      w(2, "Dr Loosen Riesling Kabinett 2019. Mosel, Germany. (8%)"),
    ]);
    expect(r.violations).toHaveLength(2);
  });
});
