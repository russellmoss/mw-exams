import { neon } from "@neondatabase/serverless";
import { generateFreshQuestion } from "./question-engine";
import type { ProgressEmitter } from "./thinking-stream";
import { getAvailability, fitsBudget, confidentCount, minSameCurrencyPrice, type Stockist } from "./retail-availability";
import {
  createLiveTastingSession,
  createLiveTastingPrepSession,
  attachByoQuestion,
  repointLiveTastingSession,
  clearLiveTastingShareToken,
  setLiveTastingVintages,
  type LiveTastingSession,
} from "./db";
import Anthropic from "@anthropic-ai/sdk";
import { selectModel } from "./model-selector";
import { logClaudeUsage } from "./usage-log";
import { liveTastingSessionId } from "./live-tasting";

/**
 * Live Tasting generation pipeline (live_tasting_plan.md §2.1, §4):
 *
 *   ARCHETYPE FIRST → per-slot candidates from wine_bank (deterministic price-band budget gate)
 *   → availability confirms/prunes WITHIN the archetype (candidate #2/#3 only on a miss)
 *   → generateFreshQuestion with the confirmed flight PINNED (scope='live-tasting',
 *     awaitKeyOnly so the validated key lands before the session exists)
 *   → session row created only after the key validated.
 *
 * Availability never defines the flight shape; it only prunes within slot constraints. A slot
 * whose candidates all miss is accepted with mail-order-thin availability (the wine-searcher
 * deep link keeps the user unblocked) rather than bending the archetype to inventory.
 */

export type SlotAvailability = {
  slot: number;
  wineKey: string;
  producer: string;
  wineName: string;
  label: string;
  region: string;
  country: string;
  priceBand: string | null;
  stockists: Stockist[];
  /** true when no confident stockist was found — mail-order/deep-link framing in the UI. */
  thin: boolean;
  /** true when every confirmed listing priced this slot above the session budget (plan §2.2:
   *  snippet prices refine the band — this is the eviction the first E2E proved was missing). */
  overBudget?: boolean;
};

type BankRow = {
  id: string;
  producer: string;
  wine_name: string;
  country: string;
  region: string;
  grape_varieties: unknown;
  style_category: string;
  price_band: string | null;
};

type SlotPick = { row: BankRow; alternates: BankRow[] };

// Benchmark varieties per paper with the origins a same-variety flight can draw on. Origin labels
// are matched against wine_bank.country. Deliberately the wide-distribution classics — the P3 long
// tail and curveball styles are out of v1 scope (plan §4.2).
const P1_VARIETIES: Record<string, string[]> = {
  Chardonnay: ["France", "Australia", "United States", "USA", "New Zealand", "South Africa", "Chile", "Argentina"],
  Riesling: ["Germany", "France", "Australia", "Austria", "United States", "USA"],
  "Sauvignon Blanc": ["France", "New Zealand", "South Africa", "Chile", "United States", "USA"],
  "Chenin Blanc": ["France", "South Africa"],
  "Pinot Gris": ["France", "Italy", "New Zealand", "United States", "USA"],
};

const P2_VARIETIES: Record<string, string[]> = {
  "Pinot Noir": ["France", "New Zealand", "United States", "USA", "Germany", "Australia", "Chile"],
  "Cabernet Sauvignon": ["France", "United States", "USA", "Australia", "Chile", "South Africa"],
  Syrah: ["France", "Australia", "United States", "USA", "South Africa", "Chile"],
  Merlot: ["France", "United States", "USA", "Chile"],
  Grenache: ["France", "Spain", "Australia"],
  Malbec: ["Argentina", "France"],
};

// Quality-ladder regions: same region, tiers separated by price band. Variety anchors the color.
const LADDER_REGIONS: { region: string; paper: number; variety: string }[] = [
  { region: "Burgundy", paper: 1, variety: "Chardonnay" },
  { region: "Burgundy", paper: 2, variety: "Pinot Noir" },
  { region: "Rioja", paper: 2, variety: "Tempranillo" },
  { region: "Tuscany", paper: 2, variety: "Sangiovese" },
  { region: "Piedmont", paper: 2, variety: "Nebbiolo" },
];

// P3 style-contrast pools by wine_bank.style_category (wide-distribution categories only).
const P3_CATEGORIES = ["sparkling", "fortified", "still_sweet"];

export type ArchetypeId = "same-variety" | "quality-ladder" | "mixed-variety" | "same-origin" | "p3-styles";

export const ARCHETYPE_FAMILY: Record<ArchetypeId, string> = {
  "same-variety": "F1",
  "quality-ladder": "F7",
  "mixed-variety": "F4",
  "same-origin": "F2",
  "p3-styles": "F6",
};

