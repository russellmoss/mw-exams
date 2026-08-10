import { describe, it, expect } from "vitest";
import {
  isSparklingRedSyrah,
  isSparklingWineText,
  detectCappedStyles,
  styleFrequencyAllowances,
  applyStyleFrequencyCaps,
  selectCappedStyleExclusions,
  STYLE_FREQUENCY_CAPS,
  PRECEDENT_SPARKLING_SUBSTITUTES,
  type CapWine,
} from "../src/lib/question-engine";
import { buildStyleFrequencyCapBlock } from "../src/lib/prompts/question-generation-prompt";

/**
 * Sparkling-Syrah frequency cap (fb_597–fb_601). Five consecutive Paper 3 sparkling flights were
 * rejected for over-using sparkling red Syrah/Shiraz against its ~once-in-fifteen-years exam precedent.
 * The cap: at most ONE such wine per flight, and NONE at all once one appears in the last 20 generated
 * sparkling questions. These tests pin the SELECTION behaviour and prove the cap — and only the cap —
 * is what enforces it (emptying STYLE_FREQUENCY_CAPS restores the old behaviour).
 */

// Two DISTINCT sparkling Shiraz wines, a Champagne (sparkling, not Syrah), and precedent substitutes.
const SPARK_SYRAH_A = "Ashton Hills, Sparkling Shiraz, NV. Adelaide Hills, Australia. (13%)";
const SPARK_SYRAH_B = "Seppelt, Show Sparkling Shiraz, 2012. Grampians, Australia. (14%)";
const CHAMPAGNE = "Bollinger, Special Cuvée Brut Champagne, NV. Champagne, France. (12%)";
const STILL_SHIRAZ = "Yalumba, The Signature Shiraz, 2018. Barossa, Australia. (14.5%)";

const SUBS: CapWine[] = [
  { fullText: "Nyetimber, Classic Cuvée, NV. Sussex, England. (12%)" },
  { fullText: "Raventós i Blanc, Cava de Paraje, 2019. Penedès, Spain. (12%)" },
  { fullText: "Bisol, Prosecco Superiore Brut, NV. Valdobbiadene, Italy. (11.5%)" },
  { fullText: "Ca' dei Zago, Prosecco Col Fondo pét-nat, 2020. Veneto, Italy. (11%)" },
];

describe("isSparklingRedSyrah — detection", () => {
  it("flags sparkling Shiraz / Syrah", () => {
    expect(isSparklingRedSyrah(SPARK_SYRAH_A)).toBe(true);
    expect(isSparklingRedSyrah(SPARK_SYRAH_B)).toBe(true);
    expect(isSparklingRedSyrah("Domaine X, Sparkling Syrah, 2020. Rhône, France. (12%)")).toBe(true);
  });

  it("does NOT flag a still Syrah/Shiraz or a sparkling wine of another variety", () => {
    expect(isSparklingRedSyrah(STILL_SHIRAZ)).toBe(false);
    expect(isSparklingRedSyrah(CHAMPAGNE)).toBe(false);
    expect(isSparklingRedSyrah("Bisol, Prosecco Superiore, NV. Italy. (11.5%)")).toBe(false);
  });

  it("scopes the category window to sparkling wines only", () => {
    expect(isSparklingWineText(SPARK_SYRAH_A)).toBe(true);
    expect(isSparklingWineText(CHAMPAGNE)).toBe(true);
    expect(isSparklingWineText(STILL_SHIRAZ)).toBe(false);
  });

  it("detectCappedStyles tags the sparkling-red-syrah style", () => {
    expect(detectCappedStyles(SPARK_SYRAH_A)).toContain("sparkling-red-syrah");
    expect(detectCappedStyles(CHAMPAGNE)).toEqual([]);
  });
});

describe("styleFrequencyAllowances — recent-window refusal", () => {
  it("allows one when no recent sparkling question used the style", () => {
    const allow = styleFrequencyAllowances([[CHAMPAGNE], [STILL_SHIRAZ]]);
    expect(allow.get("sparkling-red-syrah")).toBe(1);
  });

  it("drops the allowance to zero when a recent sparkling question already used it", () => {
    const allow = styleFrequencyAllowances([[SPARK_SYRAH_A, CHAMPAGNE]]);
    expect(allow.get("sparkling-red-syrah")).toBe(0);
  });

  it("ignores a STILL Syrah in the history — the window is sparkling-only", () => {
    const allow = styleFrequencyAllowances([[STILL_SHIRAZ]]);
    expect(allow.get("sparkling-red-syrah")).toBe(1);
  });

  it("ignores a sparkling-Syrah flight older than the recent window", () => {
    // 20 clean sparkling flights, then the offender at index 20 (outside the 20-flight window).
    const history = [
      ...Array.from({ length: 20 }, () => [CHAMPAGNE]),
      [SPARK_SYRAH_A],
    ];
    expect(styleFrequencyAllowances(history).get("sparkling-red-syrah")).toBe(1);
  });
});

