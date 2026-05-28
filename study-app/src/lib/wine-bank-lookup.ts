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
  source_method: "bank_lookup" | "llm_enrichment" | "none";
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

function tokenScore(query: string, target: string): number {
  const qTokens = new Set(query.split(" ").filter(t => t.length > 2));
  const tTokens = new Set(target.split(" ").filter(t => t.length > 2));
  if (qTokens.size === 0 || tTokens.size === 0) return 0;
  let hits = 0;
  for (const t of tTokens) {
    for (const q of qTokens) {
      if (q.includes(t) || t.includes(q)) { hits++; break; }
    }
  }
  return hits / Math.max(tTokens.size, 1);
}

export function lookupWine(fullText: string): { entry: WineBankEntry; score: number } | null {
  const bank = loadBank();
  if (bank.length === 0) return null;

  const query = normalize(fullText);
  let bestMatch: WineBankEntry | null = null;
  let bestScore = 0;

  for (const entry of bank) {
    const target = normalize(`${entry.producer} ${entry.wine_name}`);
    const score = tokenScore(query, target);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  if (bestScore >= 0.5 && bestMatch) {
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
