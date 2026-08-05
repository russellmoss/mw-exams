import Anthropic from "@anthropic-ai/sdk";
import { lookupWines, buildStructuralProfile, type WineProfile, type WineBankEntry, type TastingGrid,
  type WineSource, type SourceType, type GridCitations } from "./wine-bank-lookup";
import { neon } from "@neondatabase/serverless";
import { logClaudeUsage, logTavilyUsage } from "./usage-log";
import { selectModel } from "./model-selector";

const TAVILY_API_URL = "https://api.tavily.com/search";

// Usage-tracking context threaded from the request so each enrichment call (Tavily + Claude)
// is attributed to the right source/user/question.
type EnrichMeta = {
  source?: "user" | "server";
  userId?: number | null;
  questionId?: string | null;
  batchId?: string | null; // migration 029 — attribute bulk-run enrichment spend to its batch
};

const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract";

type TavilyResult = { url: string; title: string; content: string };

// Sources CLAUDE.md's working principles already name as preferred, expressed as an actual search
// filter rather than a hope. Producer/importer domains are unbounded (a tech sheet can live on any
// of a thousand distributor sites) so they are reached via the tech-sheet tier, not this allowlist.
const CRITIC_DOMAINS = [
  "vinous.com", "jancisrobinson.com", "decanter.com", "robertparker.com", "wineadvocate.com",
  "jamessuckling.com", "timatkin.com", "jebdunnuck.com", "winespectator.com", "wineanorak.com",
  "thewinecellarinsider.com", "janeanson.com", "falstaff.com", "guildsomm.com",
];

// Named in CLAUDE.md as acceptable sources, but they are aggregators and community databases, not
// signed criticism — and a domain-scoped search returns them by the fistful. Measured on an obscure
// Burgenland wine, putting wine-searcher in the critic tier filled 6 of 12 slots with price
// listings that contain no tasting descriptors at all. They stay usable via the open-web tier and
// keep their display names, but they are typed `web` so a citation never overstates what backs it.
const AGGREGATOR_DOMAINS = new Set(["wine-searcher.com", "cellartracker.com"]);

function sourceTypeFor(url: string): SourceType {
  const h = hostOf(url);
  if ([...AGGREGATOR_DOMAINS].some((d) => h === d || h.endsWith(`.${d}`))) return "web";
  return publisherFor(url) ? "critic" : "web";
}

// Publisher shown in a citation. Anything unlisted falls back to the bare hostname, which is still
// more use than a raw URL.
const DOMAIN_PUBLISHER: Record<string, string> = {
  "vinous.com": "Vinous", "jancisrobinson.com": "JancisRobinson.com", "decanter.com": "Decanter",
  "robertparker.com": "Wine Advocate", "wineadvocate.com": "Wine Advocate",
  "jamessuckling.com": "James Suckling", "timatkin.com": "Tim Atkin MW",
  "jebdunnuck.com": "Jeb Dunnuck", "winespectator.com": "Wine Spectator",
  "wineanorak.com": "Wine Anorak", "thewinecellarinsider.com": "The Wine Cellar Insider",
  "janeanson.com": "Jane Anson", "falstaff.com": "Falstaff", "guildsomm.com": "GuildSomm",
  "wine-searcher.com": "Wine-Searcher", "cellartracker.com": "CellarTracker",
};

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; }
}

function publisherFor(url: string): string | undefined {
  const h = hostOf(url);
  if (DOMAIN_PUBLISHER[h]) return DOMAIN_PUBLISHER[h];
  const key = Object.keys(DOMAIN_PUBLISHER).find((d) => h.endsWith(d));
  return key ? DOMAIN_PUBLISHER[key] : undefined;
}