// Paper composition (Phase D) samples the CORPUS families; the pick-for-me candidate picker
// works in archetypes. F3 (blend logic) maps to mixed-breadth for wine-picking purposes — its
// stem logic is generation's job, not the picker's; F5/F6 are the P3 style pickers.
export const FAMILY_TO_ARCHETYPE: Record<string, ArchetypeId> = {
  F1: "same-variety",
  F2: "same-origin",
  F3: "mixed-variety",
  F4: "mixed-variety",
  F5: "p3-styles",
  F6: "p3-styles",
  F7: "quality-ladder",
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pinnedText(row: BankRow): string {
  const name = (row.wine_name || "").trim();
  const head = name ? `${row.producer.trim()}, ${name}` : row.producer.trim();
  return `${head}. ${row.region.trim()}, ${row.country.trim()}.`;
}

function usableRow(r: BankRow): boolean {
  return Boolean(
    r.producer && r.producer.trim().length > 2 &&
    r.country && r.country.trim() &&
    r.region && r.region.trim() &&
    r.price_band
  );
}

function grapeList(r: BankRow): string[] {
  const g = typeof r.grape_varieties === "string" ? JSON.parse(r.grape_varieties) : r.grape_varieties;
  return Array.isArray(g) ? g.filter((x): x is string => typeof x === "string") : [];
}

async function loadBudgetedBank(budgetAmount: number | null, budgetCurrency: string | null): Promise<BankRow[]> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`
    SELECT id, producer, wine_name, country, region, grape_varieties, style_category, price_band
    FROM wine_bank
    WHERE price_band IS NOT NULL
  `) as BankRow[];
  return rows.filter(
    (r) => usableRow(r) && fitsBudget({ priceBand: r.price_band, budgetAmount, budgetCurrency })
  );
}

const norm = (s: string) => (s || "").toLowerCase().trim();

// Variety names that can appear ON a label. A candidate whose wine_name carries a DIFFERENT
// variety than its slot's target is either a mangled bank row or a field blend — both poison a
// same-variety flight (E2E run 6: a "…Chardonnay" cuvée pinned into a Pinot Noir flight).
const LABEL_VARIETIES = [
  "chardonnay", "riesling", "sauvignon blanc", "chenin blanc", "pinot gris", "pinot grigio",
  "pinot noir", "cabernet sauvignon", "syrah", "shiraz", "merlot", "grenache", "malbec",
  "tempranillo", "sangiovese", "nebbiolo", "zinfandel", "gamay", "viognier", "semillon",
];
// Variety-driven slots demand the DOMINANT grape (first in the list): a field blend that merely
// CONTAINS the target sneaks a duplicate resolved variety into a "different varieties" flight
// (E2E run 10: two slots both keyed to Riesling).
function dominantGrapeIs(r: BankRow, variety: string): boolean {
  const g = grapeList(r);
  return g.length > 0 && norm(g[0]) === norm(variety);
}

// Same-variety flights demand PURE varietals: a multi-grape row keyed as a blend under a
// "single grape variety" stem is a hard stem-fact contradiction (audit rule
// stem-fact-singular-variety-blend — E2E 2026-08-06 quarantined exactly this).
function isPureVarietal(r: BankRow): boolean {
  return grapeList(r).length === 1;
}

function nameContradictsVariety(wineName: string, variety: string): boolean {
  const name = norm(wineName);
  const target = norm(variety);
  return LABEL_VARIETIES.some((v) => v !== target && !target.includes(v) && !v.includes(target) && name.includes(v));
}

/**
 * Pick an archetype and per-slot candidate lists (primary + up to 2 alternates per slot) from the
 * budget-filtered bank. Tries archetypes in shuffled preference order and returns the first that
 * the bank can satisfy; throws with a user-facing message when none can.
 */