describe("applyStyleFrequencyCaps — never two in one flight", () => {
  it("keeps at most one sparkling Syrah in a flight, substituting the rest", () => {
    const flight: CapWine[] = [
      { slot: 1, fullText: SPARK_SYRAH_A },
      { slot: 2, fullText: SPARK_SYRAH_B },
      { slot: 3, fullText: CHAMPAGNE },
    ];
    const out = applyStyleFrequencyCaps(flight, SUBS, []);
    expect(out.filter((w) => isSparklingRedSyrah(w.fullText)).length).toBe(1);
    expect(out.length).toBe(3);
    // Slots are preserved on substituted wines.
    expect(out.map((w) => w.slot)).toEqual([1, 2, 3]);
  });

  it("refuses the style entirely when it is in the recent window", () => {
    const flight: CapWine[] = [
      { slot: 1, fullText: SPARK_SYRAH_A },
      { slot: 2, fullText: CHAMPAGNE },
    ];
    const out = applyStyleFrequencyCaps(flight, SUBS, [[SPARK_SYRAH_B, CHAMPAGNE]]);
    expect(out.filter((w) => isSparklingRedSyrah(w.fullText)).length).toBe(0);
  });
});

describe("20 consecutive sparkling P3 flights", () => {
  const candidate = (): CapWine[] => [
    { slot: 1, fullText: SPARK_SYRAH_A },
    { slot: 2, fullText: SPARK_SYRAH_B },
    { slot: 3, fullText: CHAMPAGNE },
  ];

  it("yields at most ONE sparkling Syrah overall and never two in a single flight", () => {
    const history: string[][] = []; // newest first
    const flights: CapWine[][] = [];
    for (let i = 0; i < 20; i++) {
      const flight = applyStyleFrequencyCaps(candidate(), SUBS, history);
      flights.push(flight);
      history.unshift(flight.map((w) => w.fullText));
    }
    const perFlight = flights.map((f) => f.filter((w) => isSparklingRedSyrah(w.fullText)).length);
    expect(Math.max(...perFlight)).toBeLessThanOrEqual(1); // never two in one flight
    expect(perFlight.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(1); // at most one overall
  });

  it("with the cap map emptied the old behaviour returns (proves the cap enforces it)", () => {
    const history: string[][] = [];
    const flights: CapWine[][] = [];
    for (let i = 0; i < 20; i++) {
      const flight = applyStyleFrequencyCaps(candidate(), SUBS, history, []); // empty caps
      flights.push(flight);
      history.unshift(flight.map((w) => w.fullText));
    }
    const perFlight = flights.map((f) => f.filter((w) => isSparklingRedSyrah(w.fullText)).length);
    expect(Math.max(...perFlight)).toBe(2); // two per flight again
    expect(perFlight.reduce((a, b) => a + b, 0)).toBe(40); // no overall cap
  });
});

describe("selectCappedStyleExclusions — prompt-level hard exclusion", () => {
  it("hard-excludes the style once it is in the recent sparkling questions", () => {
    const out = selectCappedStyleExclusions([[SPARK_SYRAH_A, CHAMPAGNE], [CHAMPAGNE]]);
    const style = out.find((s) => s.id === "sparkling-red-syrah");
    expect(style).toBeDefined();
    expect(style!.reasons).toContain("recent-window");
  });

  it("excludes nothing when no recent sparkling question used the style", () => {
    expect(selectCappedStyleExclusions([[CHAMPAGNE], [STILL_SHIRAZ]])).toEqual([]);
  });
});

describe("buildStyleFrequencyCapBlock", () => {
  it("returns empty string with no caps", () => {
    expect(buildStyleFrequencyCapBlock([])).toBe("");
  });

  it("states the per-flight ceiling and names precedent substitutes", () => {
    const block = buildStyleFrequencyCapBlock(
      STYLE_FREQUENCY_CAPS.map((c) => ({ label: c.label, maxPerFlight: c.maxPerFlight, substitutes: c.substitutes }))
    );
    expect(block).toContain("Sparkling red Syrah / Shiraz");
    expect(block).toContain("at most 1");
    expect(block).toContain("HARD RULE");
    expect(block).toContain("Cava");
    expect(block).toContain("silently");
  });
});

describe("cap config", () => {
  it("pins the sparkling-red-syrah cap: 1 per flight, 20-question window", () => {
    const cap = STYLE_FREQUENCY_CAPS.find((c) => c.id === "sparkling-red-syrah");
    expect(cap).toBeDefined();
    expect(cap!.maxPerFlight).toBe(1);
    expect(cap!.recentWindow).toBe(20);
    expect(PRECEDENT_SPARKLING_SUBSTITUTES.length).toBeGreaterThan(0);
  });
});
