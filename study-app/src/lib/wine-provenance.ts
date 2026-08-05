/**
 * Wine source provenance — types and PURE helpers, with no Node imports.
 *
 * Split out of wine-bank-lookup.ts because that module reads the seed bank off disk (`fs`) and opens
 * a Neon client, so anything importing it is server-only. WineReveal is a client component and needs
 * `describeSource` to render citations; pulling it from wine-bank-lookup put `fs` in the browser
 * bundle and broke the production build (Turbopack: "Can't resolve 'fs'"). Typecheck and the unit
 * tests both passed, because neither bundles for the browser — so this file is the boundary.
 *
 * Keep it dependency-free. wine-bank-lookup re-exports everything here, so server callers are
 * unaffected by the split.
 */

// Where a tasting claim came from, in the order we prefer to believe it. A producer/importer
// technical sheet is the best evidence available: it carries the analysis (pH, abv, blend), the
// winemaking, the producer's own note, and — on importer sheets — a dozen attributed critic reviews
// in one document. A named critic note is next. Generic web is the fallback we used to run on
// exclusively.
export type SourceType = "tech_sheet" | "critic" | "web";

export interface WineSource {
  url: string;
  type: SourceType;
  /** "Vinous", "Wine Advocate", "Château Mouton Rothschild" */
  publisher?: string;
  /** "Neal Martin" — present when a note is signed, which critic sheets usually are. */
  author?: string;
  title?: string;
}

/**
 * Per-field provenance: grid field name -> indices into the profile's `sources` array.
 * An EMPTY array means the value was inferred from model knowledge rather than read from a source —
 * that distinction is the whole point, so an inferred field must never be silently dropped from the
 * map. Absent key = unknown provenance (a legacy row written before citations existed).
 */
export type GridCitations = Record<string, number[]>;

/**
 * Sources were originally stored as bare URL strings and hundreds of banked rows still are. Every
 * read goes through here so old and new rows present identically to callers.
 */
export function normalizeSources(raw: unknown): WineSource[] {
  if (!Array.isArray(raw)) return [];
  const out: WineSource[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      if (item.trim()) out.push({ url: item.trim(), type: "web" });
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const url = typeof o.url === "string" ? o.url.trim() : "";
      if (!url) continue;
      const type = o.type === "tech_sheet" || o.type === "critic" ? o.type : "web";
      out.push({
        url,
        type,
        publisher: typeof o.publisher === "string" ? o.publisher : undefined,
        author: typeof o.author === "string" ? o.author : undefined,
        title: typeof o.title === "string" ? o.title : undefined,
      });
    }
  }
  return out;
}

/**
 * Best tier present in a source list. Used for rows banked before evidence_tier was stored, so a
 * cached wine still reports how well evidenced it is instead of showing a blank.
 */
export function tierFromSources(sources: WineSource[]): SourceType | "inferred" {
  if (sources.some((s) => s.type === "tech_sheet")) return "tech_sheet";
  if (sources.some((s) => s.type === "critic")) return "critic";
  return sources.length ? "web" : "inferred";
}

/** Human-readable attribution for display: "Neal Martin, Vinous" / "Tech sheet — Elite Wines". */
export function describeSource(s: WineSource): string {
  const who = [s.author, s.publisher].filter(Boolean).join(", ");
  if (s.type === "tech_sheet") return who ? `Tech sheet — ${who}` : "Tech sheet";
  if (who) return who;
  try {
    return new URL(s.url).hostname.replace(/^www\./, "");
  } catch {
    return s.url;
  }
}

/**
 * The candidate-safe provenance summary for one wine: where the reference profile behind its tasting
 * note came from, and how much of that profile was actually sourced rather than inferred.
 *
 * Contains NO sensory values and no wine identity of its own — but the URLs name the château, so this
 * is post-answer material only. See the `showSources` gate in WineReveal.
 */
export interface WineProvenance {
  slot: number;
  evidence_tier?: SourceType | "inferred";
  confidence?: string;
  sources: WineSource[];
  /** Grid fields backed by at least one document, out of those whose provenance is known. */
  sourcedFields: number;
  totalFields: number;
}

/**
 * Typed structurally rather than against WineProfile so this file imports nothing. WineProfile
 * satisfies it.
 */
export type ProvenanceInput = {
  evidence_tier?: SourceType | "inferred";
  confidence?: string;
  tasting_profile?: { sources?: unknown; citations?: GridCitations } | null;
};

export function buildProvenance(slot: number, profile: ProvenanceInput | undefined): WineProvenance {
  const sources = normalizeSources(profile?.tasting_profile?.sources);
  const citations = profile?.tasting_profile?.citations ?? {};
  const entries = Object.values(citations);
  return {
    slot,
    evidence_tier: profile?.evidence_tier ?? (sources.length ? tierFromSources(sources) : undefined),
    confidence: profile?.confidence,
    sources,
    sourcedFields: entries.filter((refs) => refs.length > 0).length,
    totalFields: entries.length,
  };
}