export function pickArchetype(
  bank: BankRow[],
  paper: number,
  flightSize: number,
  opts?: {
    /** Pin the archetype (paper composition demands a family) instead of shuffled preference. */
    require?: ArchetypeId;
    /** Cross-flight dedup for papers: bank ids and dominant varieties already used. */
    excludeWineKeys?: Set<string>;
    excludeVarieties?: Set<string>;
  }
): { archetype: ArchetypeId; label: string; slots: SlotPick[] } {
  const excludedKey = (r: BankRow) => opts?.excludeWineKeys?.has(r.id) ?? false;
  const excludedVariety = (r: BankRow) => {
    const g = grapeList(r);
    return g.length > 0 && (opts?.excludeVarieties?.has(norm(g[0])) ?? false);
  };
  bank = bank.filter((r) => !excludedKey(r));
  const stillDry = bank.filter((r) => r.style_category === "still_dry");

  const bySlot = (groups: BankRow[][]): SlotPick[] | null => {
    if (groups.some((g) => g.length === 0)) return null;
    const used = new Set<string>();
    const slots: SlotPick[] = [];
    for (const g of groups) {
      const fresh = g.filter((r) => !used.has(r.id));
      if (!fresh.length) return null;
      const ordered = shuffle(fresh);
      const pick = ordered[0];
      used.add(pick.id);
      slots.push({ row: pick, alternates: ordered.slice(1, 3) });
    }
    return slots;
  };

  if (paper === 3) {
    // ONE style category per flight, contrast WITHIN it. The axis must be more than geography:
    // paper-QA round 3 died on a flight of two LATE-HARVEST wines from different countries —
    // no method/style contrast for the stem to ask about. Prefer distinct SUBTYPES (botrytized
    // vs icewine vs passito vs late-harvest; port vs sherry vs madeira; champagne vs cava vs
    // prosecco), then distinct countries.
    const subtypeOf = (r: BankRow): string => {
      const t = norm(`${r.wine_name} ${r.region} ${r.producer}`);
      if (r.style_category === "still_sweet") {
        if (/(sauternes|barsac|aszu|tokaji|beerenauslese|trockenbeeren|botrytis|quarts de chaume|noble)/.test(t)) return "botrytized";
        if (/(icewine|ice wine|eiswein)/.test(t)) return "icewine";
        if (/(passito|recioto|straw|vin santo|santo)/.test(t)) return "dried";
        if (/(rutherglen|muscat|moscatel|constance)/.test(t)) return "muscat";
        return "late-harvest";
      }
      if (r.style_category === "fortified") {
        if (/(port|porto|douro)/.test(t)) return "port";
        if (/(sherry|jerez|fino|oloroso|amontillado|palo cortado|manzanilla|pedro ximenez|px)/.test(t)) return "sherry";
        if (/(madeira|sercial|bual|malmsey|verdelho)/.test(t)) return "madeira";
        if (/(banyuls|maury|rivesaltes|muscat)/.test(t)) return "vdn";
        return "other-fortified";
      }
      if (r.style_category === "sparkling") {
        if (/(champagne)/.test(t)) return "champagne";
        if (/(cava)/.test(t)) return "cava";
        if (/(prosecco|glera)/.test(t)) return "prosecco";
        if (/(cremant|sekt|franciacorta|trento)/.test(t)) return "other-trad";
        return "other-sparkling";
      }
      return norm(r.country);
    };
    const cats = shuffle([...P3_CATEGORIES]);
    for (const cat of cats) {
      const pool = bank.filter((r) => r.style_category === cat);
      if (pool.length < flightSize) continue;
      const bySubtype = new Map<string, BankRow[]>();
      for (const r of pool) bySubtype.set(subtypeOf(r), [...(bySubtype.get(subtypeOf(r)) ?? []), r]);
      let groups: BankRow[][];
      if (bySubtype.size >= flightSize) {
        groups = shuffle([...bySubtype.values()]).slice(0, flightSize);
      } else {
        const byCountry = new Map<string, BankRow[]>();
        for (const r of pool) byCountry.set(norm(r.country), [...(byCountry.get(norm(r.country)) ?? []), r]);
        if (byCountry.size < flightSize && bySubtype.size < 2) continue; // no real axis — try another category
        groups = byCountry.size >= flightSize
          ? shuffle([...byCountry.values()]).slice(0, flightSize)
          : Array.from({ length: flightSize }, () => pool);
      }
      const slots = bySlot(groups);
      if (slots) return { archetype: "p3-styles", label: `${cat.replace("_", " ")} styles compared`, slots };
    }
    throw new Error("No Paper 3 category has enough banked wines within budget — run the price-band backfill or widen the budget.");
  }

  const varieties = paper === 1 ? P1_VARIETIES : P2_VARIETIES;
  const tryOrder: ArchetypeId[] = opts?.require
    ? [opts.require, ...shuffle(["same-variety", "quality-ladder", "mixed-variety", "same-origin"] as ArchetypeId[]).filter((a) => a !== opts.require)]
    : shuffle(["same-variety", "quality-ladder", "mixed-variety"] as ArchetypeId[]);

  for (const arch of tryOrder) {
    if (arch === "p3-styles") continue;
    if (arch === "same-origin") {
      // F2: one country, DISTINCT dominant varieties — the corpus's same-origin comparative set.
      const byCountry = new Map<string, BankRow[]>();
      for (const r of stillDry) {
        if (excludedVariety(r)) continue;
        const k = norm(r.country);
        byCountry.set(k, [...(byCountry.get(k) ?? []), r]);
      }
      for (const [, pool] of shuffle([...byCountry.entries()])) {
        const byVariety = new Map<string, BankRow[]>();
        for (const r of pool) {
          const g = grapeList(r);
          if (!g.length) continue;
          const k = norm(g[0]);
          byVariety.set(k, [...(byVariety.get(k) ?? []), r]);
        }
        if (byVariety.size >= flightSize) {
          const groups = shuffle([...byVariety.values()]).slice(0, flightSize);
          const slots = bySlot(groups);
          if (slots) return { archetype: "same-origin", label: `Same origin (${groups[0][0].country}), different varieties`, slots };
        }
      }
      continue;
    }
    if (arch === "same-variety") {
      for (const [variety, origins] of shuffle(Object.entries(varieties))) {
        if (opts?.excludeVarieties?.has(norm(variety))) continue;
        const pool = stillDry.filter(
          (r) => dominantGrapeIs(r, variety) && isPureVarietal(r) && !nameContradictsVariety(r.wine_name, variety)
        );
        const byOrigin = shuffle(origins)
          .map((o) => pool.filter((r) => norm(r.country) === norm(o)))
          .filter((g) => g.length > 0);
        // Distinct origins only — a same-variety flight's whole point is origin contrast.
        if (byOrigin.length >= flightSize) {
          const slots = bySlot(byOrigin.slice(0, flightSize));
          if (slots) return { archetype: "same-variety", label: `Same variety (${variety}), different origins`, slots };
        }
      }
    } else if (arch === "quality-ladder") {
      for (const ladder of shuffle(LADDER_REGIONS.filter((l) => l.paper === paper))) {
        const broad = stillDry.filter(
          (r) => norm(r.region).includes(norm(ladder.region)) &&
                 dominantGrapeIs(r, ladder.variety) &&
                 !nameContradictsVariety(r.wine_name, ladder.variety)
        );
        // Same EXACT region string only: "Burgundy" broadly matched Chablis + Meursault, and the
        // stem's "same region of origin" premise read as pedagogically false to the E2E judge
        // (they are distinct sub-regions). Group by the row's own region and ladder within the
        // largest group — a Meursault ladder, a Chablis ladder, never a mongrel.
        const byExact = new Map<string, BankRow[]>();
        for (const r of broad) {
          const k = norm(r.region);
          byExact.set(k, [...(byExact.get(k) ?? []), r]);
        }
        const pool = [...byExact.values()].sort((a, b) => b.length - a.length)[0] ?? [];
        const bands = new Set(pool.map((r) => r.price_band));
        if (pool.length >= flightSize && bands.size >= 2) {
          // Order the flight cheap→dear so the ladder reads as a ladder.
          const bandRank: Record<string, number> = { value: 0, premium: 1, super_premium: 2, icon: 3 };
          const sorted = [...pool].sort((a, b) => (bandRank[a.price_band!] ?? 9) - (bandRank[b.price_band!] ?? 9));
          const step = Math.max(1, Math.floor(sorted.length / flightSize));
          const groups: BankRow[][] = [];
          for (let i = 0; i < flightSize; i++) {
            const start = i * step;
            groups.push(sorted.slice(start, Math.max(start + 1, start + step)));
          }
          const slots = bySlot(groups);
          if (slots) return { archetype: "quality-ladder", label: `${ladder.region} quality ladder`, slots };
        }
      }
    } else {
      // mixed-variety: flightSize distinct varieties, each from a classic origin for that grape.
      const entries = shuffle(Object.entries(varieties));
      const groups: BankRow[][] = [];
      for (const [variety, origins] of entries) {
        if (groups.length >= flightSize) break;
        const pool = stillDry.filter(
          (r) => dominantGrapeIs(r, variety) &&
                 origins.some((o) => norm(r.country) === norm(o)) &&
                 !nameContradictsVariety(r.wine_name, variety)
        );
        if (pool.length > 0) groups.push(pool);
      }
      if (groups.length >= flightSize) {
        const slots = bySlot(groups);
        if (slots) return { archetype: "mixed-variety", label: "Mixed varieties, classic origins", slots };
      }
    }
  }
  throw new Error(
    "The wine bank can't fill this flight within your budget yet — try a wider budget, a smaller flight, or a different paper."
  );
}