async function tavilyFetch(url: string, body: unknown, ctx: { taskType: string; query: string; credits: number }, meta?: EnrichMeta): Promise<unknown | null> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) {
    console.warn("TAVILY_API_KEY not set — skipping web research");
    return null;
  }
  const log = (ok: boolean, n: number) =>
    logTavilyUsage({ taskType: ctx.taskType, query: ctx.query, resultsCount: n, credits: ctx.credits,
      userId: meta?.userId, batchId: meta?.batchId, questionId: meta?.questionId, success: ok });
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${tavilyKey}` },
      body: JSON.stringify(body),
      // An extract of a large PDF is slow; without a cap a stalled connection hangs enrichment,
      // which is exactly how the model-answer batch wedged itself.
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`Tavily ${ctx.taskType} error ${res.status}: ${text.slice(0, 200)}`);
      log(false, 0);
      return null;
    }
    const data = await res.json();
    log(true, Array.isArray((data as { results?: unknown[] }).results) ? (data as { results: unknown[] }).results.length : 0);
    return data;
  } catch (err) {
    console.error(`Tavily ${ctx.taskType} failed:`, err);
    log(false, 0);
    return null;
  }
}

async function searchTavily(
  query: string,
  meta?: EnrichMeta,
  opts?: { includeDomains?: string[]; maxResults?: number; taskType?: string }
): Promise<TavilyResult[]> {
  const data = await tavilyFetch(
    TAVILY_API_URL,
    {
      query,
      max_results: opts?.maxResults ?? 6,
      search_depth: "basic",
      ...(opts?.includeDomains?.length ? { include_domains: opts.includeDomains } : {}),
    },
    { taskType: opts?.taskType ?? "wine_enrichment", query, credits: 1 },
    meta
  );
  const results = (data as { results?: { url?: string; title?: string; content?: string }[] } | null)?.results ?? [];
  return results
    .filter((r) => r.url)
    .map((r) => ({ url: r.url!, title: r.title ?? "", content: r.content ?? "" }));
}

// Full-text extraction. A search snippet is ~400 chars of whatever the crawler grabbed; an extracted
// tech sheet is the whole document — analysis, winemaking, the producer's note, and on importer
// sheets a dozen attributed critic reviews. Verified against a real PDF tech sheet before this was
// built, because PDF support was the load-bearing unknown.
async function extractTavily(urls: string[], meta?: EnrichMeta): Promise<{ url: string; text: string }[]> {
  if (!urls.length) return [];
  const data = await tavilyFetch(
    TAVILY_EXTRACT_URL,
    { urls, extract_depth: "advanced" },
    // Advanced extract bills roughly 2 credits per 5 URLs; round up so the Cost dashboard is not
    // quietly under-reporting the most expensive call in the pipeline.
    { taskType: "wine_tech_sheet", query: urls.join(" "), credits: Math.ceil(urls.length / 5) * 2 },
    meta
  );
  const results = (data as { results?: { url?: string; raw_content?: string }[] } | null)?.results ?? [];
  return results
    .filter((r) => r.url && r.raw_content)
    // Tech sheets run long (the Mouton sheet is ~10k words). Cap per document so one verbose PDF
    // cannot crowd the others out of the extraction prompt.
    .map((r) => ({ url: r.url!, text: r.raw_content!.slice(0, 14_000) }));
}

// The vintage is the one field the regex parse gets right regardless of how the reference string is
// shaped, so it stays a standalone helper rather than something classifyWine has to be trusted for.
function extractVintage(fullText: string): string {
  const m = fullText.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : "NV";
}

function parseWineIdentity(fullText: string): { producer: string; wineName: string; vintage: string; region: string; country: string } {
  const parts = fullText.split(".");
  const firstPart = (parts[0] || "").trim();
  const commaIdx = firstPart.indexOf(",");
  const producer = commaIdx > 0 ? firstPart.slice(0, commaIdx).trim() : firstPart;
  const wineName = commaIdx > 0 ? firstPart.slice(commaIdx + 1).trim().replace(/\d{4}$/, "").trim() : "";
  const vintageMatch = fullText.match(/\b(19|20)\d{2}\b/);
  const vintage = vintageMatch ? vintageMatch[0] : "NV";
  const regionPart = (parts[1] || "").trim();
  const regionComma = regionPart.lastIndexOf(",");
  const region = regionComma > 0 ? regionPart.slice(0, regionComma).trim() : regionPart;
  const country = regionComma > 0 ? regionPart.slice(regionComma + 1).trim().replace(/[()]/g, "") : "";
  return { producer, wineName, vintage, region, country };
}

// Valid style_category values (must match data/mock_wine_bank.schema.json).
const STYLE_CATEGORIES = "still_dry, still_off_dry, still_sweet, sparkling, fortified, oxidative, orange, rose";

export type WineIdentity = {
  producer: string;
  wineName: string;
  country: string;
  region: string;
  grapeVarieties: string[];
  styleCategory: string;
};

// Derive a clean, structured identity (+ grape varieties + style classification) from a wine's
// reference string. The old regex parser (parseWineIdentity) mangled anything that didn't fit the
// exact "Producer, Name. Region, Country" shape — producing rows like producer="R", country="2012",
// and every wine defaulting to still_dry. We're already calling Claude per non-bank wine, so we let
// it do the parsing/classification too. parseWineIdentity remains the fallback if the call fails.
async function classifyWine(fullText: string, apiKey: string, meta?: EnrichMeta): Promise<WineIdentity> {
  const fallback = parseWineIdentity(fullText);
  const fallbackIdentity: WineIdentity = {
    producer: fallback.producer,
    wineName: fallback.wineName,
    country: fallback.country,
    region: fallback.region,
    grapeVarieties: [],
    styleCategory: "still_dry",
  };

  try {
    const client = new Anthropic({ apiKey });
    const { model, abGroup } = await selectModel("wine_enrichment", apiKey, "haiku");
    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 300,
      system: `You identify a wine from a single reference string. Output exactly one JSON object, no prose, no code fences:
{"producer":"...","wine_name":"...","country":"...","region":"...","grape_varieties":["..."],"style_category":"..."}

