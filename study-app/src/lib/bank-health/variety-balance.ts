// variety-balance.ts — the always-on grape-variety coverage read over the live question bank.
//
// Counts the DOMINANT variety of every WINE in the served-eligible (kept, non-binned, non-retired)
// pool, per paper, and compares each variety's share against the historical corpus target
// (variety-targets.ts). Blend partners are counted separately and shown as a "+N in blends" note —
// they never affect a variety's status. It powers the admin readout (the "Grape Balance" card on
// /admin/bank-health) and, indirectly, the one-click grape-targeted "Fill the gap" generation.
//
// Same architecture as country-balance.ts: read at request time from the same stored wine JSON the
// candidate sees; memoised for 60s so polling never re-scans. No schema, no migration — the dominant
// variety is a normalized key DERIVED from the wine identity/variety text, not a stored column.

import { getKeptBankLite } from "@/lib/db";
import { parseWines, type LiteWine } from "./derive";
import {
  EXPECTED_VARIETY_SHARE,
  EXPECTED_SHARE_VERSION,
  varietyLabel,
  type VarietyKey,
} from "./variety-targets";

export type VarietyStatus = "short" | "heavy" | "ok";

// Status thresholds (spec). 'short' = well under target AND a material gap; 'heavy' = well over target
// AND a material surplus. The min-wine gate keeps a tiny bank from flagging noise.
export const SHORT_RATIO = 0.6;
export const HEAVY_RATIO = 1.6;
export const MIN_DELTA_WINES = 3;

// The short/heavy/ok verdict for a variety, from its bank vs expected share and the signed wine gap
// (shortfallWines > 0 → under target; < 0 → over). Pure so it is unit-testable without the DB.
export function varietyStatus(
  bankSharePct: number,
  expectedSharePct: number,
  shortfallWines: number
): VarietyStatus {
  const surplusWines = -shortfallWines;
  if (bankSharePct < SHORT_RATIO * expectedSharePct && shortfallWines >= MIN_DELTA_WINES) {
    return "short";
  }
  if (bankSharePct > HEAVY_RATIO * expectedSharePct && surplusWines >= MIN_DELTA_WINES) {
    return "heavy";
  }
  return "ok";
}

export interface VarietyRow {
  variety: VarietyKey;
  label: string;
  paper: number;
  bankCount: number;
  blendCount: number;
  bankSharePct: number;
  expectedSharePct: number;
  shortfallWines: number;
  status: VarietyStatus;
}

