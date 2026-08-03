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

/**
 * APPELLATION LAW — gated to the appellations whose SPECIFICATION IS ACTUALLY IN THE CORPUS.
 *
 * This is the one gate that is a whitelist rather than a topic test, and the reason is the same
 * failure that produced F3 and F4. `kb-fortified-build.mjs --group appellation` added 645 chunks of
 * cahiers des charges and disciplinari, but only 16 documents — roughly a dozen appellations against
 * the 183 that appear in the exam corpus. Measured after the build:
 *
 *   covered      Champagne 586 · Bordeaux/Graves 156 · Alsace 98 · Languedoc 93 · Savoie 80 ·
 *                Piemonte 68 · Rioja 68 · Chianti Classico 63 · Meursault 28 · Chablis 24 ·
 *                Vouvray 22 · Barolo 20
 *   NOT covered  Sancerre 0 · Brunello 0 · Prosecco 0 · Châteauneuf 2 · Saint-Émilion 2 ·
 *                Pessac-Léognan 3
 *
 * Opening this on "is it an origin question?" would therefore send a Sancerre question to Barolo's
 * disciplinare — real, tier-1, legally binding, and about the wrong wine. That is precisely the
 * confidently-wrong failure the fortified and botrytis gates existed to prevent, so the test is the
 * NAME, not the topic.
 *
 * CONSEQUENCE FOR MAINTENANCE: this list and the source registry must move together. Adding a cahier
 * des charges without adding its name here leaves the corpus unreachable; adding a name here without
 * the document is worse, because it promises coverage that does not exist. The eval asserts both
 * directions.
 */
const APPELLATION_COVERED =
  /\bchampagne\b|\bchablis\b|\bmeursault\b|\bvouvray\b|\bbordeaux\b|\bgraves\b|\balsace\b|\blanguedoc\b|\bsavoie\b|\bsaint[- ]p[ée]ray\b|\bbarolo\b|\bchianti\b|\bpiemonte\b|\bpiedmont\b|\brioja\b/i;

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
 * FORTIFIED / OXIDATIVE — SUPPRESSION LIFTED (was the F3 finding).
 *
 * The original guard existed because the corpus had FIVE chunks in 3,979 mentioning solera, criadera,
 * flor, fino, amontillado, oloroso, madeira or estufagem, and an oxidative-fortified query returned
 * Champagne mousse studies. Suppressing was right: confidently wrong tier-1 material is worse than
 * nothing.
 *
 * That condition no longer holds. scripts/kb-fortified-build.mjs added 1,196 chunks from the bodies
 * that actually regulate these wines — Consejo Regulador DO Jerez (including the DOP product
 * specification), IVDP, CIVR — plus peer-reviewed open-access reviews. Re-measured on the live corpus:
 *
 *   solera / criadera / flor / fino / amontillado / oloroso / manzanilla   5 -> 267 chunks
 *   estufagem / canteiro / frasqueira / sercial / verdelho / bual          ~0 -> 62
 *   mutage / vin doux naturel / banyuls / rivesaltes / maury / rancio      ~0 -> 25
 *   benefício / aguardente / tawny / colheita / LBV / vintage port         ~0 -> 22
 *
 * So the gate lets these through now. Two honest caveats, recorded because they bound what the
 * passages can be trusted for:
 *   - MADEIRA rests on the peer-reviewed literature, not the regulator. IVBAM blocks automated
 *     fetching, so estufagem/canteiro coverage is research chemistry rather than an official
 *     specification.
 *   - VDN is the thinnest at 25 chunks; the CIVR site is promotional rather than technical.
 *
 * BOTRYTIS IS A SEPARATE QUESTION and stays suppressed — see below. The fortified build did not
 * touch it (it added exactly one noble-rot chunk), which is the point: these are different holes and
 * filling one says nothing about the other.
 */