Rules:
- producer: the estate/house only, e.g. "Domaine Leflaive", "Billecart-Salmon", "Nyetimber". Never a year or a region.
- wine_name: the cuvée/bottling without the producer and without the vintage year, e.g. "Mâcon-Verzé", "Blanc de Blancs Grand Cru", "Tillington Single Vineyard". Empty string if there is none.
- country: the country of origin, e.g. "France", "England". Never a year.
- region: the wine region, e.g. "Burgundy", "Champagne", "Mosel", "West Sussex". Never a year.
- grape_varieties: the grape(s). If not stated, infer the standard variety/blend for the appellation. Use standard names, e.g. ["Chardonnay"], ["Grenache","Syrah","Mourvèdre"].
- style_category: exactly one of: ${STYLE_CATEGORIES}.
  - sparkling: Champagne, Crémant, Cava, Prosecco, Sekt, traditional-method / any fizzy wine.
  - fortified: Port, Sherry, Madeira, Rutherglen/liqueur Muscat, Vin Doux Naturel.
  - still_sweet: Sauternes, Tokaji Aszú, Beerenauslese/Trockenbeerenauslese, Icewine/Eiswein, Vin Santo, passito, Quarts de Chaume, Vin de Constance, late-harvest dessert wines.
  - still_off_dry: fruity Kabinett/Spätlese and other clearly off-dry (not fully sweet) styles.
  - oxidative: Vin Jaune, oxidative/sous-voile Jura whites, biologically/deliberately oxidative styles. This includes wines where the style is implied by the house rather than stated on the label — traditional white Rioja aged for years in old oak (López de Heredia Viña Tondonia Blanco and Viña Gravonia, Marqués de Murrieta Castillo Ygay Blanco, CVNE Monopole Clásico) and the voile-by-default Jura domaines (Macle, Montbourgeau, Berthet-Bondet, Bourdy). A "Blanco Reserva/Gran Reserva" from Rioja is oxidative, not still_dry.
  - NOT oxidative: anything labelled "ouillé" (topped up) is the deliberate opposite — no flor forms — so an Arbois Savagnin Ouillé is still_dry however Jura it looks. A grape or appellation never settles this on its own: Arbois and L'Étoile both cover topped-up and voile-aged wines, and the reds from those same houses (Viña Tondonia Tinto, Castillo Ygay Gran Reserva, Berthet-Bondet Trousseau) are still_dry.
  - rose / orange: as appropriate. Blush wines count as rose even when unlabelled (White Zinfandel).
  - still_dry: everything else (the default for dry still whites and reds).`,
      messages: [{ role: "user", content: `Wine: ${fullText}` }],
    });
    logClaudeUsage(
      { taskType: "wine_enrichment", model, source: meta?.source, userId: meta?.userId,
          batchId: meta?.batchId, questionId: meta?.questionId, abGroup },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );

    const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const o = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const str = (v: unknown, fb: string) => (typeof v === "string" && v.trim() ? v.trim() : fb);
      return {
        producer: str(o.producer, fallbackIdentity.producer),
        wineName: str(o.wine_name, fallbackIdentity.wineName),
        country: str(o.country, fallbackIdentity.country),
        region: str(o.region, fallbackIdentity.region),
        grapeVarieties: Array.isArray(o.grape_varieties)
          ? (o.grape_varieties as unknown[]).filter((g): g is string => typeof g === "string" && g.trim().length > 0)
          : [],
        styleCategory: str(o.style_category, "still_dry"),
      };
    }
  } catch (err) {
    console.error("Wine classification failed, falling back to regex parse:", fullText, err);
  }
  return fallbackIdentity;
}

type EvidenceDoc = { source: WineSource; text: string };

// Keys on TastingGrid that are metadata rather than sensory fields. Gap detection and citation
// bookkeeping must skip these or they get treated as missing tasting values.
const META_KEYS = ["sources", "citations", "inferred_fields"];

/**
 * Keep only citations that point at a document we actually supplied. The model is asked for document
 * numbers; a hallucinated "[7]" against a 3-document prompt would otherwise render as a confident
 * link to nothing, which is worse than admitting the field was inferred.
 */
export function normalizeCitations(raw: unknown, sourceCount: number): GridCitations {
  const out: GridCitations = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [field, v] of Object.entries(raw as Record<string, unknown>)) {
    if (META_KEYS.includes(field)) continue;
    const refs = Array.isArray(v)
      ? v.map((n) => (typeof n === "number" ? n : Number(n)))
          // Prompt numbers documents from 1; storage indexes from 0.
          .map((n) => n - 1)
          .filter((n) => Number.isInteger(n) && n >= 0 && n < sourceCount)
      : [];
    out[field] = [...new Set(refs)];
  }
  return out;
}

// A URL worth paying for a full extract on. PDFs are the giveaway — tech sheets are overwhelmingly
// PDFs — but plenty of importers publish the same document as HTML, hence the filename hints.
export function looksLikeTechSheet(r: { url: string; title: string }): boolean {
  if (/\.pdf(\?|#|$)/i.test(r.url)) return true;
  return /(tech[-_ ]?sheet|fiche[-_ ]?technique|fact[-_ ]?sheet|spec[-_ ]?sheet|sell[-_ ]?sheet|\bTS\b)/i
    .test(`${r.url} ${r.title}`);
}

/**
 * Gather evidence in preference order: technical sheets, then named critics, then open web, and stop
 * as soon as we have enough. Tiers ACCUMULATE rather than compete — a thin tech sheet still gets
 * critic notes layered on top — because the goal is one complete, coherent note, not one pure source.
 *
 * Ordering is the point. A tech sheet carries the analysis (pH, abv, blend), the winemaking, the
 * producer's own tasting note, and — on importer sheets — a dozen attributed critic reviews, all in
 * one document. A search snippet carries ~400 characters of whatever the crawler happened to grab.
 */
async function acquireEvidence(subject: string, meta?: EnrichMeta): Promise<{ docs: EvidenceDoc[]; tier: SourceType | "inferred" }> {
  const docs: EvidenceDoc[] = [];
  const seen = new Set<string>();
  const volume = () => docs.reduce((n, d) => n + d.text.length, 0);
  // Below this, the evidence is too thin to build a full grid from and the next tier is worth its
  // cost. Above it, stop — a rich tech sheet already answers more than a critic snippet would add.
  const ENOUGH = 2500;

  // ── Tier 1: technical sheets ────────────────────────────────────────────────
  const sheetHits = await searchTavily(`${subject} technical sheet tasting notes`, meta, { taskType: "wine_tech_sheet_search" });
  const candidates = sheetHits.filter(looksLikeTechSheet).slice(0, 2);
  if (candidates.length) {
    for (const { url, text } of await extractTavily(candidates.map((c) => c.url), meta)) {
      if (seen.has(url)) continue;
      seen.add(url);
      const hit = candidates.find((c) => c.url === url);
      docs.push({
        source: { url, type: "tech_sheet", publisher: publisherFor(url) ?? hostOf(url), title: hit?.title || undefined },
        text,
      });
    }
  }
  // The non-sheet results from the same search are already paid for — keep the useful ones rather
  // than discarding them and searching again.
  if (volume() < ENOUGH) {
    for (const r of sheetHits.filter((r) => !seen.has(r.url) && r.content).slice(0, 3)) {
      seen.add(r.url);
      docs.push({
        source: { url: r.url, type: sourceTypeFor(r.url), publisher: publisherFor(r.url) ?? hostOf(r.url), title: r.title || undefined },
        text: r.content,
      });
    }
  }

  // ── Tier 2: named critics ───────────────────────────────────────────────────
  if (volume() < ENOUGH) {
    const criticHits = await searchTavily(`${subject} tasting note review`, meta, {
      includeDomains: CRITIC_DOMAINS,
      taskType: "wine_critic_search",
    });
    for (const r of criticHits.filter((r) => !seen.has(r.url) && r.content).slice(0, 5)) {
      seen.add(r.url);
      docs.push({
        source: { url: r.url, type: "critic", publisher: publisherFor(r.url) ?? hostOf(r.url), title: r.title || undefined },
        text: r.content,
      });
    }
  }

  // ── Tier 3: open web (the original behaviour, now a fallback) ───────────────
  if (volume() < ENOUGH) {
    const webHits = await searchTavily(`${subject} tasting notes appearance color aroma palate review`, meta);
    for (const r of webHits.filter((r) => !seen.has(r.url) && r.content).slice(0, 4)) {
      seen.add(r.url);
      docs.push({
        source: { url: r.url, type: sourceTypeFor(r.url), publisher: publisherFor(r.url) ?? hostOf(r.url), title: r.title || undefined },
        text: r.content,
      });
    }
  }

  const tier: SourceType | "inferred" = docs.some((d) => d.source.type === "tech_sheet")
    ? "tech_sheet"
    : docs.some((d) => d.source.type === "critic")
      ? "critic"
      : docs.length ? "web" : "inferred";
  console.log(`Evidence for "${subject.slice(0, 60)}": ${docs.length} doc(s), ${volume()} chars, best tier=${tier}`);
  return { docs, tier };
}

// `identity` MUST be the classifyWine result, not parseWineIdentity's. The search query is only as
// good as the producer/cuvée it names, and the regex parser mangles anything that doesn't fit
// "Producer, Name. Region, Country" — the same failure that put producer="R" / country="2012" rows in
// the wine bank. Building the query from a mangled parse searched the open web for nonsense, returned
// nothing usable, and dropped the wine silently into the LLM gap-fill path below: the enrichment
// LOOKED like it had researched the wine (source_method could still read tavily_research off one
// irrelevant snippet) while the grid was really the model's own recall.
async function researchWineViaTavily(
  wine: { slot: number; fullText: string },
  identity: WineIdentity,
  apiKey: string,
  meta?: EnrichMeta
): Promise<WineProfile> {
  // Region disambiguates the many repeated producer names; vintage pins the note to the right release.
  // If classification came back empty on every field, search the raw reference string rather than a
  // query made only of the boilerplate suffix.
  const subject = [identity.producer, identity.wineName, identity.region, extractVintage(wine.fullText)]
    .map((s) => (s || "").trim())
    .filter(Boolean)
    .join(" ");
  const evidence = await acquireEvidence(subject || wine.fullText, meta);
  const hasTavilyResults = evidence.docs.length >= 1;

  const GRID_SYSTEM = `You are an MW-level wine expert building a structured tasting grid. Use the MW Systematic Approach to Tasting (SAT) framework.

