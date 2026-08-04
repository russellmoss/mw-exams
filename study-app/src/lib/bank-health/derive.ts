// derive.ts — turn a stored banked question into the Bank Health slicing dimensions.
//
// These pure functions re-derive the analytics dimensions from the SAME stored stem + wine JSON the
// candidate saw. They serve two callers:
//   1. saveGeneratedQuestion (src/lib/db.ts) — stamps question_type / curveball / price_band /
//      flight_size onto every new banked row so the fast SQL GROUP BY slices stay accurate.
//   2. the Bank Health aggregator — derives the free-text-dependent slices (grape & region coverage,
//      mark focus, over-representation) that can't live in a single indexed column.
// Keep the logic here identical to migration 026's SQL backfill so old and new rows agree.

export interface LiteWine {
  slot?: number;
  fullText?: string;
  variety?: string | null;
  region?: string | null;
  country?: string | null;
  priceBand?: string | null;
  price_band?: string | null;
}

export function parseWines(wines: unknown): LiteWine[] {
  if (!wines) return [];
  let arr: unknown = wines;
  if (typeof wines === "string") {
    try {
      arr = JSON.parse(wines);
    } catch {
      return [];
    }
  }
  return Array.isArray(arr) ? (arr as LiteWine[]) : [];
}

export function deriveFlightSize(wines: unknown): number {
  return parseWines(wines).length;
}

// Bucket a flight into the 2 / 3 / 4+ slice used by the flightSize benchmark.
export function flightSizeKey(size: number): "2" | "3" | "4plus" | null {
  if (size <= 1) return null;
  if (size === 2) return "2";
  if (size === 3) return "3";
  return "4plus";
}

export type Curveball = "low" | "medium" | "high";

export function deriveCurveball(metadata: unknown): Curveball {
  const meta = (metadata || {}) as Record<string, unknown>;
  const raw = String(meta.curveball ?? meta.difficulty ?? "").toLowerCase();
  if (raw.includes("high")) return "high";
  if (raw.includes("med")) return "medium";
  return "low";
}

export type QuestionType =
  | "same_variety"
  | "same_country"
  | "different_countries"
  | "compare_contrast"
  | "mixed_grab_bag"
  | "focus_style_quality_commercial"
  | "other";

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  same_variety: "Same variety flights",
  same_country: "Same country / region",
  different_countries: "Different countries",
  compare_contrast: "Compare & contrast",
  mixed_grab_bag: "Mixed grab-bag",
  focus_style_quality_commercial: "Style / quality / commercial",
  other: "Other framings",
};

// Priority-ordered — mirrors the CASE in migration 026 so a re-derive of an old row lands on the
// same bucket as the backfill gave it.
export function deriveQuestionType(stem: string): QuestionType {
  const s = (stem || "").toLowerCase();
  if (s.includes("compare and contrast")) return "compare_contrast";
  if (/same single grape variety|same grape variety|same variety/.test(s)) return "same_variety";
  if (/different countr/.test(s)) return "different_countries";
  if (/same country|same region/.test(s)) return "same_country";
  if (/mixed|grab bag|grab-bag/.test(s)) return "mixed_grab_bag";
  if (/commercial|quality|style/.test(s)) return "focus_style_quality_commercial";
  return "other";
}

export type PriceBand = "value" | "mainstream" | "premium" | "super_premium" | "luxury";

const PRICE_BAND_ORDER: PriceBand[] = ["value", "mainstream", "premium", "super_premium", "luxury"];

function bandFromPrice(n: number): PriceBand {
  if (n <= 15) return "value";
  if (n <= 30) return "mainstream";
  if (n <= 60) return "premium";
  if (n <= 120) return "super_premium";
  return "luxury";
}

function normaliseBand(raw: string): PriceBand | null {
  const v = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (v.startsWith("value")) return "value";
  if (v.startsWith("main") || v.startsWith("commercial")) return "mainstream";
  if (v.startsWith("super")) return "super_premium";
  if (v.startsWith("lux") || v.startsWith("fine") || v.startsWith("icon")) return "luxury";
  if (v.startsWith("prem") || v.startsWith("specialist")) return "premium";
  return null;
}

// The flight's modal price band. Prefers the enriched per-wine band; falls back to any price number
// in the descriptor; returns null when the flight gives no price signal (excluded from the slice).
export function deriveFlightPriceBand(wines: unknown): PriceBand | null {
  const list = parseWines(wines);
  if (list.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const w of list) {
    let band: PriceBand | null = null;
    const rawBand = w.priceBand ?? w.price_band;
    if (rawBand) band = normaliseBand(String(rawBand));
    if (!band && w.fullText) {
      const m = /(?:[$£€]|priced at |retail[s]? at |around )\s*(\d{1,4})/i.exec(w.fullText);
      if (m) band = bandFromPrice(Number(m[1]));
    }
    if (band) counts[band] = (counts[band] || 0) + 1;
  }
  const entries = Object.keys(counts);
  if (entries.length === 0) return null;
  // Modal band; tie broken toward the more premium end (the IMW leans premium).
  entries.sort((a, b) => {
    const d = counts[b] - counts[a];
    return d !== 0 ? d : PRICE_BAND_ORDER.indexOf(b as PriceBand) - PRICE_BAND_ORDER.indexOf(a as PriceBand);
  });
  return entries[0] as PriceBand;
}

