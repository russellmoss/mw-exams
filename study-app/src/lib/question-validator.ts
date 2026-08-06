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
  canonVariety,
  norm,
  normStem,
} from "./question-rules.mjs";
import { applyAnswerContentRules } from "./answer-content-rules.mjs";

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
  // The raw generated label from generated_questions.wines[].fullText. The answer key resolves a wine
  // into varieties/region/country and loses the original string, so a slot holding the generator's
  // reasoning rather than a wine resolves to a plausible-looking key and the audit sees nothing wrong.
  // Callers that can supply the label should, to enable the wine-reference-shape rule.
  fullText?: string;
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
  return {
    ok: !violations.some((x) => x.severity === "hard"),
    violations,
    scoringModel: stemSniperScoringModel(q.questionText, (q.wines || []).length),
  };
}
