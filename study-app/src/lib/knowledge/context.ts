// Unit 4 — deciding WHEN to retrieve, and how retrieved passages enter the model-answer prompt.
//
// The gate is the most important thing in this file. A corpus that answers confidently outside its
// coverage is worse than no corpus, and this one has sharply defined edges: it is 3,979 chunks of
// enology and viticulture technique from research institutes and extension services. It knows how
// malolactic fermentation softens acidity and what happens on the lees. It does not know that Barossa
// Shiraz smells of dark chocolate, it does not know DOCG ageing minima, and — see FORTIFIED below — it
// barely knows sherry exists.
//
// So retrieval fires on production-shaped questions only, and is suppressed on two axes where it would
// return confident irrelevance.

import { retrieveKnowledge, type RetrievedPassage } from "./retrieve";
import { assessPassageAge, summarizeCorpusAge } from "./passage-age";

/** Families whose whole point is production. F5 = Method / Production, F6 = Style Mechanism. */
const PRODUCTION_FAMILIES = new Set(["F5", "F6"]);

/**
 * Production intent in the stem. Deliberately the SAME regexes question-engine.ts already uses — the
 * `winemaking` sub-question rule and the `ask:production` stem token — rather than a third dialect of
 * "is this about winemaking" that would drift away from them.
 */
const PRODUCTION_INTENT =
  /\bwinemak|\bvinif|\bproduction\b|\bproduced\b|\bmethod of production\b|\bmaturation|\bfermentat|\belevage|\bélevage|\blees\b|\bmalolactic|\boak\b|\bhow [a-z ]+ (made|produced)\b/i;

/**
 * FORTIFIED / OXIDATIVE SUPPRESSION — the F3 finding, enforced in code rather than trusted to the prompt.
 *
 * Measured on the live corpus: 11 chunks classified `fortified`, and FIVE chunks in total mentioning
 * solera, criadera, flor, fino, amontillado, oloroso, madeira or estufagem. Viticulture and enology
 * research institutes do not publish on sherry and port. A smoke query about oxidative fortified wine
 * returned Champagne mousse studies and a German institute's annual report — not a near-miss, just
 * confidently wrong material presented with tier-1 publishers attached.
 *
 * This is a code guard and not a prompt line for the same reason the age warnings are computed rather
 * than described: a prose instruction is advisory, and the failure it prevents is one where every
 * retrieved passage looks authoritative. Fortified is a Paper 3 staple, so this will fire often.
 *
 * Remove this ONLY when a fortified corpus exists (Consejo Regulador de Jerez, IVDP, IVBAM).
 */
const FORTIFIED_OR_OXIDATIVE =
  /\bfortified\b|\bsherry\b|\bport\b|\bmadeira\b|\bmarsala\b|\bvin jaune\b|\boxidative\b|\bsolera\b|\bflor\b|\brancio\b|\bvin doux naturel\b|\bmistelle\b/i;

/**
 * BOTRYTIS SUPPRESSION — the same failure mode as fortified, found by the Unit 5 eval, and more
 * insidious because the corpus is not silent here. It is LOUD AND OFF-TOPIC.
 *
 * The corpus holds 191 chunks mentioning botrytis. Only 9 frame it as noble rot; 56 frame it as bunch
 * rot, grey rot or a fungicide target. Sauternes, Tokaji and Beerenauslese appear twice in 3,979
 * chunks. These are viticulture research institutes: to them botrytis is a disease to prevent, not a
 * technique to court.
 *
 * So a Sauternes production question retrieves six confident tier-1 passages about controlling rot —
 * measured: the eval's botrytis query returned six passages, five tagged `faults`. Handing those to a
 * model answer is worse than handing it nothing, because the material is real, cited, and exactly
 * backwards.
 *
 * Scoped to botrytis/dried-grape sweetness ONLY, not to sweetness generally: sweetness by arrested
 * fermentation, Süssreserve and residual-sugar management ARE covered (the German institutes write
 * about them), so `ask:sweetness-mechanism` questions still retrieve.
 */
const BOTRYTIS_SWEET =
  /\bbotrytis\b|\bbotrytised\b|\bbotrytized\b|\bnoble rot\b|\bsauternes\b|\btokaji\b|\baszú\b|\bbeerenauslese\b|\btrockenbeeren\w*\b|\beiswein\b|\bice wine\b|\bpasserillage\b|\bappassimento\b|\brecioto\b|\bvin santo\b/i;

export interface GateDecision {
  retrieve: boolean;
  /** Why — surfaced in telemetry so a silently-never-firing gate is visible. */
  reason: string;
}

