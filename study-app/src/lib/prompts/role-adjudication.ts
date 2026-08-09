// role-adjudication.ts — the shared contract for ruling on a banker/curveball dispute.
//
// TWO CALLERS, ONE CONTRACT. A role dispute reaches a model by one of two routes:
//
//   · filed WITH a rejection → the feedback analysis adjudicates it inline, because that prompt is
//     already carrying the flight, the corpus and the empirical knowledge, and paying ~$1.58 a second
//     time to look at the same evidence would be waste;
//   · filed WITHOUT one (a reviewer approving a question but correcting a role) → wine-role-rulings.ts
//     batches it into its own call.
//
// Both must rule the same way on the same claim. Two prompts that drift would make the verdict depend
// on whether the reviewer happened to also press Reject, which is not a property anyone would choose.
// So the rules, the evidence and the output line live here, and both callers render them.
//
// Pure: no database, no SDK. Reads one JSON file (the corpus) the same way the rest of the prompt
// layer does.

import { readFileSync } from "fs";
import { join } from "path";
import { bankerSignalTable, describePattern } from "@/lib/banker-signals";

export type RulingVerdictDecided = "upheld" | "overruled" | "inconclusive";
export type ProposedEdit =
  | "add_signal"
  | "remove_signal"
  | "narrow_signal"
  | "add_exclusion"
  | "none";

/** The minimum a claim needs to be adjudicable. Shared by both call sites. */
export interface RoleDisputeForPrompt {
  id: number;
  questionId: string;
  slot: number;
  reviewerName?: string | null;
  wineLabel: string | null;
  variety: string | null;
  region: string | null;
  country: string | null;
  keyedRole: "banker" | "curveball";
  claimedRole: "banker" | "curveball";
}

function norm(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

// ── The corpus: how the Institute has actually used this class of wine ────────────────────────────

interface CorpusWine {
  year: number;
  paper: number;
  producer: string;
  wine_name: string;
  country: string;
  region: string;
  benchmark_status: string;
  question_role: string;
  curveball_level: string;
}

let corpusCache: CorpusWine[] | null = null;

function corpus(): CorpusWine[] {
  if (corpusCache) return corpusCache;
  // One inline, statically-scoped read — see the long note in banker-signals.ts. A path assembled via
  // a helper or carrying a `".."` is opaque to Turbopack's tracer and makes it pull the whole parent
  // tree into the serverless bundle. scripts/sync-stem-data.mjs puts the file here at prebuild.
  try {
    corpusCache = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "historical_wine_classification.json"), "utf8")
    ) as CorpusWine[];
    return corpusCache;
  } catch {
    // fall through to the degraded path below
  }
  // Unlike banker_signals.json this degrades rather than breaking: an adjudication without the corpus
  // is weaker but still runs, and refusing to adjudicate would strand every dispute indefinitely. The
  // absence is stated in the rendered evidence so the model knows to be correspondingly cautious.
  console.warn(
    "[role-adjudication] historical_wine_classification.json not found — ruling without corpus evidence"
  );
  corpusCache = [];
  return corpusCache;
}

/** Test seam. */
export function resetCorpusCache(): void {
  corpusCache = null;
}

export interface CorpusEvidence {
  matched: number;
  benchmarkStatus: Record<string, number>;
  /** 'benchmark_anchor' is the corpus's word for a banker. */
  questionRole: Record<string, number>;
  curveballLevel: Record<string, number>;
  examples: string[];
  /** How the match was made. A region match is far stronger evidence than a country one. */
  basis: "region" | "country+variety" | "country" | "none";
}

/**
 * What the ten-year corpus says about the disputed wine's class.
 *
 * The match is reported alongside its BASIS rather than silently widened. "Six Rioja wines, five of
 * them benchmark anchors" and "sixty Spanish wines, mixed" are very different pieces of evidence, and
 * a model shown only the second number reads a weak signal as a strong one. Region first, then
 * country+variety, then country — and `basis: "none"` when nothing matched, which is itself
 * informative: an origin the exam has never poured is not a banker.
 */
