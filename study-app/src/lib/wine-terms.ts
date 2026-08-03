import { readFileSync } from "fs";
import { join } from "path";

/**
 * The wine vocabulary used to repair dictated answers: varieties, regions and styles.
 *
 * Reuses `public/data/stem-autocomplete.json` — the same list that backs the Stem Sniper answer
 * autocomplete — so there is one vocabulary to maintain rather than two that can drift apart.
 * Cached per process; the file is generated at build time and never changes at runtime.
 */
let cached: string[] | null = null;

export function loadWineTerms(): string[] {
  if (cached) return cached;
  try {
    const filePath = join(process.cwd(), "public", "data", "stem-autocomplete.json");
    const data = JSON.parse(readFileSync(filePath, "utf-8")) as {
      varieties?: string[];
      regions?: string[];
      styles?: string[];
    };
    const all = [...(data.varieties ?? []), ...(data.regions ?? []), ...(data.styles ?? [])];
    // De-duplicate case-insensitively, keeping the first (canonical) spelling.
    const seen = new Set<string>();
    cached = all.filter((t) => {
      const k = t.trim().toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  } catch {
    // Missing/unreadable vocabulary must not break grading — normalisation just becomes a no-op.
    cached = [];
  }
  return cached;
}