For every field, use the standard MW vocabulary scales:
- color: e.g. "lemon-green", "gold", "ruby", "garnet", "tawny"
- clarity: "clear", "slight haze", "hazy"
- viscosity: "low", "medium", "high"
- nose_intensity: "light", "medium(-)", "medium", "medium(+)", "pronounced"
- nose_descriptors: specific aromas — fruit, floral, herbal, oak, earth, etc.
- palate_sweetness: "dry", "off-dry", "medium-dry", "medium-sweet", "sweet", "luscious"
- palate_acid: "low", "medium(-)", "medium", "medium(+)", "high"
- palate_tannin: "low", "medium(-)", "medium", "medium(+)", "high" (or "n/a" for whites)
- palate_body: "light", "medium(-)", "medium", "medium(+)", "full"
- palate_alcohol: "low", "medium", "medium(+)", "high"
- palate_flavor_descriptors: specific palate flavors, oak influence, secondary/tertiary notes
- palate_finish: "short", "medium(-)", "medium", "medium(+)", "long"
- quality_assessment: "poor", "acceptable", "good", "very good", "outstanding"

Output exactly one JSON object (no markdown, no code fences):
{"color":"...","clarity":"...","viscosity":"...","nose_intensity":"...","nose_descriptors":"...","palate_sweetness":"...","palate_acid":"...","palate_tannin":"...","palate_body":"...","palate_alcohol":"...","palate_flavor_descriptors":"...","palate_finish":"...","quality_assessment":"...","citations":{"<field>":[<document numbers>]},"inferred_fields":["field names you had to infer rather than find stated"]}

