// aggregate.ts — assemble the Bank Health payload from the DB slices + benchmark table.
//
// Scalar slices (paper / questionType / curveball / flightSize / priceBand) come back pre-grouped
// from SQL. The free-text slices (mark focus, grape & region coverage, over-representation) are
// derived in TypeScript from a single lite scan of the servable pool. The whole payload is memoised
// for 60s so the page and its polling never re-run the scan on every request.

import {
  getBankHealthTotals,
  getBankSliceCounts,
  getFlightSizeCounts,
  getBankBatchKeepStats,
  getTopRejectionReasons,
  getKeptBankLite,
} from "@/lib/db";
import {
  BENCHMARKS,
  BENCHMARK_YEARS,
  BENCHMARK_VERSION,
  computeFlag,
  type Flag,
  type SliceId,
} from "./benchmarks";
import {
  deriveGrapes,
  deriveRegions,
  deriveMarkFocus,
  QUESTION_TYPE_LABELS,
  MARK_CATEGORY_LABELS,
  type MarkCategory,
} from "./derive";

export interface HealthRow {
  key: string;
  label: string;
  count: number;
  bankPct: number;
  benchmarkPct: number;
  flag: Flag;
}

export interface HealthSlice {
  id: SliceId;
  label: string;
  rows: HealthRow[];
  // Coverage slices split their rows into "most used" and "thin or missing"; the UI reads this.
  layout?: "table" | "coverage";
}

export interface BankHealthPayload {
  totals: {
    total: number;
    unserved: number;
    servedPct: number;
    keepRate: number | null;
    binnedRate: number | null;
    topBinReasons: { reason: string; count: number }[];
  };
  slices: HealthSlice[];
  benchmarkYears: number[];
  benchmarkVersion: string;
  generatedAt: string;
}

const PAPER_LABELS: Record<string, string> = { "1": "Paper 1", "2": "Paper 2", "3": "Paper 3" };
const CURVEBALL_LABELS: Record<string, string> = { low: "Standard", medium: "Testing", high: "Curveball" };
const FLIGHT_LABELS: Record<string, string> = { "2": "2 wines", "3": "3 wines", "4plus": "4+ wines" };
const PRICE_LABELS: Record<string, string> = {
  value: "Value",
  mainstream: "Mainstream",
  premium: "Premium",
  super_premium: "Super-premium",
  luxury: "Luxury",
};

// Plain-language names for the internal generation rules, so the "top bin reason" caption never
// leaks a rule token into the UI (DESIGN: no technical/internal terms in visible copy).
const REJECTION_LABELS: Record<string, string> = {
  markMix: "Mark spread off",
  markCheck: "Mark spread off",
  banker: "No classic anchor",
  bankerCheck: "No classic anchor",
  novelty: "Too similar to existing",
  noveltyCheck: "Too similar to existing",
  flightSize: "Wrong flight size",
  flightSizeCheck: "Wrong flight size",
  priceSpread: "Price spread off",
  price: "Price spread off",
  countryDiversity: "Country mix off",
  countryDiversityCheck: "Country mix off",
  originDiversity: "Origin mix off",
  originDiversityCheck: "Origin mix off",
  variety: "Variety mismatch",
  varietyCheck: "Variety mismatch",
  varietyFilter: "Variety mismatch",
  paperScope: "Wrong for this paper",
  paperScopeCheck: "Wrong for this paper",
  composition: "Flight balance off",
  parse: "Couldn't read the draft",
  parseFailed: "Couldn't read the draft",
};

export function friendlyRejection(rule: string): string {
  return REJECTION_LABELS[rule] || "Other";
}

function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

// Build a scalar slice's rows from grouped counts. `keyOrder`/labels drive display; benchmark keys
// with a zero bank count are still shown (so a missing bucket flags as thin).
function buildScalarSlice(
  id: SliceId,
  label: string,
  grouped: { key: string; count: number }[],
  labels: Record<string, string>,
  keyOrder: string[]
): HealthSlice {
  const counts = new Map<string, number>();
  for (const g of grouped) counts.set(g.key, (counts.get(g.key) || 0) + g.count);
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const benchmark = BENCHMARKS[id] || {};
  const keys = [...new Set([...keyOrder, ...counts.keys(), ...Object.keys(benchmark)])];
  const rows: HealthRow[] = keys.map((key) => {
    const count = counts.get(key) || 0;
    const bankPct = pct(count, total);
    const benchmarkPct = benchmark[key] ?? 0;
    return {
      key,
      label: labels[key] || key,
      count,
      bankPct,
      benchmarkPct,
      flag: computeFlag(bankPct, benchmarkPct, count),
    };
  });
  // Show most-populated / benchmark-relevant first.
  rows.sort((a, b) => b.count - a.count || b.benchmarkPct - a.benchmarkPct);
  return { id, label, rows, layout: "table" };
}