export function corpusEvidenceFor(w: {
  region: string | null;
  country: string | null;
  variety: string | null;
}): CorpusEvidence {
  const rows = corpus();
  const region = norm(w.region);
  const country = norm(w.country);
  const variety = norm(w.variety);

  const tally = (matches: CorpusWine[], basis: CorpusEvidence["basis"]): CorpusEvidence => {
    const count = (key: keyof CorpusWine) =>
      matches.reduce<Record<string, number>>((acc, r) => {
        const v = String(r[key] ?? "unknown");
        acc[v] = (acc[v] ?? 0) + 1;
        return acc;
      }, {});
    return {
      matched: matches.length,
      benchmarkStatus: count("benchmark_status"),
      questionRole: count("question_role"),
      curveballLevel: count("curveball_level"),
      examples: matches
        .slice(0, 6)
        .map(
          (r) =>
            `${r.year} P${r.paper}: ${r.producer} ${r.wine_name} (${r.region}, ${r.country}) — ` +
            `${r.benchmark_status}, role ${r.question_role}, curveball ${r.curveball_level}`
        ),
      basis,
    };
  };

  if (region) {
    const byRegion = rows.filter((r) => {
      const rr = norm(r.region);
      return rr && (rr.includes(region) || region.includes(rr));
    });
    if (byRegion.length > 0) return tally(byRegion, "region");
  }
  if (country && variety) {
    const byCV = rows.filter(
      (r) => norm(r.country) === country && norm(`${r.wine_name} ${r.producer}`).includes(variety)
    );
    if (byCV.length > 0) return tally(byCV, "country+variety");
  }
  if (country) {
    const byCountry = rows.filter((r) => norm(r.country) === country);
    if (byCountry.length > 0) return tally(byCountry, "country");
  }
  return tally([], "none");
}

export function renderCorpusEvidence(e: CorpusEvidence): string {
  if (e.matched === 0) {
    return (
      "NO PRECEDENT. This origin appears nowhere in the 540 wines the IMW has actually poured across " +
      "ten years of papers. That is strong evidence AGAINST calling it a banker — a candidate cannot " +
      "anchor on a wine the exam has never set — and it is NOT, by itself, evidence that the wine is " +
      "unsuitable as a curveball."
    );
  }
  const dist = (d: Record<string, number>) =>
    Object.entries(d)
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k} ${n}`)
      .join(", ");
  const basisNote = {
    region: "matched on REGION — the strongest available match",
    "country+variety": "matched on COUNTRY + VARIETY — the region itself has no corpus precedent",
    country: "matched on COUNTRY ONLY — weak; treat these counts as background, not as a verdict",
    none: "no match",
  }[e.basis];
  return [
    `${e.matched} matching wines in the real corpus (${basisNote}).`,
    `  benchmark_status: ${dist(e.benchmarkStatus)}`,
    `  question_role:    ${dist(e.questionRole)}   <- "benchmark_anchor" is the corpus's word for a banker`,
    `  curveball_level:  ${dist(e.curveballLevel)}`,
    ...e.examples.map((x) => `  - ${x}`),
  ].join("\n");
}

// ── The rules, identical for both callers ─────────────────────────────────────────────────────────

export const ROLE_RULING_LINE_FORMAT =
  "RoleRuling: id=<id> verdict=<upheld|overruled|inconclusive> edit=<add_signal|narrow_signal|remove_signal|add_exclusion|none> signal=<signal-id-or-none> - <one or two sentences of reasoning citing the evidence you used>";

/**
 * The adjudication rules.
 *
 * The load-bearing paragraph is the one that says the default is NOT deference. Two examiner-grade
 * reviewers ruling from memory, at speed, across hundreds of questions will sometimes be wrong, and a
 * loop that upholds everything is an expensive way to overwrite a measured calibration with one
 * person's recall of it. The upheld:overruled ratio is the only evidence that this is adjudication
 * rather than rubber-stamping.
 */
