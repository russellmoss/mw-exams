// producer.ts — the "Producer Spread" primitives: extract a producer from a stored wine descriptor,
// normalise it to a stable key, and score how heavily a producer leans on the bank.
//
// Two callers share this module so the numbers always agree:
//   1. src/lib/db.ts — stamps bank_wine_producer rows on every banked insert and computes the pending
//      item's producer_flags, using extractFlightProducers + normaliseProducer + producerStatus.
//   2. the Producer Spread endpoint / generation nudge — statuses and labels come from here too.
//
// Keep normaliseProducer() byte-for-byte in step with the bank_producer_key() SQL function in
// migration 032, which backfills the historical rows; a drift between the two would split one
// producer into two keys.

// ── Over-used rule config (edit here) ──────────────────────────────────────────────────────────────
// A producer is 'over-used' when it clears BOTH a floor count AND a share of the paper's banked wines,
// so a tiny bank can't flag a producer that has simply appeared a handful of times. 'watch' is a
// heads-up band shown in the UI but never flagged. Everything else is 'ok'.
export const PRODUCER_MIN_COUNT = 5; // appearances needed before over-use is even possible
export const PRODUCER_OVERUSE_SHARE = 0.04; // AND its share of the paper's banked wines must exceed this
export const PRODUCER_WATCH_MIN = 3; // inclusive lower bound of the 'watch' band
export const PRODUCER_WATCH_MAX = 4; // inclusive upper bound of the 'watch' band

// Below this many banked wines for a paper, the generation nudge stays silent — the spread signal is
// too noisy to steer on. (Spec §2.)
export const PRODUCER_NUDGE_MIN_WINES = 40;

// How many producer keys the generation nudge lists, and how many top rows the endpoint returns before
// the "Show all producers" expand.
export const PRODUCER_NUDGE_TOP = 25;
export const PRODUCER_ROWS_LIMIT = 12;

export type ProducerStatus = "over-used" | "watch" | "ok";

// The over-used / watch / ok decision. `count` is the producer's appearance count; `share` is that
// count over the paper's banked-wine total (0..1).
export function producerStatus(count: number, share: number): ProducerStatus {
  if (count >= PRODUCER_MIN_COUNT && share > PRODUCER_OVERUSE_SHARE) return "over-used";
  if (count >= PRODUCER_WATCH_MIN && count <= PRODUCER_WATCH_MAX) return "watch";
  return "ok";
}

// Leading house articles stripped from the key so "Domaine Weinbach" and "Weinbach" collapse to one
// producer. Mirrors the SQL in migration 032. Kept to the spec's list.
const LEADING_ARTICLE = /^(domaine|chateau|ch\.|bodegas|weingut|dom\.)\s+/;
// Trailing family/company suffixes ("Trimbach & Fils" → "Trimbach").
const TRAILING_SUFFIX = /\s*(&\s*fils|&\s*co|et\s+fils)\s*$/;

/**
 * Normalise a raw producer string to a stable comparison key: strip diacritics, lowercase, drop a
 * leading house article and a trailing "& fils / & co / et fils", then collapse all punctuation and
 * whitespace to single spaces. Returns "" for empty input.
 *
 * MUST match bank_producer_key() in migration 032.
 */
export function normaliseProducer(raw: string): string {
  if (!raw) return "";
  let s = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // combining diacritics (à→a, ç→c, ñ→n …)
    .toLowerCase()
    .trim();
  s = s.replace(LEADING_ARTICLE, "");
  s = s.replace(TRAILING_SUFFIX, "");
  s = s.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

// A stored wine payload, loosely typed — we only read the descriptor and the enriched place fields.
interface WineLike {
  slot?: number;
  fullText?: string;
  region?: string | null;
  country?: string | null;
}

// The head segment of a wine descriptor is its producer. fullText is authored as
// `Producer, Cuvée, Vintage. Region, Country. (ABV%)` (see question-generation-prompt.ts), so the
// text before the first comma is the producer's raw display spelling. Returns null when there is no
// usable head (empty, or implausibly long — a malformed descriptor with no comma).
export function extractProducerDisplay(fullText: string | undefined | null): string | null {
  if (!fullText) return null;
  const head = fullText.split(",")[0].trim();
  if (!head || head.length > 60) return null;
  return head;
}

export interface FlightProducer {
  slot: number;
  key: string;
  display: string;
  region: string | null;
  country: string | null;
}

// Per-wine producers for a flight, in slot order. Wines whose descriptor yields no producer (or whose
// normalised key is empty) are skipped, so a malformed row never invents a phantom producer.
export function extractFlightProducers(wines: unknown): FlightProducer[] {
  let list: WineLike[] = [];
  if (typeof wines === "string") {
    try {
      const parsed = JSON.parse(wines);
      if (Array.isArray(parsed)) list = parsed as WineLike[];
    } catch {
      return [];
    }
  } else if (Array.isArray(wines)) {
    list = wines as WineLike[];
  }
  const out: FlightProducer[] = [];
  list.forEach((w, i) => {
    const display = extractProducerDisplay(w?.fullText);
    if (!display) return;
    const key = normaliseProducer(display);
    if (!key) return;
    out.push({
      slot: typeof w?.slot === "number" ? w.slot : i + 1,
      key,
      display,
      region: (w?.region ?? null) || null,
      country: (w?.country ?? null) || null,
    });
  });
  return out;
}

// The flag persisted on a pending item (and read by the review card). One entry per over-used producer
// in the flight.
export interface ProducerFlag {
  producer_display: string;
  appearance_number: number;
  paper: number;
}