/**
 * Confirm availability per slot: primary candidate first, alternates only on a miss (bounded
 * fan-out — worst case 3 searches per slot, typical 1, and the 30-day cache absorbs repeats).
 */
export async function confirmSlots(
  slots: SlotPick[],
  city: string,
  country: string,
  apiKey: string,
  userId: number,
  emit?: ProgressEmitter,
  budget?: { amount: number | null; currency: string | null },
  radiusMinutes?: number | null
): Promise<SlotAvailability[]> {
  const budgetAmount = budget?.amount ?? null;
  // Slots run IN PARALLEL: sequential per-slot laddering cost the pilot's cold create ~100s of
  // wall clock before generation even started, and the whole route must fit inside 300s. Each
  // slot's candidate ladder stays sequential internally (alternates only on a miss).
  const out = await Promise.all(slots.map(async (slotPick, i) => {
    const slotNo = i + 1;
    const candidates = [slotPick.row, ...slotPick.alternates];
    type Cand = { row: BankRow; stockists: Stockist[]; minListed: number | null; typical: number | null };
    let chosen: Cand | null = null;       // confident AND within budget
    let overBudgetBest: Cand | null = null; // confident but every listed price exceeds budget
    let fallback: Cand | null = null;     // nothing confident anywhere
    for (const row of candidates) {
      emit?.({ type: "status", label: `Checking availability near ${city}: ${row.producer}…` });
      const res = await getAvailability(
        { producer: row.producer, wineName: row.wine_name, wineKey: row.id },
        city, country, apiKey, { userId }, radiusMinutes ?? null
      );
      const minListed = minSameCurrencyPrice(res.stockists, budget?.currency ?? null);
      const cand: Cand = { row, stockists: res.stockists, minListed, typical: res.typicalPriceUsd };
      if (!fallback) fallback = cand;
      if (confidentCount(res.stockists) >= 1) {
        // Snippet-price refinement (plan §2.2): a concrete listed price over budget EVICTS this
        // candidate — the price band admitted it, the shelf disagrees. When NO price was listed,
        // the parser's typical-retail ESTIMATE backstops with a 1.3x margin (E2E run 5: an
        // unpriced Meursault VV sailed past a $40 budget on a mis-banded row).
        const effective = minListed ?? (cand.typical != null ? cand.typical / 1.3 : null);
        if (budgetAmount == null || effective == null || effective <= budgetAmount) {
          chosen = cand;
          break;
        }
        if (!overBudgetBest || (minListed ?? Infinity) < (overBudgetBest.minListed ?? Infinity)) {
          overBudgetBest = cand;
        }
      }
    }
    // Preference order: affordable+confident → cheapest confident-but-over-budget (flagged,
    // honest UI note) → best-effort fallback (deep-link only).
    const pick = chosen ?? overBudgetBest ?? fallback!;
    const { row, stockists } = pick;
    return {
      slot: slotNo,
      wineKey: row.id,
      producer: row.producer,
      wineName: row.wine_name,
      label: `${row.producer} ${row.wine_name}`.trim(),
      region: row.region,
      country: row.country,
      priceBand: row.price_band,
      stockists,
      thin: confidentCount(stockists) === 0,
      ...(chosen == null && overBudgetBest != null ? { overBudget: true } : {}),
    };
  }));
  return out;
}

