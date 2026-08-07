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
  "estate", "estates", "winery", "cellars", "cellar", "vineyard", "vineyards", "vintners", "wine", "wines", "wein", "vin", "vino", "vina",
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

/**
 * Mark-structure realism as a HARD check, calibrated against the REAL 2023-24 corpus (not the QA
 * judge's claims — round 7 proved the judge hallucinates conventions the corpus contradicts).
 * Ground truth (data/exams.json, 2023-24 P3):
 *   - Per-wine sub-questions use multiplier notation with EQUAL marks per wine: "(4 x 13 marks)",
 *     "(3 x 10 marks)", "(5 x 2 marks)". Largest observed per-wine block: 15.
 *   - Pooled sub-questions take one total, largest observed: 30 ("(30 marks)", 2024 P3 Q3a).
 *   - Irregularity lives BETWEEN sub-parts (a=13, b=10, c=2 per wine), never between wines.
 *
 * `totalMarks` (wines × 25) is exempted so a stem's total header doesn't false-positive.
 */
export function validateMarkRealism(
  questionText: string,
  totalMarks: number,
  paper?: number
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const text = questionText || "";
  // Bands are PER PAPER — the original numbers were read off Paper 3 alone and would reject real
  // Paper 1 structures (2023 P1 Q3a pools 40 marks; 2023 P1 Q1c allocates "2 x 25" per pair).
  const pooledCap = paper === 3 ? 30 : 40;
  const perUnitCap = 25;
  if (/\d+\s*marks?\s+each\b/i.test(text)) {
    violations.push("'N marks each' phrasing — real papers write multiplier notation '(3 x N marks)'");
  }
  for (const m of text.matchAll(/\(\s*\d+\s*(?:x|×)\s*(\d+)\s*marks?\s*\)/gi)) {
    const per = parseInt(m[1], 10);
    if (per > perUnitCap) violations.push(`a ${per}-mark per-wine block — real per-wine blocks cap at ${perUnitCap} marks`);
  }
  for (const m of text.matchAll(/\(\s*(\d+)\s*marks?\s*\)/gi)) {
    const val = parseInt(m[1], 10);
    if (val > pooledCap && val !== totalMarks) {
      violations.push(`a single ${val}-mark sub-question — real pooled sub-questions cap at ${pooledCap} marks on Paper ${paper ?? "?"}`);
    }
  }
  // Micro-state technical tasks (residual sugar, alcohol) are a Paper 3 convention and appear in
  // NO Paper 1/2 question in the corpus — round 12 caught the generator using them on both.
  if (paper !== 3 && /(residual sugar|alcohol level|level of alcohol)/i.test(text)) {
    violations.push(`a residual-sugar/alcohol micro-state task on Paper ${paper} — those appear only on Paper 3`);
  }
  // Micro-state tasks use the corpus's bare phrasing; the QA judge rejected "to the nearest 10 g/L"
  // as an invented precision the real papers never ask for.
  if (/residual sugar[^.\n]*\b(nearest|g\/l|grams per)/i.test(text)) {
    violations.push('a residual-sugar task asking for a numeric precision — real papers write "State the residual sugar."');
  }
  // Pooled marks SCALE WITH WINE COUNT — they are not an absolute band. Measured across the four
  // corpus years the QA judge is shown (2023-26): pooled identification runs 4-8 marks per wine
  // (2025 P1 Q1a 10/2, 2025 P2 Q1a 12/3, 2023 P3 Q4a 18/3, 2024 P2 Q3a 25/5), rising to ~10/wine
  // only when the same sub-question also carries commentary (2024 P3 Q3a 30/3 "identify … and
  // comment on commercial opportunities"). Other pooled tasks reach 10/wine (2024 P3 Q1b 20/2).
  //
  // An earlier absolute floor of 14-15 marks here was itself a bad fix — read off a single noisy
  // judge finding, it forced 2-wine flights into 15-30 mark pooled tasks and made Paper 2 fail
  // every round until the loop exposed it.
  const wines = Math.max(1, Math.round(totalMarks / 25));
  for (const line of text.split(/\n/)) {
    const pooled = line.match(/\(\s*(\d+)\s*marks?\s*\)/i);
    if (!pooled || /(?:x|×)\s*\d+\s*marks?/i.test(line)) continue;
    const val = parseInt(pooled[1], 10);
    if (val === totalMarks) continue;
    const per = val / wines;
    const isId = /identif/i.test(line);
    const alsoComments = /(comment|discuss|compare|contrast|quality|commercial|style|winemaking|production)/i.test(line);
    const ceiling = isId ? (alsoComments ? 10 : 8) : 10;
    const floor = isId ? 4 : 0;
    if (per > ceiling) {
      violations.push(
        `pooled task "${line.trim().slice(0, 50)}" is ${val} marks for ${wines} wines (${per.toFixed(1)}/wine) — real pooled tasks stay at or below ${ceiling}/wine`
      );
    } else if (isId && per < floor) {
      violations.push(
        `pooled identification "${line.trim().slice(0, 50)}" is ${val} marks for ${wines} wines (${per.toFixed(1)}/wine) — real pooled identification runs 4-8/wine`
      );
    }
  }
  // The per-wine 5-mark floor for commentary tasks is NOT duplicated here — validateMarkBudget
  // (question-validator.ts) already owns it, and now runs in pinned generation too.
  return { valid: violations.length === 0, violations };
}