export function roleAdjudicationRules(): string {
  return `## RULING ON THE BANKER / CURVEBALL DISPUTES

A BANKER is a classic benchmark expression that gives a well-prepared MW candidate a reliable route to
the wine's COUNTRY from the glass — the anchor that establishes a flight's baseline. A CURVEBALL is
everything else. Every MW flight of 3+ wines needs at least one banker; an all-curveball flight is
unfairly hard and reads as un-MW.

THE TEST IS REACHABILITY, NOT FAME, PRICE OR QUALITY. A wine can be superb, expensive and famous and
still be a curveball, because the question is whether a candidate tasting it blind arrives at its
origin. This is why a bare regional Mendoza Malbec is NOT a banker (EK-0029, STRONG SIGNAL): a flight's
anchor has to be a wine the candidate knows cold at classified/benchmark level — a Bordeaux classed
growth, a Barolo, a 1er Cru Burgundy, a Rioja Gran Reserva, a Marlborough Sauvignon.

YOUR DEFAULT IS TO UPHOLD THE EXISTING CALIBRATION, NOT THE REVIEWER. Their judgement is why this loop
exists — but they are ruling from memory, at speed, across hundreds of questions, and the calibration
they are disputing was itself measured against the real corpus. A claim must be SUPPORTED by the
evidence, not merely asserted by someone qualified to assert it. OVERRULE is an expected and
respectable outcome; a run that upholds everything has adjudicated nothing.

- To uphold "this is a BANKER": the origin needs real precedent as an anchor — corpus rows showing
  benchmark_anchor / benchmark_classic / iconic_benchmark usage, or an appellation so canonical that
  its absence is plainly a sampling gap (e.g. Chablis Grand Cru).
- To uphold "this is a CURVEBALL": you need a reason the current signal is too broad — a colour it
  should not cover (Chateauneuf-du-Pape Blanc under a rouge-calibrated signal), a non-noble variety
  from a famous region (Alsace Sylvaner, EK-0131), or a quality tier the region's fame does not carry
  down to (a generic regional bottling under a signal calibrated on classified wines).
- OVERRULE when the reviewer is generalising from one bottle, when the claim contradicts corpus usage,
  or when it would widen a signal until unreachable wines start counting as anchors.
- INCONCLUSIVE when the evidence genuinely does not settle it. Prefer this to a coin-flip: an
  inconclusive ruling costs a human two minutes, a wrong upheld ruling rewrites the calibration that
  every future flight is built against and invalidates banked questions that were correct.

WHEN YOU UPHOLD, NAME THE NARROWEST EDIT THAT FIXES IT:
- add_signal    - the origin is a banker and nothing covers it. Prefer a variety-gated signal; a bare
                  region match promotes every oddity from that region too.
- narrow_signal - a signal is right in general but too broad for this wine; add a variety gate or a
                  colour exclusion. USUALLY THE RIGHT ANSWER for a "should be a curveball" claim,
                  because removing the signal outright would demote the wines it correctly catches.
- remove_signal - the whole signal is wrong. Rare; needs the corpus to show the origin is not used as
                  an anchor at all.
- add_exclusion - record the wine class in the "deliberately not bankers" list so future rulings and
                  the generator both see the reasoning. Use alongside narrow_signal / remove_signal.

OUTPUT — one line per claim, at the very end of your internal section, exactly this shape:

${ROLE_RULING_LINE_FORMAT}

Emit one line for EVERY claim, in order, even when you overrule. Never invent a corpus statistic; if
the evidence is thin, say so and rule inconclusive.`;
}

/** The current calibration, as the adjudicator needs to see it: signals and deliberate exclusions. */
export function renderCalibrationForAdjudication(): string {
  const table = bankerSignalTable();
  const signals = table.signals
    .map((s) => {
      const variety = s.variety ? ` [only as ${describePattern(s.variety)}]` : "";
      const exclude = s.exclude ? ` [NOT ${describePattern(s.exclude)}]` : "";
      return `- ${s.id}: ${describePattern(s.region)}${exclude}${variety}`;
    })
    .join("\n");
  const exclusions = table.notCounted.map((e) => `- ${e.id} (${e.label}): ${e.why}`).join("\n");
  return `### The current banker calibration (data/banker_signals.json)
Each line is a signal id and the origins it matches. A wine matching none of them scores CURVEBALL.

${signals}

### Deliberately NOT counted as bankers, with the reason each exclusion was recorded
Several of these exist because an earlier claim was checked and rejected. A dispute that would undo one
must engage with the stated reason, not merely disagree with the conclusion.

${exclusions}`;
}

