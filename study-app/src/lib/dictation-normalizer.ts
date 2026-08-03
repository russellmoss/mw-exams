/**
 * Repair wine terms that voice-to-text mangled, before the answer reaches the grader.
 *
 * The MW examiners genuinely deduct for blatant or repeated misspellings, so the grader is right to
 * flag them. But a candidate dictating their answer is being marked on their transcription engine,
 * not their knowledge — "Gewürztraminer" comes back as "gewurtz traminer" no matter how well they
 * know the grape. Fixing the INPUT is better than excusing the output: it helps typed answers too,
 * and it keeps the spelling critique meaningful for the errors that are actually the candidate's.
 *
 * The policy is deliberately timid. A wrong "correction" that turned Sémillon into Sauvignon would
 * corrupt the mark far worse than the original typo, so a term is only rewritten when the intended
 * word is UNAMBIGUOUS:
 *   - the span must be close to exactly one known term (ties are left alone);
 *   - short words demand near-exact matches, since one edit can reach many real grapes;
 *   - anything already spelled correctly is never touched.
 */

export interface Substitution {
  from: string;
  to: string;
}

export interface NormalizationResult {
  text: string;
  substitutions: Substitution[];
}

/** Lowercase, strip accents, and drop separators so "Gewürz-traminer" ≈ "gewurztraminer". */
function squash(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Levenshtein distance, bailing out as soon as it exceeds `max` (keeps the n-gram sweep cheap). */
function distanceWithin(a: string, b: string, max: number): number | null {
  if (Math.abs(a.length - b.length) > max) return null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      curr.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return null; // no cell in this row can lead to an acceptable total
    prev = curr;
  }
  const d = prev[b.length];
  return d <= max ? d : null;
}

/**
 * How wrong a span is allowed to be before we stop trusting the match. Short words are held to a
 * tighter standard because a single edit reaches too many real grapes (Syrah/Sirah is fine;
 * one edit from a four-letter term is not).
 */
function tolerance(len: number): number {
  if (len < 5) return 0;
  if (len <= 8) return 1;
  if (len <= 12) return 2;
  return 3;
}

// Terms shorter than this are never fuzzy-matched — too little signal to correct safely.
const MIN_TERM_LENGTH = 5;
// Longest phrase we'll consider as one term ("pedro ximenez", "melon de bourgogne").
const MAX_NGRAM = 3;

/**
 * Rewrite mangled wine terms in `text` using `terms` (varieties, regions, styles) as the vocabulary.
 *
 * Returns the corrected text plus every substitution made, so the change can be DISCLOSED rather
 * than applied silently — the candidate needs to know a term came out wrong even when we fixed it.
 */
export function normalizeDictatedTerms(text: string, terms: readonly string[]): NormalizationResult {
  if (!text?.trim() || !terms?.length) return { text, substitutions: [] };

  // Pre-squash the vocabulary once, and index the exact forms so correct spellings are never touched.
  const vocab = terms
    .map((t) => ({ term: t, key: squash(t) }))
    .filter((t) => t.key.length >= MIN_TERM_LENGTH);
  const exact = new Map(vocab.map((t) => [t.key, t.term]));
  if (!vocab.length) return { text, substitutions: [] };

  const tokenRe = /[\p{L}\p{M}'’-]+/gu;
  const tokens: { text: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(tokenRe)) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }

  const substitutions: Substitution[] = [];
  const edits: { start: number; end: number; to: string }[] = [];

  let i = 0;
  while (i < tokens.length) {
    let applied = false;
    // How far this span may extend: a multi-word term is only ever separated by spaces or hyphens.
    // Without this, "chardonnay, not riesling" would be treated as one 24-character span and
    // fuzzy-matched to "Chardonnay", silently eating the ", not".
    let maxSpan = 1;
    while (
      maxSpan < MAX_NGRAM &&
      i + maxSpan < tokens.length &&
      /^[\s-]*$/.test(text.slice(tokens[i + maxSpan - 1].end, tokens[i + maxSpan].start))
    ) {
      maxSpan++;
    }

    // Longest span first: "melon de bourgogne" should win over "melon".
    for (let n = Math.min(maxSpan, tokens.length - i); n >= 1 && !applied; n--) {
      const span = tokens.slice(i, i + n);
      const raw = text.slice(span[0].start, span[n - 1].end);
      const key = squash(raw);
      if (key.length < MIN_TERM_LENGTH) continue;
      const canonical = exact.get(key);
      if (canonical) {
        // The right word, possibly wearing the wrong accents or spacing ("gruner veltliner",
        // "Cotes du Rhone") — dictation strips those constantly. Restore the canonical form, but
        // treat a pure capitalisation difference as already correct: rewriting "chardonnay" to
        // "Chardonnay" is noise, not a repair, and would clutter the disclosure list.
        if (raw.toLowerCase() !== canonical.toLowerCase()) {
          edits.push({ start: span[0].start, end: span[n - 1].end, to: canonical });
          substitutions.push({ from: raw, to: canonical });
        }
        // Consume either way, so a sub-token can't be "corrected" out from under a correct term.
        i += n;
        applied = true;
        break;
      }

      let best: { term: string; d: number } | null = null;
      let tied = false;
      for (const cand of vocab) {
        // Size the tolerance to the SHORTER of the two strings. Judging by the span alone lets a
        // long span absorb an extra word ("chardonnay not" → "Chardonnay" at distance 3); the
        // shorter string is the honest measure of how much of the word actually matched.
        const max = tolerance(Math.min(key.length, cand.key.length));
        if (max === 0) continue;
        const d = distanceWithin(key, cand.key, max);
        if (d === null || d === 0) continue;
        if (!best || d < best.d) {
          best = { term: cand.term, d };
          tied = false;
        } else if (d === best.d && squash(cand.term) !== squash(best.term)) {
          tied = true; // two different real terms are equally close — refuse to guess
        }
      }

      if (best && !tied) {
        edits.push({ start: span[0].start, end: span[n - 1].end, to: best.term });
        substitutions.push({ from: raw, to: best.term });
        i += n;
        applied = true;
      }
    }
    if (!applied) i += 1;
  }

  if (!edits.length) return { text, substitutions: [] };

  let out = "";
  let cursor = 0;
  for (const e of edits) {
    out += text.slice(cursor, e.start) + e.to;
    cursor = e.end;
  }
  out += text.slice(cursor);

  return { text: out, substitutions };
}