/**
 * Shared-attribute identification must be POOLED (paper-QA round 13, the only finding that
 * repeated across rounds): when every wine in the flight shares a variety/origin, real papers ask
 * for that attribute ONCE for the whole flight — "With reference to all four wines: a) Identify
 * the grape variety. (16 marks)" (2025 P1 Q2a; also 2024 P2 Q1a, 2024 P2 Q3a, 2023 P3 Q4a) —
 * never per-wine, which would pay the candidate N times for one deduction.
 *
 * `flightTheme` is the archetype's organizing fact, already threaded into the prompt.
 */
export function validateSharedAttributePooling(
  questionText: string,
  flightTheme: string | null | undefined
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const theme = (flightTheme || "").toLowerCase();
  const text = questionText || "";
  const shared: { label: string; re: RegExp }[] = [];
  if (/same single grape variety|same grape variety/.test(theme)) {
    shared.push({ label: "grape variety", re: /identif\w*[^.\n]*\b(grape\s+)?variet/i });
  }
  // Shared ORIGIN is deliberately NOT enforced: real papers do it both ways — 2023 P1 Q3a pools
  // "Name the country and the three grape varieties" across four wines, while 2022 P1 Q2/Q3 ask
  // per-wine identification of same-country flights. Forcing the pooled form produced pooled
  // "identify the country" stems the judge rejected (round 14, Paper 2). Only a shared VARIETY
  // has unambiguous, repeated corpus support for pooling.
  for (const { label, re } of shared) {
    for (const line of text.split(/\n/)) {
      if (!re.test(line)) continue;
      // Multiplier notation on the shared attribute = asked per wine.
      if (/\(\s*\d+\s*(?:x|×)\s*\d+\s*marks?\s*\)/i.test(line)) {
        violations.push(
          `the flight shares its ${label}, but "${line.trim().slice(0, 70)}" asks for it per wine — real papers pool a shared attribute into one sub-question`
        );
      }
    }
  }
  return { valid: violations.length === 0, violations };
}

/**
 * Anti-clone check for full papers: two questions in one paper must not share a mark skeleton.
 * The prompt has asked for varied scaffolds since round 5 and the model still cloned Q1 into Q3
 * (round 13, Paper 2) — so the structure is compared deterministically instead.
 */
export function validateScaffoldNovelty(
  questionText: string,
  priorStems: string | null | undefined
): { valid: boolean; violations: string[] } {
  const signature = (s: string) =>
    [...(s || "").matchAll(/\(\s*(\d+\s*(?:x|×)\s*)?(\d+)\s*marks?\s*\)/gi)]
      .map((m) => `${m[1] ? "N*" : ""}${m[2]}`)
      .join("|");
  const mine = signature(questionText);
  if (!mine || !priorStems) return { valid: true, violations: [] };
  const violations: string[] = [];
  for (const block of priorStems.split(/\n(?=Q\d+:)/)) {
    if (!/^Q\d+:/.test(block.trim())) continue;
    if (signature(block) === mine) {
      violations.push(`this question's mark skeleton (${mine}) is identical to ${block.trim().slice(0, 12)} — real papers differentiate every question`);
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
