# `question-spec.ts` — preserved reference (NOT wired into the build)

Provenance: `claude/study-question-validators-fe6edb`, commit `b9b5f98` (2026-08-03), branch deleted after harvest.

The "flight spec" — the design that constrains generation INPUT (wine count, axis, mark mix)
instead of filtering output. It never landed: master took 109 commits on `question-engine.ts`
after this forked, and the wiring is unmergeable. Kept because the idea is the same inversion
argued for selection-from-corpus, and because the measured result behind it was real
(3+ redrafts -> 1.25 attempts, 75% first-pass, on the 2026-08-03 validator).

It is Markdown, not `.ts`, deliberately: as a live file it would be dead code that rots.

```ts
// question-spec.ts — the deterministic "flight spec" compiler (Layer 2 of the first-pass project).
//
// WHY THIS EXISTS
// The generator used to be pure generate-and-check: ask the model to invent a whole question, then
// run twelve validators and resample on failure. Replaying the full suite over the 104 served
// questions (tests/validator-replay.eval.test.ts) showed that the rules doing most of the rejecting
// are ones NO model should be asked to satisfy by inspiration, because they are pure arithmetic or
// pure bookkeeping:
//
//   marks    (36/104) — sub-question marks must total exactly 25 x N
//   markMix  (30/104) — identification must stay under ~46% of marks
//   flightSize (3)    — the flight size must sit in the family's historical range
//
// So this module DECIDES those before the model is called, and hands the model a filled-in spec:
// the exact flight size, the exact mark tokens to print, and the contrast axis to build around.
// A spec is arithmetically correct by construction, so the corresponding validators cannot fire.
// The model's job shrinks to what it is actually good at — choosing real wines and writing an
// examiner's prose.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO
// It does not pick the wines. The wine_bank holds ~200 rows with no quality tier; the model knows
// the whole world of wine. Solving wine identity from a 200-row table would trade a rare validator
// failure for a permanent collapse in question variety. Wine SELECTION stays with the model;
// only the question's SKELETON is solved here.
//
// This module imports nothing from question-engine, so the dependency runs one way
// (engine -> spec, prompt -> spec) and there is no cycle.

export const SPEC_VERSION = "spec-1";

// ── Flight size ──────────────────────────────────────────────────────────────────────────────────
// The historical wine-count range per question family. This is the single source of truth: the
// size picker filters against it, and question-engine's validateFlightSize imports it rather than
// keeping a second copy. They previously disagreed — the picker's F5 distribution offered a 1-wine
// flight on every paper while the validator rejects 1-wine flights outside Paper 3, so the engine
// was rejecting drafts that had faithfully obeyed the size it was told to use.
export const FAMILY_FLIGHT_RANGES: Record<string, { min: number; max: number; typical: number[] }> = {
  F1: { min: 2, max: 6, typical: [2, 3] },
  F2: { min: 2, max: 4, typical: [2, 3] },
  F3: { min: 2, max: 4, typical: [2, 4] },
  F4: { min: 2, max: 6, typical: [3, 4] },
  F5: { min: 1, max: 5, typical: [2, 3, 4] },
  F6: { min: 2, max: 5, typical: [2, 4, 5] },
  F7: { min: 2, max: 6, typical: [2, 6] },
};

/**
 * Every flight size that is legal for this (paper, family) under the corpus rules the engine's
 * validateFlightSize enforces. Anything this returns is guaranteed to pass that validator.
 */
export function legalFlightSizes(paper: number, family: string): number[] {
  const range = FAMILY_FLIGHT_RANGES[family] || { min: 2, max: 6, typical: [2, 3, 4] };
  const sizes: number[] = [];
  for (let n = range.min; n <= range.max; n++) {
    if (paper === 1 && n === 5) continue; // P1 has never used a 5-wine flight
    if (n === 1 && paper !== 3) continue; // single-wine flights only exist on Paper 3
    sizes.push(n);
  }
  return sizes;
}

// ── Mark plan ────────────────────────────────────────────────────────────────────────────────────
// A sub-question in the plan. `perWine` parts render as "(N x M marks)" and contribute N*M to the
// total; shared parts render as "(M marks)" and contribute M. A plan is valid when the total is
// exactly 25*N, every written part is >= 5 marks, and the identification share is <= ID_SHARE_CAP.
export type MarkPart = {
  letter: string;
  /** What this sub-question must ask. Goes into the prompt verbatim as a directive. */
  intent: string;
  role: "identification" | "winemaking" | "quality_style" | "maturity" | "commercial" | "state_rs";
  perWine: boolean;
  /**
   * This part's share of the 25-mark-per-wine budget — ALWAYS per-wine, for both kinds of part.
   * A part therefore contributes `marks * wineCount` to the flight total either way; `perWine` only
   * changes how it is printed ("(4 x 8 marks)" vs "(32 marks)"). Because every template's parts sum
   * to 25, the flight total is 25*N for any N with no further arithmetic — that is what makes the
   * mark validators unfireable.
   */
  marks: number;
};

export type MarkPlan = {
  parts: MarkPart[];
  totalMarks: number;
  idShare: number;
};

// The engine's validateMarkTypeMix rejects above 0.55. We target 0.46 (the modern-paper mean,
// EK-0098) so there is real headroom: a plan sitting at 0.54 would pass the validator but leave no
// room for a stray identification phrase in another sub-question.
export const ID_SHARE_TARGET = 0.46;
/** Where the real papers actually sit (44% of marks, measured over data/exams.json). */
export const CORPUS_ID_SHARE = 0.44;

// ── Question shapes, sampled from the real corpus ────────────────────────────────────────────────
//
// The first version of this file carried eight hand-written templates. They were arithmetically
// correct and pedagogically dull: every generated question came out as
// "a) Identify -> b) winemaking/maturity -> c) style, quality and commercial", because that was
// most of what eight templates could say. Benchmarking made it visible — wine selection stayed
// varied (97% distinct wines) while question SHAPE repeated far more than the real exam does.
//
// Writing more templates by hand would be more invention. scripts/analyze-corpus-shapes.mjs reads
// the 153 real questions in data/exams.json and reports what the examiners actually do:
//
//   sub-part count      3 parts 73%, 2 parts 14%, 4 parts 12%, 5 parts 2%
//   role sequences      far more varied than "id -> making -> quality"; the second most common
//                       shape splits IDENTIFICATION ACROSS TWO PARTS (a shared "identify the
//                       region" plus a per-wine "identify the variety and comment on quality")
//   id position         first in 91% of questions that have one — but 9% place it later, and 5%
//                       of questions have no identification part at all
//   part scope          25% of all parts are shared across the flight; 44% of questions have one
//   per-wine values     5, 6, 7, 8, 9, 10, 12, 13, 15, 20 all occur (10 is the mode)
//   marks by role       identification 44%, winemaking 21%, commercial 12%, quality/style 10%,
//                       maturity 10% — which is where ID_SHARE_TARGET's 46% comes from
//
// So a plan is now SAMPLED: draw a role sequence from the observed distribution, then solve a mark
// partition for it. The arithmetic guarantee is unchanged — every plan still sums to exactly 25 per
// wine and keeps identification under the cap — but the shape varies the way the real exam varies.
type Role = "identification" | "winemaking" | "quality_style" | "maturity" | "commercial" | "state_rs";

// Observed role sequences with their corpus counts as weights. Sequences appearing once or twice are
// omitted; `papers` restricts a shape where the paper's mark emphasis demands it (EK-0098).
const ROLE_SEQUENCES: { seq: Role[]; weight: number; papers?: number[] }[] = [
  { seq: ["identification", "winemaking", "commercial"], weight: 15 },
  { seq: ["identification", "identification", "winemaking"], weight: 13 },
  { seq: ["identification", "winemaking", "maturity"], weight: 11 },
  { seq: ["identification", "winemaking", "quality_style"], weight: 9 },
  { seq: ["identification", "identification", "commercial"], weight: 9 },
  { seq: ["identification", "maturity", "winemaking"], weight: 7 },
  { seq: ["identification", "identification", "quality_style"], weight: 6 },
  { seq: ["identification", "winemaking"], weight: 6 },
  { seq: ["identification", "identification", "maturity"], weight: 5 },
  { seq: ["identification", "quality_style", "identification"], weight: 5 },
  { seq: ["identification", "quality_style", "winemaking"], weight: 4 },
  { seq: ["identification", "quality_style", "maturity"], weight: 4 },
  { seq: ["identification", "quality_style", "commercial"], weight: 4 },
  { seq: ["identification", "identification", "winemaking", "quality_style"], weight: 3 },
  { seq: ["identification", "winemaking", "identification"], weight: 3 },
  { seq: ["identification", "identification", "winemaking", "maturity"], weight: 3 },
  { seq: ["winemaking", "commercial"], weight: 3 },
  { seq: ["identification", "commercial"], weight: 3 },
  { seq: ["winemaking", "identification"], weight: 2 },
  { seq: ["winemaking", "identification", "commercial"], weight: 2 },
  { seq: ["identification", "winemaking", "quality_style", "commercial"], weight: 2 },
  // Paper 3 is where the 2-3 mark "state the residual sugar" ask lives (EK-0098).
  { seq: ["identification", "state_rs", "winemaking", "commercial"], weight: 6, papers: [3] },
  { seq: ["identification", "state_rs", "quality_style"], weight: 4, papers: [3] },
];

// Per-wine mark values the exam actually uses, weighted by observed frequency. Restricting the
// solver to these keeps generated allocations looking like real ones (10s and 5s are common, 11s
// and 16s essentially never appear).
const MARK_VALUE_WEIGHTS: Record<number, number> = {
  5: 47, 6: 14, 7: 39, 8: 42, 9: 12, 10: 112, 11: 2, 12: 11, 13: 5, 15: 15, 20: 6,
};
const MARK_VALUES = Object.keys(MARK_VALUE_WEIGHTS).map(Number).sort((a, b) => a - b);
const STATE_RS_VALUES = [2, 3];

/** Every partition of 25 into `k` values drawn from the corpus's observed mark values. */
function partitionsOf25(k: number, hasStateRs: boolean): number[][] {
  const out: number[][] = [];
  const walk = (remaining: number, slots: number, acc: number[]) => {
    if (slots === 0) {
      if (remaining === 0) out.push([...acc]);
      return;
    }
    // The state-RS slot is the only one allowed below 5, and it is always the slot we mark as such.
    const pool = hasStateRs && acc.length === 0 ? STATE_RS_VALUES : MARK_VALUES;
    for (const v of pool) {
      if (v > remaining) break;
      // Every remaining slot needs at least 5.
      if (remaining - v < (slots - 1) * 5) continue;
      acc.push(v);
      walk(remaining - v, slots - 1, acc);
      acc.pop();
    }
  };
  walk(25, k, []);
  return out;
}

function weightedPick<T>(items: T[], weightOf: (t: T) => number, rand: () => number): T {
  const total = items.reduce((a, b) => a + weightOf(b), 0);
  let roll = rand() * total;
  for (const item of items) {
    roll -= weightOf(item);
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

// Several phrasings per role, so two questions that happen to draw the same shape do not also read
// identically. The wording is modelled on real stems ("Identify the origin as closely as possible",
// "Discuss how the wine has been made, with specific reference to...").
const ROLE_PHRASINGS: Record<Role, string[]> = {
  identification: [
    "Identify the grape variety and the origin, as precisely as you can.",
    "Identify the origin as closely as possible.",
    "Identify the grape variety or varieties.",
    "Identify the country and region of origin, and the principal grape variety.",
    "Identify the origin as closely as possible and comment on the level of quality within the context of that origin.",
    "Identify the grape variety and comment on the level of quality within the context of the region of origin.",
  ],
  winemaking: [
    "Discuss how the wine has been made, with specific reference to the evidence in the glass.",
    "Comment on the winemaking, with particular reference to the use of oak and malolactic fermentation.",
    "Explain the method of production.",
    "Discuss the winemaking and maturation, and how they have shaped the wine.",
    "Comment on the vinification and ageing, with reference to any human intervention you can detect.",
  ],
  quality_style: [
    "Comment on the style and quality.",
    "Assess the quality, with reference to the evidence in the glass.",
    "Comment on the style, with reference to climate and winemaking.",
    "Comment on the quality and typicity.",
    "Comment on the style and quality, and on the balance between natural factors and human inputs.",
  ],
  maturity: [
    "Comment on the state of maturity and the drinking window you would recommend.",
    "Comment on the age of the wine and its potential to develop and improve further.",
    "Assess the maturity and the ageing potential.",
    "Comment on the vintage and how much longer the wine will hold.",
  ],
  commercial: [
    "Comment on the commercial position and the target market.",
    "Assess the commercial appeal and who would buy this wine.",
    "Comment on the commercial potential in your market.",
    "Comment on the quality and the commercial position.",
  ],
  state_rs: [
    "State the level of residual sugar.",
    "State the level of residual sugar in grams per litre.",
  ],
};

export function buildMarkPlan(paper: number, wineCount: number, rand: () => number): MarkPlan {
  const eligible = ROLE_SEQUENCES.filter((s) => !s.papers || s.papers.includes(paper));
  const chosen = weightedPick(eligible, (s) => s.weight, rand);
  const roles = chosen.seq;
  const hasStateRs = roles.includes("state_rs");

  // Solve the mark partition, then keep only those that respect the identification cap. There is
  // always at least one survivor for every sequence in the table — a test proves it, so this cannot
  // silently fall back to a degenerate plan.
  const idIndices = roles.map((r, i) => (r === "identification" ? i : -1)).filter((i) => i >= 0);
  const candidates = partitionsOf25(roles.length, hasStateRs).filter((values) => {
    // The state-RS slot is solved in position 0 but belongs wherever the sequence puts it, so
    // reorder before scoring.
    const ordered = reorderForStateRs(roles, values);
    const idTotal = idIndices.reduce((sum, i) => sum + ordered[i], 0);
    return idTotal / 25 <= ID_SHARE_TARGET + 1e-9;
  });

  // Weight by how ordinary the mark values are AND by closeness to the corpus's identification
  // share. Merely capping at ID_SHARE_TARGET let the solver drift to the cheap end — a live run
  // measured 31% ID against the corpus's 44%, which reads as a question that never quite asks the
  // candidate to commit. The exam's real centre of gravity is ~44%, so aim at it.
  const idShareOf = (v: number[]) => {
    const ordered = reorderForStateRs(roles, v);
    return idIndices.reduce((sum, i) => sum + ordered[i], 0) / 25;
  };
  const values = reorderForStateRs(
    roles,
    weightedPick(
      candidates,
      (v) => {
        const commonness = v.reduce((a, b) => a * (MARK_VALUE_WEIGHTS[b] ?? 1), 1);
        const drift = Math.abs(idShareOf(v) - CORPUS_ID_SHARE);
        return commonness * Math.exp(-drift * 12);
      },
      rand
    )
  );

  // 25% of real parts are shared across the flight rather than per-wine, and a shared part is most
  // natural for the FIRST identification ask ("For all three wines: a) Identify the region").
  const sharedIndex =
    idIndices.length > 1 && rand() < 0.55
      ? idIndices[0]
      : rand() < 0.18
        ? 0
        : -1;

  // Deduplicate by TOPIC, not just by exact string. Several roles legitimately offer a phrasing that
  // mentions quality ("assess the quality...", "comment on the quality and the commercial
  // position"), and drawing two of them produced a question whose parts b) and c) both asked about
  // quality — redundant, and not something any real paper does.
  const TOPIC_WORDS = ["quality", "style", "commercial", "maturity", "winemaking", "origin"];
  const claimedTopics = new Set<string>();
  const topicsOf = (phrase: string) => TOPIC_WORDS.filter((w) => phrase.toLowerCase().includes(w));

  const usedPhrasings = new Set<string>();
  const parts: MarkPart[] = roles.map((role, i) => {
    const pool = ROLE_PHRASINGS[role].filter((p) => !usedPhrasings.has(p));
    const fresh = pool.filter((p) => topicsOf(p).every((t) => !claimedTopics.has(t)));
    const options = fresh.length > 0 ? fresh : pool;
    const intent = options[Math.floor(rand() * options.length)] ?? ROLE_PHRASINGS[role][0];
    for (const t of topicsOf(intent)) claimedTopics.add(t);
    usedPhrasings.add(intent);
    return {
      letter: String.fromCharCode(97 + i),
      intent,
      role,
      perWine: i !== sharedIndex,
      marks: values[i],
    };
  });

  return {
    parts,
    totalMarks: planTotal(parts, wineCount),
    idShare: planIdShare(parts, wineCount),
  };
}

/**
 * partitionsOf25 always solves the state-RS slot first (it is the only one that may be below 5), so
 * the returned values are in "state-RS first" order. Rotate them back onto the sequence's real
 * positions.
 */
function reorderForStateRs(roles: Role[], values: number[]): number[] {
  const rsIndex = roles.indexOf("state_rs");
  if (rsIndex < 0) return values;
  const [rsValue, ...rest] = values;
  const out: number[] = [];
  let k = 0;
  for (let i = 0; i < roles.length; i++) out.push(i === rsIndex ? rsValue : rest[k++]);
  return out;
}

/**
 * Render a plan's per-wine mark value into the exact token the model must print.
 * A one-wine flight has no multiplier, so "1 x 10 marks" collapses to "(10 marks)".
 */
export function renderMarkToken(part: MarkPart, wineCount: number): string {
  if (!part.perWine) return `(${part.marks * wineCount} marks)`;
  if (wineCount === 1) return `(${part.marks} marks)`;
  return `(${wineCount} x ${part.marks} marks)`;
}

function planTotal(parts: MarkPart[], wineCount: number): number {
  // `marks` is a per-wine share for both part kinds (see MarkPart.marks), so this is uniform.
  return parts.reduce((sum, p) => sum + p.marks * wineCount, 0);
}

function planIdShare(parts: MarkPart[], wineCount: number): number {
  const total = planTotal(parts, wineCount);
  if (total === 0) return 0;
  const id = parts
    .filter((p) => p.role === "identification")
    .reduce((sum, p) => sum + p.marks * wineCount, 0);
  return id / total;
}


/**
 * Self-check used by the tests (and cheap enough to assert at build time): a plan is only usable if
 * it satisfies, by arithmetic alone, every mark rule the engine enforces after the fact.
 */
export function checkMarkPlan(plan: MarkPlan, wineCount: number): string[] {
  const problems: string[] = [];
  if (plan.totalMarks !== wineCount * 25)
    problems.push(`total ${plan.totalMarks} != 25 x ${wineCount}`);
  for (const p of plan.parts) {
    if (p.role !== "state_rs" && p.marks < 5)
      problems.push(`part ${p.letter} is a written sub-question worth ${p.marks} (< 5)`);
    if (p.role === "state_rs" && (p.marks < 2 || p.marks > 3))
      problems.push(`part ${p.letter} is a state-RS ask worth ${p.marks} (must be 2-3)`);
  }
  if (plan.idShare > ID_SHARE_TARGET + 0.001)
    problems.push(`identification share ${Math.round(plan.idShare * 100)}% exceeds the ${Math.round(ID_SHARE_TARGET * 100)}% target`);
  // 1 or 2 identification parts. The corpus's second-most-common shape splits identification in
  // two — a shared "identify the region" plus a per-wine "identify the variety and comment on
  // quality" — so requiring exactly one was itself a source of the flattened output.
  const idParts = plan.parts.filter((p) => p.role === "identification").length;
  if (idParts > 2) problems.push(`a plan may have at most two identification sub-questions, got ${idParts}`);
  if (plan.parts.length < 2) problems.push("a plan needs at least two sub-questions");
  return problems;
}

// ── Contrast axis ────────────────────────────────────────────────────────────────────────────────
// The novelty validator rejects a draft that reuses a recent question's structural template AND its
// pedagogical contrast. Rejecting after the fact is the expensive way to get novelty; picking an
// axis the recent questions do NOT use, and telling the model to build around it, is the cheap way.
// Each axis carries the marker regexes that identify it in an existing stem.
// `p3Styles` gates an axis against the Paper 3 style category the sampler chose. Without it the two
// decisions were made independently — the style inside the prompt builder, the axis here — and could
// contradict each other: "this must be a SPARKLING flight" plus "contrast the sweetness mechanisms"
// is not a question anyone can write, so the model picked one, and the validators rejected whatever
// it dropped. Omitting the field means the axis works with any style.
// `claim` is the stem's opening factual sentence, as a function of the flight size.
//
// This exists because the validators check the stem's CLAIMS against the wine list, and the model
// was writing those claims freehand. Live runs kept producing things like a stem promising "each
// made from a different, single grape variety" over a flight containing a Saint-Julien (a blend), or
// over a Sherry quality ladder where every wine is Palomino. Both are correct flights ruined by an
// invented sentence — `variety` was the top first-draft rejection because of it.
//
// The claim is derivable from the contrast axis, so the spec states it and forbids adding others.
type Axis = {
  id: string;
  papers: number[];
  directive: string;
  markers: RegExp[];
  p3Styles?: string[];
  /**
   * Several real phrasings of the stem's opening claim, one of which is sampled. A single fixed
   * sentence per axis made every question of that axis open identically — half of the flattening
   * the corpus-shape analysis exposed. These are modelled on actual stems in data/exams.json.
   */
  claims: ((n: number) => string)[];
};

const AXES: Axis[] = [
  {
    id: "same-variety-different-origin",
    claims: [
      (n: number) => `Wines 1 to ${n} are made from the same single grape variety.`,
      (n: number) => `Wines 1 to ${n} are all made from the same single grape variety and come from different countries.`,
      (n: number) => `Wines 1 to ${n} are made from the same grape variety.`,
    ],
    papers: [1, 2],
    directive:
      "All wines share one grape variety; the candidate must separate them by ORIGIN. The stem must say the wines are made from the same single grape variety.",
    markers: [/\bsame (single )?grape variet/i],
  },
  {
    id: "same-origin-different-variety",
    claims: [
      (n: number) => `Wines 1 to ${n} are from the same region of origin, but made from different single grape varieties.`,
      (n: number) => `Wines 1 to ${n} are from the same country of origin, each made predominantly from a different grape variety.`,
      (n: number) => `Wines 1 to ${n} are made from different single grape varieties and are from the same region of origin.`,
    ],
    papers: [1, 2],
    directive:
      "All wines come from one country or region; the candidate must separate them by VARIETY. Every wine must have a different dominant grape.",
    markers: [/\bsame countr/i, /\bsame region\b/i],
  },
  {
    id: "different-countries-different-varieties",
    claims: [
      (n: number) => `Wines 1 to ${n} are from ${n} different countries.`,
      (n: number) => `Wines 1 to ${n} are each from a different country, and each is made predominantly from a different grape variety.`,
      (n: number) => `Wines 1 to ${n} come from ${n} different countries and are made from ${n} different grape varieties.`,
    ],
    papers: [1, 2, 3],
    directive:
      "Each wine is from a different country AND a different dominant variety — a breadth test. The stem must state the number of countries, and that number must equal the number of wines.",
    markers: [/\bdifferent countr/i],
  },
  {
    id: "winemaking-signature",
    claims: [
      (n: number) => `Wines 1 to ${n} have been made in noticeably different ways.`,
      (n: number) => `Wines 1 to ${n} are closely related in origin but differ markedly in how they were made.`,
      (n: number) => `Wines 1 to ${n} show contrasting approaches to vinification and maturation.`,
    ],
    papers: [1, 2],
    directive:
      "The wines are close in variety or origin and differ mainly by WINEMAKING (oak regime, lees, whole-bunch, vessel, malolactic). The contrast the candidate must resolve is a production choice, not a place.",
    markers: [/\bwinemaking\b/i, /\bmethod of production\b/i, /\bvinificat/i],
  },
  {
    id: "quality-hierarchy",
    claims: [
      (n: number) => `Wines 1 to ${n} represent different levels of a single quality hierarchy.`,
      (n: number) => `Wines 1 to ${n} are drawn from the same classification ladder at different levels.`,
      (n: number) => `Wines 1 to ${n} sit at different points of one quality hierarchy.`,
    ],
    papers: [1, 2, 3],
    directive:
      "The wines form a quality ladder within one legal hierarchy (village / 1er cru / grand cru, or a DOC(G) or classification ladder). The candidate must rank them and justify the ranking from the glass.",
    markers: [/\bquality hierarch/i, /\brank\b/i, /\bclassification\b/i],
  },
  {
    id: "maturity-spread",
    claims: [
      (n: number) => `Wines 1 to ${n} are from the same grape variety and origin, but from different vintages.`,
      (n: number) => `Wines 1 to ${n} are the same wine from ${n} different vintages.`,
      (n: number) => `Wines 1 to ${n} share a variety and an origin but differ in age.`,
    ],
    papers: [1, 2],
    directive:
      "The wines are close in identity but spread across AGE. The contrast is developmental — the candidate must read maturity and place each wine on its drinking curve.",
    markers: [/\bmaturit/i, /\bdrink(ing)? window\b/i, /\bageing potential\b/i],
  },
  {
    id: "sweetness-mechanism",
    claims: [
      (n: number) => `Wines 1 to ${n} are sweet wines in which the sweetness was achieved by different means.`,
      (n: number) => `Wines 1 to ${n} are sweet wines produced by ${n} different methods.`,
      (n: number) => `Wines 1 to ${n} are all sweet, but the sugar arrived in each by a different route.`,
    ],
    papers: [3],
    p3Styles: ["sweet"],
    directive:
      "The wines are sweet by DIFFERENT mechanisms (botrytis, passerillage, freeze concentration, arrested fermentation, fortification). The candidate must name the mechanism, not just the sweetness.",
    markers: [/\bsweetness (was|is) achiev/i, /\bmechanism\b/i, /\bbotrytis\b/i],
  },
  {
    id: "sparkling-method",
    claims: [
      (n: number) => `Wines 1 to ${n} are sparkling wines made by different methods.`,
      (n: number) => `Wines 1 to ${n} are sparkling wines produced by contrasting methods of production.`,
      (n: number) => `Wines 1 to ${n} are all sparkling, made in ${n} different ways.`,
    ],
    papers: [3],
    p3Styles: ["sparkling"],
    directive:
      "The wines are sparkling by different methods or different dosage/ageing regimes. The candidate must separate traditional method from tank, ancestral, or transfer.",
    markers: [/\bsparkling\b/i, /\btraditional method\b/i, /\bdosage\b/i],
  },
  {
    id: "oxidative-vs-biological",
    claims: [
      (n: number) => `Wines 1 to ${n} have undergone different styles of ageing.`,
      (n: number) => `Wines 1 to ${n} contrast oxidative and biological ageing.`,
      (n: number) => `Wines 1 to ${n} have been aged under markedly different conditions.`,
    ],
    papers: [3],
    p3Styles: ["oxidative", "fortified"],
    directive:
      "The contrast is oxidative versus biological (flor) ageing, or fortified versus unfortified. The candidate must read the ageing regime from the glass.",
    markers: [/\boxidative\b/i, /\bflor\b/i, /\bsous voile\b/i, /\bvin jaune\b/i],
  },
  {
    id: "fortification-point",
    claims: [
      (n: number) => `Wines 1 to ${n} are fortified wines.`,
      (n: number) => `Wines 1 to ${n} are fortified wines in which the spirit was added at different stages.`,
      (n: number) => `Wines 1 to ${n} are all fortified, but differ in when and why the spirit was added.`,
    ],
    papers: [3],
    p3Styles: ["fortified", "sweet"],
    directive:
      "The wines differ by WHEN fortification happened and what it preserved (sweet-fortified versus dry-fortified, and the ageing that followed).",
    markers: [/\bfortifi/i],
  },
];

/** How many recent stems count toward an axis being "recently used". See pickContrastAxis. */
const AXIS_RECENCY_WINDOW = 8;

/**
 * Choose the contrast axis this question is built around, favouring axes the recent questions have
 * not leaned on.
 *
 * NOT a hard used/unused filter, which is how the first version worked and why it failed. Axis
 * markers have wildly different natural hit rates: "quality-hierarchy" matches on the literal words
 * "rank" or "classification", which almost never appear in a stem, while "winemaking" or "different
 * countries" appear in something within any 30-stem window. So "used at least once" was true for
 * nearly every axis and false for quality-hierarchy — and a live run came back with
 * axis=quality-hierarchy on all 14 attempts. The mechanism built to CREATE novelty was manufacturing
 * the exact repetition the novelty validator then rejected.
 *
 * Two changes make it behave: score over a short recency window rather than the whole history (so
 * the counts don't saturate), and weight-sample across ALL eligible axes with weight 1/(1+count)^2
 * rather than filtering. An axis used recently becomes unlikely, never impossible — so the picker
 * always has the full range available and cannot collapse onto one value.
 */
export function pickContrastAxis(
  paper: number,
  recentStems: string[],
  rand: () => number,
  p3Style?: string | null
): Axis {
  const byPaper = AXES.filter((a) => a.papers.includes(paper));
  // On Paper 3 the style category is already fixed, so drop any axis that contradicts it. Falls back
  // to the unfiltered set if a style has no dedicated axis, rather than failing to pick one.
  const styleFiltered =
    paper === 3 && p3Style
      ? byPaper.filter((a) => !a.p3Styles || a.p3Styles.includes(p3Style))
      : byPaper;
  const eligible = styleFiltered.length > 0 ? styleFiltered : byPaper;
  if (eligible.length === 1) return eligible[0];

  const window = recentStems.slice(0, AXIS_RECENCY_WINDOW);
  const weights = eligible.map((axis) => {
    const count = window.filter((stem) => axis.markers.some((re) => re.test(stem))).length;
    return 1 / Math.pow(1 + count, 2);
  });

  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rand() * total;
  for (let i = 0; i < eligible.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return eligible[i];
  }
  return eligible[eligible.length - 1];
}

// ── Banker vocabulary ────────────────────────────────────────────────────────────────────────────
// validateBankerMinimum recognises a "banker" by matching a wine's text against one fixed regex of
// benchmark appellations. The prompt used to describe bankers in PROSE, so the model could pick a
// wine that is unarguably a banker to any MW (a Keller GG, a Vega Sicilia) and still be rejected,
// because the regex had never heard of it. Two specifications, one of them invisible to the writer.
//
// These lists are drawn from that regex's own alternatives, so anything the model picks from them
// is guaranteed to satisfy the validator. tests/question-spec.test.ts asserts every entry here
// still matches the engine's BENCHMARK_APPELLATIONS — if someone edits the regex, the test fails
// rather than the generator silently starting to loop again.
export const BANKER_VOCABULARY: Record<number, string[]> = {
  1: ["Chablis", "Meursault", "Puligny-Montrachet", "Chassagne-Montrachet", "Sancerre", "Pouilly-Fumé", "Vouvray", "Savennières", "Alsace Grand Cru", "Marlborough", "Clare Valley", "Eden Valley", "Margaret River", "Wachau", "Kamptal", "Hawke's Bay", "Sonoma Coast", "Waipara"],
  2: ["Pauillac", "Margaux", "Saint-Julien", "Saint-Estèphe", "Saint-Émilion", "Pomerol", "Pessac-Léognan", "Gevrey-Chambertin", "Chambolle-Musigny", "Vosne-Romanée", "Nuits-Saint-Georges", "Pommard", "Volnay", "Barolo", "Barbaresco", "Brunello di Montalcino", "Chianti Classico", "Vino Nobile", "Taurasi", "Hermitage", "Côte-Rôtie", "Cornas", "Châteauneuf-du-Pape", "Rioja Gran Reserva", "Ribera del Duero", "Priorat", "Napa Valley", "Oakville", "Rutherford", "Stags Leap", "Barossa", "Yarra Valley", "Stellenbosch", "Willamette"],
  3: ["Vintage Port", "LBV", "Tawny 20", "Fino", "Manzanilla", "Amontillado", "Oloroso", "Palo Cortado", "Madeira", "Sauternes", "Barsac", "Tokaji", "Grand Cru", "Premier Cru"],
};

// Old/New World country lists. These are the SAME lists validateCompositionBalance checks against —
// the engine imports them from here rather than keeping its own copy, so the prompt can hand the
// model the grader's actual vocabulary instead of the category name.
export const OLD_WORLD_COUNTRIES = new Set([
  "france", "italy", "spain", "portugal", "germany", "austria", "greece",
  "hungary", "england", "georgia", "switzerland", "croatia", "slovenia", "israel", "lebanon",
]);
export const NEW_WORLD_COUNTRIES = new Set([
  "south africa", "new zealand", "usa", "australia", "argentina", "chile",
  "canada", "uruguay", "brazil", "japan", "mexico", "china",
]);

// ── The spec ─────────────────────────────────────────────────────────────────────────────────────
export type FlightSpec = {
  specVersion: string;
  paper: number;
  family: string;
  /** Paper 3 only: the style family this flight must be built from (sparkling | sweet | ...). */
  p3Style: string | null;
  wineCount: number;
  markPlan: MarkPlan;
  axisId: string;
  axisDirective: string;
  /** The stem's opening factual sentence. Every claim in it is checked against the wine list. */
  stemClaim: string;
  bankerVocabulary: string[];
  requireBanker: boolean;
  requireWorldMix: boolean;
};

/** Small deterministic PRNG so a spec is reproducible from its seed across retries. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildFlightSpec(input: {
  paper: number;
  family: string;
  /** The DB-informed size pick; clamped here to a size that is legal for this paper+family. */
  preferredWineCount?: number;
  recentStems?: string[];
  /** The Paper 3 style family the sampler chose, so the contrast axis can be kept compatible. */
  p3Style?: string | null;
  seed: number;
}): FlightSpec {
  const { paper, family, preferredWineCount, recentStems = [], p3Style = null, seed } = input;
  const rand = seededRandom(seed);

  const legal = legalFlightSizes(paper, family);
  const wineCount =
    preferredWineCount && legal.includes(preferredWineCount)
      ? preferredWineCount
      : legal[Math.floor(rand() * legal.length)] ?? 3;

  const markPlan = buildMarkPlan(paper, wineCount, rand);
  const axis = pickContrastAxis(paper, recentStems, rand, p3Style);

  return {
    specVersion: SPEC_VERSION,
    paper,
    family,
    p3Style,
    wineCount,
    markPlan,
    axisId: axis.id,
    axisDirective: axis.directive,
    stemClaim: axis.claims[Math.floor(rand() * axis.claims.length)](wineCount),
    bankerVocabulary: BANKER_VOCABULARY[paper] || [],
    // validateBankerMinimum only applies to flights of 3+.
    requireBanker: wineCount >= 3,
    // validateCompositionBalance wants an Old/New World mix in non-same-origin families of 3+.
    requireWorldMix: wineCount >= 3 && family !== "F2" && family !== "F7",
  };
}

/**
 * Render the spec as the prompt's opening block. Everything here is already arithmetically valid,
 * so the model is copying numbers rather than inventing them.
 */
export function renderFlightSpecBlock(spec: FlightSpec): string {
  const lines: string[] = [];
  lines.push(`## FLIGHT SPEC — PRE-SOLVED, COPY IT EXACTLY (${spec.specVersion})`);
  lines.push(
    `The skeleton of this question has already been computed and checked. The numbers below are correct; ` +
      `do not recalculate, redistribute, or "improve" them. Where any later section of this prompt suggests ` +
      `different mark values or a different flight size, THIS BLOCK WINS.`
  );
  lines.push("");
  lines.push(`FLIGHT SIZE: exactly ${spec.wineCount} ${spec.wineCount === 1 ? "wine" : "wines"}.`);
  lines.push(`TOTAL MARKS: exactly ${spec.markPlan.totalMarks} (25 per wine x ${spec.wineCount}).`);
  lines.push("");
  lines.push(`SUB-QUESTIONS — use exactly these ${spec.markPlan.parts.length} parts, in this order, with these exact mark tokens:`);
  for (const part of spec.markPlan.parts) {
    // Real papers signpost scope with "For all N wines:" / "For each wine:" above the parts. Carry
    // that through so a shared part reads as one answer for the flight, not one answer per wine.
    const scope = part.perWine
      ? spec.wineCount > 1
        ? "[For each wine] "
        : ""
      : `[For all ${spec.wineCount} wines, one answer] `;
    lines.push(`  ${part.letter}) ${scope}${part.intent} ${renderMarkToken(part, spec.wineCount)}`);
  }
  if (spec.markPlan.parts.some((p) => !p.perWine)) {
    lines.push(
      `The bracketed scope markers are instructions, not text to print. Signpost them the way a real ` +
        `paper does — a line reading "For all ${spec.wineCount} wines:" or "For each wine:" above the ` +
        `relevant parts — and do not print the brackets themselves.`
    );
  }
  lines.push("");
  lines.push(
    `You may rewrite the WORDING of each sub-question to suit the flight and to sound like a real exam paper, ` +
      `but you must keep: the same number of parts, the same order, the same subject for each part, and the ` +
      `mark token exactly as printed above.`
  );
  // A live run produced a stem totalling exactly 2x the required marks — every token printed twice,
  // once per half of a split flight. The arithmetic in this block is only correct if each token
  // appears once, so say so.
  lines.push(
    `Print each mark token EXACTLY ONCE in the whole question. The total above is only correct if the ` +
      `${spec.markPlan.parts.length} tokens appear ${spec.markPlan.parts.length} times in total. Do not repeat the ` +
      `sub-questions per wine, per pair, or per group — a per-wine part is already multiplied by ` +
      `${spec.wineCount} inside its own token.`
  );
  const rsPart = spec.markPlan.parts.find((p) => p.role === "state_rs");
  if (rsPart) {
    lines.push(
      `EXCEPTION — part ${rsPart.letter}) is the one sub-question allowed below 5 marks, and only because it is a ` +
        `one-number "state" answer. Keep the literal words "State" and "residual sugar" in it. Any other phrasing ` +
        `("how sweet are these wines", "comment on the sugar") turns it into a written answer, which cannot be ` +
        `worth ${rsPart.marks} marks.`
    );
  }
  lines.push("");
  const idLetters = spec.markPlan.parts
    .filter((p) => p.role === "identification")
    .map((p) => p.letter.toUpperCase());
  lines.push(
    `IDENTIFICATION IS ${idLetters.length > 1 ? `PARTS ${idLetters.join(" AND ")}` : `PART ${idLetters[0]}`} ONLY. ` +
      `No other sub-question may ask the candidate to identify, name, state or determine a grape variety, origin, ` +
      `region, country, appellation or vintage. Other parts may still REFER to origin as context ` +
      `("assess the quality in the context of its origin") — that is expected — they just must not ASK for it. ` +
      `This keeps identification at ${Math.round(spec.markPlan.idShare * 100)}% of marks, inside the ${Math.round(ID_SHARE_TARGET * 100)}% modern-paper norm.`
  );
  lines.push("");
  lines.push(`OPENING SENTENCE OF THE STEM — use this claim, and no other:`);
  lines.push(`  "${spec.stemClaim}"`);
  lines.push(
    `You may reword it to read naturally, but you must not ADD any further factual claim about the ` +
      `flight — no extra statement about how many countries are represented, how many grape varieties ` +
      `there are, whether they are single-varietal, or whether they share an origin, beyond what the ` +
      `sentence above already says. Every such claim is checked against your wine list, and an extra ` +
      `one you did not need is the most common way a correct flight gets rejected: a Sherry quality ` +
      `ladder is a fine question until the stem also promises "a different grape variety" for wines ` +
      `that are all Palomino, and a Saint-Julien belongs in many flights but not under a stem that ` +
      `calls every wine single-varietal.`
  );
  lines.push("");
  lines.push(`CONTRAST AXIS FOR THIS QUESTION: ${spec.axisId}`);
  lines.push(spec.axisDirective);
  lines.push(
    `Build the flight around this axis. It was chosen because recent questions did NOT use it, so it is ` +
      `what makes this question new — do not drift to a different contrast.`
  );

  if (spec.requireBanker) {
    lines.push("");
    lines.push(
      `BANKER REQUIREMENT: a flight of ${spec.wineCount} needs at least one benchmark wine the candidate should ` +
        `name confidently. The grader recognises a banker by APPELLATION, so at least one wine's text must contain ` +
        `one of these exactly: ${spec.bankerVocabulary.join(", ")}. ` +
        `A great wine from outside this list does not count as the banker — include one from the list as well.`
    );
  }
  if (spec.requireWorldMix) {
    lines.push("");
    // Naming the countries, not just the categories. This rule was the single largest source of
    // first-draft rejections in a live run (8 of 18 violations), every one reading "this flight is
    // entirely Old-World" — and repairs kept failing because "reach for an inter-world contrast" is
    // a category, not a choice. The banker rule had exactly this shape until it was given a
    // vocabulary; the grader recognises specific country names, so the prompt lists them.
    lines.push(
      `OLD/NEW WORLD MIX (this is checked, and it is the most common reason a flight is rejected): ` +
        `at least ONE wine must name a New-World country and at least ONE must name an Old-World country.`
    );
    lines.push(`  New World, as the grader recognises it: ${[...NEW_WORLD_COUNTRIES].join(", ")}`);
    lines.push(`  Old World, as the grader recognises it: ${[...OLD_WORLD_COUNTRIES].join(", ")}`);
    lines.push(
      `  The country must appear in the wine's own text. Before you output, read your ${spec.wineCount} wine ` +
        `lines and confirm at least one from each list is present — an all-European flight is the ` +
        `default mistake, and real ${spec.family} flights mix worlds ~60%+ of the time (EK-0099).`
    );
  }
  return lines.join("\n");
}
```

---

## `019_generation_attempt_timeouts.sql` — preserved, deliberately NOT added to `migrations/`

Applied to production 2026-08-03 17:00 UTC via a preview build; the ledger row exists
(checksum `4b3a44eae25c7b17`, which this file still matches exactly).

It is NOT restored to `study-app/migrations/` because `019_attempt_app_version.sql` already
holds that number on master. The numbering gate would reject the collision, and its suggested
fix — renumber to the next free number — is WRONG here: the ledger keys on filename, so a
rename reads as a brand-new migration and the runner would re-apply this DDL to production.
Both constraints cannot be satisfied, so the file lives here as the record of what ran.

```sql
-- Migration 019: record the timeout configuration on each generation attempt.
--
-- Migration 018 made validator rejections measurable. It did not make TRANSPORT failures measurable,
-- and those turned out to be the larger problem: benchmarking showed the successful-call latency
-- distribution topping out at exactly the per-call cap (the signature of a censored distribution),
-- with the Opus arm — which every first draft uses — timing out on 12 of 15 calls. The measured
-- "first-pass rate" was substantially counting calls that never returned a question at all.
--
-- Tuning those caps is now an ongoing exercise, so the caps themselves belong in the data. With
-- these columns, comparing two timeout configurations is a GROUP BY rather than an archaeology
-- exercise over created_at ranges, and prompt_version stays free to mean what it says — a change to
-- the prompt, not to the transport.
--
-- Additive only — safe to run repeatedly.

ALTER TABLE generation_attempts ADD COLUMN IF NOT EXISTS call_timeout_ms INTEGER;
ALTER TABLE generation_attempts ADD COLUMN IF NOT EXISTS budget_ms       INTEGER;

-- The tuning query is "failure rate by model and cap", so index the grouping.
CREATE INDEX IF NOT EXISTS idx_generation_attempts_timeouts
  ON generation_attempts (call_timeout_ms, model);
```
