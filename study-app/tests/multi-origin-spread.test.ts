// multi-origin-spread.test.ts — flight spread guard (feedback cluster: multi-origin flights lack
// country / Old-New World spread).
//
// Three validated Paper 2 signals, one shape: a flight sold as "different origins / different
// countries" that quietly repeats a country or a hemisphere.
//   fb_566 — a four-wine "different origins" flight with TWO Chilean wines (country_repeat).
//   fb_555 — a "Europe, but not France/Italy/Spain" flight with TWO Portuguese blends (country_repeat).
//   fb_545 — FOUR southern-hemisphere wines with "not enough contrast" (no_old_new_world_split).
//
// validateMultiOriginSpread caps a multi-origin flight at one wine per country and, for a 3+ wine
// non-same-country flight whose stem does not pin a single world, requires an Old + New World split.
import { describe, it, expect } from "vitest";
import {
  validateMultiOriginSpread,
  stemAssertsMultiOrigin,
  SPREAD_REASON_COUNTRY_REPEAT,
  SPREAD_REASON_NO_WORLD_SPLIT,
} from "../src/lib/question-engine";

const wine = (slot: number, fullText: string) => ({ slot, fullText });

describe("validateMultiOriginSpread — country cap in a multi-origin flight", () => {
  it("rejects a four-wine 'different origins' flight with two Chilean wines (fb_566)", () => {
    const stem = "Wines 3 to 6 are from different origins, each made predominantly from a different, single grape variety.";
    const res = validateMultiOriginSpread(stem, "F4", "", [
      wine(3, "Concha y Toro Cabernet Sauvignon, Maipo Valley, Chile"),
      wine(4, "Cono Sur Pinot Noir, Casablanca Valley, Chile"),
      wine(5, "Barolo, Piedmont, Italy"),
      wine(6, "Barossa Valley Shiraz, Australia"),
    ]);
    expect(res.valid).toBe(false);
    expect(res.reasons).toContain(SPREAD_REASON_COUNTRY_REPEAT);
    expect(res.violations.join(" ")).toMatch(/chile/i);
  });

  it("rejects two Portuguese blends in a 'Europe, but not France/Italy/Spain' flight (fb_555)", () => {
    const stem = "Wines 1-4 come from Europe, but not from France, Italy or Spain.";
    const res = validateMultiOriginSpread(stem, "F4", "", [
      wine(1, "Douro red blend, Portugal"),
      wine(2, "Dão red blend, Portugal"),
      wine(3, "Rheingau Riesling, Germany"),
      wine(4, "Wachau Grüner Veltliner, Austria"),
    ]);
    expect(res.valid).toBe(false);
    expect(res.reasons).toContain(SPREAD_REASON_COUNTRY_REPEAT);
    // The all-Old-World premise ("Europe") must NOT also trip the world-split rule.
    expect(res.reasons).not.toContain(SPREAD_REASON_NO_WORLD_SPLIT);
  });

  it("re-selects to a distinct-country flight — one Chilean, no repeat — and passes", () => {
    const stem = "Wines 3 to 6 are from different origins, each made predominantly from a different, single grape variety.";
    const res = validateMultiOriginSpread(stem, "F4", "", [
      wine(3, "Concha y Toro Cabernet Sauvignon, Maipo Valley, Chile"),
      wine(4, "Châteauneuf-du-Pape, France"),
      wine(5, "Barolo, Piedmont, Italy"),
      wine(6, "Barossa Valley Shiraz, Australia"),
    ]);
    expect(res.valid).toBe(true);
    expect(res.reasons).toEqual([]);
  });
});

describe("validateMultiOriginSpread — Old/New World split", () => {
  it("rejects an all-southern-hemisphere four-wine grab-bag (fb_545)", () => {
    const stem = "Wines 3–6 are each made predominantly from a different, single grape variety.";
    const res = validateMultiOriginSpread(stem, "F4", "", [
      wine(3, "Barossa Valley Shiraz, Australia"),
      wine(4, "Marlborough Sauvignon Blanc, New Zealand"),
      wine(5, "Maipo Valley Cabernet Sauvignon, Chile"),
      wine(6, "Stellenbosch Chenin Blanc, South Africa"),
    ]);
    expect(res.valid).toBe(false);
    expect(res.reasons).toContain(SPREAD_REASON_NO_WORLD_SPLIT);
    expect(res.violations.join(" ")).toMatch(/entirely New-World/);
  });

  it("passes a France + Chile + Italy + Australia flight (spans both worlds, no country repeat)", () => {
    const stem = "Wines 1 to 4 are from four different countries, each a different single grape variety.";
    const res = validateMultiOriginSpread(stem, "F4", "", [
      wine(1, "Sancerre, France"),
      wine(2, "Maipo Valley Cabernet Sauvignon, Chile"),
      wine(3, "Barolo, Piedmont, Italy"),
      wine(4, "Barossa Valley Shiraz, Australia"),
    ]);
    expect(res.valid).toBe(true);
    expect(res.reasons).toEqual([]);
  });

  it("leaves a legitimate same-country archetype untouched by the world-split rule", () => {
    // A same-country (F2) flight: all New Zealand. The world-split rule must not fire, and — since the
    // stem asserts a SAME origin, not different origins — the country-cap must not fire either.
    const stem = "Wines 1 to 3 are all from New Zealand.";
    const wines = [
      wine(1, "Cloudy Bay Sauvignon Blanc, Marlborough, New Zealand"),
      wine(2, "Felton Road Pinot Noir, Central Otago, New Zealand"),
      wine(3, "Kumeu River Chardonnay, Auckland, New Zealand"),
    ];
    expect(validateMultiOriginSpread(stem, "F2", "same_country", wines).valid).toBe(true);
    // Even if the family tag were missing, a same_country subcategory exempts the world-split rule.
    expect(validateMultiOriginSpread(stem, "F4", "same_country", wines).valid).toBe(true);
  });

  it("does not fire the world-split rule when the stem pins a single world (e.g. Europe)", () => {
    const stem = "Wines 1-4 come from Europe, but not from France, Italy or Spain.";
    const res = validateMultiOriginSpread(stem, "F4", "", [
      wine(1, "Douro red blend, Portugal"),
      wine(2, "Rheingau Riesling, Germany"),
      wine(3, "Wachau Grüner Veltliner, Austria"),
      wine(4, "Santorini Assyrtiko, Greece"),
    ]);
    expect(res.valid).toBe(true);
    expect(res.reasons).toEqual([]);
  });
});

describe("stemAssertsMultiOrigin", () => {
  it("recognises 'different origins', 'different countries' and 'different regions'", () => {
    expect(stemAssertsMultiOrigin("Wines are from different origins.")).toBe(true);
    expect(stemAssertsMultiOrigin("Wines 1-4 are from four different countries.")).toBe(true);
    expect(stemAssertsMultiOrigin("Each wine is from a different region.")).toBe(true);
  });
  it("recognises the exclusionary-continent premise ('Europe, but not France/Italy/Spain')", () => {
    expect(stemAssertsMultiOrigin("Wines 1-4 come from Europe, but not from France, Italy or Spain.")).toBe(true);
  });
  it("does not fire on a same-origin stem", () => {
    expect(stemAssertsMultiOrigin("Wines 1 to 3 are all from New Zealand.")).toBe(false);
  });
});
