import { readFileSync } from "fs";
import { join } from "path";

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
    sources?: string[];
    confidence?: string;
  };
}

export interface WineProfile {
  bank_match: string | null;
  tasting_profile: {
    appearance: string;
    nose_summary: string;
    palate_summary: string;
    structural_summary: string;
    sources: string[];
  } | null;
  confidence: "high" | "medium" | "low";
  source_method: "bank_lookup" | "llm_enrichment" | "tavily_research" | "none";
  enriched_at: string;
  structural_tags?: string[];
  style_category?: string;
  oak_signature?: string;
  rs_level?: string;
  grape_varieties?: string[];
  quality_tier?: string;
}

let cachedBank: WineBankEntry[] | null = null;

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

function matchScore(queryText: string, entry: WineBankEntry): number {
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

export function lookupWines(wines: { slot: number; fullText: string }[]): Record<string, WineProfile> {
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
          sources: match.entry.tasting_profile.sources || [],
        } : null,
        confidence: match.score >= 0.8 ? "high" : "medium",
        source_method: "bank_lookup",
        enriched_at: new Date().toISOString(),
        structural_tags: match.entry.structure_tags,
        style_category: match.entry.style_category,
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
