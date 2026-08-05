// country-balance.ts — the always-on country-diversity read over the live question bank.
//
// Counts the keyed country of every WINE in the served-eligible (kept, non-binned, non-retired) pool
// — a 4-wine question contributes 4 data points — and compares each country's share against the
// corpus-derived historical target (lib/countryTargets.ts). It powers two things:
//   • the admin readout ("Country Balance" card on /admin/bank-health), and
//   • a soft, generation-time steer: the top few countries the bank is LIGHT on are named in the LLM
//     prompt as a gentle preference. It is NEVER a validator rule — the hard R1 country-diversity /
//     R2 same-variety / 25-marks-per-wine rules are untouched and take precedence, and nothing here
//     ever rejects or retries a question.
//
// Read at request/generation time from the same stored wine JSON the candidate sees; memoised for 60s
// so polling never re-scans. No schema, no migration.

import { getKeptBankLite } from "@/lib/db";
import { parseWines } from "./derive";
import {
  COUNTRY_TARGETS,
  OTHER_COUNTRY_LABEL,
  OTHER_TARGET_PCT,
  canonicalCountry,
} from "@/lib/countryTargets";

// A country is "on track" within ±this many points of its target; beyond it is light (below) or
// heavy (above).
export const BALANCE_TOLERANCE_PTS = 4;
// Below this many keyed wines the bank is too small to read a distribution from.
export const MIN_WINES_FOR_BALANCE = 40;

export type BalanceStatus = "on_track" | "light" | "heavy";

export interface CountryBalanceRow {
  country: string;
  bankPct: number;
  targetPct: number;
  deltaPts: number;
  status: BalanceStatus;
}

export interface CountryBalance {
  insufficient: boolean;
  totalWines: number;
  rows: CountryBalanceRow[];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function statusFor(deltaPts: number): BalanceStatus {
  if (deltaPts < -BALANCE_TOLERANCE_PTS) return "light";
  if (deltaPts > BALANCE_TOLERANCE_PTS) return "heavy";
  return "on_track";
}

/**
 * Compute the live bank's country mix against the historical targets, WITHOUT the 60s cache. Counts
 * per wine across the whole served-eligible pool (all papers). Emits one row per NAMED target (share
 * ≥ 1.5%, spec §1) — sorted by target share descending — plus a single "Other" row aggregating every
 * sub-threshold / off-corpus origin, so the display never sprawls into a long tail. When the pool has
 * fewer than MIN_WINES_FOR_BALANCE keyed wines the distribution is unreadable and
 * { insufficient: true } is returned.
 */
export async function computeCountryBalanceUncached(): Promise<CountryBalance> {
  const lite = await getKeptBankLite(null);

  const counts = new Map<string, number>();
  let total = 0;
  for (const row of lite) {
    for (const w of parseWines(row.wines)) {
      const country = canonicalCountry(w.country) || canonicalCountry(extractCountry(w.fullText));
      if (!country) continue;
      counts.set(country, (counts.get(country) || 0) + 1);
      total += 1;
    }
  }

  if (total < MIN_WINES_FOR_BALANCE) {
    return { insufficient: true, totalWines: total, rows: [] };
  }

  const named = new Set<string>(COUNTRY_TARGETS.map((t) => t.country));
  const toRow = (country: string, count: number, targetPct: number): CountryBalanceRow => {
    const bankPct = round1((count / total) * 100);
    const deltaPts = round1(bankPct - targetPct);
    return { country, bankPct, targetPct, deltaPts, status: statusFor(deltaPts) };
  };

  // One row per named target, already in target-descending order.
  const rows: CountryBalanceRow[] = COUNTRY_TARGETS.map((t) =>
    toRow(t.country, counts.get(t.country) || 0, t.targetPct)
  );

  // Everything the bank carries that isn't a named target collapses into a single "Other" row (spec
  // §1: display only). Always shown so the readout stays complete.
  let otherCount = 0;
  for (const [country, n] of counts) if (!named.has(country)) otherCount += n;
  rows.push(toRow(OTHER_COUNTRY_LABEL, otherCount, OTHER_TARGET_PCT));

  return { insufficient: false, totalWines: total, rows };
}

// A last-ditch country read off the verbatim descriptor when the stored wine row has no country
// column (older bank items). Matches a trailing ", <Country>" the descriptors consistently carry
// ("… Alsace, France (12.5%)"); returns null when nothing named is found.
const TEXT_COUNTRY =
  /\b(france|italy|spain|australia|usa|united states|u\.s\.a\.|california|oregon|washington|new zealand|portugal|germany|south africa|austria|argentina|chile|hungary|greece|canada|georgia|uruguay|england|united kingdom)\b/i;
function extractCountry(fullText: string | null | undefined): string | null {
  if (!fullText) return null;
  const m = TEXT_COUNTRY.exec(fullText);
  return m ? m[1] : null;
}

// ── The light-country steer ────────────────────────────────────────────────────────────────────

/**
 * The countries the next batch should lean toward: the LIGHT rows, most-deficient first, capped at
 * `limit` (default 3). Empty when the read is insufficient or nothing is light.
 */
export function leaningToward(balance: CountryBalance, limit = 3): string[] {
  if (balance.insufficient) return [];
  return balance.rows
    .filter((r) => r.status === "light")
    .sort((a, b) => a.deltaPts - b.deltaPts)
    .slice(0, limit)
    .map((r) => r.country);
}

// "Italy, Germany and Portugal" — Oxford-free, human list join.
export function joinCountries(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The soft prompt clause injected on the bank-generation path when the bank is light on one or more
 * countries. Returns null when there is nothing to steer (insufficient read or nothing light), in
 * which case nothing is injected.
 */
export function buildCountryNudge(balance: CountryBalance): string | null {
  const light = leaningToward(balance, 3);
  if (light.length === 0) return null;
  const list = joinCountries(light);
  return (
    `\n\nBank balance note: the question bank is currently light on ${list} relative to historical ` +
    `exam distribution. Where a wine of comparable exam realism and quality is available from these ` +
    `origins, prefer it. This is a soft preference only — never force an implausible wine, never ` +
    `violate stem constraints, and never override country-diversity or same-variety validator rules.`
  );
}

// ── API payload ──────────────────────────────────────────────────────────────────────────────
export interface CountryBalancePayload {
  insufficient: boolean;
  totalWines: number;
  rows: { country: string; bankPct: number; targetPct: number; status: BalanceStatus }[];
  leaningToward: string[];
}

// The Bank Health API shape (drops the internal deltaPts, adds the light-country steer list). Rows
// stay sorted by target share descending, as computeCountryBalance leaves them.
export function toCountryBalancePayload(balance: CountryBalance): CountryBalancePayload {
  return {
    insufficient: balance.insufficient,
    totalWines: balance.totalWines,
    rows: balance.rows.map((r) => ({
      country: r.country,
      bankPct: r.bankPct,
      targetPct: r.targetPct,
      status: r.status,
    })),
    leaningToward: leaningToward(balance),
  };
}

// ── 60s in-memory cache ────────────────────────────────────────────────────────────────────────
let cached: { at: number; balance: CountryBalance } | null = null;
const CACHE_MS = 60_000;

/** computeCountryBalanceUncached memoised for 60s so polling / every generation never re-scans. */
export async function computeCountryBalance(): Promise<CountryBalance> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.balance;
  const balance = await computeCountryBalanceUncached();
  cached = { at: now, balance };
  return balance;
}
