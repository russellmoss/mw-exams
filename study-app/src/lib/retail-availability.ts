import Anthropic from "@anthropic-ai/sdk";
import { neon } from "@neondatabase/serverless";
import { searchTavily, isTavilyQuotaExhausted } from "./wine-enrichment";
import { logClaudeUsage } from "./usage-log";
import { selectModel } from "./model-selector";

/**
 * Retail availability for Live Tasting (live_tasting_plan.md §5).
 *
 * Given a wine and a user's market (city, country), find stockists likely to carry it — local
 * brick-and-mortar first, mail-order as a first-class fallback — via a tiered Tavily search
 * ladder, parsed into structured rows by one small LLM call. Results are cached 30 days in
 * `retail_availability` (migration 041): the benchmark-wine × metro space is small, so at ~100
 * users the cache converges to near-zero marginal Tavily spend.
 *
 * Honesty contract: stockists are LEADS, not live inventory. Every result set ends with a
 * wine-searcher deep link (free, no API) marked 'unverified' so the user always has a working
 * next step, and UI copy must say "call ahead", never "in stock".
 */

// Types are defined in the client-safe live-tasting.ts (client components render stockist cards
// and must not import this server module); re-exported here for server-side consumers.
export type { Stockist, StockistKind, StockistConfidence } from "./live-tasting";
import type { Stockist, StockistKind, StockistConfidence } from "./live-tasting";

export type AvailabilityResult = {
  stockists: Stockist[];
  /** Parser's estimate of typical retail (USD/750ml) — the budget backstop for wines whose
   *  snippets carried no concrete price (E2E run 5: an unpriced Meursault VV sailed past a $40
   *  budget). Estimate, not evidence: eviction applies a 1.3x margin and a listed price wins. */
  typicalPriceUsd: number | null;
  fromCache: boolean;
  /** true when the quota latch forced a deep-link-only degraded answer (never cached). */
  degraded: boolean;
};

type Meta = { userId?: number | null; questionId?: string | null };

const CACHE_TTL_DAYS = 30;
/** Stop the search ladder once this many listed/likely stockists are in hand. */
const ENOUGH_STOCKISTS = 2;

// US alcohol control states where the state system's own searchable store site is the single best
// availability source. Keyed by state name AND the abbreviations people actually type in a
// free-text city field. Deliberately only states with a usable online inventory search.
const US_CONTROL_STATE_DOMAINS: Record<string, string> = {
  pennsylvania: "finewineandgoodspirits.com",
  pa: "finewineandgoodspirits.com",
  "new hampshire": "liquorandwineoutlets.com",
  nh: "liquorandwineoutlets.com",
  utah: "webapps2.abs.utah.gov",
  ut: "webapps2.abs.utah.gov",
  "north carolina": "abc2.nc.gov",
  nc: "abc2.nc.gov",
  virginia: "abc.virginia.gov",
  va: "abc.virginia.gov",
};

// National mail-order merchants per country — the guaranteed-shippable tier. Extensible; a country
// with no entry just skips tier 3 (the wine-searcher fallback row still always exists).
const MAIL_ORDER_DOMAINS: Record<string, string[]> = {
  "united states": ["wine.com", "klwines.com", "totalwine.com"],
  usa: ["wine.com", "klwines.com", "totalwine.com"],
  us: ["wine.com", "klwines.com", "totalwine.com"],
  "united kingdom": ["thewinesociety.com", "majestic.co.uk", "bbr.com"],
  uk: ["thewinesociety.com", "majestic.co.uk", "bbr.com"],
  england: ["thewinesociety.com", "majestic.co.uk", "bbr.com"],
  germany: ["hawesko.de", "vicampo.de", "weinfuerst.de"],
  france: ["vinatis.com", "lavinia.fr", "idealwine.com"],
  netherlands: ["grandcruwijnen.nl", "wijnvoordeel.nl"],
  belgium: ["vinatis.com", "grandcruwijnen.nl"],
  ireland: ["obrienswine.ie", "mitchellandson.com"],
  switzerland: ["flaschenpost.ch", "moevenpick-wein.com"],
  austria: ["weinco.at", "vinorama.at"],
  spain: ["vinissimus.com", "bodeboca.com"],
  italy: ["tannico.it", "vino.com"],
};

