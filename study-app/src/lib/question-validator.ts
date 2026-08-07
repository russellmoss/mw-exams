// question-validator.ts — KEY-stage wrapper over the shared rule layer (question-rules.mjs).
//
// The hard/soft validity rules now live ONCE in question-rules.mjs (the single source of truth,
// shared with the generation engine). This module is the thin key-stage entry point used by the
// corpus audit (audit-questions.mjs, run via plain node) and the feedback/analysis path: it passes
// the resolved answer key (AuditWine) into the shared rules and derives ok + the scoring model.
// No rule logic lives here anymore — change rules in question-rules.mjs and both stages get them.

import {
  applyQuestionRules,
  stemSniperScoringModel as _stemSniperScoringModel,
  canonCountry,
  canonVariety,
  detectPrimaryVariety,
  methodClass,
  norm,
  normStem,
  RED_GRAPE_INDICATORS,
  WHITE_GRAPE_INDICATORS,
} from "./question-rules.mjs";
import { applyAnswerContentRules } from "./answer-content-rules.mjs";
// Per-wine style classifier (the SAME one the Paper 3 sampler and Exam Mix use), so the paper
// style-mix rule tags a wine still/sparkling/fortified/sweet/rosé exactly as the rest of the system.
import { classifyWineStyle } from "./p3-category.mjs";
import { noteCompletenessViolations, type TastingValidationWine } from "./tasting-validators";

export type StemSniperScoringModel = "per-wine" | "set";

// Typed re-export of the shared scoring-model classifier (kept here for existing importers).
export const stemSniperScoringModel = (questionText?: string, wineCount = 0): StemSniperScoringModel =>
  _stemSniperScoringModel(questionText, wineCount) as StemSniperScoringModel;

export interface AuditWine {
  slot: number;
  varieties: string[];
  region: string;
  country?: string;
  is_blend?: boolean;
  style?: string;
  // The P3 answer-key style category (e.g. "Botrytis sweet", "Late-harvest sweet", "Port"). Supplied
  // alongside `style`, it lets methodClass() (and the contrast-integrity rule) resolve a wine's
  // method / sweetness mechanism the same way the shared rule layer does.
  style_category?: string;
  // The raw generated label from generated_questions.wines[].fullText. The answer key resolves a wine
  // into varieties/region/country and loses the original string, so a slot holding the generator's
  // reasoning rather than a wine resolves to a plausible-looking key and the audit sees nothing wrong.
  // Callers that can supply the label should, to enable the wine-reference-shape rule.
  fullText?: string;
  // Residual sugar in grams per litre, when the answer key resolves it. Used by the stem-predicate
  // cross-check (STEM_PREDICATE_MISMATCH): a stem that asserts "both/all have residual sugar" or "sweet
  // wines" is contradicted by a keyed wine whose RS is below 5 g/L (or that is otherwise tagged dry).
  rs?: number;
}
export interface QuestionForAudit {
  questionId: string;
  paper: number;
  family: string;
  questionText: string;
  totalMarks?: number;
  wines: AuditWine[];
  // The stored model answer. Optional: when present and non-empty, the answer-content rules
  // (answer-content-rules.mjs) run alongside the question rules, so every caller of this one entry
  // point — the corpus audit, the per-question generation audit, the Fill-the-Bank review pane —
  // gets the answer verdict for free. Absent/empty, behaviour is byte-identical to before.
  modelAnswer?: string | null;
}
export interface Violation {
  rule: string;
  severity: "hard" | "soft";
  detail: string;
}

// ── Stem must not pre-announce the discriminator ────────────────────────────────────────────────
//
// Admin-reviewer bin cluster (cross-paper, 11 bins): stems that state outright what the candidate is
// supposed to deduce from the glass — the contrast, the quality gap, the ageing regime — are binned
// "too easy" / "not exam-realistic". A real IMW stem is a neutral factual frame ("from four different
// countries") and leaves the inference to the taster. This rule is a HARD reject that scans the STEM
// ONLY (never the sub-questions, where naming a mechanism to *comment on* is legitimate) for phrases
// that hand over the deduction, plus a 40-word cap on the stem (the "too wordy" bins are the same
// fault as run-on scene-setting). Neutral framings the exam genuinely uses are whitelisted out before
// the scan so they can never trip a banned pattern by accident.

// Phrases that state the discriminator the candidate is meant to find. Matched case-insensitively.
const STEM_BANNED_PHRASES: RegExp[] = [
  /different approach(es)? (to|in)/i,
  /contrasting (production|approach|technique|decision)/i,
  /very different (approach|route|way)/i,
  /handled (very )?differently/i,
  /made using (a )?different/i,
  /different official quality categories/i,
  /biological ag(e)?ing/i,
  /oxidative ag(e)?ing/i,
  /lees contact/i,
  /exposure to oxygen/i,
  /residual sugar (achieved|has been achieved) by/i,
];

// Neutral factual framings the exam actually uses. Stripped from the stem before the banned scan so
// e.g. "both have residual sugar" cannot be read as the start of "residual sugar ... by".
const STEM_WHITELIST: RegExp[] = [
  /from \w+ different countries/gi,
  /from the same country/gi,
  /made from the same single grape variety/gi,
  /both have residual sugar/gi,
];

const STEM_WORD_CAP = 40;

// Isolate the scene-setting stem from the sub-questions. Sub-questions begin with a bare letter-paren
// label ("a)", "b)" …), optionally introduced by a "For each/both wine(s):" line; everything before
// the first such label is the stem. A stem with no labels (e.g. a lone framing sentence) is itself.
function extractStem(questionText: string): string {
  const text = questionText || "";
  const marker = text.match(/(?:^|\s)[a-z]\)/i);
  let stem = marker && marker.index != null ? text.slice(0, marker.index) : text;
  // Drop the neutral "For each wine:" / "For both wines:" scaffolding that trails the framing.
  stem = stem.replace(/\bFor (each|both) wines?:/gi, " ");
  return stem.trim();
}

