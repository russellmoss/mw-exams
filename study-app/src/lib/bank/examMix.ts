// examMix.ts — Exam Mix: the invisible composition-balancing layer over bank generation.
//
// THE single source of truth for (a) the Paper 3 category mix and (b) the all-papers curveball
// difficulty mix that steer question-bank generation toward the historical exam composition. Nothing
// here is candidate-facing or admin-facing — it lives entirely on the generation path.
//
// Two responsibilities:
//   • SELECTION (pre-generation): given the batch's running tally, pick the most-underweighted
//     category / curveball level and hand it to the generation prompt as a required target.
//   • VALIDATION (post-generation, hard): validateP3Composition (category coherence + honoured
//     target) and validateCurveballMix (projected batch shares stay inside the tolerance bands).
//
// It reuses the per-wine style detection in p3-category.mjs and extends it to the 8-way wine_category
// scheme the spec stores (sparkling | rose | fortified | sweet | oxidative | orange | still_white |
// still_red).

import { classifyWineStyle } from "@/lib/p3-category.mjs";

export type WineCategory =
  | "sparkling"
  | "rose"
  | "fortified"
  | "sweet"
  | "oxidative"
  | "orange"
  | "still_white"
  | "still_red";

export type CurveballLevel = "low" | "medium" | "high";

export const WINE_CATEGORIES: readonly WineCategory[] = [
  "sparkling",
  "rose",
  "fortified",
  "sweet",
  "oxidative",
  "orange",
  "still_white",
  "still_red",
] as const;

export const CURVEBALL_LEVELS: readonly CurveballLevel[] = ["low", "medium", "high"] as const;

// ── Targets ─────────────────────────────────────────────────────────────────────────────────────
//
// Paper 3 category mix, as a share of P3 wines (spec). Sparkling is PRIMARY and most-underweighted-
// first. The "remainder" band (oxidative/orange/other still) is expressed once and shared: the
// categories that make it up are steered as a group, never individually.
export interface MixBand {
  min: number;
  max: number;
}

export const P3_CATEGORY_TARGETS: Record<WineCategory, MixBand> = {
  sparkling: { min: 0.25, max: 0.33 }, // 3–4 wines per 12 — PRIMARY
  fortified: { min: 0.17, max: 0.25 },
  sweet: { min: 0.17, max: 0.25 },
  rose: { min: 0.05, max: 0.1 },
  // Remainder band (spec: "oxidative/orange/other still 0.10–0.20"), steered as a group below.
  oxidative: { min: 0.0, max: 0.2 },
  orange: { min: 0.0, max: 0.2 },
  still_white: { min: 0.0, max: 0.2 },
  still_red: { min: 0.0, max: 0.2 },
};

// The categories Exam Mix targets on Paper 3, in most-underweighted-first tie-break order (sparkling
// leads). The remainder categories share one band so they sit last.
export const P3_PRIORITY: readonly WineCategory[] = [
  "sparkling",
  "fortified",
  "sweet",
  "rose",
  "oxidative",
  "orange",
  "still_white",
  "still_red",
] as const;

// The categories that make up the P3 "remainder" band (steered on their combined share).
export const P3_REMAINDER: readonly WineCategory[] = ["oxidative", "orange", "still_white", "still_red"] as const;
export const P3_REMAINDER_BAND: MixBand = { min: 0.1, max: 0.2 };

// Curveball mix — all papers combined and per paper (EK-0023: 75.9/17.9/6.2). Tolerance ±0.06 on
// low/medium, ±0.04 on high.
export interface CurveballTarget {
  share: number;
  tol: number;
}
export const CURVEBALL_TARGETS: Record<CurveballLevel, CurveballTarget> = {
  low: { share: 0.76, tol: 0.06 },
  medium: { share: 0.18, tol: 0.06 },
  high: { share: 0.06, tol: 0.04 },
};

// ── Classification ──────────────────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Orange / skin-contact whites — a distinct wine_category the p3-category classifier folds into
// "oxidative". Split out on the explicit style cues.
const ORANGE = /\b(orange wine|amber wine|skin[- ]contact|skin contact|qvevri|kvevri|ramato)\b/;
const WHITE_CUE =
  /\b(blanc|blanco|bianco|white|weiss|weisser|riesling|chardonnay|sauvignon|chenin|semillon|gruner|gruener|viognier|albarino|verdejo|furmint|assyrtiko|garganega|trebbiano|fiano|vermentino|marsanne|roussanne|muscat|gewurztraminer|pinot gris|pinot grigio|silvaner)\b/;
const RED_CUE =
  /\b(rouge|tinto|tinta|red|noir|nero|dunkel|cabernet|merlot|syrah|shiraz|grenache|garnacha|tempranillo|sangiovese|nebbiolo|pinot noir|malbec|zinfandel|mourvedre|mataro|touriga|montepulciano|barbera|carmenere|petit verdot|tannat|aglianico|primitivo)\b/;

