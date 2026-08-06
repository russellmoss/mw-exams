import { neon } from "@neondatabase/serverless";
import { generateFreshQuestion } from "./question-engine";
import type { ProgressEmitter } from "./thinking-stream";
import { getAvailability, fitsBudget, confidentCount, minSameCurrencyPrice, type Stockist } from "./retail-availability";
import {
  createLiveTastingSession,
  repointLiveTastingSession,
  clearLiveTastingShareToken,
  setLiveTastingVintages,
  type LiveTastingSession,
} from "./db";
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

export type ArchetypeId = "same-variety" | "quality-ladder" | "mixed-variety" | "p3-styles";

export const ARCHETYPE_FAMILY: Record<ArchetypeId, string> = {
  "same-variety": "F1",
  "quality-ladder": "F7",
  "mixed-variety": "F4",
  "p3-styles": "F6",
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
  flightSize: number
): { archetype: ArchetypeId; label: string; slots: SlotPick[] } {
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
    // Style contrast: one wine per wide-distribution P3 category, padding with a second country
    // of an earlier category when flightSize exceeds available categories.
    const byCat = P3_CATEGORIES.map((c) => bank.filter((r) => r.style_category === c));
    const nonEmpty = byCat.filter((g) => g.length > 0);
    if (nonEmpty.length === 0) throw new Error("No Paper 3 wines with a price band in the bank yet — run the price-band backfill.");
    const groups: BankRow[][] = [];
    for (let i = 0; i < flightSize; i++) groups.push(nonEmpty[i % nonEmpty.length]);
    const slots = bySlot(groups);
    if (!slots) throw new Error("Could not assemble a Paper 3 style flight within budget.");
    return { archetype: "p3-styles", label: "Contrasting P3 styles", slots };
  }

  const varieties = paper === 1 ? P1_VARIETIES : P2_VARIETIES;
  const tryOrder = shuffle(["same-variety", "quality-ladder", "mixed-variety"] as const);

  for (const arch of tryOrder) {
    if (arch === "same-variety") {
      for (const [variety, origins] of shuffle(Object.entries(varieties))) {
        const pool = stillDry.filter(
          (r) => dominantGrapeIs(r, variety) && !nameContradictsVariety(r.wine_name, variety)
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
}): Promise<CreateLiveTastingResult> {
  const { userId, apiKey, paper, flightSize, city, country, budgetAmount, budgetCurrency, radiusMinutes, emit, keepAlive } = opts;

  emit?.({ type: "status", label: "Choosing a flight archetype within your budget…" });
  const bank = await loadBudgetedBank(budgetAmount, budgetCurrency);
  let picked: ReturnType<typeof pickArchetype>;
  try {
    picked = pickArchetype(bank, paper, flightSize);
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
    ARCHETYPE_FAMILY[(session.archetype as ArchetypeId) ?? "mixed-variety"] ?? "F4",
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