export function shouldRetrieve(opts: { questionText: string; family?: string | null }): GateDecision {
  const text = opts.questionText ?? "";

  if (FORTIFIED_OR_OXIDATIVE.test(text)) {
    return { retrieve: false, reason: "suppressed: fortified/oxidative — corpus has no coverage (F3)" };
  }
  if (BOTRYTIS_SWEET.test(text)) {
    return { retrieve: false, reason: "suppressed: botrytis/dried-grape — corpus frames rot as disease (F4)" };
  }
  if (opts.family && PRODUCTION_FAMILIES.has(opts.family)) {
    return { retrieve: true, reason: `family ${opts.family}` };
  }
  if (PRODUCTION_INTENT.test(text)) {
    return { retrieve: true, reason: "production intent in stem" };
  }
  return { retrieve: false, reason: "not a production question" };
}

/**
 * Format passages for the prompt.
 *
 * Three rules travel with the passages, and each exists because of a specific way this could go wrong:
 *
 *  - "The answer must stand without these." Otherwise a thin retrieval turns into a thin answer that
 *    happens to be well-sourced. The corpus is a check on the model's production claims, not a
 *    substitute for knowing the wine.
 *
 *  - "Do not cite sources in the answer prose." This is the one that is easy to get backwards. The MW
 *    practical is eight minutes of handwriting under time pressure; an examiner marks the reasoning,
 *    and "(AWRI, 2019)" in the middle of a tasting note is wasted words that model the wrong behaviour
 *    for the candidate. Citations belong in the study UI, beside the answer, not inside it.
 *
 *  - "Silent on region, variety and appellation law." The corpus genuinely is. Without saying so, a
 *    model that sees six tier-1 passages will treat their silence on origin as informative.
 */
export function buildKnowledgeBlock(passages: RetrievedPassage[]): string | null {
  if (passages.length === 0) return null;

  const ages = passages.map((p) => assessPassageAge(p.dateSource === "published" ? p.publishedAt : null));
  const corpusNote = summarizeCorpusAge(ages);

  const body = passages
    .map((p, i) => {
      const age = ages[i];
      const date = p.publishedAt ? p.publishedAt.toISOString().slice(0, 10) : "date unknown";
      const bits = [p.publisher, `tier ${p.tier}`, date];
      if (p.isRegionalPractice) bits.push("describes regional practice");
      if (age.warning) bits.push(age.warning);
      return `[${i + 1}] ${bits.join(" · ")}\n${p.sectionPath ? `${p.sectionPath}\n` : ""}${p.text.trim()}`;
    })
    .join("\n\n");

  return `## VERIFIED PRODUCTION REFERENCES

Passages retrieved from a curated corpus of tier-1 enology and viticulture publishers (AWRI, IVES,
Union des Maisons de Champagne, WSU, Oregon Wine Research Institute, IFV, WBI Freiburg, Virginia Tech
Enology and others). Some are in French or German; read them as you would English.

How to use them:
- They are BACKGROUND, not the answer. Your answer must stand on its own reasoning without them. If
  they are thin or tangential for this question, ignore them entirely — do not pad the answer to use them.
- Where a passage contradicts what you were going to assert about a production MECHANISM, prefer the
  passage and adjust the claim.
- DO NOT cite sources, publishers or dates in the answer prose. This is an eight-minute handwritten
  exam answer; the examiner marks reasoning, and inline citations model the wrong behaviour for a
  candidate. The citations are displayed to the student separately.
- This corpus covers HOW WINE IS MADE. It is silent on region, variety identification, appellation law
  and commercial positioning. Its silence on those is not evidence — keep using your own knowledge there.
${corpusNote ? `- ${corpusNote}\n` : ""}
${body}`;
}

/**
 * Gate, retrieve, format. Returns null when retrieval should not or did not happen.
 *
 * FAILS SOFT, deliberately. Model-answer generation predates this corpus and works without it, so a
 * Voyage outage, a missing key, or a slow query must degrade to the previous behaviour rather than
 * fail the generation. The error is logged, not thrown — but the gate decision is logged too, so
 * "retrieval quietly stopped working" is visible in the logs rather than only in worse answers.
 */
export async function getKnowledgeContext(opts: {
  questionText: string;
  family?: string | null;
  topK?: number;
}): Promise<{ block: string | null; passages: RetrievedPassage[]; reason: string }> {
  const gate = shouldRetrieve(opts);
  if (!gate.retrieve) return { block: null, passages: [], reason: gate.reason };

  try {
    const passages = await retrieveKnowledge({ query: opts.questionText, topK: opts.topK ?? 6 });
    console.log(`[kb] ${gate.reason} → ${passages.length} passages`);
    return { block: buildKnowledgeBlock(passages), passages, reason: gate.reason };
  } catch (e) {
    console.error(`[kb] retrieval failed (${(e as Error).message}) — generating without references`);
    return { block: null, passages: [], reason: `error: ${(e as Error).message}` };
  }
}
