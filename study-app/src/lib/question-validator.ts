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
  colourFromAppellation,
  detectPrimaryVariety,
  expandMarkTokens,
  subsetScopedStem,
  methodClass,
  norm,
  normStem,
  RED_GRAPE_INDICATORS,
  WHITE_GRAPE_INDICATORS,
} from "./question-rules.mjs";
import { applyAnswerContentRules } from "./answer-content-rules.mjs";
// The banker/curveball calibration, loaded from data/banker_signals.json. It used to be an inline
// literal here; it moved to a data file so an upheld reviewer role ruling has one small, mechanical
// thing to edit, and so the GENERATOR reads the same list this validator enforces.
import { bankerSignalTable, type BankerSignal } from "./banker-signals";
// Per-wine style classifier (the SAME one the Paper 3 sampler and Exam Mix use), so the paper
// style-mix rule tags a wine still/sparkling/fortified/sweet/rosé exactly as the rest of the system.
import { classifyWineStyle } from "./p3-category.mjs";
import {
  noteCompletenessViolations,
  type TastingValidationWine,
} from "./tasting-validators";
// Rarity/precedent tier data + fortified category-integrity map. The wine knowledge lives in db.ts as
// exported consts (so admins retag wines there); this module holds only the rules that read them.
import {
  WINE_RARITY_TIERS,
  FORTIFIED_CATEGORY_INTEGRITY,
  ZERO_PRECEDENT_ORIGINS,
  type WineRarityRule,
  type FortifiedCategoryIntegrity,
} from "./db";

export type StemSniperScoringModel = "per-wine" | "set";

// Typed re-export of the shared scoring-model classifier (kept here for existing importers).
export const stemSniperScoringModel = (
  questionText?: string,
  wineCount = 0,
): StemSniperScoringModel =>
  _stemSniperScoringModel(questionText, wineCount) as StemSniperScoringModel;

export interface AuditWine {
  slot: number;
  varieties: string[];
  region: string;
  country?: string;
  is_blend?: boolean;
  // The grape varieties the ENRICHMENT recorded, when it recorded any. Distinct from `varieties`,
  // which is what the answer key resolved: the key routinely reduces a wine to its dominant grape
  // ("Treixadura") while wine_profiles holds the whole blend ("Treixadura, Loureiro, Albariño"). R5
  // grades severity on the length of this, because two varieties can be an 85%-rule varietal and
  // three cannot — and names them in the violation, since "a wine is a blend" is not actionable but
  // "wine 2 is Treixadura/Loureiro/Albariño" is.
  blend_varieties?: string[];
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
  // The RESOLVED colour, when the caller has one — from wine_bank.colour or from the colour stored on
  // the question's wine slot at generation time. Authoritative: it was decided when the full context
  // (varieties, region, answer key, enrichment) was available, whereas a serve-time caller sees only a
  // label. Absent, resolveWineScope() infers it. See PureColour.
  colour?: "white" | "red" | "rose" | "orange";
  // The KEYED flight role of this wine — the answer key's own call on whether the wine is a banker (a
  // classic benchmark expression that anchors the flight) or a curveball (an obscure wine). Read by
  // validateAnswerKeyClaims Rule 1: reveal/marking prose that labels a wine 'banker' or 'curveball'
  // must AGREE with this stored role. Absent, the derived isBanker() call is used as the fallback.
  role?: "banker" | "curveball";
  // The classification MODEL of this wine's keyed region — how its appellation ladder is legally built
  // (see ClassificationModel). Read by validateAnswerKeyClaims Rule 3: a quality-hierarchy rationale
  // must cite each keyed region's real model, and may not reduce a producer/ageing/vineyard/hybrid
  // ladder to bare geography. Absent, it is looked up from the region name (REGION_CLASSIFICATION_MODELS).
  classificationModel?: ClassificationModel;
}

// How a region's appellation ladder is legally constructed. Bordeaux ranks PRODUCERS (the 1855/Cru
// Classé estate classifications); Burgundy ranks VINEYARDS (village → premier cru → grand cru);
// Chablis or the Mosel ladders are broadly GEOGRAPHIC (increasingly specific delimitation); Rioja
// ranks by AGEING (Crianza → Reserva → Gran Reserva); Chianti Classico / Gran Selezione is a HYBRID
// of geography and structural/ageing tiers. Reveal feedback that "explains the hierarchy" must cite
// the right one — geography alone is wrong for a producer or ageing ladder (fb_135).
export type ClassificationModel =
  "producer" | "vineyard" | "geographic" | "ageing" | "hybrid";
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
  // The stem is a REAL past-paper question taken verbatim from the corpus (a historical import; see
  // historical-stems.ts), not something a model wrote. Set it and the STEM-SHAPE rules stand down.
  //
  // Those rules describe our model of the exam, and measurement says the model is narrower than the
  // exam. Run over all 160 importable questions with the real wines the Institute poured
  // (scripts/corpus-false-positive-rate.mjs), they reject:
  //
  //   id-mark-allocation                102/160  (64%)   real papers routinely pay 15 marks for
  //                                                      "Identify the region" against our 10 cap,
  //                                                      and put 60-80% of marks on identification
  //   part-task-repertoire               30/160  (19%)   tasks it does not know are real, including
  //                                                      "identify the vintage" and "to whom is this
  //                                                      wine most likely to appeal, and why"
  //   flight-wine-count                   4/160   (3%)   the stem-count parser cannot read a paired
  //                                                      stem ("Wines 1-2, 3-4 and 5-6 are pairs")
  //   stem-preannounces-discriminator     2/160   (1%)
  //   single-wine-flight (structure)      1/160   (1%)
  //
  // On a fixed stem these are not merely wrong, they are unsatisfiable: the only lever each one
  // offers is "edit the stem", and the stem is the one thing the import may not change. The first
  // import run banked 4 of 20 for exactly this reason — the model redrafted three times, failed
  // identically each time, and fell back to a banked question.
  //
  // Everything WINE-side still runs, which is the point of importing through the engine at all:
  // paper scope and colour, variety consistency against the stem's own claims, contrast integrity,
  // cross-checked stem facts, the producer caps, style mix, the answer-content rules, and the
  // single-wine BANKER arm — all of those are answerable by choosing different wines.
  //
  // (Precedent: `missing-variety-id-part` was retired outright on 2026-08-07 for firing on a third
  // of the real modern corpus. The same measurement, the same conclusion — but these rules earn
  // their keep on GENERATED stems, so they are scoped rather than removed.)
  stemIsAuthoritative?: boolean;
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
  let stem =
    marker && marker.index != null ? text.slice(0, marker.index) : text;
  // Drop the neutral "For each wine:" / "For both wines:" scaffolding that trails the framing.
  stem = stem.replace(/\bFor (each|both) wines?:/gi, " ");
  return stem.trim();
}

// HARD violations for a stem that pre-announces the discriminator or runs over the word cap.
export function stemPreannouncesDiscriminator(
  questionText: string,
): Violation[] {
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
  const hay = norm(
    [w.fullText, w.region, w.style, ...(w.varieties || [])]
      .filter(Boolean)
      .join(" "),
  );
  const hit = MULTI_VARIETY_APPELLATIONS.find((a) => a.re.test(hay));
  return hit ? `${hit.name} is a multi-variety appellation` : null;
}

/**
 * The blend signal for the ASK rule (3b), which is deliberately STRICTER than `blendSignal` above.
 *
 * `blendSignal` runs its appellation arm even when the answer key resolved a single variety, and that
 * is wrong here: white Rioja is keyed `["Viura"]` on three live questions (two of them real IMW papers,
 * 2025 P1 Q4 among them) and the label arm would rewrite a correct singular ask into a hedge — or,
 * worse, quarantine a printed past paper. A key that names exactly one grape is TRUSTED.
 *
 * The label arm survives only for slots the key could not resolve, and even then a varietal label
 * ("Rasteau Grenache Noir") beats the appellation: the bottle names its grape.
 */
function askBlendSignal(w: AuditWine): string | null {
  if (w.is_blend === true) return "keyed as a blend";
  const n = w.varieties?.length || 0;
  if (n >= 2) return `keyed varieties: ${w.varieties.join("/")}`;
  if (n === 1) return null; // the key resolved one grape — do not second-guess it from the address
  const hay = norm([w.fullText, w.region, w.style].filter(Boolean).join(" "));
  const named = new Set<string>();
  for (const re of [RED_GRAPE_INDICATORS, WHITE_GRAPE_INDICATORS]) {
    const g = new RegExp(re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = g.exec(hay)) !== null) named.add(m[0].replace(/\s+/g, " "));
  }
  if (named.size === 1) return null; // a varietal label states its own grape
  const hit = MULTI_VARIETY_APPELLATIONS.find((a) => a.re.test(hay));
  return hit ? `${hit.name} is a multi-variety appellation` : null;
}

// ── The singular variety ASK, and the slots it addresses ───────────────────────────────────────────
//
// Feeds arm (3b) of crossCheckStemFacts. Kept here rather than folded into question-sections.ts because
// that module resolves flight-vs-per-wine SCOPE for rendering and mark arithmetic; this needs the
// narrower thing it does not model — the explicit SLOT SUBSET an addressee line names ("For each wine
// 1-3:"), which is the only reason 2022 P2 Q1 survives the rule.

/** An addressee line — the scope header a run of lettered sub-parts sits under. */
const ADDRESSEE_LINE_RE =
  /^\s*(?:for\b|with reference to\b|considering\b|in respect of\b)[^\n]*:\s*$/i;

/** The slots an addressee line names, or null when it addresses the whole flight. */
function addresseeSlots(line: string, allSlots: number[]): number[] | null {
  const l = norm(line);
  const range = l.match(/wines?\s*(\d+)\s*(?:-|–|—|\s+to\s+)\s*(\d+)/);
  if (range) {
    const [a, b] = [Number(range[1]), Number(range[2])].sort((x, y) => x - y);
    return allSlots.filter((s) => s >= a && s <= b);
  }
  const list = l.match(/wines?\s*((?:\d+\s*(?:,|and|&)\s*)+\d+)/);
  if (list) {
    const nums = (list[1].match(/\d+/g) || []).map(Number);
    return allSlots.filter((s) => nums.includes(s));
  }
  const single = l.match(/\bwine\s+(\d+)\b/);
  if (single) return allSlots.filter((s) => s === Number(single[1]));
  return null; // "For each wine" / "For both wines" / "For all four wines"
}

/** A command word must precede the noun, so "reasons for not blending the variety used" is not an ask. */
const VARIETY_COMMAND_RE = /\b(?:identif|nam(?:e|ing)|stat(?:e|ing)|specif)/i;
/** Qualifiers that already concede a blend (or make the phrase a back-reference rather than an ask). */
const VARIETY_QUALIFIED_RE =
  /\b(?:single|same|principal|predominant|predominantly|primary|main|dominant|common|shared|that|this|each|its)\s+(?:grape\s+)?$/i;
/** Already hedged, in every spelling the corpus uses: "or varieties", "(ies)", "/ies", "(s)". */
const VARIETY_HEDGED_RE =
  /^\s*(?:\(?(?:or|and)\s+varieties|\(ies\)|\/ies|\(s\))/i;

/**
 * Every lettered sub-part carrying an UNHEDGED SINGULAR variety identification ask, with the slot set
 * the part addresses. Parts under no addressee line address the whole flight.
 */
function varietyAskParts(
  questionText: string,
  allSlots: number[],
): { ask: string; slots: Set<number> }[] {
  const slots = [...allSlots].filter(Number.isFinite).sort((a, b) => a - b);
  const out: { ask: string; slots: Set<number> }[] = [];
  let scope: number[] | null = null;
  let current: { line: string; slots: number[] | null } | null = null;

  const flush = () => {
    if (!current) return;
    const text = current.line;
    const inScope = current.slots === null ? slots : current.slots;
    current = null;
    if (!VARIETY_COMMAND_RE.test(text)) return;
    const re = /\b(?:grape\s+)?variety\b/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const before = text.slice(0, m.index);
      if (!VARIETY_COMMAND_RE.test(before)) continue;
      if (VARIETY_QUALIFIED_RE.test(before)) continue;
      if (VARIETY_HEDGED_RE.test(text.slice(m.index + m[0].length))) continue;
      out.push({ ask: text.trim().split("\n")[0], slots: new Set(inScope) });
      return; // one violation per part is enough
    }
  };

  for (const line of (questionText || "").split("\n")) {
    if (ADDRESSEE_LINE_RE.test(line)) {
      flush();
      scope = addresseeSlots(line, slots);
      continue;
    }
    if (/^\s*[a-z]\)\s*/.test(line)) {
      flush();
      current = { line, slots: scope };
      continue;
    }
    if (current) current.line += "\n" + line;
  }
  flush();
  return out;
}

// Word-number map for stem cardinality claims ("four different countries", "three different regions").
const STEM_WORD_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
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
const styleTag = (w: AuditWine): string =>
  norm(w.style_category || w.style || "");

// Why a wine contradicts a "has residual sugar" / "sweet" stem claim (or null). A resolved RS below
// 5 g/L is bone dry; failing that, a dry style tag (still_dry, "dry"/"bone dry" text — but never the
// off-dry / medium-dry families, which do carry residual sugar) is the fallback signal.
function drySignal(w: AuditWine): string | null {
  if (typeof w.rs === "number" && w.rs < 5)
    return `RS ${w.rs} g/L is below 5 g/L`;
  const s = norm([w.style, w.style_category].filter(Boolean).join(" "));
  if (!s) return null;
  if (
    /\b(?:off|medium)[ -]?dry\b/.test(s) ||
    /still_off_dry|still_sweet/.test(s)
  )
    return null;
  if (/still_dry|\bbone[ -]?dry\b|\bdry\b/.test(s))
    return `keyed dry (${w.style_category || w.style})`;
  return null;
}