export function normalizeKeyPart(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function availabilityCacheKey(wineKey: string, city: string, country: string, radiusMinutes?: number | null): string {
  // Radius participates in the key: a 60-minute search legitimately returns different shops
  // than a 15-minute one, and a cache hit must not smuggle the wrong catchment across users.
  const r = radiusMinutes && radiusMinutes > 0 ? `|r${radiusMinutes}` : "";
  return `${normalizeKeyPart(wineKey)}|${normalizeKeyPart(city)}|${normalizeKeyPart(country)}${r}`;
}

export function wineSearcherLink(producer: string, wineName: string): string {
  const slug = `${producer} ${wineName}`.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `https://www.wine-searcher.com/find/${slug}`;
}

export function wineSearcherFallbackRow(producer: string, wineName: string): Stockist {
  return {
    name: "Wine-Searcher (all merchants)",
    kind: "mail",
    url: wineSearcherLink(producer, wineName),
    price: null,
    currency: null,
    confidence: "unverified",
  };
}

/** The state-store domain for a US city string like "New Hope, Pennsylvania" / "Philadelphia PA". */
export function controlStateDomain(city: string, country: string): string | null {
  const c = normalizeKeyPart(country);
  if (!["united_states", "usa", "us"].includes(c)) return null;
  const cityNorm = ` ${city.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim()} `;
  for (const [state, domain] of Object.entries(US_CONTROL_STATE_DOMAINS)) {
    if (cityNorm.includes(` ${state} `) || cityNorm.endsWith(` ${state} `.trimEnd() + " ")) return domain;
  }
  return null;
}

export function mailOrderDomains(country: string): string[] {
  return MAIL_ORDER_DOMAINS[country.trim().toLowerCase()] ?? [];
}

/** Cheapest concrete listed price among stockists in the given currency, or null when none. */
export function minSameCurrencyPrice(stockists: Stockist[], currency: string | null | undefined): number | null {
  if (!currency) return null;
  const cur = currency.trim().toUpperCase();
  const prices = stockists
    .filter((s) => s.price != null && s.price > 0 && (s.currency ?? "") === cur)
    .map((s) => s.price as number);
  return prices.length ? Math.min(...prices) : null;
}

export function confidentCount(stockists: Stockist[]): number {
  return stockists.filter((s) => s.confidence === "listed" || s.confidence === "likely").length;
}

// Band floors, derived from the ceilings: a band's floor is the previous band's ceiling.
const PRICE_BAND_FLOOR_USD: Record<string, number> = {
  value: 0,
  premium: 20,
  super_premium: 50,
  icon: 150,
};

/**
 * Budget verdict (plan §2.2): the deterministic price band is the primary gate; a concrete
 * same-currency snippet price, when the availability parse found one, overrides it in either
 * direction. Unknown band = not a candidate, full stop.
 *
 * Band rule (refined from the plan's "ceiling fits" wording, which would exclude nearly every
 * premium-band benchmark for a typical $40 budget): a band is admitted when the budget clears
 * 1.25× its FLOOR — i.e. the budget reaches comfortably into the band's range, so "typical"
 * bottles of that band are affordable even though the band's top end may not be. The snippet
 * price then evicts specific over-budget bottles. Bands are USD-denominated but coarse; EUR/GBP
 * budgets compare 1:1 (v1 cut: no FX conversion — the bands are fuzzier than the rates).
 */
export function fitsBudget(opts: {
  priceBand: string | null | undefined;
  budgetAmount: number | null | undefined;
  budgetCurrency?: string | null;
  snippetPrice?: number | null;
  snippetCurrency?: string | null;
}): boolean {
  const { priceBand, budgetAmount, budgetCurrency, snippetPrice, snippetCurrency } = opts;
  if (budgetAmount == null || budgetAmount <= 0) return true; // no budget set = no gate
  const sameCurrency =
    snippetCurrency && budgetCurrency &&
    snippetCurrency.trim().toUpperCase() === budgetCurrency.trim().toUpperCase();
  if (snippetPrice != null && snippetPrice > 0 && sameCurrency) {
    return snippetPrice <= budgetAmount;
  }
  if (!priceBand || !(priceBand in PRICE_BAND_FLOOR_USD)) return false; // unknown band: not a candidate
  const floor = PRICE_BAND_FLOOR_USD[priceBand];
  return budgetAmount >= Math.max(floor * 1.25, floor + 5);
}

const STOCKIST_JSON_SHAPE = `{"typical_price_usd":34,"stockists":[{"name":"...","kind":"local|state_store|mail","url":"...","price":29.99,"currency":"USD","confidence":"listed|likely|unverified"}]}`;

/** Validate/coerce the LLM's stockist JSON. Exported for unit tests. */
export function coerceStockists(raw: unknown): Stockist[] {
  if (!Array.isArray(raw)) return [];
  const out: Stockist[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const url = typeof o.url === "string" ? o.url.trim() : "";
    if (!name || !/^https?:\/\//i.test(url)) continue;
    const kind: StockistKind =
      o.kind === "local" || o.kind === "state_store" || o.kind === "mail" ? o.kind : "mail";
    const confidence: StockistConfidence =
      o.confidence === "listed" || o.confidence === "likely" || o.confidence === "unverified"
        ? o.confidence : "unverified";
    const priceNum = typeof o.price === "number" && o.price > 0 && o.price < 100000 ? o.price : null;
    const currency =
      typeof o.currency === "string" && /^[A-Z]{3}$/.test(o.currency.trim().toUpperCase())
        ? o.currency.trim().toUpperCase() : null;
    out.push({ name, kind, url, price: priceNum, currency, confidence });
  }
  return out.slice(0, 8);
}

// ---------------------------------------------------------------------------
// Cross-instance Tavily quota latch (plan §5.3). The module-level latch in wine-enrichment.ts
// does not survive serverless cold starts; this persists it so every instance degrades together.
// ---------------------------------------------------------------------------

const QUOTA_FLAG_KEY = "tavily_quota";
const QUOTA_LATCH_HOURS = 12;

function getSql() {
  return neon(process.env.DATABASE_URL!);
}

export async function isQuotaLatchedInDb(): Promise<boolean> {
  try {
    const sql = getSql();
    const rows = await sql`SELECT value FROM app_flags WHERE key = ${QUOTA_FLAG_KEY}`;
    const until = rows[0]?.value?.exhausted_until;
    return typeof until === "string" && new Date(until).getTime() > Date.now();
  } catch {
    return false; // flag table unreachable → don't block the feature
  }
}

export async function latchQuotaInDb(): Promise<void> {
  try {
    const sql = getSql();
    const until = new Date(Date.now() + QUOTA_LATCH_HOURS * 3600_000).toISOString();
    await sql`
      INSERT INTO app_flags (key, value, updated_at)
      VALUES (${QUOTA_FLAG_KEY}, ${JSON.stringify({ exhausted_until: until })}, now())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
    `;
  } catch (err) {
    console.error("Failed to persist Tavily quota latch:", err);
  }
}

// ---------------------------------------------------------------------------
// The main entry point
// ---------------------------------------------------------------------------

export async function getAvailability(
  wine: { producer: string; wineName: string; wineKey?: string },
  city: string,
  country: string,
  apiKey: string,
  meta?: Meta,
  radiusMinutes?: number | null
): Promise<AvailabilityResult> {
  const label = `${wine.producer} ${wine.wineName}`.trim();
  const wineKey = wine.wineKey || label;
  const cacheKey = availabilityCacheKey(wineKey, city, country, radiusMinutes);
  const sql = getSql();
  const fallback = wineSearcherFallbackRow(wine.producer, wine.wineName);

  // 1. Cache read (30-day TTL) — a hit costs zero Tavily credits.
  try {
    const rows = await sql`
      SELECT stockists, searched_at FROM retail_availability
      WHERE cache_key = ${cacheKey}
        AND searched_at > now() - make_interval(days => ${CACHE_TTL_DAYS})
    `;
    if (rows[0]) {
      sql`
        UPDATE retail_availability
        SET hit_count = hit_count + 1, last_used_at = now()
        WHERE cache_key = ${cacheKey}
      `.catch(() => {});
      const raw = rows[0].stockists as unknown;
      const arr = Array.isArray(raw) ? raw : (raw as { stockists?: unknown })?.stockists;
      const typ = !Array.isArray(raw) ? (raw as { typicalPriceUsd?: unknown })?.typicalPriceUsd : null;
      return {
        stockists: coerceStockists(arr),
        typicalPriceUsd: typeof typ === "number" && typ > 0 ? typ : null,
        fromCache: true,
        degraded: false,
      };
    }
  } catch (err) {
    console.error("retail_availability cache read failed:", err);
  }

  // 2. Cross-instance quota latch → degrade to the deep link, and do NOT cache the degraded
  //    answer (a quota blip must not poison the cache for 30 days).
  if (isTavilyQuotaExhausted() || (await isQuotaLatchedInDb())) {
    return { stockists: [fallback], typicalPriceUsd: null, fromCache: false, degraded: true };
  }

  // 3. Stampede lock: only one instance refreshes a given key; losers get the fallback row
  //    (next page load hits the winner's cache row).
  try {
    const locked = await sql`
      INSERT INTO retail_availability (cache_key, wine_key, city, country, stockists, searched_at, refreshing_at)
      VALUES (${cacheKey}, ${wineKey}, ${city}, ${country}, '[]'::jsonb, now() - interval '1 year', now())
      ON CONFLICT (cache_key) DO UPDATE SET refreshing_at = now()
        WHERE retail_availability.refreshing_at IS NULL
           OR retail_availability.refreshing_at < now() - interval '2 minutes'
      RETURNING cache_key
    `;
    if (!locked.length) {
      return { stockists: [fallback], typicalPriceUsd: null, fromCache: false, degraded: true };
    }
  } catch (err) {
    console.error("retail_availability lock failed:", err);
  }

  // 4. The search ladder (plan §5.1).
  const tavilyMeta = { source: "user" as const, userId: meta?.userId, questionId: meta?.questionId };
  const collected: { url: string; title: string; content: string }[] = [];
  const seen = new Set<string>();
  const push = (rs: { url: string; title: string; content: string }[]) => {
    for (const r of rs) if (!seen.has(r.url)) { seen.add(r.url); collected.push(r); }
  };

  const stateStore = controlStateDomain(city, country);
  if (stateStore) {
    push(await searchTavily(`"${label}"`, tavilyMeta,
      { includeDomains: [stateStore], maxResults: 4, taskType: "retail_availability" }));
  }
  const nearPhrase = radiusMinutes && radiusMinutes > 0
    ? `within ${radiusMinutes} minutes of "${city}"`
    : `near "${city}"`;
  push(await searchTavily(`buy "${label}" wine shop OR store ${nearPhrase}`, tavilyMeta,
    { maxResults: 6, taskType: "retail_availability" }));

  let parsed = await parseStockists(collected, label, city, country, apiKey, meta, radiusMinutes);
  let stockists = parsed.stockists;

  if (confidentCount(stockists) < ENOUGH_STOCKISTS && !isTavilyQuotaExhausted()) {
    push(await searchTavily(`"${label}" ${city} OR ${country}`, tavilyMeta,
      { includeDomains: ["wine-searcher.com"], maxResults: 4, taskType: "retail_availability" }));
    const mailDomains = mailOrderDomains(country);
    if (mailDomains.length) {
      push(await searchTavily(`"${label}"`, tavilyMeta,
        { includeDomains: mailDomains, maxResults: 5, taskType: "retail_availability" }));
    }
    parsed = await parseStockists(collected, label, city, country, apiKey, meta, radiusMinutes);
    stockists = parsed.stockists;
  }

  // Tavily flipped to 432 mid-ladder → persist the latch for every other instance.
  if (isTavilyQuotaExhausted()) latchQuotaInDb().catch(() => {});

  stockists = [...stockists, fallback];

  // 5. Cache write + lock release. Empty real results ARE cached (searching again tomorrow
  //    won't invent a merchant — the deep-link row keeps the user unblocked). Cached as a
  //    {stockists, typicalPriceUsd} envelope; the read path tolerates the legacy bare array.
  try {
    await sql`
      UPDATE retail_availability
      SET stockists = ${JSON.stringify({ stockists, typicalPriceUsd: parsed.typicalPriceUsd })},
          searched_at = now(), refreshing_at = NULL, last_used_at = now()
      WHERE cache_key = ${cacheKey}
    `;
  } catch (err) {
    console.error("retail_availability cache write failed:", err);
  }

  return { stockists, typicalPriceUsd: parsed.typicalPriceUsd, fromCache: false, degraded: false };
}

async function parseStockists(
  results: { url: string; title: string; content: string }[],
  wineLabel: string,
  city: string,
  country: string,
  apiKey: string,
  meta?: Meta,
  radiusMinutes?: number | null
): Promise<{ stockists: Stockist[]; typicalPriceUsd: number | null }> {
  if (!results.length) return { stockists: [], typicalPriceUsd: null };
  const radiusText = radiusMinutes && radiusMinutes > 0
    ? `within about ${radiusMinutes} minutes' drive of ${city}`
    : `in or near ${city}`;
  const docs = results.slice(0, 12).map((r, i) =>
    `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 600)}`).join("\n\n");
  try {
    const client = new Anthropic({ apiKey });
    const { model, abGroup } = await selectModel("retail_availability", apiKey, "haiku");
    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 800,
      system: `You extract wine stockists from raw web search results, for a user in ${city}, ${country}. Output exactly one JSON array, no prose, no code fences:
${STOCKIST_JSON_SHAPE}

Rules:
- Only include merchants that plausibly SELL the wine "${wineLabel}" — retail shops, state stores, online merchants. Never critics, forums, producers' own sites (unless they sell direct), or encyclopedic pages.
- kind: "local" = a physical shop the user could drive to (${radiusText}; neighboring towns and just across a state line count). "state_store" = a US state-run store system. "mail" = an online/national merchant that ships.
- url: the result URL for that merchant (the listing page if that's what was found).
- price: the per-bottle price if the snippet clearly shows one for this wine, else null. currency: ISO code like USD/EUR/GBP, else null. Never guess a price.
- confidence: "listed" = the snippet explicitly shows this wine at this merchant. "likely" = the merchant clearly stocks this producer/category and probably this wine. "unverified" = weaker.
- typical_price_usd: your estimate of this wine's TYPICAL retail price in USD for a 750ml bottle (any recent vintage), from your market knowledge — always include it, even when no snippet shows a price. Round number.
- Prefer local before mail. At most 6 stockist entries. If nothing qualifies, use "stockists": [].`,
      messages: [{ role: "user", content: docs }],
    });
    logClaudeUsage(
      { taskType: "retail_availability", model, source: "user", userId: meta?.userId,
        questionId: meta?.questionId, abGroup },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );
    const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const jsonMatch = text.match(/[{[][\s\S]*[}\]]/);
    if (!jsonMatch) return { stockists: [], typicalPriceUsd: null };
    const parsedJson = JSON.parse(jsonMatch[0]) as unknown;
    const arr = Array.isArray(parsedJson) ? parsedJson : (parsedJson as { stockists?: unknown })?.stockists;
    const typRaw = !Array.isArray(parsedJson) ? (parsedJson as { typical_price_usd?: unknown })?.typical_price_usd : null;
    return {
      stockists: coerceStockists(arr),
      typicalPriceUsd: typeof typRaw === "number" && typRaw > 0 && typRaw < 100000 ? typRaw : null,
    };
  } catch (err) {
    console.error("Stockist parse failed:", err);
    return { stockists: [], typicalPriceUsd: null };
  }
}