export interface VarietyBalance {
  version: string;
  paperTotals: Record<number, number>;
  rows: VarietyRow[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ── Variety detection ──────────────────────────────────────────────────────────────────────────────
// Ordered display-key matchers. Appellation / style cues resolve to their dominant grape (Barolo →
// nebbiolo; Sherry/Fino → palomino), and the spec's synonym map is folded in (shiraz → syrah;
// pinot grigio → pinot_gris; brunello / sangiovese grosso / prugnolo gentile → sangiovese; garnacha →
// grenache; tinta roriz / aragonez → tempranillo; spätburgunder → pinot_noir). Order is
// specific-style-first so a fortified/sweet cue wins over a bare grape token in the same descriptor.
const VARIETY_MATCHERS: { key: VarietyKey; re: RegExp }[] = [
  // Fortified / sweet anchors (Paper 3) — resolve to the base grape.
  { key: "palomino", re: /\b(palomino|sherry|jerez|fino|manzanilla|amontillado|oloroso|palo\s*cortado)\b/i },
  { key: "touriga", re: /\b(touriga(\s*(nacional|franca))?|\bport\b|vintage\s*port|tawny\s*port|ruby\s*port|lbv|colheita)\b/i },
  { key: "furmint", re: /\b(furmint|tokaj[i]?|asz[uú]|szamorodni|h[aá]rslevel[uű])\b/i },
  { key: "semillon", re: /\b(s[eé]millon|sauternes|barsac)\b/i },
  { key: "muscat", re: /\b(muscat|moscato|moscatel|moscad(el|ell)o|rutherglen)\b/i },
  // Whites.
  { key: "chardonnay", re: /\b(chardonnay|blanc\s*de\s*blancs|chablis|meursault|montrachet|pouilly-fuiss[eé])\b/i },
  { key: "sauvignon_blanc", re: /\b(sauvignon\s*blanc|sancerre|pouilly-fum[eé])\b/i },
  { key: "riesling", re: /\b(riesling)\b/i },
  { key: "chenin_blanc", re: /\b(chenin(\s*blanc)?|vouvray|savenni[eè]res|quarts\s*de\s*chaume|coteaux\s*du\s*layon)\b/i },
  { key: "pinot_gris", re: /\b(pinot\s*gri[gs](io)?|grauburgunder)\b/i },
  { key: "gewurztraminer", re: /\b(gew[uü]rztraminer)\b/i },
  { key: "albarino", re: /\b(albari[nñ]o|alvarinho)\b/i },
  { key: "viognier", re: /\b(viognier|condrieu)\b/i },
  { key: "gruner_veltliner", re: /\b(gr[uü]ner\s*veltliner|gruner)\b/i },
  // Reds.
  { key: "nebbiolo", re: /\b(nebbiolo|barolo|barbaresco|gattinara|ghemme|langhe|valtellina|sforzato)\b/i },
  { key: "sangiovese", re: /\b(sangiovese(\s*grosso)?|prugnolo\s*gentile|chianti|brunello|montalcino|vino\s*nobile|morellino)\b/i },
  { key: "tempranillo", re: /\b(tempranillo|rioja|ribera\s*del\s*duero|tinta\s*roriz|aragonez|tinto\s*fino|\btoro\b)\b/i },
  { key: "cabernet_franc", re: /\b(cabernet\s*franc|chinon|bourgueil|saumur-champigny)\b/i },
  { key: "cabernet_sauvignon", re: /\b(cabernet\s*sauvignon|pauillac|margaux|saint-julien|st[.-]?\s*est[eè]phe|coonawarra)\b/i },
  { key: "merlot", re: /\b(merlot|pomerol|saint-[eé]milion|st[.-]?\s*[eé]milion)\b/i },
  { key: "syrah", re: /\b(syrah|shiraz|hermitage|c[oô]te-r[oô]tie|cornas|saint-joseph)\b/i },
  { key: "grenache", re: /\b(grenache|garnacha|ch[aâ]teauneuf|priorat|gigondas)\b/i },
  { key: "malbec", re: /\b(malbec|cahors)\b/i },
  { key: "pinot_noir", re: /\b(pinot\s*noir|sp[aä]tburgunder|c[oô]te\s*de\s*nuits|gevrey|vosne|volnay|pommard|central\s*otago)\b/i },
  { key: "nerello_mascalese", re: /\b(nerello|etna\s*rosso)\b/i },
  { key: "aglianico", re: /\b(aglianico|taurasi)\b/i },
  { key: "gamay", re: /\b(gamay|beaujolais|fleurie|morgon|brouilly)\b/i },
  { key: "zinfandel", re: /\b(zinfandel|primitivo)\b/i },
  { key: "corvina", re: /\b(corvina|amarone|valpolicella|ripasso)\b/i },
];

// Every variety key present in a wine's identity/variety text, in matcher (priority) order, de-duped.
// The first hit is the wine's dominant variety; the rest are blend partners (spec: full credit to the
// dominant, partners counted separately).
export function detectVarietyHits(wine: LiteWine): VarietyKey[] {
  const hay = `${wine.variety ?? ""} ${wine.fullText ?? ""} ${wine.region ?? ""}`;
  const hits: VarietyKey[] = [];
  for (const m of VARIETY_MATCHERS) {
    if (m.re.test(hay) && !hits.includes(m.key)) hits.push(m.key);
  }
  return hits;
}

/**
 * Compute the live bank's grape-variety mix against the historical targets, WITHOUT the 60s cache.
 * `scope` limits the read to one paper (1|2|3) or all three. Emits one row per TRACKED variety in the
 * expected table for the paper(s) in scope — so a hard-anchor variety the bank carries none of still
 * reads as a shortfall — sorted by absolute shortfall descending.
 */
export async function computeVarietyBalanceUncached(
  scope: 1 | 2 | 3 | "all"
): Promise<VarietyBalance> {
  const papers: (1 | 2 | 3)[] = scope === "all" ? [1, 2, 3] : [scope];

  // Per-paper dominant + blend tallies and the paper's dominant-wine total (the share denominator).
  const dominant: Record<number, Map<VarietyKey, number>> = {};
  const blend: Record<number, Map<VarietyKey, number>> = {};
  const paperTotals: Record<number, number> = {};
  for (const p of papers) {
    dominant[p] = new Map();
    blend[p] = new Map();
    paperTotals[p] = 0;
  }

  const lite = await getKeptBankLite(scope === "all" ? null : scope);
  for (const item of lite) {
    const p = item.paper as 1 | 2 | 3;
    if (!dominant[p]) continue;
    for (const w of parseWines(item.wines)) {
      const hits = detectVarietyHits(w);
      if (hits.length === 0) continue;
      const [dom, ...partners] = hits;
      dominant[p].set(dom, (dominant[p].get(dom) || 0) + 1);
      paperTotals[p] += 1;
      for (const partner of partners) {
        blend[p].set(partner, (blend[p].get(partner) || 0) + 1);
      }
    }
  }

  const rows: VarietyRow[] = [];
  for (const p of papers) {
    const expected = EXPECTED_VARIETY_SHARE[p];
    const total = paperTotals[p];
    for (const variety of Object.keys(expected)) {
      const bankCount = dominant[p].get(variety) || 0;
      const blendCount = blend[p].get(variety) || 0;
      const expectedSharePct = expected[variety];
      const bankSharePct = total > 0 ? round1((bankCount / total) * 100) : 0;
      const shortfallWines = Math.round(((expectedSharePct - bankSharePct) / 100) * total);
      const status = varietyStatus(bankSharePct, expectedSharePct, shortfallWines);
      rows.push({
        variety,
        label: varietyLabel(variety),
        paper: p,
        bankCount,
        blendCount,
        bankSharePct,
        expectedSharePct,
        shortfallWines,
        status,
      });
    }
  }

  rows.sort((a, b) => Math.abs(b.shortfallWines) - Math.abs(a.shortfallWines));
  return { version: EXPECTED_SHARE_VERSION, paperTotals, rows };
}

// ── 60s in-memory cache, keyed by scope ─────────────────────────────────────────────────────────────
const cache = new Map<string, { at: number; balance: VarietyBalance }>();
const CACHE_MS = 60_000;

/** computeVarietyBalanceUncached memoised for 60s per scope so polling never re-scans. */
export async function computeVarietyBalance(scope: 1 | 2 | 3 | "all"): Promise<VarietyBalance> {
  const key = String(scope);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_MS) return hit.balance;
  const balance = await computeVarietyBalanceUncached(scope);
  cache.set(key, { at: now, balance });
  return balance;
}
