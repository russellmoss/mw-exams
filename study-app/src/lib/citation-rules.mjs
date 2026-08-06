// citation-rules.mjs — relevance gate for the "Sources consulted" citation block.
//
// Retrieval is already gated (knowledge/context.ts decides WHEN to retrieve), but the citation block
// listed the top-3 retrieved DOCUMENTS regardless of what they were about. Two junk classes reached
// candidates: institutional annual reports ("WBI Jahresbericht 1995", "ICVV memoria 2010-2011") that
// embeddings surface but no student should be sent to, and real technical documents about the WRONG
// wine — "Identifying objective measures for Barossa Valley Shiraz grapes" cited under a Loire
// Chenin question, "The Flavor Chemistry of Fortified Wines" under a still Pinot flight. A wrong
// citation costs trust the same way a wrong answer does; better to list nothing.
//
// The gate is asymmetric by design: a doc is dropped only when its title POSITIVELY names an
// identity (a grape, a named region, fortified/sparkling/botrytis style) that the question and its
// wines do not carry. Generic production titles ("Malolactic fermentation review") always pass — the
// corpus is production technique, and generic technique is what it is for.
//
// Shared (plain .mjs) between the live block builder (knowledge/context.ts), the audit's soft rule
// (answer-content-rules.mjs), and the offline backfill that re-filters already-stored answers.

import { norm, canonVariety, WHITE_GRAPE_INDICATORS, RED_GRAPE_INDICATORS } from "./question-rules.mjs";

// Institutional/administrative documents that are never a useful citation, whatever the question.
// Tested against title AND url (URL-decoded): the giveaway is often only in the path.
const JUNK_DOC =
  /jahresbericht|jahres\s*und\s*tatigkeitsbericht|tatigkeitsbericht|annual report|\bmemoria\b|presentacion y objetivos|estructura y personal|\bnewsletter\b|price list|\bprospekt\b/;

// Named regions/appellations a title can pin a document to. Mirrors the names the KB actually
// covers (context.ts APPELLATION_COVERED) plus the New World regions seen in its research corpus.
const REGION_TOKENS =
  /\bchampagne\b|\bchablis\b|\bmeursault\b|\bsancerre\b|\bvouvray\b|\bmuscadet\b|\bbeaujolais\b|\bbordeaux\b|\bgraves\b|\bsauternes\b|\bbarsac\b|\balsace\b|\blanguedoc\b|\bsavoie\b|\bbarolo\b|\bbarbaresco\b|\bbrunello\b|\bchianti\b|\bamarone\b|\bvalpolicella\b|\bprosecco\b|\bsoave\b|\bpiedmont\b|\brioja\b|\bpriorat\b|\bburgundy\b|\bbourgogne\b|\bloire\b|\brhone\b|\bbarossa\b|\bmclaren vale\b|\bcoonawarra\b|\bhunter\b|\bmarlborough\b|\bwillamette\b|\bnapa\b|\bsonoma\b|\bstellenbosch\b|\bswartland\b|\bmosel\b|\brheingau\b|\bwachau\b|\btokaj\b|\bjerez\b|\bdouro\b|\bmadeira\b|\bcoteaux du layon\b/;

// Style families a title can pin a document to, with the question-side test for each.
const STYLE_PINS = [
  {
    name: "fortified/oxidative",
    title: /fortified|sherry|jerez|manzanilla|amontillado|oloroso|\bflor\b|solera|\bport\b|madeira|estufagem|marsala|vin doux|mutage|banyuls|rivesaltes|maury|rancio|oxidative/,
    context: /fortified|sherry|jerez|manzanilla|fino|amontillado|oloroso|palo cortado|solera|flor|\bport\b|tawny|colheita|madeira|marsala|vin jaune|vin doux|vdn|mutage|banyuls|rivesaltes|maury|rutherglen|rancio|oxidative/,
  },
  {
    name: "sparkling",
    title: /sparkling|champagne|\bmousse\b|autolysis|tirage|disgorg|\bcava\b|prosecco|cremant|traditional method|charmat|\bbubbl/,
    context: /sparkling|champagne|mousse|autolys|tirage|disgorg|\bcava\b|prosecco|cremant|franciacorta|traditional method|charmat|methode|petillant|\bbrut\b|\bbubbl|blanc de blancs|blanc de noirs|\bsekt\b|cap classique/,
  },
  {
    name: "botrytis/sweet",
    title: /botrytis|noble rot|sauternes|tokaji?|aszu|beerenauslese|trockenbeeren|eiswein|ice ?wine|late harvest|passerillage|appassimento|recioto|vin santo|vendanges tardives/,
    context: /botrytis|botrytis(?:ed|ised|ized)|noble rot|sauternes|barsac|tokaji?|aszu|puttonyos|beerenauslese|trockenbeeren|grains nobles|vendanges tardives|coteaux du layon|quarts de chaume|eiswein|ice ?wine|icewine|passerillage|appassimento|recioto|vin santo|late harvest|moelleux|\bsweet\b|\bdessert\b/,
  },
];

