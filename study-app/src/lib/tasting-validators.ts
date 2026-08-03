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
const ALCOHOL_SIGNAL = /\b(alcohol|abv|warm(?:th|ing)?|hot|heat|spirit(?:y|ous)?|glycerol|glyceri[nc]e?|body|weight|full[-\s]?bodied|light[-\s]?bodied|medium[-\s]?bodied|\d{1,2}(?:\.\d)?\s*%)\b/i;

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
 * Validate generated tasting notes against the wines. Checks (1) appearance↔colour consistency
 * (a white wine must not be described ruby/garnet/purple; a red must not be pale lemon/straw) and
 * (2) completeness — each note must carry a perceived-alcohol/warmth reading so the candidate can
 * lead with structure (alcohol+acidity) when deducing climate/origin. Notes are matched to wines by
 * flight order; if the counts don't line up we skip (can't map reliably).
 */
export function validateTastingNotes(
  wineNotes: string[],
  wines: TastingValidationWine[],
  paper?: number
): TastingValidation {
  const violations: string[] = [];
  if (wineNotes.length !== wines.length) return { valid: true, violations };

  wines.forEach((w, i) => {
    const note = wineNotes[i];

    // Completeness: the note must carry a perceived-alcohol/warmth reading (ideally in a Structure
    // block) so the candidate can lead with structure when deducing climate/origin. Prefer the
    // dedicated Structure line; fall back to the whole note so a warmth cue anywhere still passes.
    const structure = structureOf(note);
    if (!ALCOHOL_SIGNAL.test(structure) && !ALCOHOL_SIGNAL.test(note)) {
      violations.push(
        `Wine ${w.slot} has no perceived-alcohol/warmth reading. Add a **Structure:** line giving ` +
          `alcohol as warmth/weight with an estimated band (e.g. "warm, medium-plus body, ~14%"), ` +
          `alongside acidity, tannin, and residual sugar — never a bare label ABV. Examiners rate ` +
          `this hard structural evidence above the flavour profile.`
      );
    }

    const exp = expectedColour(w, paper);
    if (!exp) return;
    const app = appearanceOf(note);
    if (exp === "white" && RED_APPEARANCE.test(app)) {
      violations.push(
        `Wine ${w.slot} is a WHITE wine but the note's appearance reads RED ("${app.slice(0, 60).trim()}"). ` +
          `White wines are pale lemon / straw / gold / amber — never ruby, garnet, or purple.`
      );
    } else if (exp === "red" && WHITE_APPEARANCE.test(app) && !RED_APPEARANCE.test(app)) {
      violations.push(
        `Wine ${w.slot} is a RED wine but the note's appearance reads WHITE ("${app.slice(0, 60).trim()}"). ` +
          `Red wines are ruby / garnet / purple — never pale lemon, straw, or water-white.`
      );
    }
  });

  return { valid: violations.length === 0, violations };
}
