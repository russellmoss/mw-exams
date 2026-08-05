// countryTargets.ts — the historical "shape" of the exam by country of origin.
//
// A static, normalized target distribution of exam wines by country, recomputed directly from the
// 14-year exam corpus (data/historical_wine_classification.json, 2011–2025) rather than estimated.
// Each country's share is a BLENDED figure: 70% weight on the full 14-year corpus + 30% weight on
// the last five exam years, giving a modest recent pull without letting one atypical year distort an
// otherwise stable distribution. Countries whose blended share falls below 1.5% are folded into a
// single "Other" bucket for DISPLAY only — the generation-time steer may still name them.
//
// Nothing here is candidate-facing. It backs the always-on Country Balance steer over bank
// generation and the admin readout on /admin/bank-health. No admin controls, no manual action.

export interface CountryTarget {
  country: string;
  targetPct: number;
}

// Ordered by target share descending. Recomputed from the corpus with the blend above; source-country
// aliases were canonicalised first (California → USA; Bordeaux / South West France → France) and the
// small "source needed" rows (no recorded origin) excluded from the denominator. The residual under
// 1.5% collapses into "Other".
export const COUNTRY_TARGETS: readonly CountryTarget[] = [
  { country: "France", targetPct: 33.5 },
  { country: "Italy", targetPct: 11.5 },
  { country: "Spain", targetPct: 8.4 },
  { country: "Australia", targetPct: 8.0 },
  { country: "USA", targetPct: 7.7 },
  { country: "New Zealand", targetPct: 5.4 },
  { country: "Portugal", targetPct: 5.4 },
  { country: "Germany", targetPct: 4.9 },
  { country: "South Africa", targetPct: 3.7 },
  { country: "Austria", targetPct: 2.9 },
  { country: "Argentina", targetPct: 2.7 },
  { country: "Chile", targetPct: 2.2 },
  { country: "Hungary", targetPct: 1.5 },
] as const;

// The countries the balance tracks by name (spec §1: France, Italy, Spain, Germany, USA, Australia,
// Portugal, New Zealand, Argentina, Chile, Austria, South Africa — plus corpus-grounded Hungary).
// Derived from COUNTRY_TARGETS so the named set and the target table stay a single source of truth;
// every other origin the bank carries buckets into "Other".
export const TRACKED_COUNTRIES: readonly string[] = COUNTRY_TARGETS.map((t) => t.country);

// User-visible label for the collapsed tail — the only place the tail is ever surfaced.
export const OTHER_COUNTRY_LABEL = "Other";

// The share the "Other" bucket carries (100% − the named countries above). Used only for the admin
// readout's completeness, never as a steer target.
export const OTHER_TARGET_PCT =
  Math.round((100 - COUNTRY_TARGETS.reduce((s, t) => s + t.targetPct, 0)) * 10) / 10;

// The countries the steer/readout knows by name, lower-cased for lookup.
const CANONICAL = new Map<string, string>(COUNTRY_TARGETS.map((t) => [t.country.toLowerCase(), t.country]));

// Common raw-country aliases seen in stored wine rows → the canonical name used in COUNTRY_TARGETS.
// Keeps the read-time bank tally aligned with the corpus-derived targets (which were canonicalised
// the same way). Anything not resolvable to a named target flows into "Other".
const ALIASES: Record<string, string> = {
  "usa": "USA",
  "u.s.a.": "USA",
  "us": "USA",
  "u.s.": "USA",
  "united states": "USA",
  "united states of america": "USA",
  "america": "USA",
  "california": "USA",
  "oregon": "USA",
  "washington": "USA",
  "new york": "USA",
  "uk": "United Kingdom",
  "england": "United Kingdom",
  "great britain": "United Kingdom",
  "deutschland": "Germany",
  "österreich": "Austria",
  "espana": "Spain",
  "españa": "Spain",
  "italia": "Italy",
  "aotearoa": "New Zealand",
  "south africa (rsa)": "South Africa",
};

/**
 * Canonicalise a raw stored country string to the name space COUNTRY_TARGETS uses. Trims, resolves
 * known aliases and sub-national origins (California → USA), and title-cases anything unrecognised so
 * it tallies consistently. Returns null for an empty/unusable value.
 */
export function canonicalCountry(raw: string | null | undefined): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (CANONICAL.has(lower)) return CANONICAL.get(lower)!;
  if (ALIASES[lower]) return ALIASES[lower];
  // Title-case an unknown so "new zealand" and "New Zealand" don't split into two buckets.
  return t.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Target share for a canonical country, or 0 when it isn't a named target (part of the tail).
export function targetPctFor(country: string): number {
  return COUNTRY_TARGETS.find((t) => t.country === country)?.targetPct ?? 0;
}
