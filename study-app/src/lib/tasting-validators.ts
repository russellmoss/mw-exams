// tasting-validators.ts — the source of truth for tasting-NOTE sanity, shared by every tool that
// shows tasting notes (study page reveal + Reverse Tasting Layer-B), the same way question-engine's
// validator suite is the source of truth for question STRUCTURE. The shared tasting generator
// (src/lib/tasting.ts) runs these and regenerates on failure, so a bad note (e.g. a red-coloured
// description for a white Riesling) self-corrects everywhere. Grow these as the feedback→EK loop
// surfaces new failure modes — like the question validators.

export interface TastingValidationWine {
  slot: number;
  fullText: string;
}

export interface TastingValidation {
  valid: boolean;
  violations: string[];
}

// Colour words a candidate would write in the APPEARANCE line. We only judge the appearance line
// (the most reliable colour signal) to avoid false positives from flavour descriptors.
const RED_APPEARANCE = /\b(ruby|garnet|purple|crimson|violet|magenta|brick|inky|opaque|blood[-\s]?red|deep red)\b/i;
const WHITE_APPEARANCE = /\b(lemon|straw|water[-\s]?white|pale yellow|colou?rless|greenish|pale green)\b/i;

// Conservative grape/style tokens for per-wine colour when the paper alone doesn't fix it (Paper 3).
const RED_TOKENS = /\b(cabernet|merlot|pinot noir|syrah|shiraz|grenache|garnacha|tempranillo|sangiovese|nebbiolo|malbec|zinfandel|primitivo|mourv[eè]dre|carignan|barbera|touriga|tannat|carmenere|pinotage|gamay|aglianico|nerello|rosso|rouge|tinto|noir|\bport\b|tawny|ruby port)\b/i;
const WHITE_TOKENS = /\b(chardonnay|sauvignon blanc|riesling|pinot gris|pinot grigio|gew[uü]rz|muscat|viognier|chenin|s[eé]millon|albari[nñ]o|gr[uü]ner|verdejo|vermentino|garganega|fiano|greco|marsanne|roussanne|furmint|assyrtiko|palomino|fino|manzanilla|amontillado|blanc|bianco|blanco|weiss)\b/i;

function appearanceOf(note: string): string {
  const m = note.match(/\*\*\s*Appearance\s*:?\s*\*\*\s*([^\n]+)/i);
  return (m ? m[1] : note.slice(0, 140)).toLowerCase();
}

// The dedicated **Structure:** line, when present (lowercased). Empty string if absent.
function structureOf(note: string): string {
  const m = note.match(/\*\*\s*Structure\s*:?\s*\*\*\s*([^\n]+)/i);
  return (m ? m[1] : "").toLowerCase();
}

// A perceived-alcohol/warmth signal a candidate would lead with when deducing climate/origin:
// either a warmth/weight/body descriptor or an estimated ABV band. Examiners rate this hard
// structural evidence above the flavour profile, so a note that omits it strips out the axis the
// exam expects the candidate to lead with — a completeness gap, not a contradiction.
const ALCOHOL_SIGNAL = /\b(alcohol|abv|warm(?:th|ing)?|hot|heat|spirit(?:y|ous)?|glycerol|glyceri[nc]e?|body|weight|full[-\s]?bodied|light[-\s]?bodied|medium[-\s]?bodied|low[-\s]?alcohol|high[-\s]?alcohol|\d{1,2}(?:\.\d)?\s*%)\b/i;

// ── Appearance completeness ────────────────────────────────────────────────────────────────────────
// A usable appearance clause names BOTH a colour and a colour intensity: candidates read colour + depth
// as a primary structural marker, and Paper 3 in particular is "very difficult to answer with any
// precision" without those visual cues (fb_53 — all-sparkling / all-rosé / all-fortified flights are
// only distinguishable by eye). A note whose appearance names neither hue nor depth is incomplete.
const APPEARANCE_COLOUR =
  /\b(lemon|straw|gold(?:en)?|yellow|amber|greenish|green|colou?rless|water[-\s]?white|bronze|copper|onion[-\s]?skin|salmon|pink|rose[-\s]?gold|orange|ruby|garnet|purple|violet|crimson|magenta|brick|tawny|cherry|inky|opaque|blush|topaz|mahogany|red|white)\b/i;
const APPEARANCE_INTENSITY =
  /\b(pale|medium(?:[-\s]?(?:plus|minus))?|med|deep|light|intense|pronounced|watery|dark|mid|medium[-\s]?deep)\b/i;