// HARD violations for a stem that pre-announces the discriminator or runs over the word cap.
export function stemPreannouncesDiscriminator(questionText: string): Violation[] {
  const stem = extractStem(questionText);
  if (!stem) return [];
  const violations: Violation[] = [];

  // Whitelist first: remove the neutral framings so they cannot seed a false banned-phrase hit.
  let scan = stem;
  for (const w of STEM_WHITELIST) scan = scan.replace(w, " ");

  for (const re of STEM_BANNED_PHRASES) {
    const hit = re.exec(scan);
    if (hit) {
      violations.push({
        rule: "stem-preannounces-discriminator",
        severity: "hard",
        detail: `Stem states the discriminator the candidate must deduce from the glass: "${hit[0].trim()}". Reframe as a neutral factual set-up.`,
      });
      break; // one verdict per stem is enough — the fix is the same regardless of how many hit.
    }
  }

  const words = stem.split(/\s+/).filter(Boolean);
  if (words.length > STEM_WORD_CAP) {
    violations.push({
      rule: "stem-too-wordy",
      severity: "hard",
      detail: `Stem is ${words.length} words; the cap is ${STEM_WORD_CAP}. Run-on scene-setting telegraphs the inference — trim to a neutral factual frame.`,
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------------------------------
// STEM-FACT CROSS-CHECK — validate the stem's factual claims against the flight's own wines.
//
// A recurring reviewer bin: the stem asserts a variety/blend fact that contradicts the actual flight
// (a "same variety" stem over Barolo + Mencía; an "each a different variety" stem with two Chenin
// Blancs; a "single grape variety" stem over a Châteauneuf/Beaucastel or Port, which are blends). The
// shared rule layer trusts the model's framing; here we parse the stem's claims and check them against
// the resolved wine records, hard-rejecting any contradiction and naming the offending wine + clause.
// ---------------------------------------------------------------------------------------------------

// Appellations that are, by convention, multi-variety blends. A singular "single grape variety" stem
// over one of these is misleading — the reviewer's bin says such a stem should read
// "grape variety or varieties". Patterns run against norm()'d text (lower-case, accents stripped).
const MULTI_VARIETY_APPELLATIONS: { name: string; re: RegExp }[] = [
  { name: "Châteauneuf-du-Pape", re: /chateauneuf[- ]du[- ]pape/ },
  // "Port" as a wine style — guarded against the Australian region "Port Phillip".
  { name: "Port", re: /\bport\b(?!\s*phillip)/ },
  { name: "Rioja", re: /\brioja\b/ },
  { name: "Bordeaux", re: /\bbordeaux\b/ },
  { name: "Chianti", re: /\bchianti\b/ },
];

// The dominant grape of a resolved wine, canonicalised so synonyms and accents don't read as different
// grapes (Shiraz=Syrah, Garnacha/Cannonau=Grenache, Spätburgunder=Pinot Noir, …). "" when unresolved.
function primaryVariety(w: AuditWine): string {
  return canonVariety(w.varieties?.[0] || "");
}

// Why this wine reads as a blend (or null). Three signals, cheapest first: an explicit key flag, a
// variety field listing 2+ grapes, or a label/region/style naming a conventionally-blended appellation.
function blendSignal(w: AuditWine): string | null {
  if (w.is_blend) return "keyed as a blend";
  if ((w.varieties?.length || 0) >= 2)
    return `varieties list ${w.varieties.length} grapes (${w.varieties.join("/")})`;
  const hay = norm([w.fullText, w.region, w.style, ...(w.varieties || [])].filter(Boolean).join(" "));
  const hit = MULTI_VARIETY_APPELLATIONS.find((a) => a.re.test(hay));
  return hit ? `${hit.name} is a multi-variety appellation` : null;
}

// Word-number map for stem cardinality claims ("four different countries", "three different regions").
const STEM_WORD_NUM: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
function parseStemCount(token: string | undefined): number {
  if (!token) return 0;
  return /^\d+$/.test(token) ? Number(token) : STEM_WORD_NUM[token] || 0;
}

// A wine's canonical country / region / style-tag, "" when the key can't place it. canonCountry folds
// synonyms (USA/United States) so two USA wines don't read as two distinct countries; styleTag prefers
// the P3 style_category and falls back to the free-text style.
const countryOf = (w: AuditWine): string => canonCountry(w.country || "");
const regionOf = (w: AuditWine): string => norm(w.region || "");
const styleTag = (w: AuditWine): string => norm(w.style_category || w.style || "");

// Why a wine contradicts a "has residual sugar" / "sweet" stem claim (or null). A resolved RS below
// 5 g/L is bone dry; failing that, a dry style tag (still_dry, "dry"/"bone dry" text — but never the
// off-dry / medium-dry families, which do carry residual sugar) is the fallback signal.
function drySignal(w: AuditWine): string | null {
  if (typeof w.rs === "number" && w.rs < 5) return `RS ${w.rs} g/L is below 5 g/L`;
  const s = norm([w.style, w.style_category].filter(Boolean).join(" "));
  if (!s) return null;
  if (/\b(?:off|medium)[ -]?dry\b/.test(s) || /still_off_dry|still_sweet/.test(s)) return null;
  if (/still_dry|\bbone[ -]?dry\b|\bdry\b/.test(s)) return `keyed dry (${w.style_category || w.style})`;
  return null;
}

export function crossCheckStemFacts(q: QuestionForAudit): Violation[] {
  const v: Violation[] = [];
  const stem = normStem(q.questionText);
  const wines = q.wines || [];

  // (1) "the same (single) grape variety" — every resolved primary variety must be identical.
  if (wines.length >= 2 && /\bsame (?:single )?grape variety\b/.test(stem)) {
    const known = wines.filter((w) => primaryVariety(w));
    if (known.length >= 2) {
      const base = primaryVariety(known[0]);
      const offender = known.find((w) => primaryVariety(w) !== base);
      if (offender)
        v.push({
          rule: "stem-fact-same-variety",
          severity: "hard",
          detail: `stem claims "the same single grape variety", but wine ${offender.slot} is ${primaryVariety(
            offender
          )} while wine ${known[0].slot} is ${base}`,
        });
    }
  }

  // (2) "a different (single) grape variety" / "different grape varieties" — primaries pairwise distinct.
  if (/different (?:single )?grape variet(?:y|ies)/.test(stem)) {
    const seen = new Map<string, number>();
    for (const w of wines) {
      const pv = primaryVariety(w);
      if (!pv) continue;
      const prior = seen.get(pv);
      if (prior !== undefined)
        v.push({
          rule: "stem-fact-distinct-variety",
          severity: "hard",
          detail: `stem claims each wine is "a different grape variety", but wine ${w.slot} and wine ${prior} are both ${pv}`,
        });
      else seen.set(pv, w.slot);
    }
  }

  // (3) A singular variety claim ("single grape variety", or "predominantly … grape variety") must not
  // sit over a blend. Skipped when the stem already hedges as "grape variety or varieties" / "variety(ies)".
  const hedged = /variety or varieties|variety ies\b/.test(stem);
  const singularClaim =
    /\bsingle grape variety\b/.test(stem) || /\bpredominantly\b[a-z ]{0,40}?\bgrape variety\b/.test(stem);
  if (!hedged && singularClaim) {
    for (const w of wines) {
      const why = blendSignal(w);
      if (why)
        v.push({
          rule: "stem-fact-singular-variety-blend",
          severity: "hard",
          detail: `stem asserts a single grape variety, but wine ${w.slot} is a blend (${why}); the stem should read "grape variety or varieties"`,
        });
    }
  }

  // ── Non-variety stem PREDICATES — the four remaining axes beyond variety/blend ──────────────────
  // The shipped checker above only covers variety/blend assertions, so non-variety stem predicates
  // still passed unchecked (fb_121 served "four different countries" over two USA wines; fb_89
  // declared "both wines have residual sugar" while keying a bone-dry Savennières; fb_120 declared
  // "same country … contrasting styles" over a key whose wines shared one style tag). Each parsed
  // predicate is compared against the resolved wine records; a contradiction is a hard reject emitted
  // as STEM_PREDICATE_MISMATCH naming the predicate and the offending wine index.

  // (4) COUNTRY cardinality — "N different countries" needs N distinct; "the same country" needs one.
  {
    const distinctCount = stem.match(
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+different\s+countries\b/
    );
    const required = distinctCount
      ? parseStemCount(distinctCount[1])
      : /\bdifferent countries\b/.test(stem)
        ? wines.length
        : 0;
    if (required >= 2) {
      const placed = wines.filter((w) => countryOf(w));
      const distinct = new Set(placed.map(countryOf));
      if (placed.length >= 2 && distinct.size < required) {
        const seen = new Map<string, number>();
        const dup = placed.find((w) => {
          const c = countryOf(w);
          if (seen.has(c)) return true;
          seen.set(c, w.slot);
          return false;
        });
        const dupNote = dup
          ? ` (wine ${dup.slot} repeats ${dup.country} from wine ${seen.get(countryOf(dup))})`
          : "";
        v.push({
          rule: "STEM_PREDICATE_MISMATCH",
          severity: "hard",
          detail: `stem predicate "${
            distinctCount ? distinctCount[0] : "different countries"
          }" claims ${required} different countries, but the flight keys only ${distinct.size} distinct (${
            [...distinct].join(", ") || "none"
          })${dupNote}`,
        });
      }
    }
    if (/\b(?:the )?same country\b/.test(stem)) {
      const placed = wines.filter((w) => countryOf(w));
      if (placed.length >= 2) {
        const base = placed[0];
        const offender = placed.find((w) => countryOf(w) !== countryOf(base));
        if (offender)
          v.push({
            rule: "STEM_PREDICATE_MISMATCH",
            severity: "hard",
            detail: `stem predicate "same country" is contradicted: wine ${offender.slot} is ${offender.country} while wine ${base.slot} is ${base.country}`,
          });
      }
    }
  }

  // (5) REGION cardinality — "the same region" needs one region; "N different regions" needs N distinct.
  {
    if (/\b(?:the )?same region\b/.test(stem)) {
      const placed = wines.filter((w) => regionOf(w));
      if (placed.length >= 2) {
        const base = placed[0];
        const offender = placed.find((w) => regionOf(w) !== regionOf(base));
        if (offender)
          v.push({
            rule: "STEM_PREDICATE_MISMATCH",
            severity: "hard",
            detail: `stem predicate "same region" is contradicted: wine ${offender.slot} is ${offender.region} while wine ${base.slot} is ${base.region}`,
          });
      }
    }
    const distinctRegions = stem.match(
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+different\s+regions\b/
    );
    const requiredR = distinctRegions
      ? parseStemCount(distinctRegions[1])
      : /\bdifferent regions\b/.test(stem)
        ? wines.length
        : 0;
    if (requiredR >= 2) {
      const placed = wines.filter((w) => regionOf(w));
      const distinct = new Set(placed.map(regionOf));
      if (placed.length >= 2 && distinct.size < requiredR) {
        const seen = new Map<string, number>();
        const dup = placed.find((w) => {
          const r = regionOf(w);
          if (seen.has(r)) return true;
          seen.set(r, w.slot);
          return false;
        });
        const dupNote = dup ? ` (wine ${dup.slot} repeats ${dup.region} from wine ${seen.get(regionOf(dup))})` : "";
        v.push({
          rule: "STEM_PREDICATE_MISMATCH",
          severity: "hard",
          detail: `stem predicate "${
            distinctRegions ? distinctRegions[0] : "different regions"
          }" claims ${requiredR} different regions, but the flight keys only ${distinct.size} distinct${dupNote}`,
        });
      }
    }
  }

  // (6) SWEETNESS — "both/all have residual sugar" or "sweet wines" fails on any keyed wine that is
  // bone dry (RS < 5 g/L or a dry style tag). This is the fb_89 fault: a bone-dry Savennières keyed
  // under "both wines have residual sugar".
  if (
    /\b(?:both|all|each)\b[a-z ]{0,20}\bresidual sugar\b/.test(stem) ||
    /\bhave residual sugar\b/.test(stem) ||
    /\bsweet wines?\b/.test(stem) ||
    /\b(?:both|all|each)\b[a-z ]{0,20}\bsweet\b/.test(stem)
  ) {
    const predicate = /residual sugar/.test(stem) ? "have residual sugar" : "sweet wines";
    for (const w of wines) {
      const why = drySignal(w);
      if (why)
        v.push({
          rule: "STEM_PREDICATE_MISMATCH",
          severity: "hard",
          detail: `stem predicate "${predicate}" is contradicted: wine ${w.slot} (${
            w.region || (w.varieties || []).join("/") || "keyed wine"
          }) is bone dry — ${why}`,
        });
    }
  }

  // (7) STYLE CONTRAST — "contrasting styles" fails when every keyed wine shares one style tag, so
  // there is no contrast to earn the marks (the fb_120 shape: a same-country pair keyed to one style).
  if (/\bcontrasting styles?\b/.test(stem)) {
    const tagged = wines.filter((w) => styleTag(w));
    if (tagged.length >= 2) {
      const base = styleTag(tagged[0]);
      if (tagged.every((w) => styleTag(w) === base))
        v.push({
          rule: "STEM_PREDICATE_MISMATCH",
          // SOFT, unlike the other three axes. The style taxonomy is too coarse to PROVE the absence
          // of contrast: Chablis and Meursault are both `still_dry` yet contrast sharply on oak and
          // texture, and that is a real exam question this rule must not reject. A shared tag is a
          // genuine smell worth surfacing, but only a reviewer can tell a flat pair from an
          // oaked/unoaked one, so it flags rather than blocks. Country/region/sweetness stay hard —
          // those the key can actually decide.
          severity: "soft",
          detail: `stem predicate "contrasting styles" is contradicted: all ${tagged.length} wines share the same style tag (${
            tagged[0].style_category || tagged[0].style
          }) — e.g. wines ${tagged.map((w) => w.slot).join(", ")}`,
        });
    }
  }

  return v;
}

// ---------------------------------------------------------------------------------------------------
// FLIGHT COMPOSITION — banker / curveball balance (Mike's recurring bin cluster).
//
// A recurring reviewer verdict across 14 binned flights (papers 1–3) was, in the reviewer's own
// framing, "a flight like this would likely have a banker" and "three out of the four wines are
// curveballs, normally in a flight like this you would see one curveball, two at best". The banker —
// a classic benchmark expression of a mainstream variety in its home region — is what gives the
// candidate a route to the country; a flight that is all curveballs (obscure varieties/regions with
// no anchoring wine) is unfairly hard and reads as un-MW.
//
// There is no stored banker/curveball flag on the answer key, so we DERIVE one: a wine is a BANKER
// when its resolved region (+ variety, where the pairing matters) matches a small lookup of
// textbook benchmark expressions; every other wine — including any whose origin we cannot place — is
// a CURVEBALL, so the rule fails SAFE (an unrecognised wine counts against the flight, never for it).
//
// Rule: a flight of 2+ wines must contain at least one banker, and the number of curveballs must not
// exceed min(2, ceil(n/2)) — 2-wine flights allow 1 curveball, 3–6 wine flights allow 2. Rejections
// name the curveball wines so the admin can see (and overrule) the call.
// ---------------------------------------------------------------------------------------------------

// Each signal is a classic benchmark expression: a region that (optionally paired with its
// mainstream variety) unambiguously routes a candidate to a country. Deliberately compact — the
// fail-safe default is "curveball", so the list only needs the wines a reasonable examiner would
// call a banker. `region` is tested against the wine's region + country + raw label; `variety`,
// when present, against the resolved (canonicalised) varieties.
type BankerSignal = { region: RegExp; variety?: RegExp };
const BANKER_SIGNALS: BankerSignal[] = [
  // ── France ──
  { region: /\bchablis\b|\bmeursault\b|puligny|chassagne|montrachet|cote de beaune|\bbeaune\b/ },
  { region: /gevrey|chambolle|\bvosne\b|pommard|volnay|cote de nuits/, variety: /pinot noir/ },
  { region: /\bsancerre\b|pouilly-?fume/, variety: /sauvignon/ },
  { region: /chateauneuf/ },
  { region: /cote-?rotie|\bhermitage\b|\bcornas\b|crozes/, variety: /syrah|shiraz/ },
  { region: /\bchampagne\b/ },
  { region: /\bsauternes\b|\bbarsac\b/ },
  { region: /\bmedoc\b|pauillac|margaux|saint-?julien|saint-?estephe|saint-?emilion|\bpomerol\b|pessac|\bgraves\b|\bbordeaux\b/ },
  { region: /beaujolais|\bfleurie\b|\bmorgon\b|moulin-?a-?vent/, variety: /gamay/ },
  { region: /vouvray|savennieres|\bmontlouis\b/, variety: /chenin/ },
  { region: /\balsace\b/, variety: /riesling|gewurztraminer|pinot gris|muscat|pinot blanc/ },
  // ── Italy ──
  { region: /\bbarolo\b|barbaresco|\bbarbera\b\s*d/, variety: /nebbiolo/ },
  { region: /chianti|brunello|montalcino|vino nobile/, variety: /sangiovese/ },
  { region: /\bsoave\b/ },
  { region: /valpolicella|amarone/ },
  { region: /\bprosecco\b/ },
  // ── Spain / Portugal ──
  { region: /\brioja\b/, variety: /tempranillo|grenache/ },
  { region: /ribera del duero/, variety: /tempranillo/ },
  { region: /rias baixas/, variety: /albarino/ },
  { region: /\bjerez\b|\bsherry\b|manzanilla|montilla/ },
  { region: /\bdouro\b|\bport\b|\bporto\b/ },
  // ── Germany / Austria ──
  { region: /\bmosel\b|rheingau|\bpfalz\b|\bnahe\b|rheinhessen/, variety: /riesling/ },
  { region: /\bwachau\b|kamptal|kremstal/, variety: /gruner|riesling/ },
  // ── New World ──
  { region: /marlborough/, variety: /sauvignon/ },
  { region: /central otago|martinborough/, variety: /pinot noir/ },
  { region: /barossa|mclaren vale/, variety: /shiraz|syrah|grenache/ },
  { region: /coonawarra/, variety: /cabernet/ },
  { region: /clare valley|eden valley/, variety: /riesling/ },
  { region: /hunter valley/, variety: /semillon|shiraz/ },
  { region: /margaret river|\byarra\b/ },
  { region: /rutherglen/, variety: /muscat|muscadelle|topaque|tokay/ },
  { region: /\bnapa\b|sonoma|russian river|carneros/ },
  { region: /willamette/, variety: /pinot noir/ },
  { region: /\bmendoza\b|\buco\b/, variety: /malbec/ },
  { region: /\bmaipo\b|colchagua/, variety: /cabernet|carmenere/ },
  { region: /stellenbosch/, variety: /cabernet|chenin|syrah|shiraz/ },
];

/** Derive whether a resolved wine reads as a BANKER (true) or a CURVEBALL (false, incl. unknowns). */
export function isBanker(w: AuditWine): boolean {
  const origin = norm(`${w.region || ""} ${w.country || ""} ${w.fullText || ""}`);
  const variety = norm((w.varieties || []).map(canonVariety).join(" "));
  return BANKER_SIGNALS.some((s) => s.region.test(origin) && (!s.variety || s.variety.test(variety)));
}

function wineLabel(w: AuditWine): string {
  const label = [((w.varieties || []).join("/")), w.region, w.country].filter(Boolean).join(", ");
  if (label) return `wine ${w.slot} (${label})`;
  if (w.fullText) return `wine ${w.slot} (${w.fullText.length > 60 ? `${w.fullText.slice(0, 60)}…` : w.fullText})`;
  return `wine ${w.slot}`;
}

/**
 * Flight-composition rule. Every flight of 2+ wines must have at least one banker, and the number of
 * curveballs must not exceed min(2, ceil(n/2)). Returns hard violations naming the curveball wines.
 */
export function flightCompositionViolations(wines: AuditWine[]): Violation[] {
  const flight = wines || [];
  const n = flight.length;
  if (n < 2) return []; // a single-wine question has no flight balance to judge

  const curveballs = flight.filter((w) => !isBanker(w));
  const list = curveballs.map(wineLabel).join("; ");
  const v: Violation[] = [];

  if (curveballs.length === n) {
    v.push({
      rule: "flight-composition",
      severity: "hard",
      detail: `flight of ${n} wines has no banker — every wine reads as a curveball (${list}). An MW flight needs at least one banker (a classic benchmark expression) to give the candidate a route to the country.`,
    });
  }

  const maxCurveballs = Math.min(2, Math.ceil(n / 2));
  if (curveballs.length > maxCurveballs) {
    v.push({
      rule: "flight-composition",
      severity: "hard",
      detail: `flight of ${n} wines has ${curveballs.length} curveballs but at most ${maxCurveballs} is expected (one, two at best): ${list}.`,
    });
  }

  return v;
}

// ---------------------------------------------------------------------------------------------------
// SINGLE-WINE FLIGHT — a one-wine flight must be a curveball and must NOT ask for variety/origin ID.
//
// Three validated feedbacks say the same thing (fb_354 + fb_355, the same served single-wine Chinon
// question; fb_98, a P3 Madeira-shaped flight). One-wine flights are RARE on the MW exam, and when
// they do appear the wine is a big CURVEBALL and the paper does NOT ask the candidate to identify the
// grape variety or the region/origin — "the candidate would not be expected to pull out a Cabernet
// Franc from Hungary". Instead the exam asks for style, quality, method or COMMERCIAL evaluation
// (fb_98's archetype: "a Qvevri from Georgia, or an Orange wine … a quality evaluation, or a
// commercial evaluation … variety and origin would not be asked"). This rule fires only on a lone
// wine and hard-rejects:
//   • any sub-part that asks the candidate to IDENTIFY the grape variety and/or the region/origin;
//   • a single wine that reads as a BANKER (isBanker) rather than a curveball — a lone banker is not
//     a shape the exam sets (the one corpus instance is an origin-suppressed curveball orange wine).
//
// It also rejects the fb_98 HYBRID structure on any multi-wine flight: a strict subset of the wines
// share a sub-part block while ONE trailing wine gets its own private block ("For wines 1 and 2: … /
// For wine 3: …") — the reviewer's "unlikely structure". The clean 2+2 paired comparison is exempt.
// ---------------------------------------------------------------------------------------------------

// An identification ask for grape variety and/or region/origin, matched on norm()'d question text.
const SINGLE_WINE_ID_ASK_RE =
  /\bidentif(?:y|ies|ication)\b[a-z0-9 ,/()'-]{0,90}\b(?:grape variet(?:y|ies)|varietal|varieties|region|regions|country|countries|origin|origins|appellation|provenance)\b/;

// "For wines 1 and 2:" / "For wine 3 only:" scaffolding → the slots each sub-part block addresses.
// Whole-flight blocks ("For all/each/both wines", "For all three wines") are skipped — they are not a
// per-subset block. Only numeric slot lists within the paper's wine range are collected.
function parseWineGroupScaffolds(questionText: string, wineCount: number): number[][] {
  const text = questionText || "";
  const groups: number[][] = [];
  const re = /\bfor\s+(?:all\s+|both\s+|each\s+|the\s+)*wines?\s+([a-z0-9 ,and&-]+?)\s*(?:only\s*)?[:.]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const clause = m[1].toLowerCase();
    // "all / each / both / every / three / four …" address the whole flight, not a subset.
    if (/\b(?:all|each|both|every|following|two|three|four|five|six)\b/.test(clause)) continue;
    const nums = [...clause.matchAll(/\d+/g)]
      .map((x) => Number(x[0]))
      .filter((num) => num >= 1 && num <= wineCount);
    const uniq = [...new Set(nums)].sort((a, b) => a - b);
    if (uniq.length > 0) groups.push(uniq);
  }
  return groups;
}

/**
 * Single-wine-flight rule. On a one-wine flight, hard-reject a variety/region/origin identification
 * ask and a keyed BANKER (the lone wine must be a curveball). On a multi-wine flight, hard-reject the
 * fb_98 hybrid structure (a shared subset block + one trailing wine's private block), except a 2+2.
 */
export function validateSingleWineFlight(q: QuestionForAudit): Violation[] {
  const wines = q.wines || [];
  const n = wines.length;
  const v: Violation[] = [];
  const text = q.questionText || "";

  if (n === 1) {
    const wine = wines[0];
    const scan = norm(text).replace(/[^a-z0-9 ,/()'-]+/g, " ").replace(/\s+/g, " ");
    if (SINGLE_WINE_ID_ASK_RE.test(scan)) {
      v.push({
        rule: "single-wine-flight",
        severity: "hard",
        detail:
          "single-wine flight asks the candidate to identify the grape variety and/or region of origin — a lone wine on the MW exam is a big curveball and the paper does NOT ask for variety/origin ID; it asks for style, quality, method or commercial evaluation. Move the ask to those parts.",
      });
    }
    if (isBanker(wine)) {
      v.push({
        // Distinct rule name from the ID-ask violation above: the engine drops THIS one in pinned
        // (Live Tasting) mode. "Pick a curveball instead" is not a fix the redraft loop can make when
        // the flight is fixed upstream by retail availability, so blocking on it would spin the
        // generator to exhaustion. The ID-ask half stays hard everywhere — that one is a stem edit.
        rule: "single-wine-flight-banker",
        severity: "hard",
        detail: `single-wine flight is keyed on ${wineLabel(
          wine
        )}, which reads as a banker — when the exam sets a lone wine it is a big curveball (e.g. a Qvevri or an orange wine), never a benchmark expression. Use a curveball wine or set 2+ wines.`,
      });
    }
    return v;
  }

  // fb_98 hybrid: a strict-subset shared block + one trailing wine's own private block. Skip when the
  // stem explicitly declares a paired-comparison (2+2) structure — that is a legitimate exam shape.
  if (n >= 3 && parseDeclaredPairs(extractStem(text)).length < 2) {
    const groups = parseWineGroupScaffolds(text, n);
    const solo = groups.filter((g) => g.length === 1);
    const shared = groups.filter((g) => g.length >= 2 && g.length < n);
    if (solo.length === 1 && solo[0][0] === n && shared.length >= 1) {
      v.push({
        rule: "single-wine-flight",
        severity: "hard",
        detail: `flight gives wines ${shared[0].join(
          " and "
        )} a shared sub-part block while wine ${n} gets its own private block — an unlikely MW structure. Either set the shared wines as an explicit paired comparison, or give the whole flight the same sub-parts.`,
      });
    }
  }

  return v;
}

// ---------------------------------------------------------------------------------------------------
// IDENTIFICATION MARK ALLOCATION — cap variety/origin ID marks against flight difficulty.
//
// A recurring reviewer bin cluster (cross-paper, 5 reasoned bins): flights that are fine to *set* —
// "obscure wines are fine" — but that then pour too many marks into naming the grape variety and
// region of origin. The reviewer's repeated point is that when the wines are curveballs the real
// exam weights the OTHER parts (style, method, quality) and "perhaps might not even ask for the
// variety at all", so a question that awards, say, 20 marks just to identify the grape variety, or
// half the paper to variety+origin over a five-curveball flight, is mis-weighted.
//
// The rule parses each sub-question's mark value, tags any part naming an identification task
// (/identify the (grape variety|region|country|origin)/i) and sums those as idMarks. It then compares
// idMarks against the question total, scaling the ceiling by flight difficulty (reusing the
// curveball classifier — !isBanker — from the flight-composition rule): idMarks may not exceed 50%
// of the total when the flight has NO curveballs, and 35% once the flight has one or more. It also
// caps any SINGLE identification part at 10 marks (catching "20 marks for identify the grape
// variety"). Rejections state idMarks, the total, the applicable cap and the curveball count, so the
// obvious fix is to move marks to the style/method/quality parts.
// ---------------------------------------------------------------------------------------------------

// A part naming an identification task. Matched case-insensitively against the sub-question text.
const ID_PART_RE = /identify the (grape variety|region|country|origin)/i;
// Any one identification sub-question is capped at this per-instance mark value.
const ID_SINGLE_PART_CAP = 10;

// Parse the mark-carrying sub-questions from a question's text. Each "(N marks)" or "(A x B marks)"
// annotation closes a part; `text` is everything since the previous annotation (so it holds the part's
// prompt), `marks` is the part's total (A×B or N), and `perUnit` is the per-instance value (B, or N).
function parseMarkedParts(questionText: string): { text: string; marks: number; perUnit: number }[] {
  const text = questionText || "";
  const re = /\((?:(\d+)\s*[x×]\s*)?(\d+)\s*marks?\)/gi;
  const parts: { text: string; marks: number; perUnit: number }[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const mult = m[1] ? parseInt(m[1], 10) : 1;
    const base = parseInt(m[2], 10);
    parts.push({ text: text.slice(lastIndex, m.index), marks: mult * base, perUnit: base });
    lastIndex = re.lastIndex;
  }
  return parts;
}

/**
 * Identification-mark-allocation rule. Sums the marks on variety/region/origin ID parts and rejects
 * (hard) when they exceed the difficulty-scaled ceiling (50% with no curveballs, 35% with one or
 * more) or when any single ID part is worth more than 10 marks.
 */
export function idMarkAllocationViolations(q: QuestionForAudit): Violation[] {
  const parts = parseMarkedParts(q.questionText);
  if (parts.length === 0) return [];
  const idParts = parts.filter((p) => ID_PART_RE.test(p.text));
  if (idParts.length === 0) return [];

  const idMarks = idParts.reduce((s, p) => s + p.marks, 0);
  const total =
    q.totalMarks && q.totalMarks > 0 ? q.totalMarks : parts.reduce((s, p) => s + p.marks, 0);
  const curveballs = (q.wines || []).filter((w) => !isBanker(w)).length;
  const v: Violation[] = [];

  // (a) No single identification part may exceed the per-part cap (catches "20 marks for the variety").
  const oversized = idParts.find((p) => p.perUnit > ID_SINGLE_PART_CAP);
  if (oversized) {
    const label = oversized.text.match(ID_PART_RE)?.[0] ?? "an identification part";
    v.push({
      rule: "id-mark-allocation",
      severity: "hard",
      detail: `"${label}" is worth ${oversized.perUnit} marks, over the ${ID_SINGLE_PART_CAP}-mark cap on any single variety/region/origin identification part. Move the balance to the style/method/quality parts.`,
    });
  }

  // (b) The identification total must sit under the difficulty-scaled share of the paper.
  if (total > 0) {
    const capFraction = curveballs >= 1 ? 0.35 : 0.5;
    const capMarks = Math.floor(total * capFraction);
    if (idMarks > capMarks) {
      v.push({
        rule: "id-mark-allocation",
        severity: "hard",
        detail: `identification marks total ${idMarks} of ${total} — over the ${Math.round(
          capFraction * 100
        )}% cap (${capMarks} marks) for a flight with ${curveballs} curveball${
          curveballs === 1 ? "" : "s"
        }. Obscure wines are fine, but the exam then weights the other parts (it may not even ask for the variety); move marks to the style/method/quality parts.`,
      });
    }
  }

  return v;
}

// ---------------------------------------------------------------------------------------------------
// PART-TASK REPERTOIRE — every lettered part must set a task the real exam actually sets (admin bin
// cluster, cross-paper, 3 reasoned bins: gen_p2_F2_1785968458385, gen_p3_F7_1785964017240,
// gen_p3_F2_1785964017222).
//
// The generator invents part tasks the real exam never sets ("… including how the bubbles were
// created" — "the exam would never ask that"; a free-standing "Comment on the role of autolysis and
// dosage" — "at best we would see 'discuss the role of yeast'"). One arm:
//
//   • part-task-repertoire — each lettered part is split into COMMAND CLAUSES (sentences, plus
//     mechanism riders like ", including how …" and compound commands ", and explain …" split off so
//     an off-repertoire rider can't hide behind a legitimate opening clause). Every clause must match
//     an ALLOWED_PART_TASKS entry; a clause matching none is a hard reject quoting the clause.
//
// A second arm, `missing-variety-id-part`, was removed on 2026-08-07 for firing on a third of the real
// modern corpus — see the note where it used to live, at the end of partTaskRepertoireViolations.
//
// The registry is DATA-ONLY: new phrasings are added by editing the array, never the rule. Entries
// are seeded from past-paper phrasings (the compilation + the canonical templates the generation
// prompt quotes from real 2018–2025 papers). Regexes run on a cleaned clause: norm()'d (lower-case,
// accents stripped) with punctuation flattened to spaces.
// ---------------------------------------------------------------------------------------------------

export interface AllowedPartTask {
  id: string;
  label: string;
  re: RegExp;
}

// Verb stems the exam uses to open a task. Shared across entries so a new verb is one edit.
const TASK_VERBS = "(?:identify|comment(?: briefly)? (?:on|upon)|describe|discuss|assess|evaluate|analyse|analyze|compare(?: and contrast)?|contrast|explain|state|estimate|account for)";

export const ALLOWED_PART_TASKS: AllowedPartTask[] = [
  {
    id: "identify-variety",
    label: "identify the grape variety (or varieties)",
    // "grape" is optional and "name" is a verb the exam uses: the real papers write "Identify the
    // origin and variety as closely as possible" (2019 P2 Q2), "Identify the origin and variety/ies
    // used" (2021 P1 Q1) and "Name the dominant grape variety" (2017 P3 Q4). Requiring the literal
    // "grape variet…" made the repertoire scan reject those authentic phrasings.
    re: /\b(?:identify|name|comment(?: briefly)? on|discuss|state)\b[a-z0-9 ]{0,90}\b(?:grape )?variet(?:y|ies)\b/,
  },
  {
    id: "identify-origin",
    label: "identify the country and/or region of origin as closely as possible",
    re: /\bidentify\b[a-z0-9 ]{0,90}\b(?:country|countries|region|regions|origin|origins|appellation)\b/,
  },
  {
    id: "identify-wine",
    label: "identify the wine as closely as possible",
    // The object must be the WINE itself ("identify each wine as closely as possible") — an origin
    // object ("identify the country … as closely as possible") belongs to identify-origin and must
    // not satisfy this entry (it subsumes the variety ask; origin alone does not).
    re: /\bidentify (?:the |each |both |all )?wines?\b[a-z0-9 ]{0,30}\bas closely as possible\b/,
  },
  {
    id: "style",
    label: "comment on the style and key characteristics",
    re: new RegExp(`\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:styles?|key characteristics|character)\\b`),
  },
  {
    id: "winemaking",
    label: "comment on the key winemaking/production decisions and how they influenced style",
    re: new RegExp(
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:winemaking|wine making|vinification|maturation|elevage|viticultur[a-z]*|production (?:decisions?|methods?|techniques?)|methods? (?:of|used in|used for) (?:its )?production|production of|techniques?)\\b`
    ),
  },
  {
    id: "named-factor-role",
    label: "discuss the role of <named factor> (yeast, oak, climate, …)",
    re: /\b(?:discuss|comment on|assess|describe|explain)\b[a-z0-9 ]{0,40}\brole (?:played by |of )(?:the )?(?:yeast|oak|oxygen|climate|soil|terroir|acidity|human inputs?|natural factors?)\b/,
  },
  {
    id: "sweetness-method",
    label: "state/explain how the sweetness (residual sugar) has been achieved",
    // Corpus-attested P3 staple ("State how the level of sweetness in each wine has been achieved").
    re: new RegExp(`\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:sweetness|residual sugar|sugar)\\b`),
  },
  {
    id: "blend-composition",
    label: "comment on the blend and the role of its components",
    re: new RegExp(
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:blends?|blending|blended|assemblage|components? (?:of|in) the blend|role played by each component)\\b`
    ),
  },
  {
    id: "quality",
    label: "comment on quality/faults",
    re: new RegExp(
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:quality|qualities|faults?|maturity|tier|classification|quality designation)\\b`
    ),
  },
  {
    id: "quality-ranking",
    label: "rank/place the wines in order of quality",
    re: /\b(?:rank|place|put|order|list)\b[a-z0-9 ]{0,50}\b(?:order of|by)\b[a-z0-9 ]{0,30}\b(?:quality|preference)\b/,
  },
  {
    id: "readiness-ageing",
    label: "comment on readiness for drinking and ageing potential",
    // Keyword-only (no verb requirement): these phrases are unambiguous task markers, and real parts
    // sometimes carry them in verb-less clauses ("… and how long each wine is likely to hold").
    re: /\b(?:readiness for drinking|ready to drink|drink(?:ing)? window|drinkability|likely to hold|drink well|ag(?:e)?ing potential|potential for (?:further )?ag(?:e)?ing|ability to age|capacity to age|capacity for ag(?:e)?ing|future development)\b/,
  },
  {
    id: "commercial",
    label: "comment on the commercial position",
    re: new RegExp(
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:commercial|consumer appeal|market position|target market|price|pricing|value for money)\\b`
    ),
  },
  {
    id: "compare-wines",
    label: "compare and contrast the wines (dimension carried by sibling clauses)",
    re: /\bcompare(?: and contrast)?\b[a-z0-9 ]{0,40}\b(?:wines?|pairs?)\b/,
  },
  {
    id: "differences",
    label: "discuss how the wines differ",
    re: new RegExp(`\\b${TASK_VERBS}\\b[a-z0-9 ]{0,50}\\bdiffer(?:s|ences?)?\\b`),
  },
  {
    id: "how-made",
    label: "discuss how the wine has been made",
    re: /\bhow (?:the|this|each|these) wines? (?:has|have|was|were)(?: been)? made\b/,
  },
  {
    id: "justify",
    label: "justify your answer / give reasons",
    re: /^(?:justify(?:ing)? your|give (?:your )?reasons?|support your|with reference to)\b/,
  },
  {
    id: "state-analytic",
    label: "state the residual sugar / sweetness (dosage) category / alcohol level",
    re: /\b(?:state|estimate|identify)\b[a-z0-9 ]{0,40}\b(?:residual sugar|sweetness (?:level|category)|level of sweetness|dosage(?: category| level)?|abv|alcohol)\b/,
  },
];

// (NON_VARIETAL_STYLE_RE lived here: the sparkling/fortified exemption for the variety-ID template
// requirement. Removed with that requirement — the exam asks origin-only on still flights too, so
// there is nothing left to exempt.)

// The lettered parts of a question ("a) …" … up to the next label). Scaffolding before the first
// label (the stem, "For each wine:") is excluded — the repertoire scan judges commands, not framing.
function parseLetteredParts(questionText: string): { letter: string; text: string }[] {
  const text = questionText || "";
  const labels = [...text.matchAll(/(?:^|[^a-z0-9])([a-z])\)\s/gi)].map((m) => ({
    letter: m[1].toLowerCase(),
    labelAt: m.index ?? 0,
    start: (m.index ?? 0) + m[0].length,
  }));
  return labels.map((l, i) => ({
    letter: l.letter,
    text: text.slice(l.start, i + 1 < labels.length ? labels[i + 1].labelAt : text.length),
  }));
}

// Split a part into command clauses. Sentence boundaries first; then mechanism riders (", including
// how …") and compound commands (", and explain …") are split off so each command is judged alone.
function splitCommandClauses(partText: string): string[] {
  const noMarks = (partText || "").replace(/\((?:\d+\s*[x×]\s*)?\d+\s*marks?\)/gi, " ");
  const clauses: string[] = [];
  for (const sentence of noMarks.split(/[.?!;:\n]+/)) {
    for (const clause of sentence.split(
      /,?\s+including\s+(?=(?:how|why|whether)\b)|,\s+and\s+(?=(?:identify|comment|describe|discuss|assess|evaluate|compare|contrast|explain|state|estimate)\b)/i
    )) {
      const cleaned = norm(clause).replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
      // Skip fragments, mark-recap tables ("a 15 b 24 c 21 d 15 75", "3 x 8 24") and pure
      // scaffolding ("for each wine:", "for wines 1 and 2:", "be as precise as possible").
      const meaningful = cleaned
        .split(" ")
        .filter(
          (t: string) =>
            t &&
            !/^\d+$/.test(t) &&
            !/^[a-z]$/.test(t) &&
            !["x", "mark", "marks", "total", "per", "wine", "wines", "each"].includes(t)
        );
      if (meaningful.length < 3) continue;
      if (
        /^(?:for (?:each|both|all|the)(?: \w+)? wines?(?: \d+(?: and \d+)*)?|with reference to (?:each|both|all)(?: \w+)? wines?|in each case|be as (?:precise|specific|accurate) as possible)$/.test(
          cleaned
        )
      )
        continue;
      clauses.push(cleaned);
    }
  }
  return clauses;
}

/**
 * Part-task-repertoire rule. Every command clause of every lettered part must match an
 * ALLOWED_PART_TASKS entry — an unmatched clause is a hard reject quoting the clause. A flight is NOT
 * required to ask for the grape variety: the exam routinely asks origin only (EK-0154).
 */
export function partTaskRepertoireViolations(q: QuestionForAudit): Violation[] {
  const v: Violation[] = [];
  const parts = parseLetteredParts(q.questionText || "");

  for (const part of parts) {
    for (const clause of splitCommandClauses(part.text)) {
      if (!ALLOWED_PART_TASKS.some((t) => t.re.test(clause))) {
        v.push({
          rule: "part-task-repertoire",
          severity: "hard",
          detail: `part ${part.letter} sets a task outside the real exam's repertoire: "${clause}". Each command must be one of the canonical past-paper tasks (identify variety/origin, comment on style, winemaking, quality, readiness, commercial, discuss the role of a named factor).`,
        });
      }
    }
  }

  // REMOVED 2026-08-07 — the required-template arm (`missing-variety-id-part`). It hard-rejected any
  // flight of 2+ wines whose parts asked for origin identification but never for the grape variety,
  // on the strength of one reviewer bin (gen_p2_F2_1785968458385, "this question would ask for variety
  // identification"). The corpus says otherwise, and EK-0154 had already recorded it: run over
  // data/exams.json the rule fires on **27 of the 82 modern (2018-2026) real questions** and 21 of the
  // 80 older ones — including 2026 P2 Q3, 2025 P3 Q2, 2024 P1 Q3, 2023 P2 Q1 and 2022 P1 Q1, five of
  // the last six exam years. "Identify the origin as closely as possible" + style/quality/method, with
  // no variety ask anywhere, is one of the IMW's standard modern shapes; a candidate who names the
  // region has usually named the grape implicitly. It was quarantining 19 servable banked questions
  // (15 of them for this reason alone) for being exam-realistic. Not demoted to soft either — a flag
  // on a third of the real corpus is noise, not review signal.
  //
  // (The widened identify-variety pattern above is the other half of the same fault: two of those
  // modern "misses" DO ask for the variety, phrased "Identify the origin and variety/ies used".)

  return v;
}

// ---------------------------------------------------------------------------------------------------
// CONTRAST INTEGRITY — a compare/contrast/explain ask must sit over wines that actually differ on the
// dimension it names (admin bin cluster, Paper 3, 5 reasoned bins).
//
// The reviewer repeatedly binned questions that ask the candidate to compare/contrast (or explain) a
// named dimension where every referenced wine shares the SAME value on it, so there is no contrast to
// earn the marks with: "the method in which sweetness has been achieved is the same in each pair,
// typically we should see contrast within a pair"; "3 of these wines were made sweet by late
// harvesting"; "both wines were made by the same method, so no contrast"; "16 marks … for the methods
// of production … method to make these two wines is identical". Two dimensions are resolved on the
// flight's own wine records and required to differ:
//   • SWEETNESS MECHANISM — late harvest, botrytis, dried grape, fortification/mutage, icewine,
//     arrested fermentation, sweet reserve.
//   • METHOD OF PRODUCTION — the METHOD CLASS (tank vs traditional method, oxidative vs biological
//     ageing, cask/port ageing regime) via the shared methodClass() resolver.
// Where the stem declares a pair structure ("1 and 2, 3 and 4, 5 and 6") the rule is evaluated per
// PAIR (the reviewer expects the contrast INSIDE each pair); otherwise it is evaluated flight-wide,
// firing when every referenced wine shares one value, or when a strict majority do (the "3 of 5 late
// harvest" bin). Wines whose value cannot be positively resolved are skipped, so the rule fails SAFE.
// ---------------------------------------------------------------------------------------------------

// A dimension the exam can ask the candidate to compare/contrast/explain. `askRe` fires when a
// sub-question names the dimension under a compare/contrast/explain verb; `resolve` returns the wine's
// canonical value on it (or null when it can't be positively determined). Regexes run on norm()'d text.
type ContrastDimension = {
  id: string;
  label: string;
  askRe: RegExp;
  resolve: (w: AuditWine) => string | null;
};

// Sweetness-mechanism signals, most-specific first (botrytis's "…beerenauslese" outranks the generic
// "auslese" late-harvest term). Tested against norm(style + style_category + fullText).
const SWEETNESS_MECHANISMS: { value: string; re: RegExp }[] = [
  { value: "botrytis", re: /botrytis|noble rot|edelfaule|sauternes|barsac|aszu|trockenbeerenauslese|beerenauslese|tokaji/ },
  { value: "icewine", re: /icewine|ice wine|eiswein/ },
  { value: "dried grape", re: /dried.grape|appassimento|passito|recioto|vin ?santo|straw wine|amarone|pedro ximenez/ },
  { value: "fortification", re: /fortif|mutage|vin doux naturel|\bvdn\b|\bport\b(?!\s*phillip)|maury|banyuls|rutherglen|liqueur muscat|muscat de|rivesaltes/ },
  { value: "arrested fermentation", re: /arrested fermentation|fermentation (?:was |is |been )?(?:stopped|arrested|halted)/ },
  { value: "sweet reserve", re: /sweet reserve|sussreserve/ },
  { value: "late harvest", re: /late.harvest|late.picked|vendange tardive|spatlese|auslese|noble late/ },
];

function sweetnessMechanism(w: AuditWine): string | null {
  const hay = norm([w.style, w.style_category, w.fullText].filter(Boolean).join(" "));
  if (!hay) return null;
  const hit = SWEETNESS_MECHANISMS.find((m) => m.re.test(hay));
  return hit ? hit.value : null;
}

const CONTRAST_DIMENSIONS: ContrastDimension[] = [
  {
    id: "sweetness-mechanism",
    label: "sweetness mechanism",
    // "explain the sweetness mechanism", "compare … the sweetness", "the method by/in which sweetness
    // has been achieved", "how the sweetness is imparted".
    askRe: /(?:compare|contrast|explain|account for|describe|discuss)[^.?!]{0,60}sweet(?:ness)?|sweet(?:ness)?[^.?!]{0,50}(?:mechanism|achiev|impart|obtain|attain|arriv)|method (?:by|in) which[^.?!]{0,50}sweet/,
    resolve: sweetnessMechanism,
  },
  {
    id: "method-of-production",
    label: "method of production",
    askRe: /(?:compare|contrast)[^.?!]{0,60}(?:methods? of production|production methods?|(?:cask |barrel )?age?ing|maturation|winemaking|vinification)/,
    resolve: (w) => methodClass(w.style, w.style_category),
  },
];

// Slot pairs the stem declares ("Wines 1 to 6 form three pairs: 1 and 2, 3 and 4, 5 and 6"). Only
// activated when the stem literally speaks of pairs AND lists ≥2 "X and Y" groups, so a plain two-wine
// "Wines 1 and 2 …" stem is never mistaken for a pair structure.
function parseDeclaredPairs(stem: string): [number, number][] {
  const s = norm(stem);
  if (!/\bpairs?\b/.test(s)) return [];
  const pairs: [number, number][] = [];
  for (const m of s.matchAll(/\b(\d+)\s+and\s+(\d+)\b/g)) pairs.push([Number(m[1]), Number(m[2])]);
  return pairs.length >= 2 ? pairs : [];
}

// The letter label ("b") of the sub-question that carries the ask, for a precise "part b" reference.
function findAskPart(questionText: string, askRe: RegExp): string | null {
  const text = questionText || "";
  const labels = [...text.matchAll(/(?:^|[^a-z])([a-z])\)/gi)].map((m) => ({
    letter: m[1].toLowerCase(),
    index: (m.index ?? 0) + m[0].length - 2,
  }));
  if (labels.length === 0) return null;
  for (let i = 0; i < labels.length; i++) {
    const end = i + 1 < labels.length ? labels[i + 1].index : text.length;
    if (askRe.test(norm(text.slice(labels[i].index, end)))) return labels[i].letter;
  }
  return null;
}

/**
 * Contrast-integrity rule. For every dimension a sub-question asks the candidate to compare/contrast/
 * explain, require the referenced wines (or, for a declared pair structure, the wines within each
 * pair) to actually differ on it. Returns hard violations naming the shared value.
 */
export function contrastIntegrityViolations(q: QuestionForAudit): Violation[] {
  const wines = q.wines || [];
  if (wines.length < 2) return [];
  const text = q.questionText || "";
  const pairs = parseDeclaredPairs(extractStem(text));
  const v: Violation[] = [];

  for (const dim of CONTRAST_DIMENSIONS) {
    if (!dim.askRe.test(norm(text))) continue;
    const part = findAskPart(text, dim.askRe);
    const ref = part ? `part ${part}` : "the compare-and-contrast";

    if (pairs.length >= 2) {
      // Per-pair: the reviewer expects the contrast INSIDE each pair.
      for (const [a, b] of pairs) {
        const wa = wines.find((w) => w.slot === a);
        const wb = wines.find((w) => w.slot === b);
        if (!wa || !wb) continue;
        const va = dim.resolve(wa);
        const vb = dim.resolve(wb);
        if (va && vb && va === vb)
          v.push({
            rule: "contrast-integrity",
            severity: "hard",
            detail: `wines ${a} and ${b} share the same ${dim.label} (${va}) — no contrast within the pair for ${ref}`,
          });
      }
      continue;
    }

    // Flight-wide: fire when every resolved wine shares one value, or a strict majority do.
    const resolved = wines
      .map((w) => dim.resolve(w))
      .filter((val): val is string => Boolean(val));
    if (resolved.length < 2) continue;
    const counts = new Map<string, number>();
    for (const val of resolved) counts.set(val, (counts.get(val) || 0) + 1);
    let dominant = "";
    let dominantN = 0;
    for (const [val, n] of counts) if (n > dominantN) [dominant, dominantN] = [val, n];
    const n = resolved.length;
    if (counts.size === 1)
      v.push({
        rule: "contrast-integrity",
        severity: "hard",
        detail: `all ${n} wines use ${dominant} — no contrast available for ${ref}`,
      });
    else if (dominantN * 2 > n)
      v.push({
        rule: "contrast-integrity",
        severity: "hard",
        detail: `${dominantN} of ${n} wines use ${dominant} — insufficient ${dim.label} contrast for ${ref}`,
      });
  }

  return v;
}

// ---------------------------------------------------------------------------------------------------
// PAPER STYLE MIX — the wine-style mix of a flight must fit the paper it is set for (feedback cluster
// fb_145 / fb_71 / fb_47, cross-paper).
//
// Paper identity was never constrained by wine STYLE, so the generator produced flights that read as
// the wrong paper: Paper 3 got a pair of two still white wines made by different methods (fb_145 — the
// reviewer notes Paper 3 "focuses very heavily on sparkling, sweet, and fortified wines with occasional
// rosés", and a still-only pair is a Paper 1 question), while Paper 1 got two sparkling wines in one
// four-wine flight (fb_47) and a sparkling-plus-medium-sweet flight crowding out the classics (fb_71).
//
// This rule tags every KEYED wine's dominant style — still / sparkling / fortified / sweet / rosé —
// via the shared classifyWineStyle() (rosé cross-cuts, so it is counted separately), then applies a
// per-paper predicate:
//   • Paper 3 — reject any flight in which FEWER THAN HALF the wines (and at minimum one) are
//     sparkling, sweet, fortified or rosé. A still-only or still-dominant flight is a Paper 1/2 flight.
//   • Paper 1 — reject a flight with MORE THAN ONE sparkling wine, or with ANY fortified wine. (An
//     occasional single sparkling is fine; sweetness is left unconstrained here.)
//   • Paper 2 — unconstrained.
// Every rejection emits PAPER_STYLE_MIX with the paper, the counted styles, and the rule that fired.
// ---------------------------------------------------------------------------------------------------

/** The dominant style + rosé flag of a keyed wine, resolved from its style/style_category/label. */
function wineStyleTags(w: AuditWine): { style: string; isRose: boolean } {
  const text = [w.style, w.style_category, w.fullText].filter(Boolean).join(" ");
  return classifyWineStyle(text);
}

export function validatePaperStyleMix(paper: number, wines: AuditWine[]): Violation[] {
  const flight = wines || [];
  const n = flight.length;
  if (n === 0) return [];

  const tagged = flight.map(wineStyleTags);
  const counts = {
    sparkling: tagged.filter((t) => t.style === "sparkling").length,
    fortified: tagged.filter((t) => t.style === "fortified").length,
    sweet: tagged.filter((t) => t.style === "sweet").length,
    rose: tagged.filter((t) => t.isRose).length,
  };
  // Wines carrying a Paper-3 character style (rosé cross-cuts, so count each wine once).
  const p3Character = tagged.filter(
    (t) => t.isRose || t.style === "sparkling" || t.style === "sweet" || t.style === "fortified"
  ).length;
  const countsLabel = `sparkling ${counts.sparkling}, sweet ${counts.sweet}, fortified ${counts.fortified}, rosé ${counts.rose}`;
  const v: Violation[] = [];

  if (paper === 3) {
    // Fewer than half (and at minimum one) sparkling/sweet/fortified/rosé → a Paper 1/2 flight.
    if (p3Character < 1 || p3Character * 2 < n) {
      v.push({
        rule: "paper-style-mix",
        severity: "hard",
        detail: `PAPER_STYLE_MIX: Paper 3 flight of ${n} wines has only ${p3Character} sparkling/sweet/fortified/rosé wine${
          p3Character === 1 ? "" : "s"
        } (${countsLabel}) — Paper 3 leans heavily on those styles, so at least half of the flight (and a minimum of one) must be sparkling, sweet, fortified or rosé. A still-only or still-dominant flight belongs on Paper 1 or 2. Rule fired: p3-min-half-special.`,
      });
    }
  } else if (paper === 1) {
    // At most one sparkling wine; no fortified wine (Paper 1 tests the still classics).
    if (counts.sparkling > 1) {
      v.push({
        rule: "paper-style-mix",
        severity: "hard",
        detail: `PAPER_STYLE_MIX: Paper 1 flight has ${counts.sparkling} sparkling wines (${countsLabel}) — at most one sparkling wine is realistic on Paper 1, which tests the still classics. Rule fired: p1-max-one-sparkling.`,
      });
    }
    if (counts.fortified > 0) {
      v.push({
        rule: "paper-style-mix",
        severity: "hard",
        detail: `PAPER_STYLE_MIX: Paper 1 flight contains ${counts.fortified} fortified wine${
          counts.fortified === 1 ? "" : "s"
        } (${countsLabel}) — fortified wines belong on Paper 3, not Paper 1. Rule fired: p1-no-fortified.`,
      });
    }
  }
  // Paper 2 is intentionally unconstrained.
  return v;
}

// ---------------------------------------------------------------------------------------------------
// R-COLOUR — the unconditional colour/style contract (Right Paper Check).
//
// A hard rule alongside R1 (country diversity), R2 (same variety) and the mark-allocation validators.
// Paper 1 may only ever serve STILL WHITE wine; Paper 2 may only ever serve STILL RED. Paper 3 has no
// colour restriction. The rule is UNCONDITIONAL: no stem wording can license a wrong-colour wine, and
// a stem that itself implies a mixed/other colour on Paper 1/2 fails with the distinct reason
// `stem_colour_conflict`. See CLAUDE.md ("Paper 1: white still wines. Paper 2: red still wines.
// Paper 3: a mix…") and mw_exam_empirical_knowledge §4.
//
// Colour is DERIVED from the wine record's existing style/style_category/label/variety fields via
// classifyWineColour(), which resolves the strict enum white|red|rose|orange|sparkling|sweet|fortified
// (the same enum a generation-time LLM classifier persists onto records that lack a reliable colour
// key). It reuses the shared style classifier (classifyWineStyle) and grape indicators so a wine is
// tagged exactly as the rest of the system tags it. When a still wine's colour cannot be positively
// determined the classifier returns null and the rule SKIPS that wine — it fails SAFE, never blocking
// a wine it cannot place.
// ---------------------------------------------------------------------------------------------------

export type WineColour = "white" | "red" | "rose" | "orange" | "sparkling" | "sweet" | "fortified";

const COLOUR_STYLE_LABEL: Record<WineColour, string> = {
  white: "still white",
  red: "still red",
  rose: "rosé",
  orange: "orange / skin-contact",
  sparkling: "sparkling",
  sweet: "sweet / dessert",
  fortified: "fortified",
};

// Orange / skin-contact whites — the shared style classifier folds these into "oxidative", but the
// colour contract names them as their own blocked style, so they are resolved explicitly here.
const ORANGE_STYLE_RE = /orange wine|skin[- ]?contact|amber wine|\bramato\b|\bqvevri\b|\bkvevri\b/;
// Free-text colour cues on the label/region, used to settle still red vs still white when the grape
// indicators are silent. Accent-stripped (matched against norm()'d text).
const RED_COLOUR_CUE = /\b(red|rouge|rosso|tinto|tinta|rot|noir|nero)\b/;
const WHITE_COLOUR_CUE = /\b(white|blanc|blanco|bianco|weiss|weisser|weisswein)\b/;

/**
 * Resolve ONE wine's colour/style onto the strict R-COLOUR enum, or null when a still wine's colour
 * cannot be positively determined (fail-safe). Priority: fortified > sparkling > sweet > orange > rosé
 * > still red/white — a wine that is BOTH a special style and a colour is named by the style the
 * contract blocks on (a rosé Champagne is `sparkling`, a sweet white is `sweet`).
 */
export function classifyWineColour(w: AuditWine): WineColour | null {
  const styleText = [w.style, w.style_category, w.fullText].filter(Boolean).join(" ");
  const hay = norm([w.fullText, w.style, w.style_category, w.region, ...(w.varieties || [])].filter(Boolean).join(" "));
  if (!hay && !styleText) return null;

  const { style, isRose } = classifyWineStyle(styleText || hay);
  if (style === "fortified") return "fortified";
  if (style === "sparkling") return "sparkling";
  if (style === "sweet") return "sweet";
  if (ORANGE_STYLE_RE.test(hay)) return "orange";
  if (isRose) return "rose";

  // Still wine → red vs white. Prefer the resolved varieties, then any label colour cue.
  const varietyBlob = norm((w.varieties || []).map((x) => canonVariety(x)).join(" "));
  const red = RED_GRAPE_INDICATORS.test(varietyBlob) || RED_GRAPE_INDICATORS.test(hay) || RED_COLOUR_CUE.test(hay);
  const white =
    WHITE_GRAPE_INDICATORS.test(varietyBlob) || WHITE_GRAPE_INDICATORS.test(hay) || WHITE_COLOUR_CUE.test(hay);
  if (red && !white) return "red";
  if (white && !red) return "white";

  // Last resort: resolve the dominant variety from the label (covers appellation-only labels) and
  // read its colour off the shared indicators.
  const primary = (w.varieties?.[0] && canonVariety(w.varieties[0])) || detectPrimaryVariety(w.fullText || "");
  if (primary && primary !== "unknown") {
    if (RED_GRAPE_INDICATORS.test(primary)) return "red";
    if (WHITE_GRAPE_INDICATORS.test(primary)) return "white";
  }
  return null; // indeterminate — skip (fail safe)
}

/**
 * Detect a stem that itself implies a colour/style the paper forbids. Requires the word "wine(s)"
 * after a colour so a tasting descriptor ("white pepper") can never trip it; the unambiguous style
 * words (sparkling/fortified) stand alone. Returns one hard violation or null.
 */
function stemColourConflict(paper: number, questionText: string | undefined): Violation | null {
  const stem = normStem(questionText || "");
  if (!stem) return null;
  const forbidden =
    paper === 1
      ? /\b(red wines?|rose wines?|rosado wines?|rosato wines?|sparkling wines?|dessert wines?|sweet wines?|fortified)\b/
      : /\b(white wines?|rose wines?|rosado wines?|rosato wines?|sparkling wines?|dessert wines?|fortified)\b/;
  const m = stem.match(forbidden);
  if (!m) return null;
  return {
    rule: "stem_colour_conflict",
    severity: "hard",
    detail: `Paper ${paper} is ${
      paper === 1 ? "STILL WHITE" : "STILL RED"
    } only, but the stem wording implies a forbidden colour/style ("${m[0].trim()}"). Rule R-COLOUR is unconditional — stem text can never override it.`,
  };
}

/**
 * R-COLOUR. Paper 1 → every wine must be still white; Paper 2 → every wine must be still red; Paper 3
 * → no restriction. Emits `wrong_colour_for_paper` (hard) per offending wine, carrying the paper and
 * the detected colour, and `stem_colour_conflict` (hard) when the stem implies a forbidden colour.
 */
export function validatePaperColour(paper: number, wines: AuditWine[], questionText?: string): Violation[] {
  if (paper !== 1 && paper !== 2) return [];
  const allowed: WineColour = paper === 1 ? "white" : "red";
  const allowedLabel = paper === 1 ? "STILL WHITE" : "STILL RED";
  const v: Violation[] = [];

  for (const w of wines || []) {
    const colour = classifyWineColour(w);
    if (colour && colour !== allowed) {
      v.push({
        rule: "wrong_colour_for_paper",
        severity: "hard",
        detail: `Paper ${paper} must serve ${allowedLabel} wine only, but ${wineLabel(
          w
        )} reads as ${COLOUR_STYLE_LABEL[colour]} (detected colour "${colour}"). Rule R-COLOUR is unconditional.`,
      });
    }
  }

  const stemV = stemColourConflict(paper, questionText);
  if (stemV) v.push(stemV);
  return v;
}

// ---------------------------------------------------------------------------------------------------
// TASTING-NOTE COMPLETENESS — every wine's generated note must carry the visual + structural markers a
// candidate leads with, and must never describe the ABSENCE of bubbles (feedback cluster fb_246,
// fb_244, fb_53).
//
// Candidates identify wines from the glass by colour + intensity and by alcohol/warmth as much as by
// flavour (fb_246: "one of the big structural characters that I use … is the alcohol levels"); Paper 3
// in particular is unanswerable "with any precision" without visual cues (fb_53). And a note must never
// state that a wine has no bubbles — bubbles are only ever a positive cue, graded fine-persistent
// (traditional-method) vs soft-frothy (tank-method) (fb_244).
//
// This is the KEY-stage wrapper over the shared note-integrity rules (tasting-validators.ts): it maps
// each coded verdict onto a hard Violation with the stable reason code as its rule, so the audit /
// analysis path can reject the whole question with 'note_missing_appearance' / 'note_missing_alcohol'
// (and the bubble/colour codes) when ANY wine in the flight lacks a required marker.
// ---------------------------------------------------------------------------------------------------
export function checkNoteCompleteness(
  wineNotes: string[],
  wines: TastingValidationWine[],
  paper?: number
): Violation[] {
  return noteCompletenessViolations(wineNotes, wines, paper).map((x) => ({
    rule: x.code,
    severity: "hard" as const,
    detail: x.detail,
  }));
}

// ---------------------------------------------------------------------------------------------------
// MARK BUDGET — the hard MW mark-allocation rule (accepted user feedback fb_138, fb_96, fb_73, fb_79).
//
// Two non-negotiable facts about a real IMW tasting paper, stated verbatim by candidates and accepted
// by the analysis loop:
//   • "there should be exactly 25 points per wine … a hard fast rule" (fb_138); "every wine, no matter
//     which paper, will have exactly 25 marks available … This is non-negotiable. This question has 70
//     marks for 2 wines, which would not occur" (fb_96). → the sum of every sub-part's marks (expanding
//     the "n × m" per-wine notation) must equal EXACTLY 25 × wineCount, else MARKS_TOTAL_MISMATCH.
//   • A written analytical task is never priced at 2 marks: "Commercial positioning is always at least
//     five points" and "The only questions ever for 2 points are … residual sugar in g[/l] … and …
//     alcohol percentage" (fb_73); the grading granularity fb_79 describes only makes sense above a
//     5-mark floor. → any sub-part whose task is commercial positioning, quality assessment, style, or
//     method of production must carry ≥ 5 marks per wine it covers (≥ 5 × n when asked across the whole
//     flight in a single un-multiplied total); only a literal numeric readout ("state the residual sugar
//     in g/L", "state the alcohol in % abv") may sit at 2 marks. A shortfall is MARKS_BELOW_FLOOR.
//
// This is the KEY-stage twin of the generation engine's own validateMarkAllocation (question-engine.ts):
// putting it here lets the corpus audit and the feedback/regeneration loop reject and self-correct a
// budget that could not occur on a real paper. It reuses the shared part-task classifier
// (ALLOWED_PART_TASKS) so a task's category is resolved the same way it is everywhere else in this file.
// It only judges a WELL-FORMED question (its lettered parts begin at "a)"); a bare fragment passed in
// isolation is left alone. It does NOT choose marks — it only rejects budgets that cannot occur.
// ---------------------------------------------------------------------------------------------------

// The five-mark-floor task categories (fb_73/fb_79), keyed to the shared ALLOWED_PART_TASKS ids:
// commercial positioning, quality assessment, style, and method of production (the "winemaking" entry).
const FLOOR_TASK_IDS = new Set(["commercial", "quality", "style", "winemaking"]);
const MARK_FLOOR_PER_WINE = 5;

// The only ask the exam ever prices at 2 marks: a literal numeric readout of residual sugar or alcohol
// (fb_73 — "answered in a few seconds e.g. 120 g/l, 20% ABV"). A part matching this is exempt from the
// floor at any mark value. Everything else that is a floor task must clear the 5-mark-per-wine floor.
const LITERAL_FACTUAL_ASK_RE =
  /\b(?:state|give|indicate|estimate|identify)\b[a-z0-9 ,]{0,50}\b(?:residual sugar|\brs\b|alcohol|abv)\b/;

// A single un-multiplied total that is asked ACROSS the whole flight (fb_73's "overall … compare and
// contrast across all wines … 18–24 points"). Such a part's floor is 5 × wineCount, not 5.
const FLIGHT_WIDE_ASK_RE = /\bacross\b|\ball (?:the |\d+ )?wines\b|\boverall\b|\bthe flight\b|\bcompare(?: and contrast)?\b/;

// norm()'d, punctuation-flattened text for task classification (mirrors splitCommandClauses' cleaning).
function cleanForTask(text: string): string {
  return norm(text || "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

// The floor-task category (if any) a marked part sets, via the shared part-task classifier.
function floorTaskFor(partText: string): AllowedPartTask | null {
  const cleaned = cleanForTask(partText);
  return ALLOWED_PART_TASKS.find((t) => FLOOR_TASK_IDS.has(t.id) && t.re.test(cleaned)) || null;
}

/**
 * Mark-budget rule. (a) The sum of every sub-part's marks (expanding "n × m") must equal exactly
 * 25 × wineCount — a mismatch is MARKS_TOTAL_MISMATCH quoting the computed total. (b) Every floor-task
 * sub-part (commercial / quality / style / method of production) must clear the 5-mark-per-wine floor
 * unless it is a literal numeric readout — a shortfall is MARKS_BELOW_FLOOR quoting the offending part.
 */
export function validateMarkBudget(q: QuestionForAudit): Violation[] {
  const v: Violation[] = [];
  const parts = parseMarkedParts(q.questionText);
  if (parts.length === 0) return v;

  // Only judge a well-formed question: its lettered parts must begin at "a)". A fragment passed in
  // isolation (e.g. a lone "b) …" used in a unit test) has no meaningful budget to total.
  const lettered = parseLetteredParts(q.questionText || "");
  if (lettered.length > 0 && lettered[0].letter !== "a") return v;

  const wineCount = (q.wines || []).length;

  // (a) Total must be exactly 25 × wineCount. Skip only when the wine count is unknown (0), so the
  // rule can never invent a spurious "must equal 0" mismatch.
  if (wineCount >= 1) {
    const total = parts.reduce((s, p) => s + p.marks, 0);
    const expected = wineCount * 25;
    if (total > 0 && total !== expected) {
      v.push({
        rule: "MARKS_TOTAL_MISMATCH",
        severity: "hard",
        detail: `marks total ${total}, but a real IMW paper carries exactly 25 × ${wineCount} wine${
          wineCount === 1 ? "" : "s"
        } = ${expected}. Re-allocate the sub-part marks so they sum to ${expected}.`,
      });
    }
  }

  // (b) Per-task floor. A floor-task part must clear 5 marks per wine it covers (5 × n when asked
  // across the whole flight in one un-multiplied total); literal numeric readouts are exempt.
  for (const p of parts) {
    const task = floorTaskFor(p.text);
    if (!task) continue;
    if (LITERAL_FACTUAL_ASK_RE.test(cleanForTask(p.text))) continue;

    const hasMultiplier = p.marks !== p.perUnit; // "n × m" was written (m is the per-wine value)
    const flightWide =
      !hasMultiplier && wineCount > 1 && FLIGHT_WIDE_ASK_RE.test(cleanForTask(p.text));

    const floor = flightWide ? MARK_FLOOR_PER_WINE * wineCount : MARK_FLOOR_PER_WINE;
    const actual = hasMultiplier ? p.perUnit : p.marks;
    if (actual < floor) {
      const scope = flightWide
        ? `across the ${wineCount}-wine flight (floor ${floor})`
        : hasMultiplier
        ? "per wine"
        : "for this part";
      v.push({
        rule: "MARKS_BELOW_FLOOR",
        severity: "hard",
        detail: `a "${task.label}" part is worth ${actual} marks ${scope}, below the ${MARK_FLOOR_PER_WINE}-mark floor — commercial position, quality, style and method-of-production tasks are never priced this low (only a literal "state the residual sugar in g/L" / "state the alcohol in % abv" readout may be 2 marks).`,
      });
    }
  }

  return v;
}

// ---------------------------------------------------------------------------------------------------
// SERVED-QUESTION INTEGRITY — the reveal/serving surfaces must be provably reading ONE question record
// (recurring fault cluster, cross-paper: fb_344, fb_185, fb_161).
//
// Three accepted feedbacks describe the SAME class of bug: a surface diverging from the keyed payload.
//   • fb_344 — the stem shown at reveal was not the stem shown in the stem-analysis screen ("this
//     question says the same single variety, which the previous screen did not show"). A second render
//     re-derived the stem instead of reading the stored record.
//   • fb_185 — "it only displayed 1 wine of the three": the served flight silently truncated to one
//     wine, so the candidate could not answer the question that was keyed.
//   • fb_161 — the reveal showed pictures of regions/wines that were not in the correct answer.
//
// This is the serve-path guard. It is called at EVERY phase transition (stem analysis → answer →
// reveal) so all surfaces are provably reading one record:
//   Check 1 — hash the stem text, the sub-part list and the mark table when the question is first
//     served, then re-assert BYTE equality of that hash at answer and reveal. A changed hash means a
//     surface re-derived the stem rather than reading the stored record → throw.
//   Check 2 — the wine array actually rendered must have length equal to the wine count declared by the
//     stem ("Wines 1 to N" / "Wines 1 and 2") or, failing an explicit stem count, by an "N × M marks"
//     per-wine multiplier in the parts. A three-wine question rendering one wine is a HARD FAIL, never
//     a silent truncation → throw.
//   Check 3 — any image / media attached to the reveal must reference a producer, region or appellation
//     present in the keyed answer wines. Non-matching assets are FILTERED OUT (returned minus the
//     stragglers) rather than displayed — this one repairs rather than throws.
//
// Throws a ServedQuestionIntegrityError carrying the phase name and the mismatching field, so a
// divergence is diagnosable straight from the logs.
// ---------------------------------------------------------------------------------------------------

export type ServePhase = "stem" | "answer" | "reveal";

/** A reveal image / media asset. Free-shape: any string field that names its subject is inspected. */
export interface ServedMediaAsset {
  tag?: string;
  caption?: string;
  alt?: string;
  title?: string;
  label?: string;
  producer?: string;
  region?: string;
  appellation?: string;
  [key: string]: unknown;
}

/** The served question payload a surface renders. `wines` is the keyed flight; `media` the reveal assets. */
export interface ServedQuestionPayload {
  questionId?: string;
  paper?: number;
  questionText: string;
  wines: Array<{
    slot?: number;
    fullText?: string;
    region?: string;
    country?: string;
    appellation?: string;
    producer?: string;
    varieties?: string[];
  }>;
  media?: ServedMediaAsset[];
}

export interface ServedIntegrityResult {
  phase: ServePhase;
  /** The stem/sub-part/mark-table hash — pass this back in as `priorHash` at the next phase. */
  stemHash: string;
  wineCount: number;
  /** The media to display — at reveal this is the input filtered to answer-relevant assets (Check 3). */
  media: ServedMediaAsset[];
}

/** Thrown by assertServedQuestionIntegrity. Carries the phase and the mismatching field for the logs. */
export class ServedQuestionIntegrityError extends Error {
  phase: ServePhase;
  field: string;
  constructor(phase: ServePhase, field: string, detail: string) {
    super(`[served-integrity:${phase}] ${field}: ${detail}`);
    this.name = "ServedQuestionIntegrityError";
    this.phase = phase;
    this.field = field;
  }
}

// A deterministic FNV-1a hash (32-bit, hex). Self-contained so the guard has no crypto/runtime
// dependency; we only need a stable fingerprint that changes iff the canonical input bytes change.
function fnv1aHex(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * Fingerprint the stem text, sub-part list and mark table exactly as stored. Byte-identical question
 * text produces a byte-identical hash; a re-derived stem (fb_344) produces a different one.
 */
export function computeServedStemHash(questionText: string): string {
  const text = questionText || "";
  const stem = extractStem(text).replace(/\s+/g, " ").trim();
  const parts = parseLetteredParts(text).map((p) => `${p.letter}:${p.text.replace(/\s+/g, " ").trim()}`);
  const marks = parseMarkedParts(text).map((p) => `${p.marks}/${p.perUnit}`);
  return fnv1aHex(JSON.stringify({ stem, parts, marks }));
}

// The wine count the STEM declares, or null when it makes no explicit claim.
//
// A numbered wine reference names a SLOT, not a count. A real paper holds twelve wines and a flight is
// drawn from it, so "Wines 5 and 6" is a TWO-wine flight (slots 5 and 6), not a six-wine one — reading
// the highest number as the size was the single largest source of false positives here.
//
// A stem also routinely declares several GROUPS, each naming its own slots: "Wines 1 and 2 are from the
// same region … Wine 3 is from a different country" is a three-wine flight, and reading only the first
// enumeration would call it two. So we union the slots referenced across the WHOLE stem and count them.
// Handled forms: a "Wines 1 to N" range (also "through" / "1-N"), any number of enumerations
// ("Wines 1 and 2", "Wines 1, 2 and 3"), and a lone "Wine 1".
function parseStemWineCount(questionText: string): number | null {
  const stem = norm(extractStem(questionText || ""));

  const slots = new Set<number>();

  // Ranges. A range is a span of SLOTS, so it need not start at 1 ("Wines 4 to 6" is a three-wine
  // flight from slots 4-6), and the corpus writes the separator as "to", "through", an ASCII hyphen
  // or an en/em dash ("Wines 1–6") — miss any of those and the enumeration below reads only the first
  // number, collapsing a six-wine flight to one.
  const RANGE_RE =
    /\bwines?\s+(\d+)\s*(?:to|through|[-–—])\s*(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/g;
  for (const m of stem.matchAll(RANGE_RE)) {
    const from = Number(m[1]);
    const to = parseStemCount(m[2]);
    if (from >= 1 && to >= from && to - from < 12) for (let i = from; i <= to; i++) slots.add(i);
  }

  // Enumerations, unioned across every group the stem declares.
  for (const m of stem.matchAll(/\bwines?\s+(\d+(?:\s*,\s*\d+)*(?:\s*,?\s*and\s+\d+)?)/g)) {
    for (const d of m[0].matchAll(/\d+/g)) slots.add(Number(d[0]));
  }

  // Only trust the stem when it names at least TWO slots. A single incidental reference ("…of wine 2")
  // is not a declaration that the flight holds one wine, so we fall through to the mark multiplier
  // rather than assert a count we cannot support.
  return slots.size >= 2 ? slots.size : null;
}

// The wine count implied by an "N × M marks" per-wine multiplier in the parts (the largest N), or null.
function parseMultiplierWineCount(questionText: string): number | null {
  const mults = parseMarkedParts(questionText)
    .filter((p) => p.perUnit > 0 && p.marks !== p.perUnit)
    .map((p) => Math.round(p.marks / p.perUnit))
    .filter((n) => n >= 1);
  return mults.length ? Math.max(...mults) : null;
}

// The anchor words (producer / region / appellation / country, plus the raw label as a fallback) that a
// reveal asset must reference to be about one of the keyed answer wines. norm()'d, ≥3-char tokens only.
function answerWineAnchorWords(wines: ServedQuestionPayload["wines"]): Set<string> {
  const words = new Set<string>();
  for (const w of wines || []) {
    for (const field of [w.producer, w.region, w.appellation, w.country, w.fullText]) {
      for (const tok of norm(field || "").split(/\s+/)) if (tok.length >= 3) words.add(tok);
    }
  }
  return words;
}

/**
 * Drop any reveal asset that does not reference a producer/region/appellation present in the keyed
 * answer wines (fb_161). Fails SAFE: with no resolvable wine anchors it keeps every asset (it can only
 * ever remove an asset it can prove is off-answer, never blank the reveal on missing data).
 */
export function filterRevealMedia(
  media: ServedMediaAsset[],
  wines: ServedQuestionPayload["wines"]
): ServedMediaAsset[] {
  const anchors = answerWineAnchorWords(wines);
  if (anchors.size === 0) return media;
  return media.filter((asset) => {
    const text = norm(
      [asset.tag, asset.caption, asset.alt, asset.title, asset.label, asset.producer, asset.region, asset.appellation]
        .filter(Boolean)
        .join(" ")
    );
    const assetWords = String(text)
      .split(/\s+/)
      .filter((t: string) => t.length >= 3);
    // No identifying text at all → keep (fail safe; we cannot prove it is off-answer).
    if (assetWords.length === 0) return true;
    return assetWords.some((a: string) => anchors.has(a));
  });
}

/**
 * Serve-path integrity guard. Call at every phase transition (stem analysis → answer → reveal), passing
 * the stemHash returned by the previous phase as `priorHash`. Runs Check 1 (stem-hash byte equality),
 * Check 2 (rendered wine count == declared wine count) and, at reveal, Check 3 (drop off-answer media).
 * Throws ServedQuestionIntegrityError with the phase and the mismatching field on a hard divergence.
 */
/**
 * The flight-size half of Check 2, as an ordinary NON-THROWING audit rule (fb_185).
 *
 * This is how a question whose stored flight doesn't match its stem gets taken out of circulation: it
 * flows through validateQuestion() into the machinery that already exists — `invalid_reasons` at
 * generation, the nightly audit re-verdict, and the serve gate that excludes quarantined rows. The
 * candidate never sees the bad question, and never sees an error either.
 *
 * Deliberately NOT enforced by throwing on the serve path. A throw there reaches the candidate as a
 * 500 (get-question/route.ts) or a stream error (stream/route.ts) with no retry and no fallback, which
 * is a worse outcome than the truncated flight it is trying to prevent: a defective question becomes a
 * candidate who cannot study at all.
 */
export function flightWineCountViolations(q: QuestionForAudit): Violation[] {
  const questionText = q.questionText || "";
  const wines = q.wines || [];
  const renderedCount = new Set(wines.map((w, i) => (w?.slot == null ? `idx${i}` : String(w.slot)))).size;
  const expected = parseStemWineCount(questionText) ?? parseMultiplierWineCount(questionText);
  if (expected == null || renderedCount === 0 || renderedCount === expected) return [];
  return [
    {
      rule: "flight-wine-count",
      severity: "hard",
      detail: `the stem declares ${expected} wine${
        expected === 1 ? "" : "s"
      } but the keyed flight holds ${renderedCount} — a flight must carry exactly the wines its stem announces, never a truncated or padded set`,
    },
  ];
}

export function assertServedQuestionIntegrity(
  phase: ServePhase,
  served: ServedQuestionPayload,
  priorHash?: string | null
): ServedIntegrityResult {
  const questionText = served.questionText || "";
  const stemHash = computeServedStemHash(questionText);

  // Check 1 — the stem/sub-parts/mark table must be byte-identical to when the question was first served.
  if (priorHash != null && priorHash !== "" && stemHash !== priorHash) {
    throw new ServedQuestionIntegrityError(
      phase,
      "stem-hash",
      `served stem/sub-parts/mark-table changed since the question was first served (hash ${priorHash} → ${stemHash}); a surface re-derived the stem instead of reading the stored record`
    );
  }

  // Check 2 — the rendered flight must contain exactly the wines the question keys.
  const wines = served.wines || [];
  // The flight size is the number of DISTINCT SLOTS, not the array length: a stored wines array can
  // carry several candidate records per slot (one pool row holds 15 records across 5 slots), while a
  // rendered flight shows one wine per slot.
  const renderedCount = new Set(wines.map((w, i) => (w?.slot == null ? `idx${i}` : String(w.slot)))).size;
  const expected = parseStemWineCount(questionText) ?? parseMultiplierWineCount(questionText);
  if (expected != null && renderedCount !== expected) {
    throw new ServedQuestionIntegrityError(
      phase,
      "wine-count",
      `the question declares ${expected} wine${expected === 1 ? "" : "s"} but the served flight rendered ${
        renderedCount
      } — a flight must render every keyed wine, never a truncated subset`
    );
  }

  // Check 3 — at reveal, any attached media must be about one of the answer wines (drop the stragglers).
  const media = phase === "reveal" ? filterRevealMedia(served.media || [], wines) : served.media || [];

  return { phase, stemHash, wineCount: renderedCount, media };
}

export function validateQuestion(q: QuestionForAudit): {
  ok: boolean;
  violations: Violation[];
  scoringModel: StemSniperScoringModel;
} {
  const violations = applyQuestionRules({
    paper: q.paper,
    questionText: q.questionText,
    totalMarks: q.totalMarks,
    wines: q.wines,
  }) as Violation[];
  violations.push(...stemPreannouncesDiscriminator(q.questionText));
  violations.push(...flightCompositionViolations(q.wines));
  violations.push(...validateSingleWineFlight(q));
  violations.push(...idMarkAllocationViolations(q));
  violations.push(...validateMarkBudget(q));
  violations.push(...flightWineCountViolations(q));
  if (q.modelAnswer && q.modelAnswer.trim().length > 0) {
    violations.push(
      ...(applyAnswerContentRules({
        questionText: q.questionText,
        answerText: q.modelAnswer,
        wines: q.wines,
      }) as Violation[])
    );
  }
  violations.push(...crossCheckStemFacts(q));
  violations.push(...contrastIntegrityViolations(q));
  violations.push(...partTaskRepertoireViolations(q));
  violations.push(...validatePaperStyleMix(q.paper, q.wines));
  // R-COLOUR (Right Paper Check) deliberately does NOT run inside this KEY-stage audit wrapper. It is
  // an UNCONDITIONAL serve-time contract (Paper 1 still-white / Paper 2 still-red) enforced on every
  // generation/serve path in question-engine.ts (paperColourCheck), where a wrong-colour draft is
  // silently repaired or discarded. validateQuestion is the shared audit/feedback wrapper whose
  // fixtures are keyed only for the rule under test and are not colour-consistent, so folding a hard
  // colour verdict in here would reject legitimate audits. Use validatePaperColour directly instead.
  return {
    ok: !violations.some((x) => x.severity === "hard"),
    violations,
    scoringModel: stemSniperScoringModel(q.questionText, (q.wines || []).length),
  };
}