/**
 * Classify ONE wine's fullText into the 8-way wine_category scheme.
 *
 * Builds on classifyWineStyle (fortified > sweet > sparkling > oxidative > other) and its rosé flag,
 * then resolves the base classifier's "other" bucket into orange / still_white / still_red using
 * colour cues.
 */
export function classifyWineCategory(fullText: string): WineCategory {
  const t = norm(fullText);
  const { style, isRose } = classifyWineStyle(fullText);
  if (isRose) return "rose";
  if (style === "fortified") return "fortified";
  if (style === "sweet") return "sweet";
  if (style === "sparkling") return "sparkling";
  if (style === "oxidative") {
    return ORANGE.test(t) ? "orange" : "oxidative";
  }
  // style === "other": a still dry wine — split by colour.
  if (ORANGE.test(t)) return "orange";
  if (RED_CUE.test(t) && !WHITE_CUE.test(t)) return "still_red";
  if (WHITE_CUE.test(t) && !RED_CUE.test(t)) return "still_white";
  // Ambiguous: default to still_white (Paper 3 dry stills are more often white curveballs).
  return "still_white";
}

/** The per-wine categories in a flight. */
export function flightCategories(wines: { fullText: string }[]): WineCategory[] {
  return (Array.isArray(wines) ? wines : [])
    .filter((w) => w && w.fullText)
    .map((w) => classifyWineCategory(w.fullText));
}

/**
 * The single dominant wine_category for a flight (the tag stored on the bank item). Coherent flights
 * resolve to their shared category; a mixed flight resolves to the most common, ties broken by
 * P3_PRIORITY.
 */
export function classifyFlightCategory(wines: { fullText: string }[]): WineCategory {
  const cats = flightCategories(wines);
  if (cats.length === 0) return "still_white";
  const counts = new Map<WineCategory, number>();
  for (const c of cats) counts.set(c, (counts.get(c) ?? 0) + 1);
  let best = cats[0];
  let bestN = 0;
  for (const cat of P3_PRIORITY) {
    const n = counts.get(cat) ?? 0;
    if (n > bestN) {
      bestN = n;
      best = cat;
    }
  }
  return best;
}

// ── Selection (pre-generation targeting) ─────────────────────────────────────────────────────────

export type CategoryCounts = Partial<Record<WineCategory, number>>;
export type CurveballCounts = Partial<Record<CurveballLevel, number>>;

function total(counts: CategoryCounts | CurveballCounts): number {
  return Object.values(counts).reduce((s: number, n) => s + (n ?? 0), 0);
}

/**
 * Ordered list of P3 category targets, most-deficient-first. Deficit = (band midpoint share − current
 * share); a category already inside/above its band has a non-positive deficit and sinks down the
 * list. Ties (and the empty-batch cold-start) fall back to P3_PRIORITY, so sparkling leads.
 *
 * The remainder categories share one band (P3_REMAINDER_BAND) measured over their combined share, so
 * they are only pulled up when the whole remainder group is thin.
 */
export function orderP3TargetsByDeficit(counts: CategoryCounts): WineCategory[] {
  const n = total(counts);
  const share = (cat: WineCategory) => (n > 0 ? (counts[cat] ?? 0) / n : 0);
  const remainderShare = P3_REMAINDER.reduce((s, c) => s + share(c), 0);

  const deficitFor = (cat: WineCategory): number => {
    if (P3_REMAINDER.includes(cat)) {
      const mid = (P3_REMAINDER_BAND.min + P3_REMAINDER_BAND.max) / 2;
      return mid - remainderShare;
    }
    const band = P3_CATEGORY_TARGETS[cat];
    const mid = (band.min + band.max) / 2;
    return mid - share(cat);
  };

  return [...P3_PRIORITY].sort((a, b) => {
    const d = deficitFor(b) - deficitFor(a);
    if (Math.abs(d) > 1e-9) return d;
    return P3_PRIORITY.indexOf(a) - P3_PRIORITY.indexOf(b);
  });
}

/** The single most-deficient P3 category to target for the next generation. */
export function pickP3TargetCategory(counts: CategoryCounts): WineCategory {
  return orderP3TargetsByDeficit(counts)[0];
}

/**
 * Ordered list of curveball levels, most-deficient-first. Deficit = target share − current share, so
 * a level running under its target is pulled up. Cold-start returns low, medium, high.
 */
export function orderCurveballByDeficit(counts: CurveballCounts): CurveballLevel[] {
  const n = total(counts);
  const share = (lvl: CurveballLevel) => (n > 0 ? (counts[lvl] ?? 0) / n : 0);
  return [...CURVEBALL_LEVELS].sort((a, b) => {
    const d = CURVEBALL_TARGETS[b].share - share(b) - (CURVEBALL_TARGETS[a].share - share(a));
    if (Math.abs(d) > 1e-9) return d;
    return CURVEBALL_LEVELS.indexOf(a) - CURVEBALL_LEVELS.indexOf(b);
  });
}

