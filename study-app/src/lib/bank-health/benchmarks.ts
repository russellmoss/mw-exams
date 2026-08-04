// benchmarks.ts — the static, versioned benchmark table for Bank Health.
//
// Every Bank Health slice row is scored against what REAL IMW papers look like over the last seven
// exam years. Those shares are frozen here as a repo constant (not recomputed on the fly) so the
// benchmark is auditable and stable: change it deliberately, bump BENCHMARK_VERSION, and the whole
// page moves with it.
//
// Provenance — all figures are grounded in mw_exam_empirical_knowledge.md:
//   • curveball 76 / 18 / 6                          → EK-0023 (504 wines, 2011–2025)
//   • price bands premium/value/super/luxury/main    → EK-0027 corpus band distribution
//   • question-type framings                          → EK-0078 stem-phrase frequency
//   • flight size (4-wine modal, sweet ≈3.8)          → EK-0002 / EK-0080
//   • mark focus (ID ~38%, origin/style/…)            → EK-0098 / §2 mark-allocation table
//   • grape census                                    → EK-0075 per-variety corpus census
//   • region frequency                                → §4 wine-by-paper (EK-0034…EK-0038)
// Percentages are share-of-questions unless noted; grape/region are share-of-questions-featuring.

export const BENCHMARK_VERSION = "2026-08-04";

// The seven exam years the table is drawn from. The UI prints "the last 7 exam years (2019–2025)".
export const BENCHMARK_YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];

export type SliceId =
  | "paper"
  | "questionType"
  | "curveball"
  | "flightSize"
  | "markFocus"
  | "priceBand"
  | "grapeCoverage"
  | "regionCoverage"
  | "overRepetition";

// benchmarkPct keyed identically to the slice row `key`. A key absent here benchmarks to 0.
export const BENCHMARKS: Record<string, Record<string, number>> = {
  paper: { "1": 33, "2": 34, "3": 33 },

  questionType: {
    same_variety: 20,
    same_country: 12,
    different_countries: 12,
    compare_contrast: 12,
    mixed_grab_bag: 18,
    focus_style_quality_commercial: 22,
    other: 4,
  },

  curveball: { low: 76, medium: 18, high: 6 },

  flightSize: { "2": 22, "3": 30, "4plus": 48 },

  markFocus: {
    identification: 38,
    quality: 18,
    style: 15,
    maturity: 12,
    commercial: 10,
    winemaking: 7,
  },

  priceBand: {
    value: 24,
    mainstream: 5,
    premium: 47,
    super_premium: 17,
    luxury: 7,
  },

  // Share of questions featuring the grape. The keys here also define the "expected" set: any grape
  // with a benchmark that the bank barely carries surfaces in the coverage card's "thin or missing"
  // column.
  grapeCoverage: {
    Chardonnay: 18,
    "Pinot Noir": 14,
    Riesling: 11,
    "Cabernet Sauvignon": 9,
    "Sauvignon Blanc": 8,
    Syrah: 6,
    "Chenin Blanc": 6,
    Merlot: 5,
    Tempranillo: 5,
    Sangiovese: 5,
    Nebbiolo: 4,
    Grenache: 4,
    Malbec: 4,
    "Pinot Gris": 4,
    Sémillon: 4,
    Muscat: 4,
    Sherry: 4,
    Port: 4,
    Gewürztraminer: 3,
    Albariño: 3,
    Furmint: 3,
    Tokaji: 3,
    Madeira: 2,
  },

  regionCoverage: {
    Bordeaux: 9,
    Burgundy: 9,
    Rhône: 6,
    Loire: 5,
    Tuscany: 5,
    Champagne: 5,
    Rioja: 5,
    Piedmont: 4,
    Douro: 4,
    Mosel: 4,
    Alsace: 3,
    Jerez: 3,
    Napa: 3,
    Barossa: 3,
    Marlborough: 3,
    Mendoza: 3,
    Priorat: 2,
    Tokaj: 2,
    Madeira: 2,
  },
};

export type Flag = "on" | "over" | "thin";

// |bank − benchmark| ≤ 3pp → on target; bank − benchmark > 3pp → over-weighted; benchmark − bank >
// 3pp → thin. A zero-count row that the exams DO carry is always thin.
export function computeFlag(bankPct: number, benchmarkPct: number, count: number): Flag {
  if (count === 0 && benchmarkPct > 0) return "thin";
  const delta = bankPct - benchmarkPct;
  if (Math.abs(delta) <= 3) return "on";
  return delta > 3 ? "over" : "thin";
}

export function benchmarkFor(slice: SliceId, key: string): number {
  return BENCHMARKS[slice]?.[key] ?? 0;
}