/** @typedef {{ publisher?: string, title?: string | null, url?: string }} CitationDoc */

/**
 * Why (if at all) this document must not be cited under this question.
 * @param {CitationDoc} doc
 * @param {string} contextText — question stem + the flight's wine labels, joined.
 * @returns {string | null} a human-readable reason, or null when the doc may be cited.
 */
export function citationDropReason(doc, contextText) {
  let urlText = doc.url || "";
  try {
    urlText = decodeURIComponent(urlText);
  } catch {
    /* malformed escape — filter on the raw url */
  }
  const docText = norm(`${doc.title || ""} ${urlText}`);
  const titleText = norm(doc.title || "");
  const ctx = norm(contextText || "");

  if (JUNK_DOC.test(docText)) return "institutional/annual-report document";

  // Grape pin: a title naming a specific grape is only citable when the flight carries that grape
  // (canonicalised both sides, so Shiraz pins match a Syrah flight).
  const titleGrapes = [
    ...titleText.matchAll(new RegExp(WHITE_GRAPE_INDICATORS.source, "gi")),
    ...titleText.matchAll(new RegExp(RED_GRAPE_INDICATORS.source, "gi")),
  ].map((m) => canonVariety(m[0]));
  if (titleGrapes.length > 0) {
    const ctxGrapes = new Set(
      [
        ...ctx.matchAll(new RegExp(WHITE_GRAPE_INDICATORS.source, "gi")),
        ...ctx.matchAll(new RegExp(RED_GRAPE_INDICATORS.source, "gi")),
      ].map((m) => canonVariety(m[0]))
    );
    const missing = titleGrapes.filter((g) => !ctxGrapes.has(g));
    if (missing.length === titleGrapes.length)
      return `about ${[...new Set(missing)].join("/")} — not in this flight`;
  }

  // Style pin: a fortified-chemistry doc under a still flight, a botrytis doc under a dry one.
  // Also computes whether some style pin is SATISFIED (title and flight share the style) — that
  // softens the region pin below: a Champagne-titled autolysis study is a fine citation under a
  // Cava flight, and the Sauternes cahier under a Tokaji flight, because the production mechanism
  // transfers within the style even when the named region differs.
  let styleSatisfied = false;
  for (const pin of STYLE_PINS) {
    if (!pin.title.test(titleText)) continue;
    if (!pin.context.test(ctx)) return `${pin.name} document on a non-${pin.name} flight`;
    styleSatisfied = true;
  }

  // Region pin: same asymmetry for named regions, unless a shared style already vouches for it.
  const titleRegions = [...titleText.matchAll(new RegExp(REGION_TOKENS.source, "gi"))].map((m) => norm(m[0]));
  if (!styleSatisfied && titleRegions.length > 0 && !titleRegions.some((r) => ctx.includes(r)))
    return `about ${[...new Set(titleRegions)].join("/")} — not in this flight`;

  return null;
}

/**
 * Filter a citation-doc list against the question. Order-preserving.
 * @param {CitationDoc[]} docs
 * @param {string} contextText
 * @returns {{ kept: CitationDoc[], dropped: Array<{ doc: CitationDoc, reason: string }> }}
 */
export function filterCitationDocs(docs, contextText) {
  const kept = [];
  const dropped = [];
  for (const doc of docs || []) {
    const reason = citationDropReason(doc, contextText);
    if (reason) dropped.push({ doc, reason });
    else kept.push(doc);
  }
  return { kept, dropped };
}

// The exact lead-in buildCitationBlock writes — shared so the audit and the backfill can find the
// block in a stored answer without keeping their own copy of the string.
export const CITATION_BLOCK_RE = /\n*-{3,}\s*\n+\*{0,2}Sources consulted\*{0,2}[^\n]*\n+([\s\S]*)$/;

/**
 * Parse the citation items out of a stored model answer's "Sources consulted" tail.
 * @param {string} answerText
 * @returns {{ docs: Array<{ title: string, url: string }>, blockStart: number } | null}
 */
export function parseCitationBlock(answerText) {
  const text = (answerText || "").toString();
  const m = text.match(CITATION_BLOCK_RE);
  if (!m || m.index === undefined) return null;
  const docs = [...m[1].matchAll(/^\s*-\s*\[([^\]]+)\]\(([^)]+)\)\s*$/gm)].map((x) => ({ title: x[1], url: x[2] }));
  return { docs, blockStart: m.index };
}