CITATIONS are required and are the point of this task — they are what makes a note auditable instead of a black box:
- For every field, list the numbers of the documents that actually support the value, e.g. "nose_descriptors":[1,3].
- Use an EMPTY array for a field no document supports. Never cite a document that does not state or clearly imply the value; a wrong citation is worse than none.
- A document's own words outrank your expectations. If a tech sheet says the wine is deep purple and you expected garnet, cite the sheet and record what it says.`;

  const client = new Anthropic({ apiKey });
  const { model: enrichModel, abGroup: enrichAb } = await selectModel("wine_enrichment", apiKey, "sonnet");
  let grid: TastingGrid | null = null;
  let sourceMethod: WineProfile["source_method"] = "none";
  let confidence: "high" | "medium" | "low" = "low";

  if (hasTavilyResults) {
    // Step 1: Extract what Tavily sources explicitly state
    try {
      const t0 = Date.now();
      const message = await client.messages.create({
        model: enrichModel,
        max_tokens: 1000,
        system: GRID_SYSTEM + `\n\nIMPORTANT: You have real source documents below. Extract every detail they state. For fields where the documents give no information, write "NOT_FOUND" as the value — do NOT guess at this stage; a later pass fills gaps and records that it did so. Put "NOT_FOUND" fields in inferred_fields with an empty citation array.

Document 1 is the most authoritative and they descend from there. A TECH SHEET is the producer's or importer's own document: prefer its analysis (abv, pH, residual sugar), its winemaking detail, and its tasting note over anything else. Importer tech sheets often reproduce several named critic reviews — treat those as part of that document and cite its number.`,
        messages: [{
          role: "user",
          content: `Wine: ${wine.fullText}\n\nSource documents:\n${evidence.docs
            .map((d, i) => `[${i + 1}] (${d.source.type.toUpperCase()}${d.source.publisher ? ` — ${d.source.publisher}` : ""}) ${d.source.url}\n${d.text}`)
            .join("\n\n---\n\n")}\n\nBuild the tasting grid from these documents. Use "NOT_FOUND" for anything they don't cover, and cite document numbers for everything they do.`,
        }],
      });
      logClaudeUsage(
        { taskType: "wine_enrichment", model: enrichModel, source: meta?.source, userId: meta?.userId,
          batchId: meta?.batchId, questionId: meta?.questionId, abGroup: enrichAb },
        message.usage,
        { latencyMs: Date.now() - t0 }
      );

      const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        grid = JSON.parse(jsonMatch[0]) as TastingGrid;
        // Sources are set from the documents we actually supplied, NOT from anything the model
        // emitted — the model's job is to say which document supports which field, never to invent
        // the document list. Index i in `sources` is document [i+1] in the prompt, which is what the
        // citation numbers refer to, so this ordering is load-bearing.
        grid.sources = evidence.docs.map((d) => d.source);
        grid.citations = normalizeCitations(grid.citations, grid.sources.length);
        sourceMethod = "tavily_research";
        // A tech sheet is the producer's own document; a grid built on one is materially better
        // evidenced than one assembled from search snippets, and the confidence should say so.
        confidence = evidence.tier === "tech_sheet" ? "high" : "medium";
      }
    } catch (err) {
      console.error("Tavily grid extraction failed for", wine.fullText, err);
    }
  }

  // Step 2: Fill gaps — either from a partial researched grid or from scratch
  const isGap = (v: unknown): boolean => {
    if (!v || v === "NOT_FOUND") return true;
    const s = String(v).toLowerCase();
    return s.includes("not described") || s.includes("not found") || s.includes("not available")
      || s.length < 5 || s === "n/a" || s === "unknown" || s === "red, still" || s === "white, still";
  };
  const hasGaps = grid && Object.entries(grid)
    .filter(([k]) => !META_KEYS.includes(k))
    .some(([, v]) => isGap(v));
  if (!grid || hasGaps) {
    try {
      // Mark all gap fields for the LLM
      const gapFields = grid
        ? Object.entries(grid)
            .filter(([k, v]) => !META_KEYS.includes(k) && isGap(v))
            .map(([k]) => k)
        : [];
      const gapContext = grid
        ? `\n\nA partial grid was extracted from web sources:\n${JSON.stringify(grid)}\n\nThe following fields are incomplete or missing: ${gapFields.join(", ")}. Fill these fields using your expert knowledge of this exact producer, cuvée, vintage, and region. Keep all well-populated values exactly as they are. Update inferred_fields to list every field you filled in.`
        : `\n\nNo web sources were available. Build the complete grid from your knowledge of this exact producer, cuvée, and vintage. Be specific to THIS wine, not generic. List all fields in inferred_fields.`;

      const t0 = Date.now();
      const message = await client.messages.create({
        model: enrichModel,
        max_tokens: 1000,
        system: GRID_SYSTEM + `\n\nYou are filling in gaps using your expert wine knowledge. Be accurate to this specific wine — use your knowledge of the producer's style, the appellation norms, and the vintage character.`,
        messages: [{
          role: "user",
          content: `Wine: ${wine.fullText}${gapContext}`,
        }],
      });
      logClaudeUsage(
        { taskType: "wine_enrichment", model: enrichModel, source: meta?.source, userId: meta?.userId,
          batchId: meta?.batchId, questionId: meta?.questionId, abGroup: enrichAb },
        message.usage,
        { latencyMs: Date.now() - t0 }
      );

      const text = message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const filled = JSON.parse(jsonMatch[0]) as TastingGrid;
        if (!grid) {
          grid = filled;
          // Nothing was found on the web, so every value here is model knowledge. Say so explicitly
          // rather than leaving citations absent, which reads as "unknown provenance".
          grid.sources = [];
          grid.citations = Object.fromEntries(
            Object.keys(filled).filter((k) => !META_KEYS.includes(k)).map((k) => [k, [] as number[]])
          );
          sourceMethod = "llm_enrichment";
          confidence = "medium";
        } else {
          // Merge: keep researched values, fill gaps with model knowledge — and mark exactly which
          // fields that was. A filled gap MUST end up with an empty citation array: carrying over the
          // researched field's citation would attribute an inferred value to a real document, which
          // is the precise dishonesty this whole change exists to remove.
          const gridAny = grid as unknown as Record<string, unknown>;
          const citations = grid.citations ?? {};
          for (const [k, v] of Object.entries(filled)) {
            if (META_KEYS.includes(k)) continue;
            if (isGap(gridAny[k])) {
              gridAny[k] = v;
              citations[k] = [];
            }
          }
          grid.citations = citations;
          grid.inferred_fields = filled.inferred_fields || [];
        }
      }
    } catch (err) {
      console.error("LLM gap-fill failed for", wine.fullText, err);
    }
  }

  if (grid) {
    // Final check: if any key fields are still gaps after all processing, downgrade confidence
    const keyFields = [grid.color, grid.nose_descriptors, grid.palate_flavor_descriptors];
    const stillHasGaps = keyFields.some((v) => isGap(v));
    if (stillHasGaps) confidence = "low";

    return {
      bank_match: null,
      tasting_profile: {
        appearance: `${grid.color || "ruby"}, ${grid.clarity || "clear"}, ${grid.viscosity || "medium"} viscosity`,
        nose_summary: `${grid.nose_intensity || "medium"} intensity. ${grid.nose_descriptors || ""}`.trim(),
        palate_summary: `${grid.palate_flavor_descriptors || ""}. Finish: ${grid.palate_finish || "medium"}.`.trim(),
        structural_summary: `Sweetness: ${grid.palate_sweetness || "dry"}. Acid: ${grid.palate_acid || "medium"}. Tannin: ${grid.palate_tannin || "n/a"}. Body: ${grid.palate_body || "medium"}. Alcohol: ${grid.palate_alcohol || "medium"}.`,
        sources: grid.sources || [],
        citations: grid.citations,
      },
      tasting_grid: grid,
      confidence,
      source_method: sourceMethod,
      // What the note is actually built on, independent of whether a search ran at all.
      evidence_tier: sourceMethod === "llm_enrichment" ? "inferred" : evidence.tier,
      enriched_at: new Date().toISOString(),
    };
  }

  return {
    bank_match: null,
    tasting_profile: null,
    confidence: "low",
    source_method: "none",
    evidence_tier: "inferred",
    enriched_at: new Date().toISOString(),
  };
}