export async function computeBankHealth(): Promise<BankHealthPayload> {
  const [
    totals,
    paperCounts,
    typeCounts,
    curveballCounts,
    priceCounts,
    flightCounts,
    keepStats,
    rejectionReasons,
    lite,
  ] = await Promise.all([
    getBankHealthTotals(),
    getBankSliceCounts("paper"),
    getBankSliceCounts("question_type"),
    getBankSliceCounts("curveball"),
    getBankSliceCounts("price_band"),
    getFlightSizeCounts(),
    getBankBatchKeepStats(),
    getTopRejectionReasons(5),
    getKeptBankLite(),
  ]);

  const slices: HealthSlice[] = [];

  slices.push(buildScalarSlice("paper", "Papers", paperCounts, PAPER_LABELS, ["1", "2", "3"]));
  slices.push(
    buildScalarSlice("questionType", "Question types", typeCounts, QUESTION_TYPE_LABELS, Object.keys(BENCHMARKS.questionType))
  );
  slices.push(
    buildScalarSlice("curveball", "Curveball level", curveballCounts, CURVEBALL_LABELS, ["low", "medium", "high"])
  );
  slices.push(
    buildScalarSlice("flightSize", "Flight size", flightCounts, FLIGHT_LABELS, ["2", "3", "4plus"])
  );

  // ── Mark focus (TS-derived from the lite scan) ──
  const totalQ = lite.length;
  const markTotals = new Map<MarkCategory, number>();
  let allMarks = 0;
  for (const row of lite) {
    const focus = deriveMarkFocus(row.question_text, row.total_marks);
    for (const [cat, marks] of Object.entries(focus)) {
      markTotals.set(cat as MarkCategory, (markTotals.get(cat as MarkCategory) || 0) + (marks || 0));
      allMarks += marks || 0;
    }
  }
  {
    const benchmark = BENCHMARKS.markFocus;
    const keys = Object.keys(benchmark) as MarkCategory[];
    const rows: HealthRow[] = keys.map((cat) => {
      const marks = markTotals.get(cat) || 0;
      const bankPct = pct(marks, allMarks);
      const benchmarkPct = benchmark[cat] ?? 0;
      return {
        key: cat,
        label: MARK_CATEGORY_LABELS[cat],
        count: marks,
        bankPct,
        benchmarkPct,
        flag: computeFlag(bankPct, benchmarkPct, marks),
      };
    });
    rows.sort((a, b) => b.benchmarkPct - a.benchmarkPct);
    slices.push({ id: "markFocus", label: "Mark focus", rows, layout: "table" });
  }

  slices.push(
    buildScalarSlice("priceBand", "Price bands", priceCounts, PRICE_LABELS, Object.keys(BENCHMARKS.priceBand))
  );

  // ── Grape & region coverage (TS-derived; share of questions featuring each) ──
  slices.push(buildCoverageSlice("grapeCoverage", "Grape coverage", lite, deriveGrapes, totalQ));
  slices.push(buildCoverageSlice("regionCoverage", "Region coverage", lite, deriveRegions, totalQ));

  // ── Over-representation: wine types running > 3× their exam benchmark, ranked ──
  {
    const grapeCounts = new Map<string, number>();
    for (const row of lite) {
      for (const g of new Set(deriveGrapes(row.wines))) {
        grapeCounts.set(g, (grapeCounts.get(g) || 0) + 1);
      }
    }
    const benchmark = BENCHMARKS.grapeCoverage;
    const rows: HealthRow[] = [];
    for (const [key, count] of grapeCounts) {
      const bankPct = pct(count, totalQ);
      const benchmarkPct = benchmark[key] ?? 0;
      if (benchmarkPct > 0 && bankPct > benchmarkPct * 3) {
        rows.push({ key, label: key, count, bankPct, benchmarkPct, flag: "over" });
      }
    }
    rows.sort((a, b) => b.bankPct / (b.benchmarkPct || 1) - a.bankPct / (a.benchmarkPct || 1));
    slices.push({ id: "overRepetition", label: "Over-represented wine types", rows, layout: "table" });
  }

  const servedPct = totals.total > 0 ? pct(totals.total - totals.unserved, totals.total) : 0;
  const keepRate =
    keepStats.generated > 0 ? Math.round((keepStats.kept / keepStats.generated) * 1000) / 10 : null;
  const binnedRate = keepRate == null ? null : Math.round((100 - keepRate) * 10) / 10;

  return {
    totals: {
      total: totals.total,
      unserved: totals.unserved,
      servedPct,
      keepRate,
      binnedRate,
      topBinReasons: rejectionReasons.map((r) => ({ reason: friendlyRejection(r.reason), count: r.count })),
    },
    slices,
    benchmarkYears: BENCHMARK_YEARS,
    benchmarkVersion: BENCHMARK_VERSION,
    generatedAt: new Date().toISOString(),
  };
}

// A coverage slice: top-10 most-used rows (with flags) followed by the "thin or missing" expected
// entries (benchmark grape/region the bank barely carries). The UI renders the two groups as the
// "Most used" and "Thin or missing" columns.
function buildCoverageSlice(
  id: "grapeCoverage" | "regionCoverage",
  label: string,
  lite: { wines: unknown }[],
  derive: (wines: unknown) => string[],
  totalQ: number
): HealthSlice {
  const counts = new Map<string, number>();
  for (const row of lite) {
    for (const item of new Set(derive(row.wines))) {
      counts.set(item, (counts.get(item) || 0) + 1);
    }
  }
  const benchmark = BENCHMARKS[id] || {};
  const all = [...new Set([...counts.keys(), ...Object.keys(benchmark)])];
  const rows: HealthRow[] = all.map((key) => {
    const count = counts.get(key) || 0;
    const bankPct = pct(count, totalQ);
    const benchmarkPct = benchmark[key] ?? 0;
    return { key, label: key, count, bankPct, benchmarkPct, flag: computeFlag(bankPct, benchmarkPct, count) };
  });
  // Most-used first for the left column; the UI takes the top 10 by count and the thin/missing set.
  rows.sort((a, b) => b.count - a.count || b.benchmarkPct - a.benchmarkPct);
  return { id, label, rows, layout: "coverage" };
}

// ── 60s payload cache ──
let cached: { at: number; payload: BankHealthPayload } | null = null;
const CACHE_MS = 60_000;

export async function getBankHealthCached(): Promise<BankHealthPayload> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.payload;
  const payload = await computeBankHealth();
  cached = { at: now, payload };
  return payload;
}