export type CreateLiveTastingResult =
  | { session: LiveTastingSession }
  | { error: string };

export async function createLiveTasting(opts: {
  userId: number;
  apiKey: string;
  paper: number;
  flightSize: number;
  city: string;
  country: string;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  radiusMinutes?: number | null;
  emit?: ProgressEmitter;
  /** Route passes next/server after() so detached model-answer/audit work survives the response. */
  keepAlive?: (work: Promise<unknown>) => void;
  /** Paper flights (Phase D): pin the archetype the sampled family demands. */
  requireArchetype?: ArchetypeId;
  /** Paper flights: earlier questions' stems for scaffold variety (threaded into the prompt). */
  paperStemsContext?: string | null;
  /** Paper flights: cross-flight dedup — never reuse a wine or (for variety-led picks) a variety. */
  excludeWineKeys?: Set<string>;
  excludeVarieties?: Set<string>;
}): Promise<CreateLiveTastingResult> {
  const { userId, apiKey, paper, flightSize, city, country, budgetAmount, budgetCurrency, radiusMinutes, emit, keepAlive } = opts;
  const pickOpts = {
    require: opts.requireArchetype,
    excludeWineKeys: opts.excludeWineKeys,
    excludeVarieties: opts.excludeVarieties,
  };

  emit?.({ type: "status", label: "Choosing a flight archetype within your budget…" });
  const bank = await loadBudgetedBank(budgetAmount, budgetCurrency);
  // Paper-QA round 5: the examiner judge failed stems with no shared-constraint framing — real MW
  // stems open by declaring the flight's axis. Each archetype IS such an axis; spell it out so the
  // pinned prompt can require the stem to declare it. Named regions/categories are withheld except
  // the P3 style category, which real P3 stems routinely announce ("The following wines are all
  // sparkling…").
  const flightThemeFor = (archetype: ArchetypeId, label: string, n: number): string => {
    switch (archetype) {
      case "same-variety":
        return `All ${n} wines are made from the same single grape variety, from different origins.`;
      case "same-origin":
        return `All ${n} wines are from the same origin, made from different grape varieties.`;
      case "quality-ladder":
        return `All ${n} wines are from the same region, presented at different quality and price levels.`;
      case "p3-styles":
        return `The wines share one broad style category, contrasting in sub-style and/or origin (${label}).`;
      default:
        return `The ${n} wines are of different grape varieties and origins.`;
    }
  };
  let picked: ReturnType<typeof pickArchetype>;
  try {
    picked = pickArchetype(bank, paper, flightSize, pickOpts);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "No suitable wines found." };
  }

  const availability = await confirmSlots(picked.slots, city, country, apiKey, userId, emit,
    { amount: budgetAmount, currency: budgetCurrency }, radiusMinutes ?? null);

  const generateOnce = async (slotsAvail: SlotAvailability[]) => {
    const pinnedWines = slotsAvail.map((s) => {
      const row: BankRow = {
        id: s.wineKey, producer: s.producer, wine_name: s.wineName,
        country: s.country, region: s.region, grape_varieties: [], style_category: "", price_band: s.priceBand,
      };
      return { slot: s.slot, fullText: pinnedText(row) };
    });
    emit?.({ type: "status", label: "Writing the question around your confirmed flight…" });
    return generateFreshQuestion(
      paper,
      ARCHETYPE_FAMILY[picked.archetype],
      apiKey,
      { source: "user", userId },
      undefined,
      // No emit: a streamed generation call is NOT capped by the SDK timeout (E2E run 5 measured
      // 119s/162s attempts under a 95s cap), and an uncapped attempt is how creates hit the
      // 300s wall. Non-streamed => the timeout binds and two attempts always fit.
      undefined,
      {
        scope: "live-tasting",
        pinnedWines,
        status: "approved",
        // Block on the validated key only (the gradability core); the model answer + audit run
        // detached, kept alive past the response via onBackgroundWork → after().
        awaitKeyOnly: true,
        onBackgroundWork: keepAlive,
        paperStemsContext: opts.paperStemsContext,
        flightTheme: flightThemeFor(picked.archetype, picked.label, slotsAvail.length),
        // Sized so TWO generation attempts fit inside the route's 300s platform ceiling alongside
        // the availability phase (E2E run 1 + the pilot's first create both died at that wall).
        budgetMs: 190_000,
        callTimeoutMs: 95_000,
      }
    );
  };

  const result = await generateOnce(availability);

  // No in-route swap-retry: a second full generation cannot fit inside the 300s platform
  // ceiling (that wall, not the error path, is what ate the pilot's first create). The engine's
  // own attempt loop already retries within its budget; past that we surface a fast, honest
  // error and the user's retry gets the warm availability cache for free.
  if ("error" in result) return { error: result.error ?? "Generation failed." };
  if (!("question" in result) || !result.question) return { error: "Generation failed." };

  // The engine awaited key derivation + audit. Verify the outcome before the session exists:
  // a quarantined or key-failed question must never become a shopping list.
  const qid = result.question.question_id as string;
  const verified = await verifyQuestionServable(qid);
  if (!verified) {
    return { error: "The generated question failed validation — please try again." };
  }

  emit?.({ type: "status", label: "Saving your Live Tasting session…" });
  const session = await createLiveTastingSession({
    id: liveTastingSessionId(),
    userId,
    questionId: qid,
    paper,
    flightSize,
    archetype: picked.archetype,
    city,
    country,
    budgetAmount,
    budgetCurrency,
    availability: { archetypeLabel: picked.label, slots: availability },
  });
  return { session };
}