const FORTIFIED_INTENT =
  /\bfortified\b|\bsherry\b|\bjerez\b|\bmanzanilla\b|\bfino\b|\bamontillado\b|\boloroso\b|\bpalo cortado\b|\bsolera\b|\bcriadera\b|\bflor\b|\bport\b|\btawny\b|\bcolheita\b|\bmadeira\b|\bestufagem\b|\bcanteiro\b|\bmarsala\b|\bvin jaune\b|\boxidative\b|\brancio\b|\bvin doux naturel\b|\bmutage\b|\bbanyuls\b|\brivesaltes\b|\bmaury\b|\bmistelle\b/i;

/**
 * BOTRYTIS / NOBLE ROT — SUPPRESSION LIFTED (was the F4 finding).
 *
 * The original guard was the more insidious of the two, because the corpus was not silent here — it
 * was LOUD AND BACKWARDS. 56 chunks framed botrytis as bunch rot, grey rot or a fungicide target
 * against 9 as noble rot, and Sauternes/Tokaji/Beerenauslese appeared twice in 3,979 chunks. A
 * Sauternes question retrieved six passages about controlling rot, five tagged `faults`. Viticulture
 * institutes exist to help growers PREVENT botrytis; the sweet-wine world exists to court it.
 *
 * scripts/kb-fortified-build.mjs --group botrytis added 462 chunks: the INAO cahiers des charges for
 * Sauternes, Coteaux du Layon and Alsace VT/SGN (the legal texts — "récoltés manuellement par tries
 * successives", 221 g/L minimum, anti-botrytis sprays FORBIDDEN), plus the peer-reviewed noble-rot
 * literature. Re-measured on the live corpus:
 *
 *   noble rot framing        19 -> 272 chunks
 *   botrytis-as-disease      56 ->  72   (barely moved — the new material is additive, not corrective)
 *   Sauternes / Barsac        2 ->  44
 *   Loire + Alsace sweet     ~0 ->  93
 *   Tokaj / aszú / puttonyos ~0 ->  20
 *
 * The ratio inverted from roughly 1:3 against noble rot to 4:1 in favour, which is the number that
 * matters: the old failure was not thin coverage, it was CONTRADICTORY coverage winning the top slots.
 *
 * WHAT IS STILL THIN, and why it is not suppressed. Dried-grape styles remain sparse — appassimento /
 * recioto / vin santo 24 chunks, eiswein / cryoextraction 10, vin de paille 0. These are left OPEN
 * deliberately: thin is a different failure from backwards. Retrieval on them returns adjacent
 * sweet-wine material rather than material that contradicts the answer, and the prompt already tells
 * the model the passages may be silent and that the answer must stand without them. Suppression is
 * reserved for where the corpus would actively mislead.
 */
const SWEET_INTENT =
  /\bbotrytis\b|\bbotrytised\b|\bbotrytized\b|\bnoble rot\b|\bpourriture noble\b|\bsauternes\b|\bbarsac\b|\btokaji?\b|\basz[uú]\b|\bputtonyos\b|\beszencia\b|\bbeerenauslese\b|\btrockenbeeren\w*\b|\bgrains nobles\b|\bvendanges tardives\b|\bcoteaux du layon\b|\bquarts de chaume\b|\bbonnezeaux\b|\beiswein\b|\bice ?wine\b|\bpasserillage\b|\bappassimento\b|\brecioto\b|\bvin santo\b|\btries successives\b|\bsurmaturit[ée]\b|\bselective picking\b/i;

export interface GateDecision {
  retrieve: boolean;
  /** Why — surfaced in telemetry so a silently-never-firing gate is visible. */
  reason: string;
}

export function shouldRetrieve(opts: { questionText: string; family?: string | null }): GateDecision {
  const text = opts.questionText ?? "";

  // Both former suppressions are now POSITIVE signals. A question naming sherry, Sauternes or Tokaji
  // is a production question even when the stem never says "winemaking", and the corpus now answers
  // it — so these fire before the generic intent test rather than blocking it.
  if (FORTIFIED_INTENT.test(text)) {
    return { retrieve: true, reason: "fortified/oxidative — covered by the fortified corpus" };
  }
  if (SWEET_INTENT.test(text)) {
    return { retrieve: true, reason: "botrytis/sweet — covered by the noble-rot corpus" };
  }
  if (APPELLATION_COVERED.test(text)) {
    return { retrieve: true, reason: "named appellation with a specification in the corpus" };
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
