// tasting-lexicon.ts — the MW tasting-vocabulary palette used to raise the register of generated
// model/mock answers. Two parts: a descriptor palette keyed by tasting dimension (COLOUR, FRUIT,
// ACIDITY, …) and a rhetorical set (POSITIVES/NEGATIVES + the all-important SUGGESTS vs PROVES verbs,
// which map onto the funnelling principle: inference language vs confirmation language).
//
// `tasting-lexicon.json` is the single source of truth. This module bundles it for the app;
// scripts/sync-tasting-lexicon.mjs seeds the Neon `tasting_lexicon` table and regenerates the agent
// reference markdown from the same JSON. At runtime the app prefers the Neon copy (editable from
// admin) and falls back to this bundled copy — see getTastingLexicon() in db.ts.

import lexiconJson from "./tasting-lexicon.json" with { type: "json" };

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
  const preferredArg = (lex.rhetoric.PREFERRED_ARGUMENT || []).join(", ");
  const disliked = (lex.rhetoric.DISLIKED || []).join(", ");

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
${preferredArg ? `- Preferred funnel connectives (use to structure the argument): ${preferredArg}.\n` : ""}${disliked ? `- AVOID these examiner-penalised registers: ${disliked}.\n` : ""}
Rule: never write "X confirms Y" unless the evidence truly proves it — use "suggests/points to/indicative of" for a likely-but-unproven call. This is the difference between a disciplined funnel and an over-claim.`;
}

// Deterministic disliked-wording scan over a candidate's answer text. Returns the matched display
// phrases. Only matches UNAMBIGUOUS literal entries — entries carrying a "(" qualifier are guidance-only
// (context-dependent, e.g. the over-claim case) and are deliberately NOT literal-matched here; the
// grader judges those via buildLexiconCritiqueGuidance. Word-boundary, case-insensitive.
export function scanDislikedWording(
  answerText: string,
  lex: TastingLexicon = BUNDLED_TASTING_LEXICON
): string[] {
  const text = answerText || "";
  const found: string[] = [];
  for (const entry of lex.rhetoric.DISLIKED || []) {
    if (entry.includes("(")) continue; // context-dependent → leave to LLM judgement
    const phrase = entry.trim();
    if (!phrase) continue;
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (re.test(text)) found.push(phrase);
  }
  return found;
}

// A wording-audit instruction for the GRADER. `dislikedFound` is the deterministic linter's output on
// the candidate's text (from scanDislikedWording). The over-claim check stays an LLM judgement because
// it is context-dependent (a confirmation verb is legitimate when the evidence is conclusive).
export function buildLexiconCritiqueGuidance(dislikedFound: string[] = []): string {
  const detected = dislikedFound.length
    ? `A deterministic scan flagged these examiner-penalised phrases in the candidate's answer — comment on each briefly (cite the phrase, say why it is weak, give the stronger move): ${dislikedFound
        .map((p) => `"${p}"`)
        .join(", ")}.`
    : `No banned phrases were flagged by the automated scan, but still watch for the patterns below.`;
  return `## WORDING AUDIT (note in feedback; coaching voice; do not over-weight any single item)
${detected}
Also judge in context (these are NOT literal matches):
- **Over-claim:** a confirmation verb ("confirms"/"definitely"/"obviously"/"clearly") on evidence that is only suggestive — show the inference verb that fits ("suggests / points to / indicative of").
- **Bare quality:** "good"/"very good" with no official tier or benchmark — name the tier they should have used.
- **Rote commercial / food-pairing boilerplate** and **vague maturity** ("matured for many years" with no window) — examiners "rarely reward" these.
- **Cut-and-paste sameness** across wines in a flight, and **stem-restatement** that re-derives given information.`;
}
