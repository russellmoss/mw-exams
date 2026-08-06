import { describe, it, expect } from "vitest";
import {
  normalizeKeyPart,
  availabilityCacheKey,
  wineSearcherLink,
  wineSearcherFallbackRow,
  controlStateDomain,
  mailOrderDomains,
  confidentCount,
  fitsBudget,
  coerceStockists,
  type Stockist,
} from "@/lib/retail-availability";

describe("cache key normalization", () => {
  it("normalizes accents, case and punctuation", () => {
    expect(normalizeKeyPart("E. Guigal Côte-Rôtie")).toBe("e_guigal_cote_rotie");
    expect(normalizeKeyPart("López de Heredia — Viña Tondonia")).toBe("lopez_de_heredia_vina_tondonia");
  });

  it("builds a stable composite key regardless of input formatting", () => {
    const a = availabilityCacheKey("E. Guigal Côte-Rôtie", "New Hope, Pennsylvania", "United States");
    const b = availabilityCacheKey("e guigal cote rotie", "new hope pennsylvania", "united states");
    expect(a).toBe(b);
    expect(a).toBe("e_guigal_cote_rotie|new_hope_pennsylvania|united_states");
  });
});

describe("wine-searcher fallback", () => {
  it("builds an accent-free deep link", () => {
    expect(wineSearcherLink("E. Guigal", "Côte-Rôtie Brune et Blonde"))
      .toBe("https://www.wine-searcher.com/find/e-guigal-cote-rotie-brune-et-blonde");
  });

  it("is always an unverified mail row", () => {
    const row = wineSearcherFallbackRow("Trimbach", "Riesling Cuvée Frédéric Émile");
    expect(row.confidence).toBe("unverified");
    expect(row.kind).toBe("mail");
    expect(row.url).toContain("wine-searcher.com/find/");
  });
});

describe("US control-state detection", () => {
  it("detects Pennsylvania from a city string (the pilot market)", () => {
    expect(controlStateDomain("New Hope, Pennsylvania", "United States")).toBe("finewineandgoodspirits.com");
    expect(controlStateDomain("Philadelphia PA", "USA")).toBe("finewineandgoodspirits.com");
  });

  it("returns null for license states and non-US countries", () => {
    expect(controlStateDomain("Brooklyn, New York", "United States")).toBeNull();
    expect(controlStateDomain("London", "United Kingdom")).toBeNull();
    // "Paris" must not match the "pa" abbreviation
    expect(controlStateDomain("Paris, Texas", "United States")).toBeNull();
  });
});

describe("mail-order domain map", () => {
  it("covers the primary user markets (US + Europe)", () => {
    expect(mailOrderDomains("United States")).toContain("wine.com");
    expect(mailOrderDomains("united kingdom")).toContain("thewinesociety.com");
    expect(mailOrderDomains("Germany").length).toBeGreaterThan(0);
    expect(mailOrderDomains("France").length).toBeGreaterThan(0);
  });

  it("returns empty (not undefined) for unmapped countries", () => {
    expect(mailOrderDomains("Kazakhstan")).toEqual([]);
  });
});

describe("fitsBudget — the deterministic band gate (plan §2.2)", () => {
  it("no budget set = no gate", () => {
    expect(fitsBudget({ priceBand: null, budgetAmount: null })).toBe(true);
    expect(fitsBudget({ priceBand: "icon", budgetAmount: 0 })).toBe(true);
  });

  it("unknown band = not a candidate (hard exclusion)", () => {
    expect(fitsBudget({ priceBand: null, budgetAmount: 40 })).toBe(false);
    expect(fitsBudget({ priceBand: "", budgetAmount: 40 })).toBe(false);
    expect(fitsBudget({ priceBand: "mystery", budgetAmount: 40 })).toBe(false);
  });

  it("admits bands the budget reaches comfortably into", () => {
    // $40 budget: value + premium fit; super_premium ($50 floor) and icon do not.
    expect(fitsBudget({ priceBand: "value", budgetAmount: 40 })).toBe(true);
    expect(fitsBudget({ priceBand: "premium", budgetAmount: 40 })).toBe(true);
    expect(fitsBudget({ priceBand: "super_premium", budgetAmount: 40 })).toBe(false);
    expect(fitsBudget({ priceBand: "icon", budgetAmount: 40 })).toBe(false);
    // $80 budget unlocks super_premium.
    expect(fitsBudget({ priceBand: "super_premium", budgetAmount: 80 })).toBe(true);
  });

  it("a same-currency snippet price overrides the band in BOTH directions", () => {
    // Band said too expensive, snippet proves it fits.
    expect(fitsBudget({
      priceBand: "super_premium", budgetAmount: 40, budgetCurrency: "USD",
      snippetPrice: 38.99, snippetCurrency: "USD",
    })).toBe(true);
    // Band said fits, snippet proves this bottle is over budget.
    expect(fitsBudget({
      priceBand: "premium", budgetAmount: 40, budgetCurrency: "USD",
      snippetPrice: 47.5, snippetCurrency: "USD",
    })).toBe(false);
  });

  it("a cross-currency snippet price is ignored (falls back to the band)", () => {
    expect(fitsBudget({
      priceBand: "premium", budgetAmount: 40, budgetCurrency: "USD",
      snippetPrice: 47.5, snippetCurrency: "EUR",
    })).toBe(true);
  });
});

describe("coerceStockists — LLM output validation", () => {
  it("keeps valid rows and normalizes currency", () => {
    const out = coerceStockists([
      { name: "Fine Wine & Good Spirits", kind: "state_store", url: "https://www.finewineandgoodspirits.com/x", price: 34.99, currency: "usd", confidence: "listed" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].currency).toBe("USD");
    expect(out[0].kind).toBe("state_store");
  });

  it("drops rows without a name or a real http url", () => {
    expect(coerceStockists([
      { name: "", url: "https://x.com" },
      { name: "Shop", url: "javascript:alert(1)" },
      { name: "Shop", url: "ftp://x.com" },
      "not-an-object",
      null,
    ])).toEqual([]);
  });

  it("coerces junk kinds/confidences to safe defaults and rejects absurd prices", () => {
    const out = coerceStockists([
      { name: "Shop", kind: "warehouse", url: "https://x.com", price: -5, currency: "USD", confidence: "certain" },
    ]);
    expect(out[0].kind).toBe("mail");
    expect(out[0].confidence).toBe("unverified");
    expect(out[0].price).toBeNull();
  });

  it("caps the list and tolerates non-array input", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `S${i}`, url: "https://x.com" }));
    expect(coerceStockists(many).length).toBeLessThanOrEqual(8);
    expect(coerceStockists({ not: "an array" })).toEqual([]);
    expect(coerceStockists(undefined)).toEqual([]);
  });
});

describe("confidentCount — the ladder's stop condition", () => {
  it("counts listed+likely, not unverified", () => {
    const s = (confidence: Stockist["confidence"]): Stockist =>
      ({ name: "x", kind: "local", url: "https://x.com", price: null, currency: null, confidence });
    expect(confidentCount([s("listed"), s("likely"), s("unverified")])).toBe(2);
  });
});