/** Key validated + not quarantined — the invariant every session repoint/create must hold. */
async function verifyQuestionServable(questionId: string): Promise<boolean> {
  const sql = neon(process.env.DATABASE_URL!);
  const check = await sql`
    SELECT q.invalid_reasons, k.validated
    FROM generated_questions q
    LEFT JOIN stem_answer_keys k ON k.question_id = q.question_id
    WHERE q.question_id = ${questionId}
  `;
  const row = check[0];
  return Boolean(row && row.invalid_reasons == null && row.validated !== false);
}

/**
 * Replace one slot's wine (live_tasting_plan.md §2.1): the swap must satisfy the DEPARTING wine's
 * slot role — same country plus a shared grape variety (or same region) — so the flight keeps its
 * archetype and the repair loop isn't handed a thematically broken flight (council: Gemini #4).
 * Substitution is a generation event: new question row, key re-derived, session repointed, share
 * token rotated (stale partner lists must die, not drift).
 */
export async function replaceWine(opts: {
  session: LiveTastingSession;
  slot: number;
  apiKey: string;
  radiusMinutes?: number | null;
  emit?: ProgressEmitter;
  keepAlive?: (work: Promise<unknown>) => void;
}): Promise<{ ok: true } | { error: string }> {
  const { session, slot, apiKey, radiusMinutes, emit, keepAlive } = opts;
  const avail = (session.availability ?? {}) as { archetypeLabel?: string; slots?: SlotAvailability[] };
  const slots = Array.isArray(avail.slots) ? [...avail.slots] : [];
  const departing = slots.find((s) => s.slot === slot);
  if (!departing) return { error: "No such slot" };

  const sql = neon(process.env.DATABASE_URL!);
  const departingRow = (await sql`
    SELECT id, producer, wine_name, country, region, grape_varieties, style_category, price_band
    FROM wine_bank WHERE id = ${departing.wineKey}
  `) as BankRow[];
  const departingGrapes = departingRow[0] ? grapeList(departingRow[0]).map(norm) : [];
  const inFlight = new Set(slots.map((s) => s.wineKey));

  const bank = await loadBudgetedBank(
    session.budget_amount != null ? Number(session.budget_amount) : null,
    session.budget_currency
  );
  const candidates = shuffle(
    bank.filter(
      (r) =>
        !inFlight.has(r.id) &&
        norm(r.country) === norm(departing.country) &&
        (departingGrapes.length === 0 ||
          grapeList(r).some((g) => departingGrapes.includes(norm(g))) ||
          norm(r.region) === norm(departing.region)) &&
        (session.paper === 3 || r.style_category === "still_dry")
    )
  ).slice(0, 3);
  if (!candidates.length) {
    return { error: "No archetype-compatible replacement available within budget — try abandoning and regenerating." };
  }

  emit?.({ type: "status", label: "Checking availability for the replacement…" });
  const confirmed = await confirmSlots(
    [{ row: candidates[0], alternates: candidates.slice(1) }],
    session.city, session.country, apiKey, session.user_id, emit,
    { amount: session.budget_amount != null ? Number(session.budget_amount) : null,
      currency: session.budget_currency },
    radiusMinutes ?? null
  );
  slots[slots.findIndex((s) => s.slot === slot)] = { ...confirmed[0], slot };

  const pinnedWines = slots.map((s) => ({
    slot: s.slot,
    fullText: pinnedText({
      id: s.wineKey, producer: s.producer, wine_name: s.wineName,
      country: s.country, region: s.region, grape_varieties: [], style_category: "", price_band: s.priceBand,
    }),
  }));

  emit?.({ type: "status", label: "Rewriting the question for the new flight…" });
  const result = await generateFreshQuestion(
    session.paper,
    resolveFamily(session.archetype),
    apiKey,
    { source: "user", userId: session.user_id },
    undefined,
    undefined, // no emit — see createLiveTasting: streamed calls escape the timeout cap

    {
      scope: "live-tasting",
      pinnedWines,
      status: "approved",
      awaitKeyOnly: true,
      onBackgroundWork: keepAlive,
      budgetMs: 190_000,
      callTimeoutMs: 95_000,
    }
  );
  if ("error" in result) return { error: result.error ?? "Regeneration failed." };
  if (!("question" in result) || !result.question) return { error: "Regeneration failed." };

  const qid = result.question.question_id as string;
  if (!(await verifyQuestionServable(qid))) {
    return { error: "The regenerated question failed validation — the original flight is unchanged." };
  }

  await repointLiveTastingSession(session.id, qid, { ...avail, slots });
  // The replaced slot's recorded vintage no longer describes the bottle; drop it.
  const vintages = { ...((session.vintages_bought ?? {}) as Record<string, string>) };
  delete vintages[String(slot)];
  await setLiveTastingVintages(session.id, vintages);
  // Rotate: any link a partner holds now describes the wrong flight.
  await clearLiveTastingShareToken(session.id);
  return { ok: true };
}


