// tasting-lexicon.ts — the MW tasting-vocabulary palette used to raise the register of generated
// model/mock answers. Two parts: a descriptor palette keyed by tasting dimension (COLOUR, FRUIT,
// ACIDITY, …) and a rhetorical set (POSITIVES/NEGATIVES + the all-important SUGGESTS vs PROVES verbs,
// which map onto the funnelling principle: inference language vs confirmation language).
//
// `tasting-lexicon.json` is the single source of truth. This module bundles it for the app;
// scripts/sync-tasting-lexicon.mjs seeds the Neon `tasting_lexicon` table and regenerates the agent
// reference markdown from the same JSON. At runtime the app prefers the Neon copy (editable from
// admin) and falls back to this bundled copy — see getTastingLexicon() in db.ts.

import lexiconJson from "./tasting-lexicon.json";

export interface TastingLexicon {
  dimensions: Record<string, string[]>;
  rhetoric: Record<string, string[]>;
}

export const BUNDLED_TASTING_LEXICON: TastingLexicon = {
  dimensions: lexiconJson.dimensions,
  rhetoric: lexiconJson.rhetoric,
};

// Build a compact prompt block from a lexicon. Used as GUIDANCE — a palette to raise register and to
// enforce the suggest-vs-confirm deductive habit — never as a checklist. Density is penalised by
// examiners, so the guardrail is explicit.
export function buildTastingLexiconGuidance(
  lex: TastingLexicon = BUNDLED_TASTING_LEXICON
): string {
  const dims = Object.entries(lex.dimensions)
    .map(([dim, words]) => `- ${dim}: ${words.join(", ")}`)
    .join("\n");

  const suggests = (lex.rhetoric.SUGGESTS || []).join(", ");
  const proves = (lex.rhetoric.PROVES || []).join(", ");
  const positives = (lex.rhetoric.POSITIVES || []).join(", ");
  const negatives = (lex.rhetoric.NEGATIVES || []).join(", ");
  const odds = (lex.rhetoric.ODDS_AND_SODS || []).join(", ");

  return `## TASTING LEXICON (register palette — guidance, not a checklist)
Use precise, examiner-grade vocabulary. Draw on this palette for variety and accuracy; do NOT string
adjectives together for their own sake — precision beats density, and word-salad is penalised. Vary
descriptors across dimensions rather than repeating the same word.

Descriptor palette by dimension:
${dims}

Deductive register (mirror the funnelling principle — match the verb to the strength of the evidence):
- When evidence is SUGGESTIVE (implies but does not prove), use inference verbs: ${suggests}.
- When evidence is CONCLUSIVE, use confirmation verbs: ${proves}.
- Quality, positive: ${positives}.
- Quality, negative: ${negatives}.
- Connective nouns: ${odds}.

Rule: never write "X confirms Y" unless the evidence truly proves it — use "suggests/points to/indicative of" for a likely-but-unproven call. This is the difference between a disciplined funnel and an over-claim.`;
}
