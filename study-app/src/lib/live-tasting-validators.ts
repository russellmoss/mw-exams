/**
 * Live Tasting's pinned-flight validators (live_tasting_plan.md §4.1).
 *
 * The generator is handed a FIXED, availability-confirmed wine list; these two checks are what
 * makes that trustworthy:
 *
 *  - validatePinnedFlight: the draft's wine slots are exactly the pinned wines — no substitution,
 *    no reorder, no invention. Pinning pushes the model to "improve" the flight; a swapped wine
 *    would silently desynchronize the question from the bottles the user is about to buy.
 *  - validateBlindSafety: the question stem must not leak the identity the candidate is meant to
 *    deduce — producer names and cuvée names are the giveaways. Accent-normalized comparison,
 *    because "Cote-Rotie" vs "Côte-Rôtie" is exactly the bug class that has bitten this codebase
 *    before (ASCII regex vs accented label).
 *
 * Both are HARD checks: any entry in the engine's `checks` map that is not in ADVISORY_RULES
 * fails the attempt.
 */

export type PinnedWine = { slot: number; fullText: string };

function fold(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Words that appear in producer/cuvée names but identify nothing by themselves. Blind-safety must
// not fire because a stem contains "estate" or "reserve", and pinned-match must not pass because
// "domaine" matched "domaine".
const GENERIC_TOKENS = new Set([
  "domaine", "chateau", "weingut", "bodega", "bodegas", "cantina", "tenuta", "azienda", "agricola",
  "estate", "estates", "winery", "cellars", "cellar", "vineyard", "vineyards", "vintners", "wines",
  "reserve", "reserva", "riserva", "gran", "grand", "cru", "premier", "vieilles", "vignes",
  "the", "de", "la", "le", "les", "du", "des", "di", "da", "der", "den", "von", "van", "dr", "el",
  "and", "of", "co", "et", "y", "old", "vine", "vines", "blanc", "rouge", "brut", "sec", "dry",
]);

function distinctiveTokens(s: string): string[] {
  return fold(s)
    .split(" ")
    .filter((t) => t.length >= 3 && !GENERIC_TOKENS.has(t) && !/^\d+$/.test(t));
}

/**
 * "Producer, cuvée. Region, Country." → { producer, cuvee }.
 *
 * The head/origin separator is the LAST ". " in the reference (after stripping any trailing ABV
 * parenthetical) — splitting on the FIRST "." would break every producer with an initial
 * ("E. Guigal" → producer "E"), which is exactly the kind of wine this feature pins.
 */
export function splitPinnedReference(fullText: string): { producer: string; cuvee: string } {
  const trimmed = (fullText || "").trim().replace(/\s*\([^)]*\)\s*$/, "");
  const lastSep = trimmed.lastIndexOf(". ");
  const head = (lastSep > 0 ? trimmed.slice(0, lastSep) : trimmed.replace(/\.$/, "")).trim();
  const commaIdx = head.indexOf(",");
  return {
    producer: commaIdx > 0 ? head.slice(0, commaIdx).trim() : head,
    cuvee: commaIdx > 0 ? head.slice(commaIdx + 1).trim() : "",
  };
}

export function validatePinnedFlight(
  pinned: PinnedWine[],
  wines: { slot: number; fullText: string }[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  if (wines.length !== pinned.length) {
    violations.push(`pinned flight has ${pinned.length} wines but the draft has ${wines.length}`);
    return { valid: false, violations };
  }
  for (const p of pinned) {
    const w = wines.find((x) => x.slot === p.slot);
    if (!w) {
      violations.push(`pinned slot ${p.slot} is missing from the draft`);
      continue;
    }
    const wantTokens = distinctiveTokens(splitPinnedReference(p.fullText).producer);
    const got = ` ${fold(w.fullText)} `;
    // The producer is the identity anchor: every distinctive producer token must survive into the
    // draft's slot text. (Cuvée wording is allowed to flex — "Brut NV" vs "Brut" — but a swapped
    // producer is a swapped wine.)
    const missing = wantTokens.filter((t) => !got.includes(` ${t} `));
    if (wantTokens.length > 0 && missing.length > 0) {
      violations.push(
        `slot ${p.slot}: draft wine "${w.fullText.slice(0, 80)}" does not match pinned "${p.fullText.slice(0, 80)}" (missing: ${missing.join(", ")})`
      );
    }
  }
  return { valid: violations.length === 0, violations };
}

export function validateBlindSafety(
  questionText: string,
  pinned: PinnedWine[]
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const stem = ` ${fold(questionText)} `;
  for (const p of pinned) {
    const { producer, cuvee } = splitPinnedReference(p.fullText);
    for (const [label, source] of [["producer", producer], ["cuvée", cuvee]] as const) {
      for (const token of distinctiveTokens(source)) {
        if (stem.includes(` ${token} `)) {
          violations.push(`question stem leaks slot ${p.slot}'s ${label}: "${token}"`);
        }
      }
    }
  }
  return { valid: violations.length === 0, violations };
}