// ── BYO ("I'll choose wines") mode — migration 043 ──────────────────────────────────────────────
//
// The user picks paper + question type FIRST; an LLM writes a shopping brief; the session sits in
// 'prep' until the wines are entered (by the candidate behind the reveal gate, or blind via the
// partner share page). Generation then pins the entered wines — Tavily enrichment researches
// their tasting notes exactly as it does for bank wines, feeding the key and model answer.

export const ARCHETYPE_LABEL: Record<ArchetypeId, string> = {
  "same-variety": "Same variety, different origins",
  "quality-ladder": "Quality ladder (one region)",
  "mixed-variety": "Mixed varieties, classic origins",
  "same-origin": "Same origin, different varieties",
  "p3-styles": "Contrasting Paper 3 styles",
};

// BYO uses the STUDY taxonomy (F1-F7) — the same families the candidate practises against in the
// Study tab — not the pick-my-wines archetypes (those exist to make automated bank-picking
// tractable). Labels/descriptions mirror FamilyFilter.tsx.
export const BYO_FAMILIES: Record<string, { label: string; description: string }> = {
  F1: { label: "Same Variety", description: "All wines share one grape variety across different origins or styles" },
  F2: { label: "Same Origin", description: "Wines from the same country or region, testing internal diversity" },
  F3: { label: "Blend Logic", description: "Blended wines where composition and component roles are key" },
  F4: { label: "Mixed Breadth", description: "Each wine is independent — tests breadth of identification" },
  F5: { label: "Method / Production", description: "Focus on how the wine was made: sparkling, fortified, or sweet mechanisms" },
  F6: { label: "Style Mechanism", description: "Wines grouped by a structural axis: maturity, sweetness, or style" },
  F7: { label: "Quality Hierarchy", description: "Wines at different tiers within a legal classification system" },
};

/** Benchmark anchor varieties per paper for multi-flight papers — drawn without replacement so
 *  flights can't collide. Same pools the pick-for-me candidate picker uses. */
export function anchorVarietiesForPaper(paper: number): string[] {
  return Object.keys(paper === 1 ? P1_VARIETIES : P2_VARIETIES);
}

export function anchorRegionsForPaper(paper: number): string[] {
  return LADDER_REGIONS.filter((l) => l.paper === paper).map((l) => l.region)
    .concat(paper === 1 ? ["Alsace", "Loire Valley", "Mosel"] : ["Rhône Valley", "Tuscany", "Rioja"]);
}

/** BYO sessions store the F-code in the archetype column; resolve either vocabulary to a family. */
export function resolveFamily(archetypeOrFamily: string | null | undefined): string {
  const v = (archetypeOrFamily ?? "").trim();
  if (/^F[1-7]$/.test(v)) return v;
  return ARCHETYPE_FAMILY[v as ArchetypeId] ?? "F4";
}

export type EnteredWine = {
  producer: string;
  wineName: string;
  vintage: string;        // year or "NV"
  country: string;
  region?: string;
  price?: number | null;
};