/** The claims themselves, each with its own corpus evidence. */
export function renderRoleClaims(disputes: RoleDisputeForPrompt[]): string {
  return disputes
    .map((d, i) => {
      const evidence = corpusEvidenceFor(d);
      return [
        `### Claim ${i + 1} - ruling id=${d.id}`,
        `Wine: ${d.wineLabel ?? "(label unavailable)"}`,
        `Resolved as: ${[d.variety, d.region, d.country].filter(Boolean).join(" / ") || "(unresolved)"}`,
        `From question ${d.questionId}, slot ${d.slot}.`,
        `The system currently reads this wine as: ${d.keyedRole.toUpperCase()}`,
        `${d.reviewerName ?? "The reviewer"} says it is: ${d.claimedRole.toUpperCase()}`,
        ``,
        `Corpus evidence:`,
        renderCorpusEvidence(evidence),
      ].join("\n");
    })
    .join("\n\n");
}

/** The whole block, ready to append to a prompt that is already carrying the flight. */
export function roleDisputeBlock(disputes: RoleDisputeForPrompt[]): string {
  if (disputes.length === 0) return "";
  return [
    roleAdjudicationRules(),
    "",
    renderCalibrationForAdjudication(),
    "",
    `### The ${disputes.length} claim${disputes.length === 1 ? "" : "s"} to adjudicate`,
    "",
    renderRoleClaims(disputes),
  ].join("\n");
}

/** The batch adjudicator's system prompt — the same rules, standing alone. */
export function buildRoleAdjudicationSystemPrompt(): string {
  return [
    "You adjudicate BANKER vs CURVEBALL disputes for a Master of Wine practical-exam question bank.",
    "Two examiner-grade reviewers are working through the bank one question at a time; when one of",
    "them disagrees with how a wine has been classified for flight balance, the claim comes to you.",
    "",
    roleAdjudicationRules(),
  ].join("\n");
}

// ── Parsing the verdict ───────────────────────────────────────────────────────────────────────────

export interface ParsedRuling {
  id: number;
  verdict: RulingVerdictDecided;
  edit: ProposedEdit;
  signal: string | null;
  rationale: string;
}

const VERDICTS = new Set<string>(["upheld", "overruled", "inconclusive"]);
const EDITS = new Set<string>([
  "add_signal",
  "narrow_signal",
  "remove_signal",
  "add_exclusion",
  "none",
]);

/**
 * Pull the machine-readable rulings out of a response.
 *
 * Anything that does not parse is DROPPED, never guessed at. A malformed line leaves its ruling at
 * 'pending' — visible in the admin queue, picked up by the next batch — whereas inferring a verdict
 * from the surrounding prose would let a paragraph explaining why a claim is WEAK be recorded as an
 * upheld ruling that edits the calibration. The caller compares the ids it got back against the ids it
 * sent, so a dropped line surfaces as "considered but unruled" rather than as silence.
 */
export function parseRoleRulings(text: string): ParsedRuling[] {
  const out: ParsedRuling[] = [];
  const seen = new Set<number>();
  const re =
    /RoleRuling:\s*id=(\d+)\s+verdict=([a-z]+)\s+edit=([a-z_]+)\s+signal=(\S+)\s*[—–-]+\s*(.+)/gi;
  for (const m of text.matchAll(re)) {
    const id = Number(m[1]);
    const verdict = m[2].toLowerCase();
    const edit = m[3].toLowerCase();
    if (!VERDICTS.has(verdict) || !EDITS.has(edit)) continue;
    // First line wins. A restated id is a formatting slip, not a change of mind — and taking the last
    // one would let a stray example line in the prose override the real verdict.
    if (seen.has(id)) continue;
    seen.add(id);
    const signal = m[4].toLowerCase().replace(/[.,;]$/, "");
    out.push({
      id,
      verdict: verdict as RulingVerdictDecided,
      edit: edit as ProposedEdit,
      signal: signal === "none" || signal === "-" ? null : m[4].replace(/[.,;]$/, ""),
      rationale: m[5].trim(),
    });
  }
  return out;
}