// ── Grape detection ──────────────────────────────────────────────────────────────────────────────
// Display-name → matcher. Appellation cues resolve to their dominant grape (Barolo → Nebbiolo). The
// order is broadest-last so specific styles (Sherry/Port/Madeira/Tokaji) win over a bare grape hit.
const GRAPE_MATCHERS: { name: string; re: RegExp }[] = [
  { name: "Sherry", re: /\b(sherry|fino|manzanilla|amontillado|oloroso|palo\s*cortado|palomino)\b/i },
  { name: "Port", re: /\b(port\b|vintage\s*port|tawny|lbv|ruby\s*port|colheita|touriga\s*nacional|touriga\s*franca)\b/i },
  { name: "Madeira", re: /\b(madeira|malmsey|sercial|verdelho|bual|rainwater|tinta\s*negra)\b/i },
  { name: "Tokaji", re: /\b(tokaj|tokaji|asz[uú]|szamorodni)\b/i },
  { name: "Furmint", re: /\b(furmint|h[aá]rslevel[uű])\b/i },
  { name: "Chardonnay", re: /\b(chardonnay|blanc\s*de\s*blancs|chablis|meursault|montrachet|pouilly-fuiss[eé])\b/i },
  { name: "Sauvignon Blanc", re: /\b(sauvignon\s*blanc|sancerre|pouilly-fum[eé])\b/i },
  { name: "Riesling", re: /\b(riesling)\b/i },
  { name: "Chenin Blanc", re: /\b(chenin|vouvray|savenni[eè]res|quarts\s*de\s*chaume)\b/i },
  { name: "Pinot Gris", re: /\b(pinot\s*gri[gs]|pinot\s*grigio)\b/i },
  { name: "Gewürztraminer", re: /\b(gew[uü]rztraminer)\b/i },
  { name: "Sémillon", re: /\b(s[eé]millon|sauternes|barsac)\b/i },
  { name: "Albariño", re: /\b(albari[nñ]o|alvarinho)\b/i },
  { name: "Muscat", re: /\b(muscat|moscato|moscatel)\b/i },
  { name: "Viognier", re: /\b(viognier|condrieu)\b/i },
  { name: "Grüner Veltliner", re: /\b(gr[uü]ner\s*veltliner)\b/i },
  { name: "Nebbiolo", re: /\b(nebbiolo|barolo|barbaresco|gattinara|ghemme)\b/i },
  { name: "Sangiovese", re: /\b(sangiovese|chianti|brunello|montalcino|vino\s*nobile)\b/i },
  { name: "Tempranillo", re: /\b(tempranillo|rioja|ribera\s*del\s*duero|tinta\s*roriz)\b/i },
  { name: "Cabernet Sauvignon", re: /\b(cabernet\s*sauvignon|pauillac|margaux|saint-julien|st[.-]?\s*est[eè]phe)\b/i },
  { name: "Merlot", re: /\b(merlot|pomerol|saint-[eé]milion|st[.-]?\s*[eé]milion)\b/i },
  { name: "Cabernet Franc", re: /\b(cabernet\s*franc|chinon|bourgueil|saumur-champigny)\b/i },
  { name: "Syrah", re: /\b(syrah|shiraz|hermitage|c[oô]te-r[oô]tie|cornas)\b/i },
  { name: "Grenache", re: /\b(grenache|garnacha|ch[aâ]teauneuf|priorat)\b/i },
  { name: "Malbec", re: /\b(malbec|mendoza\s*malbec|cahors)\b/i },
  { name: "Pinot Noir", re: /\b(pinot\s*noir|c[oô]te\s*de\s*nuits|gevrey|vosne|volnay|pommard)\b/i },
  { name: "Nerello Mascalese", re: /\b(nerello|etna\s*rosso)\b/i },
  { name: "Aglianico", re: /\b(aglianico|taurasi)\b/i },
  { name: "Gamay", re: /\b(gamay|beaujolais|fleurie|morgon|brouilly)\b/i },
  { name: "Zinfandel", re: /\b(zinfandel|primitivo)\b/i },
  { name: "Nebbiolo Blend", re: /\b(valtellina|sforzato)\b/i },
];

export function deriveGrapes(wines: unknown): string[] {
  const list = parseWines(wines);
  const found = new Set<string>();
  for (const w of list) {
    const hay = `${w.variety ?? ""} ${w.fullText ?? ""}`;
    for (const g of GRAPE_MATCHERS) {
      if (g.re.test(hay)) found.add(g.name);
    }
  }
  return [...found];
}