async function addToWineBank(identity: WineIdentity, profile: WineProfile, idOverride?: string): Promise<void> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    // Include wine_name so different cuvées from the same producer/region get distinct ids
    // (country_region_producer alone collapses e.g. Muga Reserva and Muga Rosado onto one row).
    const slug = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    // idOverride pins the write to a row that already exists. classifyWine is an LLM call, so
    // re-classifying the same wine can return "López de Heredia" where the banked row was built from
    // "R. López de Heredia" — a different slug, and the upsert would silently INSERT a duplicate
    // instead of upgrading the row. A backfill iterating the bank must always pass the row's own id.
    const id = idOverride || [slug(identity.country), slug(identity.region), slug(identity.producer), slug(identity.wineName)]
      .filter(Boolean).join("_").slice(0, 120);

    await sql`
      INSERT INTO wine_bank (id, producer, wine_name, country, region, grape_varieties, style_category, tasting_profile, source)
      VALUES (
        ${id},
        ${identity.producer},
        ${identity.wineName},
        ${identity.country},
        ${identity.region},
        ${JSON.stringify(identity.grapeVarieties)},
        ${identity.styleCategory || "still_dry"},
        ${profile.tasting_profile ? JSON.stringify({
          appearance: profile.tasting_profile.appearance,
          nose_summary: profile.tasting_profile.nose_summary,
          palate_summary: profile.tasting_profile.palate_summary,
          sources: profile.tasting_profile.sources,
          citations: profile.tasting_profile.citations,
          evidence_tier: profile.evidence_tier,
          confidence: profile.confidence,
        }) : null},
        ${profile.source_method}
      )
      ON CONFLICT (id) DO UPDATE SET
        grape_varieties = CASE
          WHEN wine_bank.grape_varieties IS NULL OR wine_bank.grape_varieties = '[]'::jsonb
          THEN EXCLUDED.grape_varieties ELSE wine_bank.grape_varieties END,
        style_category = COALESCE(NULLIF(EXCLUDED.style_category, ''), wine_bank.style_category),
        tasting_profile = COALESCE(EXCLUDED.tasting_profile, wine_bank.tasting_profile),
        updated_at = now()
    `;
    console.log(`Added wine to DB bank: ${id} (${identity.producer} ${identity.wineName}) [${identity.styleCategory}]`);
  } catch (err) {
    console.error("Failed to add wine to DB bank:", err);
  }
}

