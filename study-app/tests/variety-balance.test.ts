import { describe, it, expect } from "vitest";
import {
  detectVarietyHits,
  varietyStatus,
  SHORT_RATIO,
  HEAVY_RATIO,
  MIN_DELTA_WINES,
} from "../src/lib/bank-health/variety-balance";
import {
  EXPECTED_VARIETY_SHARE,
  VARIETY_LABEL,
  varietyLabel,
  substyleSpreadFor,
} from "../src/lib/bank-health/variety-targets";

describe("EXPECTED_VARIETY_SHARE constant", () => {
  it("keys every paper by variety, sums to <=100% (leaving a long-tail residual)", () => {
    for (const paper of [1, 2, 3] as const) {
      const shares = EXPECTED_VARIETY_SHARE[paper];
      const sum = Object.values(shares).reduce((s, p) => s + p, 0);
      expect(sum).toBeGreaterThan(70);
      expect(sum).toBeLessThanOrEqual(100);
      for (const key of Object.keys(shares)) expect(VARIETY_LABEL[key]).toBeTruthy();
    }
  });

  it("carries the spec's hard-anchor varieties in each paper", () => {
    expect(EXPECTED_VARIETY_SHARE[1]).toHaveProperty("chardonnay");
    expect(EXPECTED_VARIETY_SHARE[1]).toHaveProperty("riesling");
    for (const k of [
      "cabernet_sauvignon", "merlot", "pinot_noir", "syrah",
      "sangiovese", "nebbiolo", "tempranillo", "malbec",
    ]) {
      expect(EXPECTED_VARIETY_SHARE[2]).toHaveProperty(k);
    }
    for (const k of ["palomino", "touriga", "furmint", "muscat", "chenin_blanc", "semillon"]) {
      expect(EXPECTED_VARIETY_SHARE[3]).toHaveProperty(k);
    }
  });
});

describe("detectVarietyHits — dominant + blend partners", () => {
  it("resolves a bare grape token", () => {
    expect(detectVarietyHits({ fullText: "Cloudy Bay Sauvignon Blanc 2022. Marlborough, NZ." })[0]).toBe(
      "sauvignon_blanc"
    );
  });

  it("resolves an appellation to its dominant grape", () => {
    expect(detectVarietyHits({ fullText: "Produttori del Barbaresco 2019. Piedmont, Italy." })[0]).toBe(
      "nebbiolo"
    );
    expect(detectVarietyHits({ fullText: "Biondi-Santi Brunello di Montalcino 2016." })[0]).toBe(
      "sangiovese"
    );
  });

  it("folds the spec's synonyms (shiraz→syrah, pinot grigio→pinot_gris)", () => {
    expect(detectVarietyHits({ variety: "Shiraz", fullText: "Penfolds Shiraz, Barossa." })[0]).toBe(
      "syrah"
    );
    expect(detectVarietyHits({ fullText: "Santa Margherita Pinot Grigio 2023." })[0]).toBe(
      "pinot_gris"
    );
  });

  it("reads a blend as dominant + partners", () => {
    const hits = detectVarietyHits({
      variety: "Cabernet Sauvignon / Merlot blend",
      fullText: "Château Margaux 2015. Margaux, Bordeaux.",
    });
    expect(hits[0]).toBe("cabernet_sauvignon");
    expect(hits).toContain("merlot");
  });

  it("returns nothing when no known variety is present", () => {
    expect(detectVarietyHits({ fullText: "Some Estate, Cuvée X 2020." })).toEqual([]);
  });
});

describe("varietyStatus", () => {
  it("flags short only when well under target AND the gap is material", () => {
    // expected 14%, bank 0.6% on a 200-wine paper → shortfall ~27 wines.
    expect(varietyStatus(0.6, 14, 27)).toBe("short");
    // under 0.6× but only a 2-wine gap → not material.
    expect(varietyStatus(2, 4, 2)).toBe("ok");
  });

  it("flags heavy only when well over target AND the surplus is material", () => {
    expect(varietyStatus(20, 6, -28)).toBe("heavy");
    expect(varietyStatus(9, 6, -1)).toBe("ok");
  });

  it("exposes the spec thresholds", () => {
    expect(SHORT_RATIO).toBe(0.6);
    expect(HEAVY_RATIO).toBe(1.6);
    expect(MIN_DELTA_WINES).toBe(3);
  });
});

describe("labels + sub-style spread", () => {
  it("labels a known key and a fallback key", () => {
    expect(varietyLabel("sangiovese")).toBe("Sangiovese");
    expect(varietyLabel("some_unknown")).toBe("Some Unknown");
  });

  it("gives Sangiovese its documented appellation spread and a generic fallback", () => {
    expect(substyleSpreadFor("sangiovese")).toMatch(/Chianti Classico/);
    expect(substyleSpreadFor("nonexistent")).toMatch(/sub-styles/);
  });
});