/** The curveball level to instruct for the next generation. */
export function pickCurveballTarget(counts: CurveballCounts): CurveballLevel {
  return orderCurveballByDeficit(counts)[0];
}

// ── Validation (post-generation, hard) ───────────────────────────────────────────────────────────

export interface MixValidation {
  valid: boolean;
  violations: string[];
}

/**
 * validateP3Composition — Paper 3 only.
 *   • every wine has a resolvable wine_category (a flight of unclassifiable wines is rejected),
 *   • the flight is category-COHERENT — all wines share one category — UNLESS the generator flagged a
 *     deliberate cross-category comparison (crossCategoryIntentional), which the stem must justify,
 *   • the targeted category (when one was requested) was honoured.
 */
export function validateP3Composition(
  question: {
    paper: number;
    wines: { fullText: string }[];
    crossCategoryIntentional?: boolean;
  },
  targetedCategory?: WineCategory | null
): MixValidation & { category: WineCategory } {
  const violations: string[] = [];
  const cats = flightCategories(question.wines);
  const flightCategory = classifyFlightCategory(question.wines);

  if (question.wines.length === 0 || cats.length !== question.wines.length) {
    violations.push("Every wine must have a resolvable wine_category.");
  }

  const distinct = new Set(cats);
  if (distinct.size > 1 && !question.crossCategoryIntentional) {
    violations.push(
      `Paper 3 flight mixes categories (${[...distinct].join(", ")}) without an intentional cross-category framing.`
    );
  }

  if (targetedCategory && distinct.size > 0) {
    // A coherent flight must BE the target; an intentional cross-category flight must at least contain
    // it.
    const honoured = question.crossCategoryIntentional
      ? distinct.has(targetedCategory)
      : flightCategory === targetedCategory;
    if (!honoured) {
      violations.push(`Targeted category '${targetedCategory}' was not honoured (flight is '${flightCategory}').`);
    }
  }

  return { valid: violations.length === 0, violations, category: flightCategory };
}

/**
 * validateCurveballMix — all papers. Given the batch's running curveball tally, reject a question
 * whose curveball level would push a projected batch share outside its tolerance band. Only the HIGH
 * band is a hard ceiling (spec: "reject a question that would push high-curveball above the band");
 * low/medium are steered by selection and never block, so a legitimately harder run is never stalled
 * chasing an exact low share.
 */
export function validateCurveballMix(
  question: { curveballLevel?: CurveballLevel | null },
  runningCounts: CurveballCounts
): MixValidation {
  const level = question.curveballLevel ?? "low";
  const projected: CurveballCounts = { ...runningCounts };
  projected[level] = (projected[level] ?? 0) + 1;
  const n = total(projected);
  const violations: string[] = [];

  if (level === "high") {
    const share = (projected.high ?? 0) / Math.max(1, n);
    const ceiling = CURVEBALL_TARGETS.high.share + CURVEBALL_TARGETS.high.tol;
    // Allow the first high in a small batch (one high in the opening handful of wines is unavoidable).
    if (n >= Math.ceil(1 / ceiling) && share > ceiling + 1e-9) {
      violations.push(
        `High-curveball share ${(share * 100).toFixed(0)}% would exceed the ${(ceiling * 100).toFixed(0)}% ceiling.`
      );
    }
  }

  return { valid: violations.length === 0, violations };
}

// ── mix_summary rendering ────────────────────────────────────────────────────────────────────────

export interface MixSummary {
  paper: number;
  categories: Partial<Record<WineCategory, number>>;
  curveball: Partial<Record<CurveballLevel, number>>;
}

const CATEGORY_LABELS: Record<WineCategory, string> = {
  sparkling: "sparkling",
  rose: "rosé",
  fortified: "fortified",
  sweet: "sweet",
  oxidative: "oxidative",
  orange: "orange",
  still_white: "still white",
  still_red: "still red",
};

/**
 * The one plain line under a batch title, e.g.
 *   "4 sparkling · 3 sweet · 3 fortified · 2 rosé · curveball 1 high, 2 medium"
 * Paper 1/2 batches omit the category fragment (curveball only). Returns null when there is nothing
 * to show.
 */
export function renderMixSummaryLine(summary: MixSummary | null | undefined): string | null {
  if (!summary) return null;
  const parts: string[] = [];

  if (summary.paper === 3) {
    const cats = (Object.entries(summary.categories) as [WineCategory, number][])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || P3_PRIORITY.indexOf(a[0]) - P3_PRIORITY.indexOf(b[0]));
    for (const [cat, n] of cats) parts.push(`${n} ${CATEGORY_LABELS[cat]}`);
  }

  const cb: string[] = [];
  if (summary.curveball.high) cb.push(`${summary.curveball.high} high`);
  if (summary.curveball.medium) cb.push(`${summary.curveball.medium} medium`);
  if (cb.length > 0) parts.push(`curveball ${cb.join(", ")}`);

  return parts.length > 0 ? parts.join(" · ") : null;
}