export async function buildByoGuidance(opts: {
  paper: number;
  family: string;
  flightSize: number;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  city: string;
  country: string;
  apiKey: string;
  userId: number;
  /** Paper flights (Phase D): pin the anchor so parallel flights can't collide, and name what
   *  earlier flights already used. E2E of the first real BYO paper: two all-Nebbiolo-adjacent
   *  flights out of three — briefs written blind to each other are not a paper. */
  anchor?: { variety?: string; region?: string } | null;
  avoid?: string | null;
  /** Part of a multi-flight paper brief: skip the restatement/title, the composer adds headings. */
  omitTitle?: boolean;
}): Promise<string> {
  const { paper, family, flightSize, budgetAmount, budgetCurrency, city, country, apiKey, userId } = opts;
  const fam = BYO_FAMILIES[family] ?? BYO_FAMILIES.F1;
  const anchorLine = opts.anchor?.variety
    ? `\nANCHOR (non-negotiable): this flight is built on ${opts.anchor.variety}. Do not offer a choice of anchor varieties.`
    : opts.anchor?.region
      ? `\nANCHOR (non-negotiable): this flight's shared origin is ${opts.anchor.region}. Do not offer a choice of regions.`
      : "";
  const avoidLine = opts.avoid
    ? `\nCROSS-FLIGHT RULE: earlier flights in this SAME paper already use ${opts.avoid}. Do not anchor on or feature these — a real paper spreads its varieties and regions.`
    : "";
  const titleLine = opts.omitTitle
    ? `\nDo NOT write a title or exercise-restatement line — start directly at the per-wine slots (the paper document adds its own headings).`
    : "";
  const client = new Anthropic({ apiKey });
  const { model, abGroup } = await selectModel("question_generation", apiKey, "sonnet");
  const budgetLine = budgetAmount
    ? `Budget: about ${budgetAmount} ${budgetCurrency ?? ""} per bottle.`
    : "No fixed budget, but favour widely available benchmarks over trophies.";
  const t0 = Date.now();
  const msg = await client.messages.create({
    model,
    max_tokens: 1200,
    system: `You are a Master of Wine exam coach writing a SHOPPING BRIEF for a candidate practising at home. They will buy real bottles matching your brief, a partner will bag them, and they will taste blind against a generated MW-style question. Write practical, buyable guidance — benchmark wines a decent wine shop or mail-order carries, not unicorns.

Format (markdown, ~250-400 words):
1. One line restating the exercise (paper, question type, flight size).
2. Per slot (Wine 1..N): the profile to buy — variety/style, 2-3 example regions ranked by availability, what QUALITY tier to aim for, and 3-4 example producers spanning price points. Never demand one exact wine.
3. "Avoid" line: what would break this flight (wrong styles, ringers, wines that contradict the question type).
4. One line on price expectations.
The candidate shops near ${city}, ${country}. ${budgetLine}${anchorLine}${avoidLine}${titleLine}`,
    messages: [{
      role: "user",
      content: `Paper ${paper} (${paper === 1 ? "white still wines" : paper === 2 ? "red still wines" : "sparkling/fortified/sweet and other special styles"}). Question family: ${family} — ${fam.label} (${fam.description}). Flight size: ${flightSize} wines.`,
    }],
  });
  logClaudeUsage(
    { taskType: "question_generation", model, source: "user", userId, abGroup },
    msg.usage,
    { latencyMs: Date.now() - t0 }
  );
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

export async function createByoPrep(opts: {
  userId: number;
  apiKey: string;
  paper: number;
  family: string;
  flightSize: number;
  city: string;
  country: string;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  emit?: ProgressEmitter;
}): Promise<{ session: LiveTastingSession } | { error: string }> {
  opts.emit?.({ type: "status", label: "Writing your shopping brief…" });
  let guidance: string;
  try {
    guidance = await buildByoGuidance(opts);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not write the shopping brief." };
  }
  if (!guidance || guidance.length < 100) return { error: "The shopping brief came back empty — try again." };
  const session = await createLiveTastingPrepSession({
    id: liveTastingSessionId(),
    userId: opts.userId,
    paper: opts.paper,
    flightSize: opts.flightSize,
    archetype: opts.family, // BYO stores the F-code; resolveFamily() reads both vocabularies
    city: opts.city,
    country: opts.country,
    budgetAmount: opts.budgetAmount,
    budgetCurrency: opts.budgetCurrency,
    prepGuidance: guidance,
  });
  return { session };
}

/** "Producer, Name Vintage. Region, Country." — the corpus reference shape the validators expect. */
export function byoFullText(w: EnteredWine): string {
  const vintagePart = w.vintage && w.vintage.trim().toUpperCase() !== "NV" ? w.vintage.trim() : "";
  const name = [w.wineName?.trim(), vintagePart].filter(Boolean).join(" ");
  const head = name ? `${w.producer.trim()}, ${name}` : w.producer.trim();
  const origin = [w.region?.trim(), w.country.trim()].filter(Boolean).join(", ");
  return `${head}. ${origin}.`;
}

export function validateEnteredWines(raw: unknown): { ok: true; wines: EnteredWine[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "wines must be an array" };
  if (raw.length < 2 || raw.length > 4) return { ok: false, error: "Enter 2-4 wines" };
  const wines: EnteredWine[] = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i] as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
    const producer = str(w.producer), wineName = str(w.wineName), country = str(w.country);
    const vintage = (str(w.vintage) || "NV").toUpperCase();
    if (!producer || producer.length < 2) return { ok: false, error: `Wine ${i + 1}: producer is required` };
    if (!country) return { ok: false, error: `Wine ${i + 1}: country is required` };
    if (!/^(19|20)\d{2}$|^NV$/.test(vintage)) return { ok: false, error: `Wine ${i + 1}: vintage must be a year or NV` };
    const priceNum = Number(w.price);
    wines.push({
      producer, wineName, vintage, country,
      region: str(w.region) || undefined,
      price: Number.isFinite(priceNum) && priceNum > 0 ? priceNum : null,
    });
  }
  return { ok: true, wines };
}

export async function attachByoWines(opts: {
  session: LiveTastingSession;
  wines: EnteredWine[];
  apiKey: string;
  emit?: ProgressEmitter;
  keepAlive?: (work: Promise<unknown>) => void;
}): Promise<{ ok: true } | { error: string }> {
  const { session, wines, apiKey, emit, keepAlive } = opts;
  if (session.question_id) return { error: "This session already has its question." };

  const pinnedWines = wines.map((w, i) => ({ slot: i + 1, fullText: byoFullText(w) }));
  emit?.({ type: "status", label: "Researching your wines and writing the question…" });
  const result = await generateFreshQuestion(
    session.paper,
    resolveFamily(session.archetype),
    apiKey,
    { source: "user", userId: session.user_id },
    undefined,
    undefined, // no emit — streamed calls escape the timeout cap (see createLiveTasting)
    {
      scope: "live-tasting",
      pinnedWines,
      status: "approved",
      awaitKeyOnly: true,
      onBackgroundWork: keepAlive,
      budgetMs: 190_000,
      callTimeoutMs: 95_000,
    }
  );
  if ("error" in result) return { error: result.error ?? "Generation failed." };
  if (!("question" in result) || !result.question) return { error: "Generation failed." };
  const qid = result.question.question_id as string;
  if (!(await verifyQuestionServable(qid))) {
    return { error: "The generated question failed validation — please try again." };
  }
  const vintages: Record<string, string> = {};
  wines.forEach((w, i) => { vintages[String(i + 1)] = w.vintage; });
  const attached = await attachByoQuestion(session.id, qid, wines, vintages);
  if (!attached) return { error: "Someone already attached wines to this session." };
  return { ok: true };
}