// Absence-of-bubbles descriptors. fb_244: the note must NEVER state that a wine has no bubbles — a
// mousse/bead is only ever a POSITIVE indicator (fine persistent mousse on a traditional-method
// sparkling, a softer frothy bead on a tank-method Prosecco); its ABSENCE carries no information and
// only misleads the candidate. Forbidden in EVERY note, sparkling or still.
const NEGATIVE_BUBBLE =
  /\bno\s+(?:bubbles?|mousse|effervescence|fizz|perlage|bead)\b|\bstill,?\s+with\s+no\b|\bwithout\s+(?:any\s+)?(?:bubbles?|mousse|effervescence|a\s+mousse)\b|\b(?:no|not)\s+sparkling\b/i;

// Any bubble/mousse language (positive or negative). Permitted ONLY when the wine is sparkling.
const BUBBLE_LANGUAGE =
  /\b(mousse|bubbles?|effervescen\w*|perlage|p[eé]tillan\w*|frothy|fizz(?:y|ing)?|beads?|beading|sparkl\w*|foam\w*)\b/i;

// Comprehensive sparkling-label detector (mirrors p3-category's SPARKLING but independent of the
// sweet/fortified precedence, so a sweet sparkling — Moscato d'Asti — still counts as sparkling for the
// purpose of PERMITTING mousse language). A permissive check: over-matching only relaxes the mousse
// rule, it never invents a violation.
const SPARKLING_LABEL =
  /\b(sparkling|champagne|cr[eé]mant|cava|prosecco|valdobbiadene|conegliano|franciacorta|trentodoc|sekt\w*|espumante|spumante|cap classique|methode? traditionnelle|metodo classico|traditional method|tank method|charmat|mousseux|p[eé]tillant|pet[- ]?nat|blanc de blancs|blanc de noirs|lambrusco|moscato d.?asti|\basti\b|\bbrut\b|extra brut|dosage|sui lieviti|col fondo)\b/i;

function isSparklingWine(w: TastingValidationWine): boolean {
  return SPARKLING_LABEL.test(w.fullText || "");
}

// The coded verdict for one wine's note. `code` is the stable reason code shared with the KEY-stage
// wrapper (question-validator.checkNoteCompleteness); `detail` is the human-readable regeneration hint.
export type NoteViolationCode =
  | "note_missing_appearance"
  | "note_missing_alcohol"
  | "note_negative_bubbles"
  | "note_mousse_on_still"
  | "note_colour_contradiction";

export interface NoteViolation {
  slot: number;
  code: NoteViolationCode;
  detail: string;
}

// "white" | "red" | null (skip — rosé/orange/ambiguous P3). Paper 1/2 are decisive; P3 best-effort.
function expectedColour(wine: TastingValidationWine, paper?: number): "white" | "red" | null {
  if (paper === 1) return "white";
  if (paper === 2) return "red";
  const t = wine.fullText.toLowerCase();
  if (/\b(ros[eé]|rosado|rosato)\b/.test(t)) return null; // rosé — appearance check doesn't apply cleanly
  if (RED_TOKENS.test(t)) return "red";
  if (WHITE_TOKENS.test(t)) return "white";
  return null;
}

/**
 * Coded, per-wine tasting-note verdict — the single source of truth for note completeness/integrity,
 * shared by the serve-time gate (validateTastingNotes) and the KEY-stage audit wrapper
 * (question-validator.checkNoteCompleteness). For each wine (matched to its note by flight order) it
 * checks:
 *   • note_missing_appearance   — appearance clause lacks a colour and/or an intensity (fb_53).
 *   • note_missing_alcohol      — no perceived-alcohol/warmth reading or stated %abv band (fb_246).
 *   • note_negative_bubbles     — states the ABSENCE of bubbles ("no mousse", "still, with no…") (fb_244).
 *   • note_mousse_on_still      — mousse/bead language on a wine whose category is not sparkling.
 *   • note_colour_contradiction — appearance hue contradicts the wine's colour (white read as ruby…).
 * If the note/wine counts don't line up we can't map reliably, so we return [].
 */