// ── Region detection ─────────────────────────────────────────────────────────────────────────────
const REGION_MATCHERS: { name: string; re: RegExp }[] = [
  { name: "Bordeaux", re: /\b(bordeaux|m[eé]doc|pauillac|margaux|saint-julien|saint-[eé]milion|pomerol|graves|pessac|sauternes)\b/i },
  { name: "Burgundy", re: /\b(burgundy|bourgogne|c[oô]te\s*de\s*(nuits|beaune)|chablis|meursault|montrachet|gevrey|vosne|puligny|chassagne)\b/i },
  { name: "Rhône", re: /\b(rh[oô]ne|hermitage|c[oô]te-r[oô]tie|ch[aâ]teauneuf|gigondas|cornas|condrieu)\b/i },
  { name: "Loire", re: /\b(loire|sancerre|vouvray|muscadet|chinon|savenni[eè]res|pouilly-fum[eé])\b/i },
  { name: "Champagne", re: /\b(champagne)\b/i },
  { name: "Alsace", re: /\b(alsace)\b/i },
  { name: "Tuscany", re: /\b(tuscany|toscana|chianti|brunello|montalcino|bolgheri)\b/i },
  { name: "Piedmont", re: /\b(piedmont|piemonte|barolo|barbaresco|gattinara|langhe)\b/i },
  { name: "Rioja", re: /\b(rioja)\b/i },
  { name: "Priorat", re: /\b(priorat)\b/i },
  { name: "Ribera del Duero", re: /\b(ribera\s*del\s*duero)\b/i },
  { name: "Douro", re: /\b(douro|porto|oporto)\b/i },
  { name: "Jerez", re: /\b(jerez|sherry|fino|manzanilla|amontillado|oloroso)\b/i },
  { name: "Madeira", re: /\b(madeira)\b/i },
  { name: "Mosel", re: /\b(mosel|saar|ruwer)\b/i },
  { name: "Rheingau", re: /\b(rheingau|nahe|pfalz)\b/i },
  { name: "Tokaj", re: /\b(tokaj|tokaji)\b/i },
  { name: "Napa", re: /\b(napa)\b/i },
  { name: "Sonoma", re: /\b(sonoma)\b/i },
  { name: "Barossa", re: /\b(barossa)\b/i },
  { name: "Marlborough", re: /\b(marlborough)\b/i },
  { name: "Mendoza", re: /\b(mendoza)\b/i },
  { name: "Central Otago", re: /\b(central\s*otago)\b/i },
];

export function deriveRegions(wines: unknown): string[] {
  const list = parseWines(wines);
  const found = new Set<string>();
  for (const w of list) {
    const hay = `${w.region ?? ""} ${w.country ?? ""} ${w.fullText ?? ""}`;
    for (const r of REGION_MATCHERS) {
      if (r.re.test(hay)) found.add(r.name);
    }
  }
  return [...found];
}

// ── Mark focus ───────────────────────────────────────────────────────────────────────────────────
export type MarkCategory =
  | "identification"
  | "style"
  | "quality"
  | "maturity"
  | "commercial"
  | "winemaking";

export const MARK_CATEGORY_LABELS: Record<MarkCategory, string> = {
  identification: "Identification",
  style: "Style",
  quality: "Quality",
  maturity: "Maturity",
  commercial: "Commercial",
  winemaking: "Winemaking",
};

const MARK_KEYWORDS: { cat: MarkCategory; re: RegExp }[] = [
  { cat: "maturity", re: /\b(maturity|matur|ageing|aging|drink(ing)?\s*window|development|cellar|potential\s*to\s*age)\b/i },
  { cat: "commercial", re: /\b(commercial|market|price|pricing|positioning|business|export|consumer)\b/i },
  { cat: "winemaking", re: /\b(winemaking|vinification|production|method|oak|fermentation|lees|malolactic|vessel|[eé]levage)\b/i },
  { cat: "quality", re: /\b(quality|assess\s*the\s*quality|rate|potential)\b/i },
  { cat: "identification", re: /\b(identif|name|origin|variet|grape|country|region|appellation|what\s+is)\b/i },
  { cat: "style", re: /\b(style|character|describe|sweetness|structure)\b/i },
];

function classifyMarkSegment(text: string): MarkCategory {
  for (const k of MARK_KEYWORDS) {
    if (k.re.test(text)) return k.cat;
  }
  return "identification";
}

// Split a stem into "(N marks)" segments and attribute each segment's marks to a category. When the
// stem carries no mark annotations, the whole allocation is treated as identification (the corpus's
// largest single share) so a flight still contributes to the slice.
export function deriveMarkFocus(stem: string, totalMarks: number): Partial<Record<MarkCategory, number>> {
  const out: Partial<Record<MarkCategory, number>> = {};
  const text = stem || "";
  const re = /\((\d{1,3})\s*marks?\)/gi;
  let m: RegExpExecArray | null;
  let lastIndex = 0;
  let attributed = 0;
  let any = false;
  while ((m = re.exec(text)) !== null) {
    any = true;
    const marks = Number(m[1]);
    const segment = text.slice(lastIndex, m.index);
    const cat = classifyMarkSegment(segment);
    out[cat] = (out[cat] || 0) + marks;
    attributed += marks;
    lastIndex = re.lastIndex;
  }
  if (!any || attributed === 0) {
    out.identification = (out.identification || 0) + (totalMarks || 0);
  }
  return out;
}