/**
 * Research ONE wine and write it straight to the bank, with no question attached.
 *
 * enrichWineProfiles is the normal entry point and is question-scoped: it looks wines up, skips the
 * ones already banked, and stores the result on the question. This exists for maintenance passes that
 * iterate the BANK itself — where there is no question, and where the write must land on an existing
 * row rather than creating a near-duplicate.
 */
export async function researchAndBankWine(
  fullText: string,
  apiKey: string,
  opts: { bankId?: string; meta?: EnrichMeta } = {}
): Promise<WineProfile> {
  const identity = await classifyWine(fullText, apiKey, opts.meta);
  const profile = await researchWineViaTavily({ slot: 1, fullText }, identity, apiKey, opts.meta);
  profile.style_category = identity.styleCategory;
  profile.grape_varieties = identity.grapeVarieties;
  // No tasting profile means the research produced nothing usable; writing that over a row that
  // already has one would be a downgrade, so leave the existing row alone.
  if (profile.tasting_profile) await addToWineBank(identity, profile, opts.bankId);
  return profile;
}

export async function enrichWineProfiles(
  questionId: string,
  wines: { slot: number; fullText: string }[],
  apiKey: string,
  meta?: { source?: "user" | "server"; userId?: number | null; batchId?: string | null },
  // Maintenance escape hatch. Normally a wine already in the bank is served from cache and never
  // re-researched — correct for the generation path, but it also means a profile built from a BAD
  // search is permanent. forceSlots re-researches the listed slots regardless of a bank hit, so a
  // wine whose profile was built before a search-quality fix can be repaired without wiping the bank
  // row (addToWineBank's ON CONFLICT overwrites tasting_profile with the fresh one). Slot-scoped on
  // purpose: re-researching a whole flight to repair one wine is wasted spend.
  opts?: { forceSlots?: number[] }
): Promise<Record<string, WineProfile>> {
  const profiles = await lookupWines(wines);
  const enrichMeta: EnrichMeta = {
    source: meta?.source,
    userId: meta?.userId,
    batchId: meta?.batchId,
    questionId,
  };

  const force = new Set(opts?.forceSlots ?? []);
  const needsEnrichment = wines.filter(
    (w) => force.has(w.slot) || profiles[String(w.slot)]?.source_method === "none"
  );

  // CLASSIFY FIRST, then research. The order is load-bearing, not stylistic: researchWineViaTavily
  // builds its search query out of the identity, so classification has to have happened before the
  // search, not after it. (It used to run second — purely to shape the bank row — which left the
  // search itself on the mangled regex parse.) No extra API call: the same classifyWine invocation
  // now just happens one line earlier.
  for (const wine of needsEnrichment) {
    const identity = await classifyWine(wine.fullText, apiKey, enrichMeta);
    const profile = await researchWineViaTavily(wine, identity, apiKey, enrichMeta);
    // Carry the classification onto the profile so the current question's wine_profiles
    // (and any downstream tasting context) reflect the real style/grapes, not still_dry/[].
    profile.style_category = identity.styleCategory;
    profile.grape_varieties = identity.grapeVarieties;
    profiles[String(wine.slot)] = profile;

    if (profile.tasting_profile) {
      await addToWineBank(identity, profile);
    }
  }

  // For bank matches without tasting prose, build structural summary
  for (const wine of wines) {
    const p = profiles[String(wine.slot)];
    if (p?.source_method === "bank_lookup" && !p.tasting_profile && p.structural_tags) {
      p.tasting_profile = {
        appearance: "",
        nose_summary: "",
        palate_summary: "",
        structural_summary: buildStructuralProfile({
          id: p.bank_match || "",
          producer: "",
          wine_name: "",
          country: "",
          region: "",
          grape_varieties: p.grape_varieties || [],
          style_category: p.style_category || "",
          structure_tags: p.structural_tags,
          oak_signature: p.oak_signature,
          rs_level: p.rs_level,
          quality_tier: p.quality_tier,
        }),
        sources: [],
      };
    }
  }

  // Save profiles to DB
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`
      UPDATE generated_questions
      SET wine_profiles = ${JSON.stringify(profiles)}
      WHERE question_id = ${questionId}
    `;
  } catch (err) {
    console.error("Failed to save wine profiles:", err);
  }

  return profiles;
}