export function noteCompletenessViolations(
  wineNotes: string[],
  wines: TastingValidationWine[],
  paper?: number
): NoteViolation[] {
  const out: NoteViolation[] = [];
  if (wineNotes.length !== wines.length) return out;

  wines.forEach((w, i) => {
    const note = wineNotes[i] || "";
    const app = appearanceOf(note);

    // (1) Appearance must name a COLOUR and an INTENSITY — the primary visual markers a candidate reads
    // off the glass. Missing either is an incomplete note (fb_53).
    const hasColour = APPEARANCE_COLOUR.test(app);
    const hasIntensity = APPEARANCE_INTENSITY.test(app);
    if (!hasColour || !hasIntensity) {
      const missing = [!hasColour && "a colour", !hasIntensity && "a colour intensity"]
        .filter(Boolean)
        .join(" and ");
      out.push({
        slot: w.slot,
        code: "note_missing_appearance",
        detail:
          `Wine ${w.slot} appearance clause is missing ${missing} ("${app.slice(0, 60).trim()}"). ` +
          `Open the note with an appearance line giving both hue and depth (e.g. "medium lemon-gold, ` +
          `bright") — colour is a primary structural marker the candidate must be able to read.`,
      });
    }

    // (2) Alcohol: the note must carry a perceived-alcohol/warmth reading (ideally in a Structure block)
    // or a stated %abv / low–medium–high band, so the candidate can lead with structure when deducing
    // climate/origin (fb_246). Prefer the dedicated Structure line; fall back to the whole note.
    const structure = structureOf(note);
    if (!ALCOHOL_SIGNAL.test(structure) && !ALCOHOL_SIGNAL.test(note)) {
      out.push({
        slot: w.slot,
        code: "note_missing_alcohol",
        detail:
          `Wine ${w.slot} has no perceived-alcohol/warmth reading. Add a **Structure:** line giving ` +
          `alcohol as warmth/weight with an estimated band (e.g. "warm, medium-plus body, ~14%"), ` +
          `alongside acidity, tannin, and residual sugar — never a bare label ABV. Examiners rate ` +
          `this hard structural evidence above the flavour profile.`,
      });
    }

    // (3) Negative-presence bubble descriptors are forbidden in EVERY note — absence of bubbles must
    // never be stated (fb_244).
    if (NEGATIVE_BUBBLE.test(note)) {
      out.push({
        slot: w.slot,
        code: "note_negative_bubbles",
        detail:
          `Wine ${w.slot} states the ABSENCE of bubbles ("no mousse" / "still, with no…"). Never note ` +
          `that a wine lacks a mousse — bubbles are only ever a positive cue (a fine persistent mousse ` +
          `on a traditional-method sparkling, a softer frothy bead on a tank-method wine). Drop it.`,
      });
    }

    // (4) Positive mousse/bead language is permitted only when the wine's category is sparkling; on a
    // still wine it is a fabrication.
    if (!isSparklingWine(w) && BUBBLE_LANGUAGE.test(note) && !NEGATIVE_BUBBLE.test(note)) {
      out.push({
        slot: w.slot,
        code: "note_mousse_on_still",
        detail:
          `Wine ${w.slot} is not a sparkling wine but the note uses mousse/bead/effervescence language. ` +
          `Mousse and bead descriptors belong only to sparkling wines — remove them from a still note.`,
      });
    }

    // (5) Appearance↔colour contradiction (existing check): a white must not read ruby/garnet/purple,
    // a red must not read pale lemon/straw. Only fires when the wine's colour is decisive.
    const exp = expectedColour(w, paper);
    if (exp === "white" && RED_APPEARANCE.test(app)) {
      out.push({
        slot: w.slot,
        code: "note_colour_contradiction",
        detail:
          `Wine ${w.slot} is a WHITE wine but the note's appearance reads RED ("${app.slice(0, 60).trim()}"). ` +
          `White wines are pale lemon / straw / gold / amber — never ruby, garnet, or purple.`,
      });
    } else if (exp === "red" && WHITE_APPEARANCE.test(app) && !RED_APPEARANCE.test(app)) {
      out.push({
        slot: w.slot,
        code: "note_colour_contradiction",
        detail:
          `Wine ${w.slot} is a RED wine but the note's appearance reads WHITE ("${app.slice(0, 60).trim()}"). ` +
          `Red wines are ruby / garnet / purple — never pale lemon, straw, or water-white.`,
      });
    }
  });

  return out;
}

/**
 * Validate generated tasting notes against the wines. A thin serve-time wrapper over
 * noteCompletenessViolations() that flattens the coded verdicts into human-readable strings for the
 * tasting generator's regenerate-on-failure loop (src/lib/tasting.ts). Notes are matched to wines by
 * flight order; if the counts don't line up we skip (can't map reliably).
 */
export function validateTastingNotes(
  wineNotes: string[],
  wines: TastingValidationWine[],
  paper?: number
): TastingValidation {
  const violations = noteCompletenessViolations(wineNotes, wines, paper).map((x) => x.detail);
  return { valid: violations.length === 0, violations };
}
