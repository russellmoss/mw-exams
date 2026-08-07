import { readFileSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
// Provenance types and pure helpers live in their own module because this one is server-only (fs +
// neon). Re-exported so existing server imports from here keep working; CLIENT components must
// import from "@/lib/wine-provenance" directly or they pull `fs` into the browser bundle.
import { normalizeSources, tierFromSources, type WineSource, type SourceType, type GridCitations } from "./wine-provenance";
export * from "./wine-provenance";

export interface WineBankEntry {
  id: string;
  producer: string;
  wine_name: string;
  country: string;
  region: string;
  sub_region?: string;
  appellation?: string;
  grape_varieties: string[];
  style_category: string;
  /** Resolved wine colour (white|red|rose|orange), independent of style_category. See WineProfile. */
  colour?: string;
  method_tags?: string[];
  structure_tags?: string[];
  oak_signature?: string;
  rs_level?: string;
  abv?: string;
  price_band?: string;
  quality_tier?: string;
  tasting_profile?: {
    appearance?: string;
    nose_summary?: string;
    palate_summary?: string;
    sources?: WineSource[];
    citations?: GridCitations;
    evidence_tier?: SourceType | "inferred";
    confidence?: string;
  };
}

export interface TastingGrid {
  color: string;
  clarity: string;
  viscosity: string;
  nose_intensity: string;
  nose_descriptors: string;
  palate_sweetness: string;
  palate_acid: string;
  palate_tannin: string;
  palate_body: string;
  palate_alcohol: string;
  palate_flavor_descriptors: string;
  palate_finish: string;
  quality_assessment: string;
  sources: WineSource[];
  citations?: GridCitations;
  inferred_fields: string[];
}

export interface WineProfile {
  bank_match: string | null;
  tasting_profile: {
    appearance: string;
    nose_summary: string;
    palate_summary: string;
    structural_summary: string;
    sources: WineSource[];
    citations?: GridCitations;
  } | null;
  tasting_grid?: TastingGrid | null;
  confidence: "high" | "medium" | "low";
  // COARSE method, kept as-is because scripts and the answer-key builder branch on it
  // (`=== "none"` means "not researched yet"). The finer question — how GOOD the evidence was —
  // is evidence_tier below, added rather than folded in here so no existing consumer changes meaning.
  source_method: "bank_lookup" | "llm_enrichment" | "tavily_research" | "none";
  /** Best tier of evidence that actually contributed. "inferred" = nothing was found on the web. */
  evidence_tier?: SourceType | "inferred";
  enriched_at: string;
  structural_tags?: string[];
  style_category?: string;
  /**
   * The resolved wine COLOUR — "white" | "red" | "rose" | "orange" — kept separate from
   * style_category, which answers how the wine was made rather than what is in the glass.
   *
   * R-COLOUR (Paper 1 = still white, Paper 2 = still red) reads this in preference to inferring from
   * the label, because a label alone cannot place an appellation-only name like Hermitage. Absent when
   * the classifier could not settle it; never guessed.
   */
  colour?: string;
  oak_signature?: string;
  rs_level?: string;
  grape_varieties?: string[];
  quality_tier?: string;
}

let cachedBank: WineBankEntry[] | null = null;
let dbBankLoaded = false;

function loadBank(): WineBankEntry[] {
  if (cachedBank) return cachedBank;
  try {
    const filePath = join(process.cwd(), "public", "data", "mock_wine_bank.json");
    const raw = JSON.parse(readFileSync(filePath, "utf-8"));
    cachedBank = Array.isArray(raw) ? raw : raw.wines || [];
    return cachedBank!;
  } catch {
    cachedBank = [];
    return [];
  }
}

async function loadBankWithDb(): Promise<WineBankEntry[]> {
  const fileBank = loadBank();
  if (dbBankLoaded) return fileBank;

  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT * FROM wine_bank`;
    const fileIds = new Set(fileBank.map((e) => e.id));
    for (const row of rows) {
      if (!fileIds.has(row.id as string)) {
        const tp = row.tasting_profile as Record<string, string> | null;
        fileBank.push({
          id: row.id as string,
          producer: row.producer as string,
          wine_name: row.wine_name as string,
          country: row.country as string,
          region: row.region as string,
          grape_varieties: (row.grape_varieties as string[]) || [],
          style_category: (row.style_category as string) || "still_dry",
          // No default: an unknown colour must stay unknown. Defaulting it would hand R-COLOUR a
          // confident wrong answer, which is worse than the inference it would otherwise fall back to.
          colour: (row.colour as string | null) || undefined,
          structure_tags: (row.structure_tags as string[]) || undefined,
          oak_signature: row.oak_signature as string | undefined,
          rs_level: row.rs_level as string | undefined,
          quality_tier: row.quality_tier as string | undefined,
          tasting_profile: tp ? {
            appearance: tp.appearance,
            nose_summary: tp.nose_summary,
            palate_summary: tp.palate_summary,
            // Legacy rows hold bare URL strings here; normalizeSources folds both shapes to one.
            sources: normalizeSources(tp.sources),
            citations: (tp.citations as unknown as GridCitations) || undefined,
            evidence_tier: (tp.evidence_tier as unknown as SourceType | "inferred") || undefined,
            confidence: tp.confidence,
          } : undefined,
        });
      }
    }
    dbBankLoaded = true;
    cachedBank = fileBank;
    console.log(`Wine bank loaded: ${fileBank.length} entries (${rows.length} from DB)`);
  } catch (err) {
    console.error("Failed to load DB wine bank, using file bank only:", err);
  }
  return fileBank;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[''`]/g, "'")
    .replace(/\b(20\d{2}|19\d{2})\b/g, "")
    .replace(/\(\d+(\.\d+)?%?\s*(abv)?\)/gi, "")
    .replace(/[^a-z0-9\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Generic wine words that should NOT count toward matching
const NOISE_WORDS = new Set([
  "chateau", "domaine", "bodega", "bodegas", "weingut", "tenuta", "casa",
  "maison", "clos", "vina", "wines", "wine", "estate", "vineyards", "vineyard",
  "cellars", "cellar", "family", "reserve", "reserva", "riserva", "gran",
  "grand", "cru", "premier", "old", "vines", "single", "the", "del", "des",
  "les", "and", "von", "van", "rouge", "blanc", "rosso", "bianco", "tinto",
]);

// Exported for tests only — production callers go through lookupWine/lookupWines.
export function matchScore(queryText: string, entry: WineBankEntry): number {
  const query = normalize(queryText);
  const producerNorm = normalize(entry.producer);
  const wineNorm = normalize(entry.wine_name);

  // Extract meaningful tokens (skip noise words and short tokens)
  const meaningful = (text: string) =>
    text.split(" ").filter((t) => t.length > 2 && !NOISE_WORDS.has(t));

  const queryTokens = meaningful(query);
  const producerTokens = meaningful(producerNorm);
  const wineTokens = meaningful(wineNorm);

  if (producerTokens.length === 0) return 0;

  // Producer match: how many producer tokens appear in the query?
  let producerHits = 0;
  for (const pt of producerTokens) {
    if (queryTokens.some((qt) => qt === pt || qt.includes(pt) || pt.includes(qt))) {
      producerHits++;
    }
  }
  const producerScore = producerHits / producerTokens.length;

  // Require at least 60% of producer tokens to match
  if (producerScore < 0.6) return 0;

  // Wine name match: how many wine name tokens appear in the query?
  let wineHits = 0;
  for (const wt of wineTokens) {
    if (queryTokens.some((qt) => qt === wt || qt.includes(wt) || wt.includes(qt))) {
      wineHits++;
    }
  }
  const wineScore = wineTokens.length > 0 ? wineHits / wineTokens.length : 0;

  // Cuvée gate: a producer can have several wines in the bank, and question wines routinely name a
  // cuvée the bank doesn't hold. Under the old producer-weighted score, "Lucien Crochet … Le Chêne"
  // matched the same producer's La Croix du Roy row at 0.73 and served its tasting profile and
  // citations; "Leflaive … Les Combettes" matched a Clavoillon row at 0.87. Both are silent
  // wrong-wine provenance — worse than no match, which just falls back to fresh research. Since
  // bank wine_names mirror question fullText (vintage stripped, noise words skipped, accents
  // normalized), a genuine same-wine match has essentially every entry token present in the query;
  // 0.8 tolerates one orphan token only on long (5+ token) cuvée names.
  if (wineTokens.length > 0 && wineScore < 0.8) return 0;

  // Combined: producer match is weighted 60%, wine name 40%
  return producerScore * 0.6 + wineScore * 0.4;
}

export function lookupWine(fullText: string): { entry: WineBankEntry; score: number } | null {
  const bank = loadBank();
  if (bank.length === 0) return null;

  let bestMatch: WineBankEntry | null = null;
  let bestScore = 0;

  for (const entry of bank) {
    const score = matchScore(fullText, entry);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  // Require 0.7+ combined score (producer must match + some wine name overlap)
  if (bestScore >= 0.7 && bestMatch) {
    return { entry: bestMatch, score: bestScore };
  }
  return null;
}

export function buildStructuralProfile(entry: WineBankEntry): string {
  const parts: string[] = [];
  if (entry.style_category) parts.push(`style=${entry.style_category}`);
  if (entry.structure_tags?.length) parts.push(`structure=${entry.structure_tags.join("/")}`);
  if (entry.oak_signature) parts.push(`oak=${entry.oak_signature}`);
  if (entry.rs_level) parts.push(`rs=${entry.rs_level}`);
  if (entry.grape_varieties?.length) parts.push(`grape=${entry.grape_varieties.join("+")}`);
  if (entry.quality_tier) parts.push(`quality=${entry.quality_tier}`);
  if (entry.price_band) parts.push(`price=${entry.price_band}`);
  return parts.join(", ");
}

export async function lookupWines(wines: { slot: number; fullText: string }[]): Promise<Record<string, WineProfile>> {
  await loadBankWithDb();
  const profiles: Record<string, WineProfile> = {};
  for (const wine of wines) {
    const match = lookupWine(wine.fullText);
    if (match) {
      profiles[String(wine.slot)] = {
        bank_match: match.entry.id,
        tasting_profile: match.entry.tasting_profile ? {
          appearance: match.entry.tasting_profile.appearance || "",
          nose_summary: match.entry.tasting_profile.nose_summary || "",
          palate_summary: match.entry.tasting_profile.palate_summary || "",
          structural_summary: buildStructuralProfile(match.entry),
          sources: normalizeSources(match.entry.tasting_profile.sources),
          citations: match.entry.tasting_profile.citations,
        } : null,
        // Stored on rows banked since evidence tiers existed; derived from the source types for the
        // ones banked before, so a cached wine never reports a blank provenance.
        evidence_tier: match.entry.tasting_profile
          ? (match.entry.tasting_profile.evidence_tier
              ?? tierFromSources(normalizeSources(match.entry.tasting_profile.sources)))
          : undefined,
        confidence: match.score >= 0.8 ? "high" : "medium",
        source_method: "bank_lookup",
        enriched_at: new Date().toISOString(),
        structural_tags: match.entry.structure_tags,
        style_category: match.entry.style_category,
        colour: match.entry.colour,
        oak_signature: match.entry.oak_signature,
        rs_level: match.entry.rs_level,
        grape_varieties: match.entry.grape_varieties,
        quality_tier: match.entry.quality_tier,
      };
    } else {
      profiles[String(wine.slot)] = {
        bank_match: null,
        tasting_profile: null,
        confidence: "low",
        source_method: "none",
        enriched_at: new Date().toISOString(),
      };
    }
  }
  return profiles;
}

/**
 * Read back the wine_profiles enrichWineProfiles stored for a question, falling back to a live bank
 * lookup when the row has none yet (older questions, or one still enriching). Returns `{}` only if
 * both fail — every caller treats an empty map as "no reference profiles", never as an error.
 *
 * Exists so the model-answer paths that run AFTER generation (the standalone route, the bulk regen
 * script) reach the same researched profiles the tasting-note generator uses, instead of writing an
 * exemplar off the wine's name alone.
 */
export async function loadStoredWineProfiles(
  questionId: string,
  wines?: { slot: number; fullText: string }[]
): Promise<Record<string, WineProfile>> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const rows = await sql`SELECT wine_profiles FROM generated_questions WHERE question_id = ${questionId}`;
    const stored = rows[0]?.wine_profiles;
    if (stored && typeof stored === "object" && Object.keys(stored).length > 0) {
      return stored as Record<string, WineProfile>;
    }
  } catch (err) {
    console.error(`Could not read stored wine profiles for ${questionId}:`, err);
  }
  if (wines?.length) {
    try {
      return await lookupWines(wines);
    } catch {
      /* fall through to empty */
    }
  }
  return {};
}