export function crossCheckStemFacts(q: QuestionForAudit): Violation[] {
  const v: Violation[] = [];
  const stem = normStem(q.questionText);
  const wines = q.wines || [];
  // A stem that describes its flight in SUBSETS makes each claim about a subset, not flight-wide, so
  // applying them to every wine is a false positive. The shared rule layer has always guarded its own
  // cardinality checks this way (applyQuestionRules → subsetSplit); these did not. On the real 2022
  // P2 Q1 — "Wines 1-3 are from different countries and are each made from a different, single grape
  // variety. Wine 4 is a blend of all three of these varieties." — that gap rejected the blend the
  // stem had just asked for, counted four different countries where the stem asked for three, and
  // read wine 4's three resolved varieties as duplicates of wines 1-3.
  const subsetSplit = subsetScopedStem(q.questionText, wines.length);

  // (1) "the same (single) grape variety" — every resolved primary variety must be identical.
  if (
    !subsetSplit &&
    wines.length >= 2 &&
    /\bsame (?:single )?grape variety\b/.test(stem)
  ) {
    const known = wines.filter((w) => primaryVariety(w));
    if (known.length >= 2) {
      const base = primaryVariety(known[0]);
      const offender = known.find((w) => primaryVariety(w) !== base);
      if (offender)
        v.push({
          rule: "stem-fact-same-variety",
          severity: "hard",
          detail: `stem claims "the same single grape variety", but wine ${offender.slot} is ${primaryVariety(
            offender,
          )} while wine ${known[0].slot} is ${base}`,
        });
    }
  }

  // (2) "a different (single) grape variety" / "different grape varieties" — primaries pairwise distinct.
  if (
    !subsetSplit &&
    /different (?:single )?grape variet(?:y|ies)/.test(stem)
  ) {
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
  // "…the same single grape variety OR PREDOMINANT grape variety" is a hedge in the exam's own words:
  // it offers the candidate either reading and therefore permits a blended wine. Four real stems use
  // it (2015 P2 Q2, 2022 P2 Q5, 2025 P2 Q1 and Q3) and all four were rejected for the blends they
  // explicitly allow. normStem has already flattened the commas in the printed "single, or
  // predominant, grape variety".
  const hedged = /variety or varieties|variety ies\b|\bor predominant\b/.test(
    stem,
  );
  const singularClaim =
    /\bsingle grape variety\b/.test(stem) ||
    /\bpredominantly\b[a-z ]{0,40}?\bgrape variety\b/.test(stem);
  if (!hedged && singularClaim && !subsetSplit) {
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

  // (3b) The same defect one level down: the STEM may be innocent, but a sub-part ASKS the candidate to
  // "Identify the grape variety" (singular, unhedged) while a wine that part addresses is a blend. The
  // reviewer hit this repeatedly in Question Review — the ask demands one grape and there isn't one.
  //
  // The exam's own answer is the hedge, printed two ways: "grape variety(ies)" (2018 P2 Q1) and "grape
  // variety/ies" (2023 P3 Q1). So the fix is a wording the corpus already uses, not an invention.
  //
  // SCOPE is what makes this safe. 2022 P2 Q1 asks "For each wine 1-3: a) Identify the grape variety"
  // over a flight whose wine 4 IS a blend, and it is correct — wines 1-3 are monovarietal and wine 4 is
  // handled by its own parts. So the blend test runs over the slots the part addresses, not the flight.
  // Qualified asks ("the principal / predominant / dominant grape variety") already concede the blend
  // and are a real exam ask ("Name the dominant grape variety", 2017 P3 Q4), so they stand down too.
  //
  // And so does a HEDGED STEM. 2025 P2 Q1 prints "Wines 1-3 are from the same single grape variety or
  // predominant grape variety" and then asks, flatly, "a) Identify the grape variety. (12 marks)" over
  // a Grenache/Syrah/Carignan blend. The candidate has already been told the flight may contain a
  // blend, so the bare ask is not misleading — and without this guard the rule quarantines a printed
  // past paper, which is the one outcome no wording rule may ever produce. `hedged` is the same test
  // arm (3) uses.
  if (!hedged)
    for (const part of varietyAskParts(
      q.questionText,
      wines.map((w) => w.slot),
    )) {
      const offender = wines.find(
        (w) => part.slots.has(w.slot) && askBlendSignal(w),
      );
      if (!offender) continue;
      v.push({
        rule: "singular-variety-ask-over-blend",
        severity: "hard",
        detail: `"${part.ask}" asks for ONE grape, but wine ${offender.slot} — which this part addresses — is a blend (${askBlendSignal(
          offender,
        )}). Write the exam's own hedge: "grape variety or varieties".`,
      });
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
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+different\s+countries\b/,
    );
    const required = subsetSplit
      ? 0
      : distinctCount
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
    if (/\b(?:the )?same country\b/.test(stem) && !subsetSplit) {
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
    // "…from the same region but different sub-regions" (real: 2022 P2 Q2 and Q3) asserts BOTH, and
    // what the key resolves as each wine's region IS its sub-region — so a difference between them is
    // exactly what the stem predicts, not a contradiction of it.
    const subRegionSplit = /\bdifferent\s+sub\s?-?\s?regions?\b/.test(stem);
    if (
      /\b(?:the )?same region\b/.test(stem) &&
      !subsetSplit &&
      !subRegionSplit
    ) {
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
      /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+different\s+regions\b/,
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
        const dupNote = dup
          ? ` (wine ${dup.slot} repeats ${dup.region} from wine ${seen.get(regionOf(dup))})`
          : "";
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
    const predicate = /residual sugar/.test(stem)
      ? "have residual sugar"
      : "sweet wines";
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
//
// THE LOOKUP ITSELF NOW LIVES IN data/banker_signals.json, not here. It is the one body of wine
// knowledge in this file that a human expert routinely corrects — several of its entries were
// hand-transcribed from a reviewer's rejection — and the generator needed the same list, which it
// previously duplicated as prose. Moving it to a data file gives an upheld role ruling something
// mechanical to edit (a small PR against one JSON file) and makes the validator and the generator
// read the SAME calibration. See src/lib/banker-signals.ts for the loader and the matching contract.
// ---------------------------------------------------------------------------------------------------

/**
 * Derive whether a resolved wine reads as a BANKER (true) or a CURVEBALL (false, incl. unknowns).
 *
 * An UNRESOLVED variety does not veto a region match. Requiring the variety gate to pass on an empty
 * string made every wine whose grape the key could not resolve a curveball, however classic its
 * origin: measured over the 160 real IMW questions, "Stellenbosch | ?", "Tuscany | ?", "Alsace | ?",
 * "Piedmont | ?", "Provence | ?" and "Penedès | ?" were all being counted against the flight. This is
 * the same principle the appellation resolver already applies to colour — an unrecognised grape is
 * SKIPPED, not treated as a veto — and it is the single largest contributor to the 47% of real exam
 * wines this detector was calling curveballs.
 */
export function isBanker(w: AuditWine): boolean {
  return matchingBankerSignal(w) !== null;
}

/**
 * The signal a wine matched, or null if it reads as a curveball.
 *
 * Same predicate as isBanker(), but it names WHICH line of data/banker_signals.json did the work. The
 * role sweep needs that: when a ruling adds or removes a signal, "which banked questions change
 * verdict, and because of which entry" is the difference between a repair queue an admin can audit and
 * a list of question ids they have to take on trust.
 */
export function matchingBankerSignal(w: AuditWine): BankerSignal | null {
  const origin = norm(`${w.region || ""} ${w.country || ""} ${w.fullText || ""}`);
  // Prefer the resolved key; fall back to reading the grape off the LABEL.
  //
  // The variety gate is skipped when the variety is unknown, which is deliberate (see the doc comment
  // on isBanker) — but the variety was read ONLY from the answer key, so on any wine whose key had not
  // resolved a grape the region alone promoted it and every gate in the table was bypassed. That is
  // not a rare case: the whole unkeyed cohort has empty varieties, and the labels name the grape in
  // plain text.
  //
  // The result was the calibration contradicting its own stated intent. banker_signals.json says bare
  // Burgundy counts for Pinot Noir and Chardonnay and cites Aligoté as excluded, and lists Oregon
  // Pinot Gris among the deliberate exclusions — yet "Domaine de Villaine, Bouzeron Aligoté. Burgundy"
  // and "Montinore Estate, Reserve Pinot Gris. Willamette Valley" both came back BANKER, and a "Huia
  // Vineyards, Gewurztraminer. Marlborough" cleared a signal that requires Sauvignon. Reviewer attempt
  // #459 named that last one exactly: "the Gewurztraminer and the Grüner Veltliner are pretty big
  // curve balls for New Zealand".
  //
  // detectPrimaryVariety reads the label and its appellation table, and returns "unknown" when it
  // genuinely cannot tell — so the deliberate free pass survives for wines that really are
  // unresolvable, and only stops applying to wines that were never ambiguous.
  const keyed = norm((w.varieties || []).map(canonVariety).join(" "));
  const fromLabel = w.fullText ? detectPrimaryVariety(w.fullText) : "unknown";
  const variety = keyed || (fromLabel === "unknown" ? "" : norm(canonVariety(fromLabel)));
  return (
    bankerSignalTable().signals.find(
      (s) =>
        s.region.test(origin) &&
        !(s.exclude && s.exclude.test(origin)) &&
        (!s.variety || !variety || s.variety.test(variety))
    ) ?? null
  );
}

function wineLabel(w: AuditWine): string {
  const label = [(w.varieties || []).join("/"), w.region, w.country]
    .filter(Boolean)
    .join(", ");
  if (label) return `wine ${w.slot} (${label})`;
  if (w.fullText)
    return `wine ${w.slot} (${w.fullText.length > 60 ? `${w.fullText.slice(0, 60)}…` : w.fullText})`;
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

  // `min(2, …)` capped the allowance at two curveballs however large the flight, so a six-wine Paper 3
  // flight was held to the same budget as a four-wine one. Measured over the real exam that rejected
  // 27% of its flights; scaling with the flight instead takes it to 5%, while still rejecting 11% of
  // our generated flights — this rule, unlike id-mark-allocation, does have signal against the bank.
  const maxCurveballs = Math.max(2, Math.ceil(n / 2));
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
// R-OW-ANCHOR — a multi-country SAME-VARIETY flight of a classic variety must carry an Old World anchor.
//
// Mike Juergens, reviewing a four-wine Chardonnay flight (Mendoza + Coonawarra + Casablanca +
// Marlborough — four different New World countries, no Burgundy, no Napa), rejected it: "if you had a
// four-wine question that was Chardonnay-based, you would expect to see at least one banker in there,
// which would be either from Burgundy or from Napa … having four curveballs would be weird."
//
// The historical record backs this precisely. EK-0169 (STRONG SIGNAL): every multi-country "same
// single grape variety" Chardonnay flight in the 2011–2026 corpus carries a Burgundian anchor
// (Chablis 1er/Grand Cru, Meursault, Corton-Charlemagne, …). An all-New-World same-variety Chardonnay
// trio or quartet is UNATTESTED across fifteen years of papers. The same holds for the other
// high-frequency classic WHITE varieties — each has a European home region the exam anchors on, and no
// all-New-World white same-variety flight exists in the corpus (measured with the wines the Institute
// actually poured, scripts/corpus-false-positive-rate.mjs → zero hits on white flights).
//
// EK-0029/EK-0169 lived as prompt guidance only, so an all-New-World Chardonnay flight passed
// validation. This rule promotes the constraint to an ENFORCED hard gate (EK-0040/EK-0064/EK-0155:
// prompt instruction is not enforcement; the gate must run in the serve/audit path, which this does).
//
// SCOPE — WHITE varieties only, and this is deliberate. The original proposal wanted the same hard gate
// for Paper 2 reds (Pinot Noir, Syrah, Cabernet Franc), but the real corpus refutes it for exactly
// those grapes: 2018 P2 Q2 is a genuine all-New-World Pinot Noir trio (Russian River + Central Otago +
// Willamette), and 2016 P2 Q2 ("Wines 1-3 are not from France…") anchors on German Ahr Spätburgunder,
// not Burgundy — the exam explicitly builds Pinot flights that clear France. A hard rule on P2 reds
// would reject two real past-paper questions, which is the failure mode this codebase measures and
// refuses (the same reason flight-composition is only ADVISORY over the real corpus). So R-OW-ANCHOR
// fires only on the classic whites, where the STRONG-SIGNAL pattern is genuinely unbroken. Red flights
// keep their softer prompt guidance without a hard gate.
//
// Trigger: a "same single grape variety" stem over 2+ wines that span 2+ distinct countries and is not
// a same-country / same-region / subset-scoped question. If the flight's variety has a defined Old
// World home region and NO wine sits in it, the flight is hard-rejected. Varieties with no listed home
// (reds, and obscure grapes the exam would not build a comparative flight around) fall through
// untouched — the rule fails SAFE by only firing on the whites whose anchor is documented in the corpus.
// ---------------------------------------------------------------------------------------------------

// Each classic WHITE variety's Old World home — the region a candidate MUST have as a fixed reference
// point in a cross-country flight of that grape. `home` is tested against the wine's region+country+label.
// For Chardonnay the home is Burgundy SPECIFICALLY (Chablis / Côte d'Or / Mâconnais), matching the
// unbroken corpus pattern; a New World Chardonnay (Napa, Margaret River, Marlborough, Mendoza) never
// satisfies it. Reds are intentionally absent — see the SCOPE note above (2018/2016 P2 Q2).
const OLD_WORLD_ANCHOR_HOMES: {
  variety: RegExp;
  home: RegExp;
  label: string;
}[] = [
  // ── High-frequency whites (Paper 1) ──
  {
    variety: /chardonnay/,
    home: /\bchablis\b|\bmeursault\b|puligny|chassagne|montrachet|corton|\bmontagny\b|\brully\b|cote de beaune|cote de nuits|\bbeaune\b|maconnais|\bmacon\b|pouilly-?fuisse|\bpouilly-?vinzelles\b|saint-?veran|\bbourgogne\b|\bburgundy\b/,
    label:
      "Burgundy (Chablis, Côte d'Or or Mâconnais) at village/1er cru/Grand Cru level",
  },
  {
    variety: /riesling/,
    home: /\balsace\b|\bmosel\b|rheingau|\bpfalz\b|\bnahe\b|rheinhessen|\bwachau\b|kamptal|kremstal/,
    label: "Alsace, the Mosel/Rheingau, or the Wachau",
  },
  {
    variety: /chenin/,
    home: /vouvray|savennieres|montlouis|\banjou\b|\bsaumur\b|\bloire\b/,
    label: "the Loire (Vouvray, Savennières or Anjou)",
  },
  {
    variety: /pinot gris|pinot grigio/,
    home: /\balsace\b/,
    label: "Alsace",
  },
  {
    variety: /gewurztraminer/,
    home: /\balsace\b/,
    label: "Alsace",
  },
  {
    // The bare `\bsauvignon\b` this used to carry also matched CABERNET SAUVIGNON, which put a red
    // variety inside a whites-only rule and quarantined gen_p2_F1_1786073842960 (Napa + Western Cape
    // Cabernet) for lacking a white-Bordeaux anchor. Reds are excluded from this table on purpose —
    // the exam sets all-New-World red same-variety flights — so a red reaching it by substring defeats
    // the scope the rule's whole false-positive argument rests on. Matched by lookbehind rather than by
    // dropping the bare form, because the key resolves some labels to just "sauvignon".
    variety: /sauvignon blanc|(?<!cabernet\s)\bsauvignon\b(?!\s+vert)/,
    home: /\bsancerre\b|pouilly-?fume|menetou-?salon|\bloire\b|\bbordeaux\b|\bgraves\b|pessac/,
    label: "the Loire (Sancerre / Pouilly-Fumé) or white Bordeaux",
  },
  {
    variety: /viognier/,
    home: /\bcondrieu\b|chateau-?grillet|\bnorthern rhone\b|\brhone\b/,
    label: "the Northern Rhône (Condrieu)",
  },
  // Reds are DELIBERATELY not listed — the exam sets all-New-World red same-variety flights (2018 P2
  // Q2 Pinot Noir; 2016 P2 Q2 anchors on German Ahr, not Burgundy). See the SCOPE note above.
];

/**
 * R-OW-ANCHOR. A cross-country "same single grape variety" flight of 2+ wines of a classic variety must
 * include at least one Old World anchor from the variety's European home region. An all-New-World flight
 * of such a variety has no precedent in the 2011–2026 corpus (EK-0169, STRONG SIGNAL) and is never valid.
 */
export function validateOldWorldAnchor(q: QuestionForAudit): Violation[] {
  const wines = q.wines || [];
  const n = wines.length;
  // A PAIR COUNTS. This was `n < 3`, which left the shape the SAME reviewer binned separately
  // (attempt 442) unguarded: "Wines 5 and 6 are made from the same single grape variety, from
  // different origins" over Clare Valley Riesling + Columbia Valley Riesling. Two wines, two New World
  // countries, no Mosel/Alsace/Wachau — a cross-country varietal comparison with no reference
  // expression in it, which is this rule's entire subject. Nothing in EK-0169 is about flight size.
  //
  // Measured before lowering it (scripts/measure-banker-arm.mjs): at n>=2 the rule still hits ZERO of
  // the 160 real IMW questions. Both real all-New-World same-variety pairs/trios in the corpus are RED
  // — 2011 P2 Q5 (Californian + Chilean Merlot) and 2018 P2 Q2 (three New World Pinots) — and reds are
  // deliberately absent from OLD_WORLD_ANCHOR_HOMES, so the whites-only scope keeps the pair case free.
  if (n < 2) return [];

  const stem = normStem(q.questionText || "");
  // Only the SAME-variety comparative shape (F1). A "different varieties" flight has no shared anchor.
  if (!/\bsame single grape variety\b/.test(stem)) return [];
  // Subset-scoped stems ("wines 1-2 … wines 3-4 …") make each claim about a subset, not the flight —
  // the same guard the shared cardinality rules use, so a paired stem is not judged as one flight.
  if (subsetScopedStem(q.questionText, n)) return [];
  // A same-country / same-region flight is anchored by geography, not by an Old World reference wine.
  if (
    /\b(?:the )?same country\b/.test(stem) ||
    /\b(?:the )?same region\b/.test(stem)
  )
    return [];

  // The flight must actually span multiple countries — an all-one-country flight is out of scope.
  const placed = wines.filter((w) => countryOf(w));
  const distinctCountries = new Set(placed.map(countryOf));
  if (distinctCountries.size < 2) return [];

  // Resolve the shared variety (the stem asserts one). Use the first resolved primary variety.
  const flightVariety = wines.map(primaryVariety).find(Boolean) || "";
  if (!flightVariety) return [];
  const spec = OLD_WORLD_ANCHOR_HOMES.find((s) =>
    s.variety.test(flightVariety),
  );
  if (!spec) return []; // variety with no documented Old World home — rule fails safe (does not fire)

  const hasAnchor = wines.some((w) => {
    const origin = norm(
      `${w.region || ""} ${w.country || ""} ${w.fullText || ""}`,
    );
    return spec.home.test(origin);
  });
  if (hasAnchor) return [];

  return [
    {
      rule: "old-world-anchor",
      severity: "hard",
      detail: `all-New-World same-variety flight: a ${n}-wine "same single grape variety" ${flightVariety} flight spanning ${distinctCountries.size} countries carries no Old World anchor from the variety's home region (${spec.label}). Every multi-country same-variety flight of a classic variety in the 2011–2026 corpus includes such an anchor (EK-0169); an all-New-World flight has no precedent and leaves the candidate no fixed reference point. Replace one wine with a ${spec.label} example.`,
    },
  ];
}

// ---------------------------------------------------------------------------------------------------
// RARITY BUDGET & FORTIFIED CATEGORY INTEGRITY — three validated Paper-3 signals (fb_254, fb_241,
// fb_55) that all reduce to "ultra-rare / no-precedent fortified & oxidative wines used as flight
// fillers". The wine knowledge lives in db.ts (WINE_RARITY_TIERS, FORTIFIED_CATEGORY_INTEGRITY) so an
// admin can retag wines without touching this rule. Three HARD arms:
//   • Rule 1 (rarity-budget)         a flight may hold at most ONE tier-3 (niche) wine, regardless of
//                                    flight size — the six-wine ladder with two Jura wines (25%) fails.
//   • Rule 2 (rarity-no-precedent)   a wine whose category has no MW-exam precedent in ten years
//                                    (examPrecedent === false, e.g. flor-aged Australian apera) is
//                                    rejected outright, at any flight position.
//   • Rule 3 (fortified-category-integrity)  a mandatory-blend fortified style (tawny port, most
//                                    sherry solera styles) that is keyed or stem-framed as a single
//                                    grape variety is a category error.
// ---------------------------------------------------------------------------------------------------

// Everything the answer key knows about a wine, flattened + normalised, so the db.ts regexes match
// against the label, region, country, keyed varieties and style category together.
function rarityHaystack(w: AuditWine): string {
  return norm(
    [
      w.fullText,
      w.region,
      w.country,
      ...(w.varieties || []),
      w.style,
      w.style_category,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function matchRarityRule(w: AuditWine): WineRarityRule | null {
  const hay = rarityHaystack(w);
  return WINE_RARITY_TIERS.find((rule) => rule.match.test(hay)) || null;
}

function matchFortifiedIntegrity(
  w: AuditWine,
): FortifiedCategoryIntegrity | null {
  const hay = rarityHaystack(w);
  return (
    FORTIFIED_CATEGORY_INTEGRITY.find((rule) => rule.match.test(hay)) || null
  );
}

// The origin nobody has seen (Slovenia / the Brda–Collio amber belt, seeded in db.ts). Returns the
// matched origin's label so a violation can name it; null when the wine reads as a normal origin. Uses
// the same combined descriptor as the rarity rules, so region, country, label and grape all count.
function matchZeroPrecedentOrigin(w: AuditWine): string | null {
  const hay = rarityHaystack(w);
  return (
    ZERO_PRECEDENT_ORIGINS.find((rule) => rule.match.test(hay))?.label ?? null
  );
}

export function validateRarityBudget(q: QuestionForAudit): Violation[] {
  const wines = q.wines || [];
  if (wines.length === 0) return [];
  const v: Violation[] = [];

  const noPrecedent: string[] = [];
  const tier3: string[] = [];
  for (const w of wines) {
    const rule = matchRarityRule(w);
    if (!rule) continue;
    if (rule.examPrecedent === false)
      noPrecedent.push(`${wineLabel(w)} — ${rule.label}`);
    if (rule.rarityTier === 3) tier3.push(`${wineLabel(w)} — ${rule.label}`);
  }

  // Rule 2 — no exam precedent: rejected outright, before any budget maths.
  if (noPrecedent.length > 0) {
    v.push({
      rule: "rarity-no-precedent",
      severity: "hard",
      detail: `wine has no MW-exam precedent in the last ten years (not poured on an Institute practical or mock): ${noPrecedent.join("; ")}. A no-precedent style is not exam-realistic and cannot appear in a flight.`,
    });
  }

  // Rule 1 — at most ONE tier-3 (niche) wine per flight, whatever the flight size.
  if (tier3.length > 1) {
    v.push({
      rule: "rarity-budget",
      severity: "hard",
      detail: `flight carries ${tier3.length} tier-3 (niche) wines but at most one is exam-realistic: ${tier3.join("; ")}.`,
    });
  }

  // Rule 3 — fortified category integrity: a mandatory-blend style presented as a single variety.
  const stem = normStem(q.questionText || "");
  const singleVarietyStem = /\bsingle grape variet(?:y|ies)\b/.test(stem);
  for (const w of wines) {
    const cat = matchFortifiedIntegrity(w);
    if (!cat) continue;
    const varieties = w.varieties || [];
    const keyedSingleVariety = w.is_blend !== true && varieties.length === 1;
    // A legitimately single-varietal expression of this style (Palomino sherry) stands down.
    const exempt = cat.singleVarietyOk
      ? varieties.some((g) => cat.singleVarietyOk!.test(norm(g)))
      : false;
    const stemForcesSingle =
      singleVarietyStem && w.is_blend !== true && varieties.length === 0;
    if (!exempt && (keyedSingleVariety || stemForcesSingle)) {
      v.push({
        rule: "fortified-category-integrity",
        severity: "hard",
        detail: keyedSingleVariety
          ? `${wineLabel(w)} is a ${cat.label}, a mandatory blend, but is keyed as a single grape variety (${varieties.join("/") || "one variety"}).`
          : `${wineLabel(w)} is a ${cat.label}, a mandatory blend, but the stem frames every wine as a single grape variety.`,
      });
    }
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
function parseWineGroupScaffolds(
  questionText: string,
  wineCount: number,
): number[][] {
  const text = questionText || "";
  const groups: number[][] = [];
  const re =
    /\bfor\s+(?:all\s+|both\s+|each\s+|the\s+)*wines?\s+([a-z0-9 ,and&-]+?)\s*(?:only\s*)?[:.]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const clause = m[1].toLowerCase();
    // "all / each / both / every / three / four …" address the whole flight, not a subset.
    if (
      /\b(?:all|each|both|every|following|two|three|four|five|six)\b/.test(
        clause,
      )
    )
      continue;
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
    const scan = norm(text)
      .replace(/[^a-z0-9 ,/()'-]+/g, " ")
      .replace(/\s+/g, " ");
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
          wine,
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
          " and ",
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

// ── RECALIBRATED 2026-08-08, against the exam itself ────────────────────────────────────────────
//
// The thresholds below were invented (10 marks a part; 35% of the paper once a flight had a
// curveball, 50% otherwise). Measured over the 160 importable real IMW questions with the wines the
// Institute actually poured (scripts/corpus-false-positive-rate.mjs), they rejected 101 of them —
// 63% of the real exam — because the real exam is nothing like that shape:
//
//                        real IMW          our generated bank
//   ID share   median      40%                  32%
//              p90         60%                  52%
//              max         80%                 100%
//   single ID  median      10                   10
//              p90         20                   15
//              max         30                   60
//
// Two things follow. First, a 35% cap rejected the MEDIAN real question, and a 10-mark part cap
// rejected 43% of them — 2011 P1 Q1 pays 15 marks for "Identify the region" and puts 60 of its 75
// marks on identification. Second, and more damning for the rule as written: our generated questions
// are TAMER than the real exam on this axis at every percentile, so the rule was not catching
// generated excess at all. It was just noise — 305 of the bank's violations.
//
// There is still a genuine tail worth catching: generated questions reach a 100% ID share and a
// 60-mark single part, and the real exam never exceeds 80% / 30. So the HARD line is drawn exactly
// where the real exam stops, giving zero false positives on it by construction, and the reviewer's
// original preference survives as a SOFT flag at the real exam's own p90 — visible in review, never
// a quarantine.
//
// The curveball scaling is GONE. It cannot be rescued: it made the cap stricter (35%) precisely when
// the flight was hard, and the real exam's median sits at 40% regardless. Flight difficulty is
// policed by flight-composition, which is the rule that actually has signal on it.
const ID_PART_RE = /identify the (grape variety|region|country|origin)/i;
const ID_SINGLE_PART_HARD = 30; // the real exam's maximum
const ID_SINGLE_PART_SOFT = 20; // the real exam's p90
const ID_SHARE_HARD = 0.8; // the real exam's maximum
const ID_SHARE_SOFT = 0.6; // the real exam's p90
// …and the other end, which the old cap-only rule could not see. Across 177 identification parts in
// the real corpus the per-unit value runs 5 → 30 and NEVER below 5. That matters because it is where
// the reviewer's own bin actually went wrong: the binned question paid 13 marks for "Identify the
// country" — which the real exam does twice — and 1 mark for "Identify the grape variety", which it
// never does. The old rule flagged the 13 and let the 1 through. Same 5-mark floor the written parts
// already use (MARKS_BELOW_FLOOR).
const ID_PART_FLOOR = 5;

// Parse the mark-carrying sub-questions from a question's text. Each "(N marks)" or "(A x B marks)"
// annotation closes a part; `text` is everything since the previous annotation (so it holds the part's
// prompt), `marks` is the part's total (A×B or N), and `perUnit` is the per-instance value (B, or N).
// Split a question into its marked sub-parts. `marks` is what the part is really worth and `perUnit`
// is the printed per-unit value; they differ whenever the part is awarded over several wines.
//
// The multiplier is resolved by the shared expander, so a part scoped by a section header
// ("For each wine:" then a bare "(15 marks)") is worth 15 × N here exactly as it is in the
// generation engine. Reading those at face value under-counted ten real IMW questions — see the
// block comment on expandMarkTokens in question-rules.mjs. `wineCount` is optional only so a caller
// without wines keeps the old face-value reading rather than crashing; pass it whenever it is known.
function parseMarkedParts(
  questionText: string,
  wineCount = 0,
): { text: string; marks: number; perUnit: number }[] {
  const text = questionText || "";
  const { tokens } = expandMarkTokens(text, wineCount);
  const parts: { text: string; marks: number; perUnit: number }[] = [];
  let lastIndex = 0;
  for (const t of tokens) {
    parts.push({
      text: text.slice(lastIndex, t.start),
      marks: t.marks,
      perUnit: t.perUnit,
    });
    lastIndex = t.end;
  }
  return parts;
}

/**
 * Identification-mark-allocation rule. Sums the marks on variety/region/origin ID parts and rejects
 * (hard) when they exceed the difficulty-scaled ceiling (50% with no curveballs, 35% with one or
 * more) or when any single ID part is worth more than 10 marks.
 */
export function idMarkAllocationViolations(q: QuestionForAudit): Violation[] {
  const parts = parseMarkedParts(q.questionText, (q.wines || []).length);
  if (parts.length === 0) return [];
  const idParts = parts.filter((p) => ID_PART_RE.test(p.text));
  if (idParts.length === 0) return [];

  const idMarks = idParts.reduce((s, p) => s + p.marks, 0);
  const total =
    q.totalMarks && q.totalMarks > 0
      ? q.totalMarks
      : parts.reduce((s, p) => s + p.marks, 0);
  const v: Violation[] = [];

  // (0) Zero-precedent origin. When EVERY wine in the flight is from an origin nobody has seen in the
  //     recorded papers (Slovenia / the Brda–Collio amber belt, seeded in db.ts), identification is
  //     near-impossible — and the real exam responds by taking the ID marks off the table entirely,
  //     not by pricing them. 2019 P1 Q3 tells the candidate "do not spend time thinking about the
  //     wine's specific origin"; 2017 P3 Q2 says "consider wine 4 to be of unknown origin". So an ID
  //     ask over an all-zero-precedent flight is the defect, at ANY mark level: the marks belong on
  //     style, winemaking, quality and commercial. Fires ahead of the share/part-size arms because it
  //     is a stronger, wine-side signal than "too many marks on a reachable ID", and it has zero
  //     false positives on the real corpus by construction — these origins never appear in it.
  const wines = q.wines || [];
  if (wines.length > 0) {
    const origins = wines.map(matchZeroPrecedentOrigin);
    if (origins.every((o) => o !== null)) {
      const label = [...new Set(origins as string[])].join("; ");
      v.push({
        rule: "zero-precedent-origin-id",
        severity: "hard",
        detail: `the flight asks the candidate to identify the grape variety/region/origin (${idMarks} marks) of wines whose origin — ${label} — has no precedent in the recorded MW papers. When the exam pours a never-seen origin it suppresses identification ("do not spend time thinking about the wine's specific origin", 2019 P1 Q3; "consider wine 4 to be of unknown origin", 2017 P3 Q2) and weights style, winemaking, quality and commercial. Move these marks to those parts.`,
      });
    }
  }

  // (a) A single identification part. Hard above what the real exam has ever paid for one, soft above
  //     its p90 — "15 marks to identify the region" is real, "60 marks" is not.
  const biggest = idParts.reduce((a, b) => (b.perUnit > a.perUnit ? b : a));
  if (biggest.perUnit > ID_SINGLE_PART_SOFT) {
    const label =
      biggest.text.match(ID_PART_RE)?.[0] ?? "an identification part";
    const hard = biggest.perUnit > ID_SINGLE_PART_HARD;
    v.push({
      rule: "id-mark-allocation",
      severity: hard ? "hard" : "soft",
      detail: hard
        ? `"${label}" is worth ${biggest.perUnit} marks. The real exam has never paid more than ${ID_SINGLE_PART_HARD} for a single variety/region/origin identification part. Move the balance to the style/method/quality parts.`
        : `"${label}" is worth ${biggest.perUnit} marks, above the ${ID_SINGLE_PART_SOFT}-mark level the real exam only reaches in its top decile. Legitimate, but check the style/method/quality parts are not being starved.`,
    });
  }

  // (a2) …and the floor. A part the exam would never price this low is a mis-allocation just as much
  //      as an oversized one, and it is the arm that catches the real reviewer bin.
  const starved = idParts.find(
    (p) => p.perUnit > 0 && p.perUnit < ID_PART_FLOOR,
  );
  if (starved) {
    const label =
      starved.text.match(ID_PART_RE)?.[0] ?? "an identification part";
    v.push({
      rule: "id-mark-allocation",
      severity: "hard",
      detail: `"${label}" is worth only ${starved.perUnit} mark${
        starved.perUnit === 1 ? "" : "s"
      }, below the ${ID_PART_FLOOR}-mark floor every identification part in the real corpus respects (177 parts, 5 to 30 marks). Price it like a task the candidate has to earn.`,
    });
  }

  // (b) The identification share of the paper, on the same two-tier basis.
  if (total > 0 && idMarks > Math.floor(total * ID_SHARE_SOFT)) {
    const hard = idMarks > Math.floor(total * ID_SHARE_HARD);
    const share = Math.round((idMarks / total) * 100);
    v.push({
      rule: "id-mark-allocation",
      severity: hard ? "hard" : "soft",
      detail: hard
        ? `identification marks total ${idMarks} of ${total} (${share}%) — beyond the ${Math.round(
            ID_SHARE_HARD * 100,
          )}% the real exam has never exceeded. A question that is almost entirely "name it" leaves no marks for style, method or quality.`
        : `identification marks total ${idMarks} of ${total} (${share}%), above the ${Math.round(
            ID_SHARE_SOFT * 100,
          )}% the real exam only reaches in its top decile. Worth checking the other parts carry their weight.`,
    });
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
//
// Widened 2026-08-08 against the corpus. `consider` and `highlight` alone accounted for six of the
// thirty real questions this rule rejected — "Consider the likely vintage" (2017 P3 Q5), "Highlight
// the key winemaking techniques used" (2017 P3 Q1 and Q2) — and `comment(?: briefly)? on` could not
// read "Comment in detail on the method of production", so the adverb slot is now open.
//
// INTERROGATIVES are the other half. The real exam sets plenty of tasks as questions rather than
// commands — "What are the key winemaking techniques used in the wine's production?" (2017 P1 Q2,
// 2019 P1 Q2), "Who would buy this wine?" (2017 P3 Q6), "To whom is this wine most likely to appeal,
// and why?" (2012 P3 Q2), "In which area of the trade would this wine be most successful?"
// (2017 P1 Q3). A repertoire that only understands imperatives cannot see any of them, so the
// question forms sit alongside the verbs and every entry below gets them for free.
const TASK_VERBS =
  "(?:identify|comment(?:[a-z ]{0,20})? (?:on|upon)|describe|discuss|assess|evaluate|analyse|analyze|" +
  "compare(?: and contrast)?|contrast|explain|state|estimate|account for|consider|highlight|outline|suggest|" +
  "what (?:are|is|has|have|would|do|does)|which|who (?:would|might|is|are)|to whom|how (?:would|might|has|have|is|are))";

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
    label:
      "identify the country and/or region of origin as closely as possible",
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
    re: new RegExp(
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:styles?|key characteristics|character)\\b`,
    ),
  },
  {
    id: "winemaking",
    label:
      "comment on the key winemaking/production decisions and how they influenced style",
    re: new RegExp(
      // `winemaker` is here because the exam asks about the person as readily as the process:
      // "Consider how the winemaker has sought to retain the wine's sense of place" (2017 P1 Q4),
      // "What has the winemaker done to maximise quality and regional typicity…" (2018 P2 Q1).
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:winemaking|wine making|winemakers?|vinification|maturation|elevage|viticultur[a-z]*|production (?:decisions?|methods?|techniques?)|methods? (?:of|used in|used for) (?:its )?production|production of|techniques?)\\b`,
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
    re: new RegExp(
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:sweetness|residual sugar|sugar)\\b`,
    ),
  },
  {
    id: "blend-composition",
    label: "comment on the blend and the role of its components",
    re: new RegExp(
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:blends?|blending|blended|assemblage|components? (?:of|in) the blend|role played by each component)\\b`,
    ),
  },
  {
    id: "quality",
    label: "comment on quality/faults",
    re: new RegExp(
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:quality|qualities|faults?|maturity|tier|classification|quality designation)\\b`,
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
    // The "how long…" family is the same task in the exam's own words, and it arrives as a rider on a
    // maturity part ("…including how long the wine will keep"), so it has to be matchable on its own.
    re: /\b(?:readiness for drinking|ready to drink|drink(?:ing)? window|drinkability|likely to hold|drink well|ag(?:e)?ing potential|potential for (?:further )?ag(?:e)?ing|ability to age|capacity to age|capacity for ag(?:e)?ing|capacity to improve|potential to (?:develop|improve)|likely to improve|reach (?:its|their) peak|how long [a-z ]{0,20}(?:keep|last|hold|improve|age)|future development)\b/,
  },
  {
    id: "commercial",
    label: "comment on the commercial position / who the wine is for",
    // The keyword list was written for the phrase "commercial position" and missed the way the real
    // exam usually asks this: who would BUY it, how would you SELL it, which MARKET or area of the
    // TRADE it belongs in, to whom it would APPEAL. Six real questions turned on those words.
    re: new RegExp(
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,90}\\b(?:commercial|appeal|markets?|market position|market potential|target market|price|pricing|value for money|sell|selling|buy|buyer|purchase|customers?|consumers?|trade)\\b`,
    ),
  },
  {
    id: "identify-vintage",
    label: "identify or estimate the vintage / age of the wine",
    // The single largest repertoire gap: nine clauses across eight real questions, 2012 to 2021.
    // "Identify the vintage" (2015 P1 Q1, 2016 P2 Q3, 2018 P3 Q1, 2021 P2 Q1), "Identify the vintage,
    // giving reasons for your conclusion" (2014 P2 Q2), "Consider the likely vintage" (2017 P3 Q5),
    // "Comment on the age/vintage of each wine" (2011 P1 Q1). It is a staple, and the registry simply
    // did not have it.
    re: new RegExp(
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,60}\\b(?:vintages?|age of the wine|wine s age)\\b|\\bcomment on the age\\b`,
    ),
  },
  {
    id: "group-the-wines",
    label: "divide / pair / group the wines",
    // 2014 P1 Q3 is a paired flight: "Divide the wines into their respective pairs by country…".
    re: /\b(?:divide|group|pair|split|separate)\b[a-z0-9 ]{0,40}\bwines?\b|\b(?:pairs?|pairings?) by (?:country|variety|region)\b/,
  },
  {
    id: "answer-format",
    label: "record the answer in the grid / tick the appropriate box",
    // A real P3 answer-sheet instruction: "Place a tick in the appropriate box for the residual sugar"
    // (2015 P3 Q3). It is a direction about HOW to answer, not an invented task.
    re: /\b(?:place a tick|tick the appropriate|appropriate box|complete the (?:grid|table)|in the (?:grid|table) (?:below|provided))\b/,
  },
  {
    id: "compare-wines",
    label:
      "compare and contrast the wines (dimension carried by sibling clauses)",
    re: /\bcompare(?: and contrast)?\b[a-z0-9 ]{0,40}\b(?:wines?|pairs?)\b/,
  },
  {
    id: "differences",
    label: "discuss how the wines differ",
    re: new RegExp(
      `\\b${TASK_VERBS}\\b[a-z0-9 ]{0,50}\\bdiffer(?:s|ences?)?\\b`,
    ),
  },
  {
    id: "how-made",
    label: "discuss how the wine has been made",
    re: /\bhow (?:the|this|each|these) wines? (?:has|have|was|were)(?: been)? made\b/,
  },
  {
    id: "justify",
    label: "justify your answer / give reasons",
    re: /^(?:justify(?:ing)? your|give (?:your )?reasons?|support your|with reference to|draw on evidence|use evidence|base your answer)\b/,
  },
  {
    id: "state-analytic",
    label:
      "state the residual sugar / sweetness (dosage) category / alcohol level",
    // Verb-OPTIONAL, unlike its siblings. The exam and the generator both write this one as a bare
    // noun phrase under a "For each wine:" header — "d) The level of residual sugar in grammes per
    // litre." The task is unambiguous from the object alone, and requiring a verb rejected a
    // canonical analytic readout for a missing word.
    re: /\b(?:state|estimate|identify)\b[a-z0-9 ]{0,40}\b(?:residual sugar|sweetness (?:level|category)|level of sweetness|dosage(?: category| level)?|abv|alcohol)\b|\b(?:the )?level of (?:residual sugar|alcohol)\b|\bresidual sugar in (?:grammes|grams)\b/,
  },
];

// (NON_VARIETAL_STYLE_RE lived here: the sparkling/fortified exemption for the variety-ID template
// requirement. Removed with that requirement — the exam asks origin-only on still flights too, so
// there is nothing left to exempt.)

// The lettered parts of a question ("a) …" … up to the next label). Scaffolding before the first
// label (the stem, "For each wine:") is excluded — the repertoire scan judges commands, not framing.
function parseLetteredParts(
  questionText: string,
): { letter: string; text: string }[] {
  const text = questionText || "";
  // The label must START a line or follow whitespace — `[^a-z0-9]` also matched a letter closing a
  // PARENTHESIS mid-word, so "Identify the grape variety and origin(s) as closely as possible"
  // (2016 P1 Q2) invented a part "s" whose text was " as closely as possible", and "State the level of
  // residual sugar (g/l) and level of alcohol" (2017 P3 Q3) invented a part "l". Both phantoms then
  // failed the repertoire scan, because a sentence fragment matches no task. Four of the thirty real
  // questions this rule rejected were this bug rather than a repertoire gap. `\(?` keeps the "(a)"
  // spelling working, since there the parenthesis OPENS the label instead of closing a word.
  const labels = [...text.matchAll(/(?:^|[\s\n])\(?([a-z])\)\s/gi)].map(
    (m) => ({
      letter: m[1].toLowerCase(),
      labelAt: m.index ?? 0,
      start: (m.index ?? 0) + m[0].length,
    }),
  );
  return labels.map((l, i) => ({
    letter: l.letter,
    text: text.slice(
      l.start,
      i + 1 < labels.length ? labels[i + 1].labelAt : text.length,
    ),
  }));
}

// Split a part into command clauses. Sentence boundaries first; then mechanism riders (", including
// how …") and compound commands (", and explain …") are split off so each command is judged alone.
function splitCommandClauses(partText: string): string[] {
  const noMarks = (partText || "").replace(
    /\((?:\d+\s*[x×]\s*)?\d+\s*marks?\)/gi,
    " ",
  );
  // "e.g." and friends are not sentence ends. Splitting on their dots tore
  // "State the approximate dosage category (e.g. Brut Nature, Brut, Demi-Sec)" into three pieces and
  // then rejected the orphan "brut nature brut demi sec" for setting no task. Decimal points ("13.5%")
  // would do the same. Neutralise both before the sentence split, not after.
  const protectedText = noMarks
    .replace(/\b(e|i)\.(g|e)\./gi, "$1$2")
    .replace(/\bcf\./gi, "cf")
    .replace(/(\d)\.(\d)/g, "$1$2");
  const clauses: string[] = [];
  for (const sentence of protectedText.split(/[.?!;:\n]+/)) {
    for (const clause of sentence.split(
      /,?\s+including\s+(?=(?:how|why|whether)\b)|,\s+and\s+(?=(?:identify|comment|describe|discuss|assess|evaluate|compare|contrast|explain|state|estimate)\b)/i,
    )) {
      const cleaned = norm(clause)
        .replace(/[^a-z0-9 ]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      // Skip fragments, mark-recap tables ("a 15 b 24 c 21 d 15 75", "3 x 8 24") and pure
      // scaffolding ("for each wine:", "for wines 1 and 2:", "be as precise as possible").
      const meaningful = cleaned
        .split(" ")
        .filter(
          (t: string) =>
            t &&
            !/^\d+$/.test(t) &&
            !/^[a-z]$/.test(t) &&
            ![
              "x",
              "mark",
              "marks",
              "total",
              "per",
              "wine",
              "wines",
              "each",
            ].includes(t),
        );
      if (meaningful.length < 3) continue;
      if (
        /^(?:for (?:each|both|all|the)(?: of)?(?: the)?(?: \w+)? wines?(?: \d+(?: and \d+)*)?|with reference to (?:each|both|all)(?: \w+)? wines?|in each case|be as (?:precise|specific|accurate) as possible)$/.test(
          cleaned,
        )
      )
        continue;
      // Framing and answer-DIRECTION, neither of which sets a task. The exam writes both: "Do not
      // spend time thinking about the wine's specific origin" (2019 P1 Q3) steers effort away from a
      // task, and "In addition to being paired by variety they are also paired by country"
      // (2014 P1 Q3) is a statement about the flight that happens to sit inside a lettered part.
      // Judging either against a repertoire of COMMANDS is a category error.
      if (
        /^(?:do not|don t|you (?:are )?(?:need |do )?not|there is no need to|avoid)\b/.test(
          cleaned,
        )
      )
        continue;
      if (
        /^(?:in addition to|as well as|note that|these wines are|they are)\b/.test(
          cleaned,
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
  {
    value: "botrytis",
    re: /botrytis|noble rot|edelfaule|sauternes|barsac|aszu|trockenbeerenauslese|beerenauslese|tokaji/,
  },
  { value: "icewine", re: /icewine|ice wine|eiswein/ },
  {
    value: "dried grape",
    re: /dried.grape|appassimento|passito|recioto|vin ?santo|straw wine|amarone|pedro ximenez/,
  },
  {
    value: "fortification",
    re: /fortif|mutage|vin doux naturel|\bvdn\b|\bport\b(?!\s*phillip)|maury|banyuls|rutherglen|liqueur muscat|muscat de|rivesaltes/,
  },
  {
    value: "arrested fermentation",
    re: /arrested fermentation|fermentation (?:was |is |been )?(?:stopped|arrested|halted)/,
  },
  { value: "sweet reserve", re: /sweet reserve|sussreserve/ },
  {
    value: "late harvest",
    re: /late.harvest|late.picked|vendange tardive|spatlese|auslese|noble late/,
  },
];

function sweetnessMechanism(w: AuditWine): string | null {
  const hay = norm(
    [w.style, w.style_category, w.fullText].filter(Boolean).join(" "),
  );
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
    askRe:
      /(?:compare|contrast|explain|account for|describe|discuss)[^.?!]{0,60}sweet(?:ness)?|sweet(?:ness)?[^.?!]{0,50}(?:mechanism|achiev|impart|obtain|attain|arriv)|method (?:by|in) which[^.?!]{0,50}sweet/,
    resolve: sweetnessMechanism,
  },
  {
    id: "method-of-production",
    label: "method of production",
    askRe:
      /(?:compare|contrast)[^.?!]{0,60}(?:methods? of production|production methods?|(?:cask |barrel )?age?ing|maturation|winemaking|vinification)/,
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
  // "&" as well as "and": the real 2023 P1 Q1 writes "1 & 2 are a pair and 3 & 4 are a pair", where
  // matching only "and" found the single spurious span "2 are a pair and 3" and so read the stem as
  // having no declared pairs at all.
  for (const m of s.matchAll(/\b(\d+)\s*(?:and|&)\s*(\d+)\b/g))
    pairs.push([Number(m[1]), Number(m[2])]);
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
    if (askRe.test(norm(text.slice(labels[i].index, end))))
      return labels[i].letter;
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
    for (const [val, n] of counts)
      if (n > dominantN) [dominant, dominantN] = [val, n];
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
  const text = [w.style, w.style_category, w.fullText]
    .filter(Boolean)
    .join(" ");
  return classifyWineStyle(text);
}

export function validatePaperStyleMix(
  paper: number,
  wines: AuditWine[],
): Violation[] {
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
    (t) =>
      t.isRose ||
      t.style === "sparkling" ||
      t.style === "sweet" ||
      t.style === "fortified",
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
    // NO sparkling and NO fortified wine — Paper 1 is white STILL wines.
    //
    // This clause used to allow one sparkling wine (`p1-max-one-sparkling`), on the strength of
    // EK-0046's "almost never contains sparkling and NEVER two". Two things made that untenable.
    //
    // First it was already dead: R-COLOUR blocks sparkling per-wine on Paper 1, and it runs on every
    // generation and serve path, so a single-sparkling P1 flight was rejected before this clause was
    // reached. The two rules disagreed and the stricter one silently won — which is worse than either
    // policy, because the intent was recorded nowhere and removing the per-wine rule would quietly
    // re-admit sparkling.
    //
    // Second, "almost never" is not a specification a generator can follow. The app's job is to drill
    // the paper's actual shape, and a sparkling wine on Paper 1 teaches a candidate to expect something
    // the paper is defined not to contain. Product decision (2026-08-07): block it entirely, and say so
    // in ONE place. See EK-0157.
    if (counts.sparkling > 0) {
      v.push({
        rule: "paper-style-mix",
        severity: "hard",
        detail: `PAPER_STYLE_MIX: Paper 1 flight contains ${counts.sparkling} sparkling wine${
          counts.sparkling === 1 ? "" : "s"
        } (${countsLabel}) — Paper 1 is white STILL wines, so sparkling wines belong on Paper 3. Rule fired: p1-no-sparkling.`,
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
// COLOUR AND STYLE ARE TWO INDEPENDENT AXES, and conflating them is a bug we shipped once already.
// resolveWineScope() returns them separately:
//
//   colour: white | red | rose | orange | null      style: still | sparkling | sweet | fortified | oxidative
//
// A rosé Champagne is `sparkling` AND `rose`; a Riesling Spätlese is `sweet` AND `white`. The original
// classifyWineColour() collapsed both onto one enum with style winning, so a Spätlese resolved to
// "sweet" rather than "white" and tripped `wrong_colour_for_paper` on Paper 1 — even though the
// generation prompt explicitly invites it ("unless a white wine with residual sugar like Riesling
// Spätlese or Vouvray demi-sec", question-generation-prompt.ts) and 16 live Paper 1 questions relied
// on it. Paper 1 blocks a wine for being RED or FORTIFIED or SPARKLING, never for being sweet or
// oxidatively handled — conventionally cask-oxidised whites (white Rioja, aged Hunter Semillon) are
// Paper 1 wines, see the note at question-engine.ts validatePaperScope.
//
// Both axes are DERIVED from the wine record's existing style/style_category/label/variety fields,
// reusing the shared style classifier (classifyWineStyle) and grape indicators so a wine is tagged
// exactly as the rest of the system tags it. When a still wine's colour cannot be positively
// determined the resolver returns null; whether that BLOCKS is the caller's choice
// (`blockIndeterminate`) — at generation an alternative wine is free, at serve time it is not.
// ---------------------------------------------------------------------------------------------------

// The collapsed enum. Retained because migration 052's wine_bank.colour CHECK constraint and the
// generation-time LLM classifier both persist these seven values. New code should prefer
// resolveWineScope() and read the two axes separately.
export type WineColour =
  "white" | "red" | "rose" | "orange" | "sparkling" | "sweet" | "fortified";

/** The colour axis alone — what is actually in the glass, independent of how it was made. */
export type PureColour = "white" | "red" | "rose" | "orange";
/** The style axis alone — how it was made, independent of colour. */
export type WineStyleAxis =
  "still" | "sparkling" | "sweet" | "fortified" | "oxidative";

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
const ORANGE_STYLE_RE =
  /orange wine|skin[- ]?contact|amber wine|\bramato\b|\bqvevri\b|\bkvevri\b/;
// Free-text colour cues on the label/region, used to settle still red vs still white when the grape
// indicators are silent. Accent-stripped (matched against norm()'d text).
const RED_COLOUR_CUE = /\b(red|rouge|rosso|tinto|tinta|rot|noir|nero)\b/;
// `branco` (Portuguese) was missing while RED_COLOUR_CUE carried the Iberian `tinto|tinta` pair, so
// "Quinta dos Roques, Touriga Nacional Branco" — a WHITE wine — resolved red off its grape name.
const WHITE_COLOUR_CUE =
  /\b(white|blanc|blanche|blanco|branco|bianco|weiss|weisser|weisswein|feher)\b/;

// A colour qualifier strong enough to OVERRIDE the grape. A red grape carrying one of these is a white
// bottling: Touriga Nacional Branco, Xinomavro White, Rioja Blanco.
//
// French `blanc` is deliberately EXCLUDED. It appears inside proprietary names of red wines —
// Château Cheval Blanc is a red Saint-Émilion, Château Blanc, Clos Blanc — so promoting it to an
// override would misread famous reds as whites. `blanc` still contributes to WHITE_COLOUR_CUE above,
// where the resolved varieties get to outvote it.
//
// The two `blanc de …` compounds ARE included: unlike a bare `blanc` they cannot be part of an estate
// name, and both name a white wine outright. Blanc de Noirs is the one that needs saying — a white
// wine from black grapes, so its variety list argues red and only the label is right.
const WHITE_QUALIFIER_OVERRIDE =
  /\b(branco|blanco|bianco|white|weiss|weisswein|feher)\b|\bblanc de (?:blancs|noirs)\b/;

// Varieties that RED_GRAPE_INDICATORS deliberately omits because the bare token is ambiguous for
// VARIETY resolution, even though it is unambiguous for COLOUR. `montepulciano` is the case: adding it
// to the shared indicator list outranks the appellation table's `vino nobile` → sangiovese entry. Every
// wine that resolves to one of these is red.
const EXTRA_RED_VARIETIES = /\b(montepulciano)\b/;

// --- Corrections applied to the SHARED style classifier for paper-scope purposes only ---------------
// classifyWineStyle is tuned for Paper 3 categorisation and its regexes are pinned by a corpus of real
// labels (tests/p3-category.test.mjs). Rather than mutate them, the two cases below are corrected here,
// where the question is narrower: "may this wine appear on Paper 1 / Paper 2?"

// Maury and Rasteau each name BOTH a vin doux naturel AND a dry still red AOC. The shared FORTIFIED
// regex matches the bare region name — correct for P3 categorisation, wrong here: "Mas Amiel, Maury
// Sec" and "Domaine de la Mordorée, Rasteau Grenache Noir" are dry reds and legitimate Paper 2 wines.
// Measured against the live bank, this accounted for 3 of 14 false rejections.
//
// So for these two the burden of proof is INVERTED: the region name alone does not make a wine
// fortified, an explicit VDN marker does. Rivesaltes is deliberately NOT in this set — its dry wines
// are labelled Côtes du Roussillon, so a bare "Rivesaltes" really is a VDN.
//
// The trade-off is deliberate. A bare "Mas Amiel, Maury" (a real VDN) now reads still, so this can
// admit a fortified wine on Paper 2 — but false REJECTIONS retire legitimate questions from the pool,
// which is the costlier error here, and the sweep's job is to be right about wines it is sure of.
// Rutherglen belongs here for the same reason: it is famous for fortified Muscat and Topaque, but it
// also makes dry Durif, Shiraz and Petite Sirah, and a "Petite Sirah, Rutherglen" is a legitimate
// Paper 2 wine that the bare region name was rejecting.
const DUAL_VDN_APPELLATION = /\b(maury|rasteau|rutherglen)\b/;
// The positive markers. `muscat|topaque|tokay|liqueur` are here for Rutherglen — they only apply when a
// dual-purpose region has already matched, so a dry Alsace Muscat is unaffected.
const EXPLICIT_FORTIFIED =
  /\b(vin doux naturel|vdn|fortified|ambre|tuile|rancio|hors d.age|mistelle|muscat|topaque|tokay|liqueur)\b/;

// The shared ROSE cue matches a bare `rose`, which collides with producer names once norm() strips
// accents ("Cascina delle Rose" in Barbaresco — a red), and `cerasuolo`, which is a rosé in Abruzzo but
// a RED DOCG in Vittoria. Both produced false rosé verdicts on real reds in the live bank.
const ROSE_FALSE_POSITIVE =
  /\b(cerasuolo di vittoria|(?:delle|della|des|du|de la|la|le)\s+rose)\b/;

// ---------------------------------------------------------------------------------------------------
// EXPLICIT COLOUR SIGNALS — what the label SAYS and what the grapes ARE, as distinct from a regional
// prior ("Etna is famous for Nerello Mascalese, therefore red").
//
// The reported failure: "Benanti, Etna Bianco Superiore Pietra Marina, 2020. Etna, Sicily, Italy" was
// classified RED, twice, by the generation-stage classifier — even though the label says Bianco and
// Carricante is a white grape. The wrong colour persisted onto the question's wine slot, and because a
// persisted colour outranks inference (see resolveWineScope), R-COLOUR then quarantined a legitimate
// Paper 1 question. R-COLOUR is unconditional and blocking by design, so a region whose name is
// associated with the opposite colour silently loses ALL of its wines of that colour from its paper:
// Etna Bianco, Etna Rosato, white Rioja, Blanc de Noirs, Sancerre Rouge, Alsace Pinot Noir.
//
// The rule stays unconditional. What changes is that its INPUT stops being a prior when the label or
// the grape settles the matter outright.
// ---------------------------------------------------------------------------------------------------

// Unambiguous rosé words. `rose` itself is kept (accents are stripped by norm(), so "rosé" arrives as
// "rose") but stays subject to ROSE_FALSE_POSITIVE, and is required to stand alone rather than sit
// inside a hyphenated proprietary name.
const ROSE_LABEL_CUE =
  /\b(rosado|rosato|blush|weissherbst)\b|\bwhite zinfandel\b|(?:^|[^\w-])rose(?:[^\w-]|$)/;
// Red colour words. `red` is here for "Sancerre Rouge"'s Anglophone cousins, but see the guard in
// explicitColourSignal — "Red Car, Chardonnay" is a white wine from a producer called Red Car.
const RED_LABEL_CUE = /\b(rouge|rosso|tinto|tinta|rotwein|red)\b/;

// French `blanc`, which WHITE_QUALIFIER_OVERRIDE deliberately excludes because it hides inside
// proprietary names of reds. Measured against the live bank, that exclusion was the single largest
// source of false quarantines: 7 of the 17 questions quarantined on `wrong_colour_for_paper` were
// white Paper 1 wines whose ONLY colour evidence was the word Blanc — Château Rayas Châteauneuf-du-Pape
// Blanc, Château Smith Haut Lafitte Blanc, Château de Beaucastel Blanc, Domaine de la Mordorée Lirac
// Blanc, Domaine Gauby Côtes Catalanes Blanc, Domaine Gramenon Côtes du Rhône Blanc, Tablas Creek
// Esprit de Tablas Blanc. In three of them the resolved KEY named the appellation's red grapes,
// because the appellation table made the same mistake, so nothing but the label could save them.
//
// The appellation data cannot arbitrate this: it lists Châteauneuf-du-Pape, Pessac-Léognan and Côtes
// du Rhône as red-only (only 7 of its 238 entries carry byColor at all), so "red appellation ⇒ ignore
// blanc" would keep every one of those seven broken.
//
// So `blanc` is now believed, with two carve-outs:
//   - "blanc de X" is a construction, not a colour ("Clos Blanc de Vougeot"). `blanc de blancs` and
//     `blanc de noirs` are matched earlier by WHITE_QUALIFIER_OVERRIDE and are unaffected.
//   - a short denylist of estates whose NAME ends in Blanc and whose wine is red.
// The residual risk is a red wine with a proprietary Blanc name outside that list reading as white.
// That is the smaller error: it admits one wrong wine, where the old behaviour retired every white
// wine labelled in French from Paper 1.
const FRENCH_BLANC = /\bblanc(?:he)?\b(?!\s+de\b)/;
const BLANC_PROPRIETARY_RED = /\b(cheval blanc|chateau blanc|mas blanc)\b/;

// A colour qualifier carried as a SUFFIX on the variety name itself. This is the grape stating its own
// colour, and it has to outrank the indicator lists because those match on substrings: "Grenache Blanc"
// contains "grenache", so RED_GRAPE_INDICATORS fires on a white grape. That collision is why five
// legitimate white Rhône/Roussillon flights were quarantined as red. It cuts the other way too —
// "Malvasia Nera" is a red grape whose name contains the white "malvasia".
const VARIETY_WHITE_SUFFIX =
  /\b(blanc|blanche|blanca|blanco|bianco|branco|gris|grigio|weiss|weisser)$/;
const VARIETY_RED_SUFFIX =
  /\b(noir|noire|nero|nera|negro|negra|tinto|tinta|rouge|rosso|preto)$/;

// The same qualifier, but written on the LABEL rather than in the resolved variety list: "Arnot-
// Roberts, Trousseau Gris" is a white wine keyed simply as Trousseau. The preceding word must itself be
// a recognised grape, which is what keeps "Vin Gris" and "Gris de Gris" — both rosés — out of it.
const GRAPE_PLUS_GRIS = /\b([a-z]+)\s+(?:gris|grigio)\b/;
function labelGrapeGris(hay: string): boolean {
  const m = hay.match(GRAPE_PLUS_GRIS);
  if (!m) return false;
  return RED_GRAPE_INDICATORS.test(m[1]) || WHITE_GRAPE_INDICATORS.test(m[1]);
}

/** One variety's colour. Suffix qualifier first, then the LONGER indicator match. */
function colourOfOneVariety(v: string): "white" | "red" | null {
  const t = norm(canonVariety(v));
  if (!t) return null;
  if (VARIETY_WHITE_SUFFIX.test(t)) return "white";
  if (VARIETY_RED_SUFFIX.test(t)) return "red";
  const rm = t.match(RED_GRAPE_INDICATORS)?.[0] ?? "";
  const wm = t.match(WHITE_GRAPE_INDICATORS)?.[0] ?? "";
  // Longest match wins, so "grenache blanc" (white, 14 chars) beats "grenache" (red, 8).
  if (wm.length > rm.length) return "white";
  if (rm.length > wm.length) return "red";
  return EXTRA_RED_VARIETIES.test(t) ? "red" : null;
}

/** The colour a variety list agrees on, or null when it is mixed, empty or unrecognised. */
function varietyColour(varieties?: string[]): "white" | "red" | null {
  let red = false;
  let white = false;
  for (const v of varieties || []) {
    const c = colourOfOneVariety(v);
    if (c === "red") red = true;
    else if (c === "white") white = true;
  }
  if (red && !white) return "red";
  if (white && !red) return "white";
  return null;
}

/** The text a colour word may legitimately appear in: the label, plus the region it names. */
export const colourBearingText = (w: Pick<AuditWine, "fullText" | "region">) =>
  [w.fullText, w.region].filter(Boolean).join(". ");

export type ColourSignal = { colour: PureColour; basis: "label" | "variety" };

/**
 * The colour a label states outright, or that its grapes settle — never a regional prior.
 *
 * `basis` matters to the caller: a LABEL word is the strongest evidence there is and may overturn a
 * stored colour, while a VARIETY list is only decisive for still wines (a Provence rosé is Grenache
 * and a ramato is Pinot Grigio — the grape cannot see how the wine was made).
 *
 * Precedence within the label mirrors resolveStillColour's, which is already pinned by tests: a white
 * qualifier outranks the grape (Touriga Nacional Branco), French `blanc` is not a qualifier (Château
 * Cheval Blanc), and rosé/orange are read before either.
 */
export function explicitColourSignal(
  fullText?: string,
  varieties?: string[],
): ColourSignal | null {
  const hay = norm(fullText || "");
  const vc = varietyColour(varieties);
  if (hay) {
    if (ORANGE_STYLE_RE.test(hay)) return { colour: "orange", basis: "label" };
    if (ROSE_LABEL_CUE.test(hay) && !ROSE_FALSE_POSITIVE.test(hay))
      return { colour: "rose", basis: "label" };
    if (WHITE_QUALIFIER_OVERRIDE.test(hay))
      return { colour: "white", basis: "label" };
    if (FRENCH_BLANC.test(hay) && !BLANC_PROPRIETARY_RED.test(hay))
      return { colour: "white", basis: "label" };
    if (labelGrapeGris(hay)) return { colour: "white", basis: "label" };
    // A red word does NOT outrank a unanimously white grape list. The asymmetry is deliberate and
    // mirrors WHITE_QUALIFIER_OVERRIDE: white qualifiers are almost always the colour of the wine,
    // whereas `red`/`rosso` turn up in producer and place names ("Red Car, Chardonnay, Sonoma Coast").
    if (RED_LABEL_CUE.test(hay) && vc !== "white")
      return { colour: "red", basis: "label" };
  }
  return vc ? { colour: vc, basis: "variety" } : null;
}

/**
 * Settle a still wine's colour: red vs white, or null when it cannot be positively determined.
 *
 * Precedence is deliberate: what the label STATES, then what the grapes ARE (both via
 * explicitColourSignal), and only then the weaker cues — loose colour words anywhere in the record, the
 * dominant variety implied by the appellation, and finally the appellation's own colour.
 */
function resolveStillColour(w: AuditWine, hay: string): "white" | "red" | null {
  const explicit = explicitColourSignal(colourBearingText(w), w.varieties);
  if (explicit?.colour === "white" || explicit?.colour === "red")
    return explicit.colour;

  // Nothing stated and no usable grape list — fall back to the label/region text.
  const red = RED_GRAPE_INDICATORS.test(hay) || RED_COLOUR_CUE.test(hay);
  const white = WHITE_GRAPE_INDICATORS.test(hay) || WHITE_COLOUR_CUE.test(hay);
  if (red && !white) return "red";
  if (white && !red) return "white";
  if (red && white && WHITE_QUALIFIER_OVERRIDE.test(hay)) return "white";

  // Last resort: resolve the dominant variety from the label and read its colour off the shared
  // indicators. This is what covers appellation-only labels — Hermitage, Châteauneuf-du-Pape,
  // Moulin-à-Vent, Viña Tondonia — which name no grape at all and were the wines that reached
  // Paper 1 in production. NOTE: it depends on the appellation resolver being registered in the
  // calling process (import "@/lib/appellation-resolver"), or detectPrimaryVariety returns "unknown".
  const primary =
    (w.varieties?.[0] && canonVariety(w.varieties[0])) ||
    detectPrimaryVariety(w.fullText || "");
  if (primary && primary !== "unknown") {
    if (RED_GRAPE_INDICATORS.test(primary) || EXTRA_RED_VARIETIES.test(primary))
      return "red";
    if (WHITE_GRAPE_INDICATORS.test(primary)) return "white";
  }

  // Last of all: the appellation's colour, which reaches further than its variety. detectPrimaryVariety
  // above can only use the 117 SINGLE-variety appellations — it must decline St-Julien, whose four
  // grapes cannot be reduced to one. But all four are red, so the appellation still settles the colour.
  // Server-only, via the registry (this module is client-reachable and cannot read the dataset itself).
  return colourFromAppellation(w.fullText || "") as "white" | "red" | null;
}

/**
 * Resolve ONE wine onto the two independent axes. `colour` is null when a still wine's colour cannot
 * be positively determined; `style` always resolves (defaulting to "still").
 */
export function resolveWineScope(w: AuditWine): {
  colour: PureColour | null;
  style: WineStyleAxis;
} {
  const styleText = [w.style, w.style_category, w.fullText]
    .filter(Boolean)
    .join(" ");
  const hay = norm(
    [w.fullText, w.style, w.style_category, w.region, ...(w.varieties || [])]
      .filter(Boolean)
      .join(" "),
  );
  if (!hay && !styleText) return { colour: null, style: "still" };

  const { style: s, isRose } = classifyWineStyle(styleText || hay);
  let style: WineStyleAxis =
    s === "fortified" || s === "sparkling" || s === "sweet" || s === "oxidative"
      ? s
      : "still";

  // A dual-purpose VDN appellation needs an explicit fortification marker to count as fortified.
  if (
    style === "fortified" &&
    DUAL_VDN_APPELLATION.test(hay) &&
    !EXPLICIT_FORTIFIED.test(hay)
  )
    style = "still";

  const reallyRose = isRose && !ROSE_FALSE_POSITIVE.test(hay);

  // Colour is resolved INDEPENDENTLY of style — a sweet wine still has a colour, and that is the whole
  // point of splitting the axes.
  //
  // A PERSISTED colour wins over INFERENCE. It was decided at generation time with the varieties,
  // region and enrichment all in hand; a serve-time caller re-deriving from a bare label is strictly
  // worse informed. This is what closes the label-invisible cases — 44 Paper 1 wine slots resolve to no
  // colour from their label alone.
  //
  // It does NOT win over the label STATING a different colour. That is not inference losing an argument
  // to better context, it is a stored value contradicting the words on the bottle — which is how a
  // Paper 1 Etna Bianco came to be quarantined as a red. The persisted colour is a model's judgement
  // and models follow regional fame; "Bianco" is not a judgement.
  const explicit = explicitColourSignal(colourBearingText(w), w.varieties);
  const labelContradiction =
    explicit?.basis === "label" && w.colour && explicit.colour !== w.colour
      ? explicit.colour
      : null;

  const colour: PureColour | null =
    labelContradiction ??
    w.colour ??
    (ORANGE_STYLE_RE.test(hay)
      ? "orange"
      : reallyRose
        ? "rose"
        : resolveStillColour(w, hay));

  return { colour, style };
}

/**
 * The collapsed seven-value enum, preserved for the persisted `wine_bank.colour` contract (migration
 * 052) and for callers that want a single tag. Style wins over colour here, exactly as before — so a
 * rosé Champagne reads "sparkling" and a sweet white reads "sweet".
 *
 * Do NOT use this to decide paper eligibility: that is what made a Riesling Spätlese fail Paper 1.
 * Use resolveWineScope() and test the two axes separately.
 */
export function classifyWineColour(w: AuditWine): WineColour | null {
  const { colour, style } = resolveWineScope(w);
  if (style === "fortified") return "fortified";
  if (style === "sparkling") return "sparkling";
  if (style === "sweet") return "sweet";
  if (colour === "orange") return "orange";
  if (colour === "rose") return "rose";
  return colour; // "white" | "red" | null
}

/**
 * Detect a stem that itself implies a colour/style the paper forbids. Requires the word "wine(s)"
 * after a colour so a tasting descriptor ("white pepper") can never trip it; the unambiguous style
 * words (sparkling/fortified) stand alone. Returns one hard violation or null.
 */
function stemColourConflict(
  paper: number,
  questionText: string | undefined,
): Violation | null {
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
export function validatePaperColour(
  paper: number,
  wines: AuditWine[],
  questionText?: string,
  opts?: { blockIndeterminate?: boolean },
): Violation[] {
  if (paper !== 1 && paper !== 2) return [];
  const allowedColour: PureColour = paper === 1 ? "white" : "red";
  const allowedLabel = paper === 1 ? "STILL WHITE" : "STILL RED";
  const v: Violation[] = [];

  for (const w of wines || []) {
    const { colour, style } = resolveWineScope(w);

    // BLOCKED STYLES — fortification and bubbles only. `sweet` and `oxidative` are deliberately NOT
    // blocked: a white wine with residual sugar (Riesling Spätlese, Vouvray demi-sec) and a
    // conventionally cask-oxidised white (white Rioja, aged Hunter Semillon) both belong on Paper 1.
    // Blocking them is the regression that this split exists to prevent.
    if (style === "fortified" || style === "sparkling") {
      v.push({
        rule: "wrong_colour_for_paper",
        severity: "hard",
        detail: `Paper ${paper} must serve ${allowedLabel} wine only, but ${wineLabel(
          w,
        )} reads as ${style} (detected style "${style}"). Rule R-COLOUR is unconditional.`,
      });
      continue; // one verdict per wine — the style is the disqualifying fact
    }

    // BLOCKED COLOURS.
    if (colour && colour !== allowedColour) {
      v.push({
        rule: "wrong_colour_for_paper",
        severity: "hard",
        detail: `Paper ${paper} must serve ${allowedLabel} wine only, but ${wineLabel(
          w,
        )} reads as ${COLOUR_STYLE_LABEL[colour]} (detected colour "${colour}"). Rule R-COLOUR is unconditional.`,
      });
      continue;
    }

    // INDETERMINATE. Asymmetric by design, and the asymmetry is the point: at GENERATION an
    // alternative wine costs one redraft, so refusing to guess is cheap and we block. At SERVE time
    // the wine is already banked, and rejecting on a LACK of evidence would retire a large slice of
    // the pool (and re-create the Live Tasting starvation failure), so we skip and let the colour
    // backfill convert these into resolved rows instead.
    if (!colour && opts?.blockIndeterminate) {
      v.push({
        rule: "wrong_colour_for_paper",
        severity: "hard",
        detail: `Paper ${paper} must serve ${allowedLabel} wine only, and ${wineLabel(
          w,
        )} could not be positively resolved to a colour. Name the grape variety or use a wine whose colour is unambiguous.`,
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
  paper?: number,
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
const FLOOR_TASK_IDS = new Set([
  "commercial",
  "quality",
  "style",
  "winemaking",
]);
const MARK_FLOOR_PER_WINE = 5;

// The only ask the exam ever prices at 2 marks: a literal numeric readout of residual sugar or alcohol
// (fb_73 — "answered in a few seconds e.g. 120 g/l, 20% ABV"). A part matching this is exempt from the
// floor at any mark value. Everything else that is a floor task must clear the 5-mark-per-wine floor.
const LITERAL_FACTUAL_ASK_RE =
  /\b(?:state|give|indicate|estimate|identify)\b[a-z0-9 ,]{0,50}\b(?:residual sugar|\brs\b|alcohol|abv)\b/;

// A single un-multiplied total that is asked ACROSS the whole flight (fb_73's "overall … compare and
// contrast across all wines … 18–24 points"). Such a part's floor is 5 × wineCount, not 5.
const FLIGHT_WIDE_ASK_RE =
  /\bacross\b|\ball (?:the |\d+ )?wines\b|\boverall\b|\bthe flight\b|\bcompare(?: and contrast)?\b/;

// norm()'d, punctuation-flattened text for task classification (mirrors splitCommandClauses' cleaning).
function cleanForTask(text: string): string {
  return norm(text || "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// The floor-task category (if any) a marked part sets, via the shared part-task classifier.
function floorTaskFor(partText: string): AllowedPartTask | null {
  const cleaned = cleanForTask(partText);
  return (
    ALLOWED_PART_TASKS.find(
      (t) => FLOOR_TASK_IDS.has(t.id) && t.re.test(cleaned),
    ) || null
  );
}

/**
 * Mark-budget rule. (a) The sum of every sub-part's marks (expanding "n × m") must equal exactly
 * 25 × wineCount — a mismatch is MARKS_TOTAL_MISMATCH quoting the computed total. (b) Every floor-task
 * sub-part (commercial / quality / style / method of production) must clear the 5-mark-per-wine floor
 * unless it is a literal numeric readout — a shortfall is MARKS_BELOW_FLOOR quoting the offending part.
 */
export function validateMarkBudget(q: QuestionForAudit): Violation[] {
  const v: Violation[] = [];
  const wineCount = (q.wines || []).length;
  const parts = parseMarkedParts(q.questionText, wineCount);
  if (parts.length === 0) return v;

  // Only judge a well-formed question: its lettered parts must begin at "a)". A fragment passed in
  // isolation (e.g. a lone "b) …" used in a unit test) has no meaningful budget to total.
  const lettered = parseLetteredParts(q.questionText || "");
  if (lettered.length > 0 && lettered[0].letter !== "a") return v;

  // (0) Whole marks only. "(2 x 7.5 marks)" was invisible to the integer-only token regex until
  // 2026-08-09, so two stems shipped printing 65 marks over 2 wines while every total check counted
  // the remaining integer tokens to a clean 50 (Mike's rejections of gen_p2_F1_1785898742363 and
  // gen_p2_any_1780197953533: "Never in the history of never have they ever given a half a mark").
  // Checked on its own — not just via the total — because fractional parts can still sum to 25 × N
  // ("2 x 12.5 marks"), and they are wrong at any total.
  for (const p of parts) {
    if (!Number.isInteger(p.perUnit) || !Number.isInteger(p.marks)) {
      v.push({
        rule: "MARKS_FRACTIONAL",
        severity: "hard",
        detail: `a sub-part is priced at ${p.perUnit} marks — the exam awards whole marks only. Re-allocate to integer marks summing to 25 per wine.`,
      });
    }
  }

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
  //
  // Skipped on a verbatim past-paper stem. The floor comes from fb_73 ("Commercial positioning is
  // always at least five points") and it is right about the modern exam, but four real questions
  // break it — 2011 P2 Q3 and 2015 P2 Q1 both price a written part at "(3 x 4 marks)". The rule's
  // only fix is a stem edit, so on a fixed stem it can do nothing but block the import. Note this
  // does NOT loosen generation: a drafted stem is still held to the floor. (The total-marks arm
  // above still runs on every path — it fires on none of the 160 corpus questions and it is the
  // check that the stored total_marks is honest.)
  if (q.stemIsAuthoritative === true) return v;

  for (const p of parts) {
    const task = floorTaskFor(p.text);
    if (!task) continue;
    if (LITERAL_FACTUAL_ASK_RE.test(cleanForTask(p.text))) continue;

    const hasMultiplier = p.marks !== p.perUnit; // "n × m" was written (m is the per-wine value)
    const flightWide =
      !hasMultiplier &&
      wineCount > 1 &&
      FLIGHT_WIDE_ASK_RE.test(cleanForTask(p.text));

    const floor = flightWide
      ? MARK_FLOOR_PER_WINE * wineCount
      : MARK_FLOOR_PER_WINE;
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
  const parts = parseLetteredParts(text).map(
    (p) => `${p.letter}:${p.text.replace(/\s+/g, " ").trim()}`,
  );
  // Deliberately UNSCOPED (no wine count). This is a stored fingerprint compared against hashes
  // written by earlier builds; resolving section-header scope here would change the hash of every
  // scoped question already served and read as a re-derived stem (fb_344) on every one of them.
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
    if (from >= 1 && to >= from && to - from < 12)
      for (let i = from; i <= to; i++) slots.add(i);
  }

  // Enumerations, unioned across every group the stem declares.
  for (const m of stem.matchAll(
    /\bwines?\s+(\d+(?:\s*,\s*\d+)*(?:\s*,?\s*and\s+\d+)?)/g,
  )) {
    for (const d of m[0].matchAll(/\d+/g)) slots.add(Number(d[0]));
  }

  // Only trust the stem when it names at least TWO slots. A single incidental reference ("…of wine 2")
  // is not a declaration that the flight holds one wine, so we fall through to the mark multiplier
  // rather than assert a count we cannot support.
  return slots.size >= 2 ? slots.size : null;
}

// The wine count implied by an "N × M marks" per-wine multiplier in the parts (the largest N), or null.
function parseMultiplierWineCount(questionText: string): number | null {
  // Deliberately UNSCOPED: this function INFERS the wine count, so feeding one in would be circular
  // (a scoped token would report back the very count that was used to expand it).
  const mults = parseMarkedParts(questionText)
    .filter((p) => p.perUnit > 0 && p.marks !== p.perUnit)
    .map((p) => Math.round(p.marks / p.perUnit))
    .filter((n) => n >= 1);
  return mults.length ? Math.max(...mults) : null;
}

// The anchor words (producer / region / appellation / country, plus the raw label as a fallback) that a
// reveal asset must reference to be about one of the keyed answer wines. norm()'d, ≥3-char tokens only.
function answerWineAnchorWords(
  wines: ServedQuestionPayload["wines"],
): Set<string> {
  const words = new Set<string>();
  for (const w of wines || []) {
    for (const field of [
      w.producer,
      w.region,
      w.appellation,
      w.country,
      w.fullText,
    ]) {
      for (const tok of norm(field || "").split(/\s+/))
        if (tok.length >= 3) words.add(tok);
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
  wines: ServedQuestionPayload["wines"],
): ServedMediaAsset[] {
  const anchors = answerWineAnchorWords(wines);
  if (anchors.size === 0) return media;
  return media.filter((asset) => {
    const text = norm(
      [
        asset.tag,
        asset.caption,
        asset.alt,
        asset.title,
        asset.label,
        asset.producer,
        asset.region,
        asset.appellation,
      ]
        .filter(Boolean)
        .join(" "),
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
  const renderedCount = new Set(
    wines.map((w, i) => (w?.slot == null ? `idx${i}` : String(w.slot))),
  ).size;
  const expected =
    parseStemWineCount(questionText) ?? parseMultiplierWineCount(questionText);
  if (expected == null || renderedCount === 0 || renderedCount === expected)
    return [];
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
  priorHash?: string | null,
): ServedIntegrityResult {
  const questionText = served.questionText || "";
  const stemHash = computeServedStemHash(questionText);

  // Check 1 — the stem/sub-parts/mark table must be byte-identical to when the question was first served.
  if (priorHash != null && priorHash !== "" && stemHash !== priorHash) {
    throw new ServedQuestionIntegrityError(
      phase,
      "stem-hash",
      `served stem/sub-parts/mark-table changed since the question was first served (hash ${priorHash} → ${stemHash}); a surface re-derived the stem instead of reading the stored record`,
    );
  }

  // Check 2 — the rendered flight must contain exactly the wines the question keys.
  const wines = served.wines || [];
  // The flight size is the number of DISTINCT SLOTS, not the array length: a stored wines array can
  // carry several candidate records per slot (one pool row holds 15 records across 5 slots), while a
  // rendered flight shows one wine per slot.
  const renderedCount = new Set(
    wines.map((w, i) => (w?.slot == null ? `idx${i}` : String(w.slot))),
  ).size;
  const expected =
    parseStemWineCount(questionText) ?? parseMultiplierWineCount(questionText);
  if (expected != null && renderedCount !== expected) {
    throw new ServedQuestionIntegrityError(
      phase,
      "wine-count",
      `the question declares ${expected} wine${expected === 1 ? "" : "s"} but the served flight rendered ${
        renderedCount
      } — a flight must render every keyed wine, never a truncated subset`,
    );
  }

  // Check 3 — at reveal, any attached media must be about one of the answer wines (drop the stragglers).
  const media =
    phase === "reveal"
      ? filterRevealMedia(served.media || [], wines)
      : served.media || [];

  return { phase, stemHash, wineCount: renderedCount, media };
}

// ---------------------------------------------------------------------------------------------------
// ANSWER-KEY CLAIM VALIDATION — the reveal/marking PROSE must not assert wine facts/roles that the
// keyed record contradicts (recurring fault cluster, cross-paper: fb_188, fb_175, fb_135).
//
// This is DISTINCT from the served-question-integrity guard above (assertServedQuestionIntegrity),
// which checks that the surfaces RENDER the same stored payload — whether the bytes match. This one
// validates the CLAIMS the feedback prose makes about the wines, against the answer key that keys
// them. Three claim classes recur:
//
//   Rule 1 — ROLE. The prose calls a wine a 'banker' or a 'curveball'; that label must equal the
//     wine record's stored `role` (fb_188: an Alsace Sylvaner was called a banker at reveal while it
//     is keyed a curveball — Sylvaner is not one of Alsace's noble grapes, so the label is wrong).
//     When a wine carries no stored `role`, the derived isBanker() classification stands in.
//
//   Rule 2 — PRODUCTION METHOD. An absolute production-method assertion about a NAMED category
//     ('Prosecco is not traditional method', 'X is always tank method') must resolve against the
//     methodFacts lookup. An absolute quantifier ('never' / 'always' / 'not' / 'only' / 'the only')
//     applied to a category whose methodFacts entry is MIXED is rejected (fb_175: a large, high-tier
//     slice of Prosecco is traditional method, so "Prosecco is not traditional method" is false).
//
//   Rule 3 — QUALITY HIERARCHY. When the prose explains a quality hierarchy it must cite the
//     `classificationModel` of each keyed region. A rationale that reduces every keyed ladder to bare
//     GEOGRAPHY while a keyed region carries a producer / vineyard / ageing / hybrid model (Bordeaux
//     is producer-classified, Rioja ages by Crianza/Reserva/Gran Reserva, Chianti Classico Gran
//     Selezione is hybrid) is rejected (fb_135).
//
// Callers producing reveal/marking feedback pass the prose + the keyed flight; on any hard violation
// they STORE the failure reason and regenerate the feedback once before serving it (regenerateOnce).
// ---------------------------------------------------------------------------------------------------

// methodFacts — the production-method truth for a named sparkling/wine category. `mixed: true` means
// the category is genuinely made by more than one method in commerce (so an ABSOLUTE quantifier about
// its method is false). DATA-ONLY: extend the table, never the rule. Keys are norm()'d category names.
export const methodFacts: Record<
  string,
  { methods: string[]; mixed: boolean }
> = {
  // Prosecco is overwhelmingly tank (Charmat) method, but a real, quality-defining slice is
  // traditional method — the col fondo / metodo classico bottlings and the top Valdobbiadene
  // houses (fb_175). So an absolute "Prosecco is not traditional method" is false.
  prosecco: { methods: ["tank", "traditional"], mixed: true },
  // Lambrusco spans tank (Charmat), ancestral (col fondo) and some traditional-method bottlings.
  lambrusco: { methods: ["tank", "ancestral", "traditional"], mixed: true },
  // Single-method categories — an absolute quantifier about these is TRUE, so the rule stands down.
  champagne: { methods: ["traditional"], mixed: false },
  cava: { methods: ["traditional"], mixed: false },
  asti: { methods: ["tank"], mixed: false },
  "moscato d'asti": { methods: ["tank"], mixed: false },
};

// Method terms a claim can name. norm()'d.
const METHOD_TERM_RE =
  /\b(?:traditional|tank|charmat|ancestral|classical|classic|methode traditionnelle|metodo classico)\b/;
// Absolute quantifiers that make a category-wide method claim (the ones the exam prose over-reaches on).
const ABSOLUTE_QUANTIFIER_RE =
  /\b(?:never|always|not|only|the only|no |cannot|can not|isn't|is not)\b/;

// REGION_CLASSIFICATION_MODELS — how each keyed region's appellation ladder is legally built. DATA-ONLY.
// Keys are substrings tested against a wine's norm()'d region + country + label. Ordered most-specific
// first so "chianti classico gran selezione" resolves as hybrid before the bare "chianti" geographic.
const REGION_CLASSIFICATION_MODELS: {
  re: RegExp;
  model: ClassificationModel;
}[] = [
  { re: /chianti classico gran selezione|gran selezione/, model: "hybrid" },
  { re: /chianti classico/, model: "hybrid" },
  { re: /\bchianti\b/, model: "hybrid" },
  { re: /\brioja\b/, model: "ageing" },
  { re: /ribera del duero/, model: "ageing" },
  {
    re: /\bbordeaux\b|medoc|pauillac|margaux|saint-?julien|saint-?estephe|saint-?emilion|\bpomerol\b|pessac|\bgraves\b|\bsauternes\b/,
    model: "producer",
  },
  {
    re: /\bburgundy\b|bourgogne|cote de nuits|cote de beaune|gevrey|chambolle|\bvosne\b|puligny|chassagne|meursault|\bchablis\b/,
    model: "vineyard",
  },
];

/** Resolve a keyed wine's classification model: its stored field first, else the region-name lookup. */
export function regionClassificationModel(
  w: AuditWine,
): ClassificationModel | null {
  if (w.classificationModel) return w.classificationModel;
  const hay = norm(`${w.region || ""} ${w.country || ""} ${w.fullText || ""}`);
  return (
    REGION_CLASSIFICATION_MODELS.find((m) => m.re.test(hay))?.model ?? null
  );
}

/**
 * The role a wine record keys, and whether that came from the ANSWER KEY or from a heuristic.
 *
 * This distinction decides Rule 1's severity, and it matters more than it looks. Nothing in the schema
 * stores `role` today, so every live call lands on `isBanker()` — a region×variety regex table built to
 * COUNT curveballs for flight composition, documented as failing soft to curveball, and calibrated on
 * that job. Measured against the 95 stored debriefs, its single surviving disagreement with the prose
 * (attempt 426: Condrieu Viognier, which the prose called "a genuine curveball" and the table calls a
 * banker) was the TABLE being wrong, not the examiner.
 *
 * A heuristic that loses that argument is not a fit basis for rewriting examiner prose, so a derived
 * role yields a SOFT violation: recorded and measurable, but it does not trigger a correction pass. A
 * genuinely keyed `role` is authoritative and yields a HARD one — so the day roles are stored, fb_188
 * starts being enforced with no further change here.
 */
function keyedRole(w: AuditWine): {
  role: "banker" | "curveball";
  fromAnswerKey: boolean;
} {
  if (w.role) return { role: w.role, fromAnswerKey: true };
  return { role: isBanker(w) ? "banker" : "curveball", fromAnswerKey: false };
}

// Split prose into clauses on sentence + strong-clause boundaries, so a role/method claim is judged
// against the wine named IN THE SAME clause rather than anywhere in the whole feedback block.
function splitProseClauses(text: string): string[] {
  return (text || "")
    .split(/[.?!;\n]+|,\s+(?=(?:but|whereas|while|although|however)\b)/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ── Rule 1 gates. Measured over the 95 real stored debriefs, the role rule without these fired on 23
// of them (24%) and every single fire was a FALSE POSITIVE. That is not a cosmetic problem: each fire
// bills a debrief-sized completion AND instructs the corrector to "fix" prose that was already right,
// so an unguarded Rule 1 actively corrupts good debriefs. The three gates below are each derived from
// a real false-positive class in that measurement; a comment names the attempt it came from.

// Mermaid/markup, not prose. The debrief embeds study diagrams whose nodes read
// `F --> C["CURVEBALL: minor grape such as Clairette or Bourboulenc"]` — a generic tree LEAF, matched
// off the variety names it happens to list (attempts 234, 268).
const CLAUSE_IS_MARKUP_RE = /-->|\[\"|\|\s*\w+\s*\||^\s*[A-Z]\s*\[/;

// Hypothetical / advisory / counterfactual framing: the clause is about what a curveball COULD have
// been, or what the candidate should watch for — not an assertion that a keyed wine IS one.
// "**Plausible curveball**: Mâconnais or cool New World Chardonnay" (attempt 80);
// "**Plausible curveballs:** Wine 2 could be a structured Tavel" (attempt 156 — note this one names an
// explicit slot, which is why requiring "wine N" is not on its own sufficient);
// "That constraint should actively surface … an indigenous curveball" (attempt 129).
// Kept deliberately narrow. An earlier draft also excluded "classic", "typical", "often" and a bare
// "or", which suppressed genuine assertions — "The Alsace Sylvaner is a banker: a classic benchmark
// expression" is exactly the fb_188 defect, and it contains "classic". Only words that make the clause
// COUNTERFACTUAL belong here.
const CLAUSE_IS_HYPOTHETICAL_RE =
  /\b(?:plausible|possible|potential|could|might|may|would|should|if|unless|expect|anticipate|watch for|look for|consider|alternative|scenario|trap)\b/;

// The debrief attributing a role call to the CANDIDATE. "Identified Carménère as a plausible South
// American curveball — good instinct" (attempt 245); "CURVEBALL = the repeated-Chardonnay trap, which
// you walked past" (attempt 178). The rule adjudicates what the DEBRIEF asserts, and a debrief
// correctly reporting the candidate's own wrong label must not be rewritten into agreement with it.
const CLAUSE_ATTRIBUTES_TO_CANDIDATE_RE =
  /\b(?:you|your|yours|candidate'?s?|identified|generated|called|named|treated|spotted|flagged|walked|instinct|credit)\b/;

// An ASSERTION that some wine holds the role, rather than a passing mention of the word. Requires a
// copula reaching the role noun: "wine 2 is the banker", "the Sylvaner was the curveball", "wines 1
// and 2 are bankers". A bare noun-phrase mention ("a curveball Sicilian", "the examiner's deliberate
// curveball") is not a claim about a keyed wine (attempts 41, 79).
const CLAUSE_ASSERTS_ROLE_RE =
  /\b(?:is|was|are|were|remains?|reads?\s+as|serves?\s+as|functions?\s+as|acts?\s+as)\b[^,;]{0,40}?\b(?:banker|curve\s*-?\s*ball)s?\b/;

/**
 * Can this clause be adjudicated as a role CLAIM about a keyed wine at all? Deliberately conservative:
 * on this rule a false positive rewrites correct prose, so anything ambiguous is left alone. Measured
 * effect of these gates on the 95 stored debriefs: 23 fires → 0.
 */
function clauseAssertsRole(clause: string, clauseNorm: string): boolean {
  if (CLAUSE_IS_MARKUP_RE.test(clause)) return false;
  if (CLAUSE_IS_HYPOTHETICAL_RE.test(clauseNorm)) return false;
  if (CLAUSE_ATTRIBUTES_TO_CANDIDATE_RE.test(clauseNorm)) return false;
  return CLAUSE_ASSERTS_ROLE_RE.test(clauseNorm);
}

// The explicit "wine N" slots a clause names (norm()'d clause). Empty when the clause names none.
function clauseSlots(clauseNorm: string): number[] {
  return [...clauseNorm.matchAll(/\bwines?\s+(\d+)\b/g)].map((m) =>
    Number(m[1]),
  );
}

// Does this clause reference this wine? An explicit "wine N" slot is AUTHORITATIVE — when a clause
// names any slot, only those slots match (so "wine 1 is the banker (Alsace Pinot Gris)" does not also
// pick up wine 2, another Alsace wine, off the shared region name). Absent an explicit slot, the wine
// is matched by its region or any variety token appearing in the clause.
function clauseReferencesWine(clauseNorm: string, w: AuditWine): boolean {
  const slots = clauseSlots(clauseNorm);
  if (slots.length > 0) return slots.includes(w.slot);
  const region = norm(w.region || "");
  if (region && region.length >= 4 && clauseNorm.includes(region)) return true;
  for (const variety of w.varieties || []) {
    const v = canonVariety(variety);
    if (v && v.length >= 4 && clauseNorm.includes(v)) return true;
    const raw = norm(variety);
    if (raw && raw.length >= 4 && clauseNorm.includes(raw)) return true;
  }
  return false;
}

// Which model families does the prose CITE? Terms are checked on the whole (norm()'d) feedback block.
function citedClassificationModels(
  feedbackNorm: string,
): Set<ClassificationModel> {
  const cited = new Set<ClassificationModel>();
  // Geography in the APPELLATION-LADDER sense only. A bare /\bgeograph/ also matched "geography
  // (domestic/export)" — a sentence about commercial markets — which is how attempt 236 was flagged for
  // explaining a hierarchy geographically when it never discussed a hierarchy at all.
  if (
    /geographic(?:al)?\s+(?:delimitation|boundar|specificity|hierarch|ladder|precision)|\bdelimit|increasingly specific|narrower (?:appellation|geograph)|proximity|geographical boundar/.test(
      feedbackNorm,
    )
  )
    cited.add("geographic");
  if (
    /producer|chateau|\bestate\b|classified growth|cru classe|classement|1855|house classification/.test(
      feedbackNorm,
    )
  )
    cited.add("producer");
  if (
    /single vineyard|vineyard classification|\bclimat\b|grand cru|premier cru|\bcru\b/.test(
      feedbackNorm,
    )
  )
    cited.add("vineyard");
  if (
    /age?ing|\baged\b|crianza|reserva|gran reserva|riserva|barrel age|oak age|time in (?:barrel|cask|oak)|months? in/.test(
      feedbackNorm,
    )
  )
    cited.add("ageing");
  return cited;
}

export interface AnswerKeyClaimResult {
  ok: boolean;
  violations: Violation[];
  /** The joined hard-failure detail(s) to STORE so the feedback can be regenerated once before serving. */
  failureReason: string | null;
}

/**
 * The keyed ground-truth shape the flight builder consumes — structurally satisfied by a derived
 * `StemKey["ground"]` entry. Declared here rather than imported so this module keeps no dependency on
 * the key builder (which reads files at import time and would drag I/O into every validator test).
 */
export interface KeyedGroundWine {
  slot: number;
  varieties?: string[];
  is_blend?: boolean;
  region?: string;
  country?: string;
  style?: string;
  style_category?: string;
  /**
   * Not written by any generator today. Threaded anyway because it is what promotes Rule 1 from a
   * review flag to an enforced correction (see keyedRole) — the day the key stores a role, enforcement
   * follows without another change here.
   */
  role?: "banker" | "curveball";
  classificationModel?: ClassificationModel;
}

/**
 * Build the flight validateAnswerKeyClaims judges against, from a derived answer key's ground truth
 * zipped with the revealed wine labels. Same "zip label onto ground_truth by slot" merge as
 * question-audit.ts, minus the DB read — the debrief path already holds both halves in memory.
 *
 * Degrades on purpose rather than throwing:
 *  - No ground truth (the key could not resolve the flight) → label-only wines, so Rule 2 (which is
 *    wine-independent) and any explicit "wine N" role claim still get checked.
 *  - A slot in one half and not the other → carried through on whichever half has it, because a
 *    partial flight still catches claims about the wines it does know.
 */
/**
 * Zip what the ENRICHMENT step learned onto the wines the answer key resolved.
 *
 * Two different things know two different halves of a wine. The answer key resolves it into one
 * dominant variety plus region/country. `generated_questions.wine_profiles` is the enrichment: a
 * web-cited read of the wine in the glass, carrying the resolved colour and the FULL grape list.
 * Rules that only ever saw the key were therefore blind to facts the row already contained.
 *
 * That is not hypothetical. Reviewer attempt #475 rejected a "different single grape varieties" stem
 * because wine 2 was a three-grape blend — and the row's own wine_profiles had said
 * ["Treixadura","Loureiro","Albariño"] with confidence "high" since the day it was generated. R5 was
 * asking `w.is_blend`, which comes from the key, and the key had reduced it to its dominant grape.
 * The evidence to reject that question was sitting one column away, unread.
 *
 * Deliberately ADDITIVE, never overriding:
 *  - colour is taken from the profile, which judged the wine directly (a red grape bottled white —
 *    "Touriga Nacional Branco" — is the case varieties cannot settle).
 *  - is_blend becomes true if EITHER half says so. The key naming one grape is not evidence of one
 *    grape; it is evidence of a dominant grape.
 *  - `varieties` is filled ONLY when the key left it empty. Overwriting it would change what R1/R2/R3
 *    compare for distinctness — a much wider change than this, and not one the profile is authoritative
 *    for. The full count travels separately in `blend_variety_count` so R5 can grade on it.
 */
export function applyWineProfiles(wines: AuditWine[], wineProfiles: unknown): AuditWine[] {
  const parsed = (typeof wineProfiles === "string" ? JSON.parse(wineProfiles) : wineProfiles) as Record<
    string,
    { colour?: unknown; grape_varieties?: unknown } | undefined
  > | null;
  if (!parsed || typeof parsed !== "object") return wines;

  return wines.map((w) => {
    const p = parsed[String(w.slot)];
    if (!p) return w;
    const out: AuditWine = { ...w };

    const c = p.colour;
    if (c === "white" || c === "red" || c === "rose" || c === "orange") out.colour = c;

    const grapes = Array.isArray(p.grape_varieties)
      ? p.grape_varieties.filter((g): g is string => typeof g === "string" && g.trim().length > 0)
      : [];
    if (grapes.length) {
      out.blend_varieties = grapes;
      if (grapes.length >= 2) out.is_blend = true;
      if (!out.varieties?.length) out.varieties = grapes;
    }
    return out;
  });
}

export function answerKeyFlight(
  ground: readonly KeyedGroundWine[] | null | undefined,
  wines: readonly { slot: number; fullText?: string }[] | null | undefined,
): AuditWine[] {
  const labelBySlot = new Map<number, string>();
  for (const w of wines || [])
    if (w?.fullText) labelBySlot.set(w.slot, w.fullText);

  const bySlot = new Map<number, AuditWine>();
  for (const g of ground || []) {
    if (!g || typeof g.slot !== "number") continue;
    bySlot.set(g.slot, {
      slot: g.slot,
      varieties: g.varieties || [],
      region: g.region || "",
      country: g.country,
      is_blend: g.is_blend,
      style: g.style,
      style_category: g.style_category,
      role: g.role,
      classificationModel: g.classificationModel,
      fullText: labelBySlot.get(g.slot),
    });
  }
  // Slots the key missed entirely: keep them as label-only wines.
  for (const [slot, fullText] of labelBySlot)
    if (!bySlot.has(slot))
      bySlot.set(slot, { slot, varieties: [], region: "", fullText });

  return [...bySlot.values()].sort((a, b) => a.slot - b.slot);
}

/**
 * Validate the CLAIMS a reveal/marking feedback block makes about a keyed flight (fb_188/fb_175/fb_135).
 * Distinct from assertServedQuestionIntegrity, which validates that surfaces render one stored payload;
 * this validates the prose's assertions against the answer key. Returns hard violations for Rule 1
 * (role label ≠ stored role), Rule 2 (absolute method claim on a mixed category) and Rule 3 (a quality
 * hierarchy reduced to geography while a keyed region has a producer/vineyard/ageing/hybrid model).
 */
export function validateAnswerKeyClaims(
  feedback: string,
  flight: AuditWine[],
): AnswerKeyClaimResult {
  const wines = flight || [];
  const prose = feedback || "";
  const feedbackNorm = norm(prose);
  const v: Violation[] = [];

  // ── Rule 1 — ROLE. A 'banker'/'curveball' label on a wine must equal the wine's keyed role. ──────
  for (const clause of splitProseClauses(prose)) {
    const clauseNorm = norm(clause);
    const saysBanker = /\bbankers?\b/.test(clauseNorm);
    const saysCurveball = /\bcurve\s*-?\s*balls?\b/.test(clauseNorm);
    // A clause that discusses both roles (e.g. "a banker against a curveball") is descriptive, not a
    // single mislabel — skip it, we can only adjudicate a clause that asserts ONE role of ONE wine.
    if (saysBanker === saysCurveball) continue;
    // ...and it must be an ASSERTION about a keyed wine, not a hypothetical, a diagram node, or the
    // debrief reporting the candidate's own call. See clauseAssertsRole: without this the rule fired on
    // 24% of real debriefs, all false, each one rewriting prose that was already correct.
    if (!clauseAssertsRole(clause, clauseNorm)) continue;
    const asserted: "banker" | "curveball" = saysBanker
      ? "banker"
      : "curveball";
    for (const w of wines) {
      if (!clauseReferencesWine(clauseNorm, w)) continue;
      const { role: keyed, fromAnswerKey } = keyedRole(w);
      if (keyed !== asserted) {
        v.push({
          rule: "answer-key-claim-role",
          // HARD only against a genuinely keyed role; SOFT when it is the isBanker() heuristic's opinion.
          // See keyedRole — on the measured corpus the heuristic, not the prose, was the wrong one.
          severity: fromAnswerKey ? "hard" : "soft",
          detail: fromAnswerKey
            ? `feedback calls ${wineLabel(w)} a ${asserted}, but the answer key keys it as a ${keyed}: "${clause.trim()}". The role stated in the prose must match the keyed role.`
            : `feedback calls ${wineLabel(w)} a ${asserted}, but the derived flight-composition classifier reads it as a ${keyed}: "${clause.trim()}". No role is stored for this wine, so this is a flag for review, not a correction — the classifier is the weaker of the two.`,
        });
      }
    }
  }

  // ── Rule 2 — PRODUCTION METHOD. An absolute quantifier on a MIXED-method category is false. ──────
  for (const clause of splitProseClauses(prose)) {
    const clauseNorm = norm(clause);
    for (const [category, facts] of Object.entries(methodFacts)) {
      if (!facts.mixed) continue; // absolute claims about a single-method category are fine
      if (!clauseNorm.includes(category)) continue;
      if (
        ABSOLUTE_QUANTIFIER_RE.test(clauseNorm) &&
        METHOD_TERM_RE.test(clauseNorm)
      ) {
        v.push({
          rule: "answer-key-claim-method",
          severity: "hard",
          detail: `feedback makes an absolute production-method claim about ${category} ("${clause.trim()}"), but ${category} is made by more than one method (${facts.methods.join(
            ", ",
          )}); an absolute quantifier ("never"/"always"/"not"/"only") is false for a mixed-method category.`,
        });
        break; // one verdict per clause is enough
      }
    }
  }

  // ── Rule 3 — QUALITY HIERARCHY. A hierarchy rationale must cite each keyed region's model. ───────
  // A bare /\btiers?\b/ is not a hierarchy explanation: "Quality must name the official tier" is an
  // instruction about naming one, and it is what made attempt 236 a false positive. Require prose that
  // is actually ABOUT the ladder.
  const explainsHierarchy =
    /hierarch|quality ladder|\bladder\b|ascend|classification (?:model|system)|appellation tiers?|(?:quality|appellation|cru) tiers?|tiers? of (?:quality|appellation)/.test(
      feedbackNorm,
    );
  if (explainsHierarchy && wines.length > 0) {
    const cited = citedClassificationModels(feedbackNorm);
    // The fault: the prose cites GEOGRAPHY (and nothing else), yet a keyed region's ladder is built on
    // a different model. Reducing a producer/ageing/vineyard/hybrid ladder to bare geography is wrong.
    const onlyGeography = cited.has("geographic") && cited.size === 1;
    const nonGeoModels = new Map<string, ClassificationModel>();
    for (const w of wines) {
      const model = regionClassificationModel(w);
      if (model && model !== "geographic")
        nonGeoModels.set(w.region || wineLabel(w), model);
    }
    if (onlyGeography && nonGeoModels.size > 0) {
      const offenders = [...nonGeoModels.entries()]
        .map(([r, m]) => `${r} (${m})`)
        .join("; ");
      v.push({
        rule: "answer-key-claim-hierarchy",
        severity: "hard",
        detail: `feedback explains the quality hierarchy in purely geographic terms, but a keyed region's ladder is not geographic: ${offenders}. Cite each region's real classification model (producer, vineyard, ageing or hybrid), not geography alone.`,
      });
    }
  }

  const hard = v.filter((x) => x.severity === "hard");
  return {
    ok: hard.length === 0,
    violations: v,
    failureReason: hard.length ? hard.map((x) => x.detail).join(" | ") : null,
  };
}

/**
 * Regenerate-once wrapper for reveal/marking feedback (the "regenerate once before serving" contract).
 * Validates `feedback`; if it passes, serves it unchanged and spends nothing. On a hard claim violation
 * it calls `regenerate(reason)` EXACTLY once and serves that redraft, re-validated so the returned
 * `failureReason` always describes what actually shipped rather than what the first draft said.
 *
 * `regenerate` is async because the reason is its INPUT — a corrector cannot be pre-awaited, since what
 * it must fix is only known once validation has run.
 *
 * Two invariants the caller depends on:
 *  - It NEVER throws. A corrector that fails (model error, timeout) falls back to the original prose
 *    with `correctionFailed: true`. A debrief the candidate is waiting on is worth more than one wrong
 *    banker label, and the stored reason keeps the defect visible either way.
 *  - It regenerates ONCE. No retry loop: a second failure means the corrector cannot fix this class of
 *    claim, and looping would bill a full grading pass per attempt to find that out.
 */
export interface RegeneratedFeedback {
  feedback: string;
  regenerated: boolean;
  /** Null once the served prose is clean; otherwise the hard-violation detail(s) to STORE. */
  failureReason: string | null;
  /** The reason the FIRST draft failed — retained even when the redraft is clean, for measurement. */
  originalFailureReason: string | null;
  /** True when `regenerate` threw and the original prose was served as the fallback. */
  correctionFailed: boolean;
  /** The FIRST draft's violations, so a caller can record WHICH rules fired, not just the prose reason. */
  violations: Violation[];
}

export async function regenerateFeedbackOnce(
  feedback: string,
  flight: AuditWine[],
  regenerate: (reason: string, violations: Violation[]) => Promise<string>,
): Promise<RegeneratedFeedback> {
  const first = validateAnswerKeyClaims(feedback, flight);
  if (first.ok) {
    return {
      feedback,
      regenerated: false,
      failureReason: null,
      originalFailureReason: null,
      correctionFailed: false,
      violations: first.violations,
    };
  }
  const reason = first.failureReason || "answer-key claim violation";
  let redraft: string;
  try {
    redraft = await regenerate(reason, first.violations);
  } catch {
    return {
      feedback,
      regenerated: false,
      failureReason: reason,
      originalFailureReason: reason,
      correctionFailed: true,
      violations: first.violations,
    };
  }
  // A corrector that returns nothing usable is a failed correction, not a valid empty debrief.
  if (!redraft || !redraft.trim()) {
    return {
      feedback,
      regenerated: false,
      failureReason: reason,
      originalFailureReason: reason,
      correctionFailed: true,
      violations: first.violations,
    };
  }
  const second = validateAnswerKeyClaims(redraft, flight);
  return {
    feedback: redraft,
    regenerated: true,
    failureReason: second.ok ? null : second.failureReason,
    originalFailureReason: reason,
    correctionFailed: false,
    violations: first.violations,
  };
}

// ---------------------------------------------------------------------------------------------------
// MODEL-ANSWER COMPLETENESS — a question is not servable without a keyed model answer that COVERS every
// lettered sub-part of its stem.
//
// Three validated signals converge on one fault (fb_427, fb_368, fb_362): generated questions reach a
// candidate — and the reveal/debrief screen — with no model answer attached, so the reveal renders
// "No model answer available for this question yet." The grader has nothing to mark against and the
// post-mortem debrief is empty. fb_427 is the acute case (a Paper 1 Condrieu vs Eden Valley Viognier
// flight served with no answer); fb_368 and fb_362 are the same gap endorsed more mildly ("would be
// nice to have model answers").
//
// This rule is the mechanical gate the analysis loop asked for. It fails a question whose payload
// carries NO model answer, and — because a half-written answer is as ungradeable as a missing one on
// the parts it skips — a question whose model answer does not carry a non-empty prose block for EVERY
// lettered sub-part (a, b, c …) named in the stem. Each sub-part's block must reach
// MODEL_ANSWER_SUBPART_MIN_CHARS characters of prose; anything thinner is treated as "not written".
// The rule reads the payload only — it never touches question content — so it is safe to run on the
// serve path (question-engine.ts consumes it there) and in the corpus audit.

/** Minimum prose length, in characters, for a lettered sub-part's model-answer block to count as written. */
export const MODEL_ANSWER_SUBPART_MIN_CHARS = 150;

// The lettered sub-question labels a stem actually poses — "a)", "b)", "(c)" … — in first-seen order,
// de-duplicated. Matched at a token boundary so the "1" in "Wines 1 and 2" or a mid-word letter can
// never read as a sub-part. This is the SAME label shape extractStem() keys on to find where a stem
// ends, so the two agree on what a sub-part is.
export function stemSubpartLetters(questionText: string): string[] {
  const text = questionText || "";
  const re = /(?:^|[\s([])([a-z])\)/gi;
  const letters: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const letter = m[1].toLowerCase();
    if (!letters.includes(letter)) letters.push(letter);
  }
  return letters;
}

// Slice a model answer into the prose block that answers each lettered sub-part. A block begins at a
// lettered label at the start of a line — tolerant of the markdown the generator emits around it
// (blockquote ">", heading "###", list "-", and bold "**a)**") — and runs to the next such label or the
// end of the text. A letter that appears more than once (e.g. across the two rendered SPLIT SECTIONS)
// keeps its LONGEST block, so a stub in one section cannot mask a full answer in the other.
export function modelAnswerSubpartBlocks(modelAnswer: string): Map<string, string> {
  const text = modelAnswer || "";
  const re = /(?:^|\n)[ \t]*(?:>[ \t]*)?(?:#{1,6}[ \t]*)?(?:[-*+][ \t]+)?\*{0,2}\(?([a-z])[).][ \t*:]/gi;
  const markers: { letter: string; bodyStart: number; labelStart: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    markers.push({ letter: m[1].toLowerCase(), bodyStart: re.lastIndex, labelStart: m.index });
  }
  const blocks = new Map<string, string>();
  for (let i = 0; i < markers.length; i++) {
    const stop = i + 1 < markers.length ? markers[i + 1].labelStart : text.length;
    const body = text.slice(markers[i].bodyStart, stop).trim();
    const prev = blocks.get(markers[i].letter);
    if (prev === undefined || body.length > prev.length) blocks.set(markers[i].letter, body);
  }
  return blocks;
}

/**
 * validateModelAnswerPresent — a HARD gate: a question with no model answer, or a model answer that
 * fails to cover every lettered sub-part of its stem with >= MODEL_ANSWER_SUBPART_MIN_CHARS characters
 * of prose, is not servable. Reads q.modelAnswer + q.questionText only.
 *
 * When the stem poses no lettered sub-parts (a bare single-ask), the whole answer is the one block and
 * it must itself clear the character floor — a one-line stub is still ungradeable.
 */
export function validateModelAnswerPresent(q: QuestionForAudit): Violation[] {
  const answer = (q.modelAnswer || "").trim();
  if (!answer) {
    return [
      {
        rule: "model-answer-missing",
        severity: "hard",
        detail:
          "no model answer is attached — the grader has nothing to mark against and the debrief is empty, so this question must not be served (fb_427). Write and attach a model answer before it can reach a candidate.",
      },
    ];
  }

  const letters = stemSubpartLetters(q.questionText || "");
  if (letters.length === 0) {
    if (answer.length < MODEL_ANSWER_SUBPART_MIN_CHARS) {
      return [
        {
          rule: "model-answer-incomplete",
          severity: "hard",
          detail: `model answer is only ${answer.length} characters — below the ${MODEL_ANSWER_SUBPART_MIN_CHARS}-character floor for a gradeable answer. It reads as a stub, not a model answer.`,
        },
      ];
    }
    return [];
  }

  const blocks = modelAnswerSubpartBlocks(answer);
  const missing = letters.filter((l) => (blocks.get(l)?.length ?? 0) < MODEL_ANSWER_SUBPART_MIN_CHARS);
  if (missing.length > 0) {
    return [
      {
        rule: "model-answer-incomplete",
        severity: "hard",
        detail: `model answer does not cover every lettered sub-part: part${
          missing.length > 1 ? "s" : ""
        } ${missing.map((l) => `"${l})"`).join(", ")} ${
          missing.length > 1 ? "are" : "is"
        } missing or below ${MODEL_ANSWER_SUBPART_MIN_CHARS} characters of prose. A candidate served this question could not be graded on ${
          missing.length > 1 ? "those parts" : "that part"
        }.`,
      },
    ];
  }
  return [];
}

export function validateQuestion(
  q: QuestionForAudit,
  opts?: { paperScope?: boolean },
): {
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
  // Stem-shape rules: skipped when the stem is a verbatim past-paper question. See the
  // `stemIsAuthoritative` field on QuestionForAudit for the measured false-positive rates and why
  // these are unsatisfiable rather than merely wrong on a fixed stem.
  const stemFixed = q.stemIsAuthoritative === true;
  if (!stemFixed) {
    violations.push(...stemPreannouncesDiscriminator(q.questionText));
    violations.push(...idMarkAllocationViolations(q));
    violations.push(...flightWineCountViolations(q));
  }
  // POOL-ADMISSION ASYMMETRY, the same shape as R-COLOUR's `blockIndeterminate`.
  //
  // flight-composition is emitted HARD, and the generation path (question-engine.ts) consumes it that
  // way — there, refusing a curveball-heavy flight costs one redraft and steers the generator toward a
  // recognisable anchor, which is cheap and is the whole point of the rule.
  //
  // Here it is ADVISORY, because this entry point judges questions that already exist. Even with the
  // banker detector repaired, the rule still rejects ~5% of real IMW flights: the Institute really does
  // set 2023 P1 Q3 (four South African whites, no classic anchor anywhere) and 2016 P2 Q2 (three
  // cool-climate Pinots). Retiring a banked question on a stylistic preference the exam itself breaks
  // one time in twenty is the wrong trade — 235 of the bank's violations were this rule. Making the
  // wine choice better at generation is right; deleting the question afterwards is not.
  violations.push(
    ...flightCompositionViolations(q.wines).map((v) => ({
      ...v,
      severity: "soft" as const,
    })),
  );
  // R-OW-ANCHOR stays HARD in every path (unlike flight-composition, which is advisory here). An
  // all-New-World same-variety flight of a classic variety has NO precedent in the 2011–2026 corpus
  // (EK-0169, STRONG SIGNAL), so — unlike a curveball-heavy flight the Institute occasionally sets —
  // there are no real-exam false positives to trade against. It is WINE-side (the fix is "add an Old
  // World anchor wine"), so it runs even when the stem is a verbatim past-paper import.
  violations.push(...validateOldWorldAnchor(q));
  // Rarity budget, exam-precedent blocklist and fortified category integrity are all WINE-side (they
  // turn on the choice/keying of the wines, not the stem's wording), so they run even on a fixed stem.
  violations.push(...validateRarityBudget(q));
  // The banker arm is a WINE choice ("pick a curveball instead") and survives a fixed stem; the two
  // `single-wine-flight` arms are stem edits, which this file already says of the ID-ask half.
  violations.push(
    ...validateSingleWineFlight(q).filter(
      (v) => !stemFixed || v.rule === "single-wine-flight-banker",
    ),
  );
  violations.push(...validateMarkBudget(q));
  if (q.modelAnswer && q.modelAnswer.trim().length > 0) {
    violations.push(
      ...(applyAnswerContentRules({
        questionText: q.questionText,
        answerText: q.modelAnswer,
        wines: q.wines,
      }) as Violation[]),
    );
  }
  violations.push(...crossCheckStemFacts(q));
  violations.push(...contrastIntegrityViolations(q));
  if (!stemFixed) violations.push(...partTaskRepertoireViolations(q));
  violations.push(...validatePaperStyleMix(q.paper, q.wines));
  // R-COLOUR (Right Paper Check) runs here by DEFAULT, and that default is the whole point.
  //
  // It used to be excluded, on the grounds that some unit-test fixtures are keyed only for the rule
  // under test and are not colour-coherent. The reasoning was right about the fixtures and wrong about
  // the conclusion: leaving it out made paper-scope compliance something each caller of
  // validateQuestion had to remember, and five of the six forgot. auditAndQuarantineQuestion() and
  // scripts/audit-questions.mjs both come through here, so for as long as it was excluded NO banked
  // question was ever quarantined for serving a red wine on Paper 1 — which is exactly what happened,
  // 35 times, 23 of them still live.
  //
  // So the flag inverts the burden: production callers get the contract by omission and only a test
  // that KNOWS its fixture is colour-incoherent opts out. tests/audit-paper-scope-default.test.ts pins
  // that no file under src/ or scripts/ passes `paperScope: false`.
  if (opts?.paperScope !== false) {
    violations.push(...validatePaperColour(q.paper, q.wines, q.questionText));
  }
  return {
    ok: !violations.some((x) => x.severity === "hard"),
    violations,
    scoringModel: stemSniperScoringModel(
      q.questionText,
      (q.wines || []).length,
    ),
  };
}
