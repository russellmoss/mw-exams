import { samplePaperComposition, type PaperComposition } from "./live-tasting-paper";
import {
  claimFlightPosition,
  createLiveTastingPaper,
  getPaperSessions,
  getQuestionById,
  getUnservableQuestionIds,
  linkSessionToPaper,
  releaseFlightPosition,
  retireUnlinkedSession,
  type LiveTastingPaper,
  type LiveTastingSession,
} from "./db";
import {
  createLiveTasting,
  buildByoGuidance,
  FAMILY_TO_ARCHETYPE,
  BYO_FAMILIES,
  anchorVarietiesForPaper,
  anchorRegionsForPaper,
  type ArchetypeId,
} from "./live-tasting-engine";
import { detectPrimaryVariety } from "./question-rules.mjs";
import type { ProgressEmitter } from "./thinking-stream";

/**
 * Live Tasting full-paper engine (Phase D, migration 046).
 *
 * A paper is composition-first: the corpus sampler fixes families/flight-sizes/budgets, then
 * each flight is generated as an ordinary Live Tasting session (all the blind/partner/grading
 * machinery reused) linked by paper_id + position. Generation is CLIENT-CHAINED — one flight per
 * request, the page loops "generate next" until complete — because 3-5 flights at ~2-4 minutes
 * each can never fit one serverless invocation.
 */

export function liveTastingPaperId(): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36])
    .join("");
  return `ltpr_${rand}`;
}

export async function createPaper(opts: {
  userId: number;
  apiKey: string;
  paper: number;
  size: "half" | "full";
  mode: "pick-for-me" | "byo";
  pacing: "flight-by-flight" | "exam-conditions";
  totalBudget: number | null;
  budgetCurrency: string | null;
  city: string;
  country: string;
}): Promise<{ paper: LiveTastingPaper } | { error: string }> {
  const composition = samplePaperComposition({
    paper: opts.paper,
    size: opts.size,
    totalBudget: opts.totalBudget,
  });

  // BYO papers get ONE brief covering every flight, so the partner shops once. Built from the
  // sampled composition — the candidate never chose (or sees) the families.
  let prepGuidance: string | null = null;
  if (opts.mode === "byo") {
    try {
      const sections: string[] = [];
      // Anchors drawn WITHOUT replacement so flights can never share a variety/region spine —
      // the first real BYO paper had Nebbiolo anchoring two of three flights because briefs
      // were written blind to each other.
      const varietyPool = shuffleInPlace(anchorVarietiesForPaper(opts.paper));
      const regionPool = shuffleInPlace(anchorRegionsForPaper(opts.paper));
      const used: string[] = [];
      for (const c of composition) {
        const fam = BYO_FAMILIES[c.family] ?? BYO_FAMILIES.F1;
        // F1/F7 anchor on a variety; F2 anchors on a region; F3/F4/F5/F6 get no pin but the
        // avoid list still steers them off earlier anchors.
        const anchor =
          c.family === "F1" || c.family === "F7"
            ? { variety: varietyPool.pop() }
            : c.family === "F2"
              ? { region: regionPool.pop() }
              : null;
        if (anchor?.variety) used.push(anchor.variety);
        if (anchor?.region) used.push(anchor.region);
        sections.push(
          await buildByoGuidance({
            paper: opts.paper,
            family: c.family,
            flightSize: c.flightSize,
            budgetAmount: c.perBottleBudget,
            budgetCurrency: opts.budgetCurrency,
            city: opts.city,
            country: opts.country,
            apiKey: opts.apiKey,
            userId: opts.userId,
            anchor,
            avoid: used.filter((u) => u !== anchor?.variety && u !== anchor?.region).join(", ") || null,
            omitTitle: true,
          }).then((g) => `## Flight ${c.position} — ${fam.label} (${c.flightSize} wines)\n\n${g}`)
        );
      }
      prepGuidance = sections.join("\n\n---\n\n");
    } catch (err) {
      return { error: err instanceof Error ? err.message : "Could not write the shopping brief." };
    }
  }

  const paper = await createLiveTastingPaper({
    id: liveTastingPaperId(),
    userId: opts.userId,
    paper: opts.paper,
    size: opts.size,
    mode: opts.mode,
    pacing: opts.pacing,
    totalBudget: opts.totalBudget,
    budgetCurrency: opts.budgetCurrency,
    city: opts.city,
    country: opts.country,
    composition,
    prepGuidance,
  });
  return { paper };
}

export function paperComposition(paper: LiveTastingPaper): PaperComposition[] {
  const c = typeof paper.composition === "string" ? JSON.parse(paper.composition) : paper.composition;
  return Array.isArray(c) ? (c as PaperComposition[]) : [];
}

/** Cross-flight dedup context: bank ids + dominant varieties already used in this paper. */
function exclusionsFrom(sessions: LiveTastingSession[]): {
  excludeWineKeys: Set<string>;
  excludeVarieties: Set<string>;
} {
  const keys = new Set<string>();
  const varieties = new Set<string>();
  for (const s of sessions) {
    const avail = (s.availability ?? {}) as {
      slots?: { wineKey?: string; label?: string; region?: string; country?: string }[];
    };
    for (const slot of avail.slots ?? []) {
      if (slot.wineKey) keys.add(slot.wineKey);
      // The variety set was created-but-never-populated (caught reviewing the first real BYO
      // paper): resolve each used wine's dominant grape so later flights can't re-anchor on it.
      const v = detectPrimaryVariety(`${slot.label ?? ""}. ${slot.region ?? ""}, ${slot.country ?? ""}.`);
      if (v && v !== "unknown" && !v.endsWith("blend")) varieties.add(v);
    }
  }
  return { excludeWineKeys: keys, excludeVarieties: varieties };
}

// Distinct question architectures, rotated by paper position (paper-QA round 5). Each is a real
// pattern from the 2023-24 corpus; rotating guarantees no two flights clone a scaffold.
const SCAFFOLD_ROTATION = [
  "Use real skeleton 1: per-wine only — 'For each wine:' with a/b/c in multiplier notation (identification, quality-in-context, plus a micro-state part where the category fits).",
  "Use real skeleton 2: pooled-open — 'With reference to all wines:' pooled identification (14-18 marks), 'Then for each wine:' analysis parts in multiplier notation.",
  "Use real skeleton 3: per-wine analysis first ('For each wine: Discuss the quality, winemaking, and style'), closing with a pooled comparative part ('For both/all wines: Compare and contrast …' 20-30 marks).",
];

function shuffleInPlace<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generate the next missing flight of a pick-for-me paper. One flight per call (the client
 * chains). Returns done=true when every flight exists.
 */
export async function generateNextFlight(opts: {
  paper: LiveTastingPaper;
  apiKey: string;
  emit?: ProgressEmitter;
  keepAlive?: (work: Promise<unknown>) => void;
}): Promise<{ done: boolean; position?: number; sessionId?: string; busy?: boolean } | { error: string }> {
  const { paper, apiKey, emit, keepAlive } = opts;
  if (paper.mode !== "pick-for-me") return { error: "BYO papers get their wines from the partner entry, not generation." };

  const composition = paperComposition(paper);
  const children = await getPaperSessions(paper.id);

  // A position counts as BUILT only if its flight is servable. Until 2026-08-07 the check was "a session
  // exists", so a quarantined question left the position permanently occupied: `next` skipped it, the
  // unique index refused a second link, and the candidate had a dead flight no UI could clear. The
  // 20:40 UTC audit sweep created exactly that on a live paper.
  //
  // Reclaim only what nobody has acted on. A flight whose shopping list has been opened, shared, entered
  // or graded may already be BOTTLES ON A TABLE — silently swapping its wines is worse than surfacing the
  // problem, so those keep their position and the paper API reports them as unservable for an explicit
  // rebuild (POST .../flight/[position]/rebuild).
  const untouched = (c: LiveTastingSession) =>
    !c.user_revealed_at && !c.share_token_hash && !c.token_first_used_at && !c.attempt_id && !c.graded_at && !c.entered_wines;
  const unservable = await getUnservableQuestionIds(children.map((c) => c.question_id));
  const reclaim = children.filter((c) => c.question_id && unservable.has(c.question_id) && untouched(c));
  for (const c of reclaim) {
    // Unlink first: the position must be free before the replacement flight can take the unique index.
    emit?.({ type: "status", label: `Flight ${c.paper_position} failed validation — rebuilding it…` });
    await retireUnlinkedSession(c.id);
  }
  const reclaimed = new Set(reclaim.map((c) => c.id));
  const have = new Set(children.filter((c) => !reclaimed.has(c.id)).map((c) => c.paper_position));
  const next = composition.find((c) => !have.has(c.position));
  if (!next) return { done: true };

  // Claim the position before spending 40-90s of Opus on it (migration 058). Concurrent callers all
  // compute the same `next` — the client re-POSTs whenever its SSE loop misses a terminal frame, and a
  // reload or a second tab does the same — which is how paper ltpr_egt9dfy3e got three sessions and
  // three billed generations on position 4. `busy` is NOT an error: the flight is being built by
  // whoever holds the claim, so the caller waits and re-reads rather than starting a rival generation.
  if (!(await claimFlightPosition(paper.id, next.position))) {
    return { done: false, position: next.position, busy: true };
  }

  emit?.({ type: "status", label: `Building flight ${next.position} of ${composition.length}…` });
  const { excludeWineKeys, excludeVarieties } = exclusionsFrom(children);
  // Scaffold variety across the paper: hand this flight the earlier stems (condensed).
  const priorStems: string[] = [];
  for (const c of children) {
    if (!c.question_id) continue;
    const q = await getQuestionById(c.question_id);
    if (q?.question_text) priorStems.push(`Q${c.paper_position}: ${q.question_text.slice(0, 400)}`);
  }

  // P3 genre mix (paper-QA round 6): "Paper 3 always mixes still, sparkling, and sometimes
  // fortified" — a sparkling+fortified half paper with no still wines fails the examiner judge.
  // Steer categories: never repeat one already used, and if the LAST flight is being built with
  // no still-wine flight yet, require still_sweet. (Soft preferences in the picker — a thin bank
  // degrades to a repeat rather than a failed paper.)
  let p3RequireCategory: string | undefined;
  let p3ExcludeCategories: string[] | undefined;
  if (paper.paper === 3) {
    const usedCats = children
      .map((s) => {
        const label = ((s.availability ?? {}) as { archetypeLabel?: string }).archetypeLabel ?? "";
        const m = label.match(/^(.+) styles compared$/);
        return m ? m[1].replace(/ /g, "_") : "";
      })
      .filter(Boolean);
    // Real P3 papers always mix STILL wines with the special categories, so the last flight is
    // forced still (dry or sweet) when no still flight exists yet; otherwise just avoid repeats.
    const isLastFlight = children.length === composition.length - 1;
    const hasStill = usedCats.some((c) => c === "still_sweet" || c === "still_dry");
    if (isLastFlight && !hasStill) p3RequireCategory = Math.random() < 0.5 ? "still_dry" : "still_sweet";
    else p3ExcludeCategories = usedCats;
  }

  const outcome = await createLiveTasting({
    userId: paper.user_id,
    apiKey,
    paper: paper.paper,
    flightSize: next.flightSize,
    city: paper.city,
    country: paper.country,
    budgetAmount: next.perBottleBudget,
    budgetCurrency: paper.budget_currency,
    emit,
    keepAlive,
    requireArchetype: (FAMILY_TO_ARCHETYPE[next.family] ?? "mixed-variety") as ArchetypeId,
    excludeWineKeys,
    excludeVarieties,
    p3RequireCategory,
    p3ExcludeCategories,
    deprioritizeArchetypes: new Set(children.map((c) => c.archetype).filter((a): a is string => Boolean(a))),
    // Global wine numbering (paper-QA round 8): each flight numbered its wines locally, so Q1 and
    // Q2 both opened "Wines 1-3…" — the judge read that as the same wines reused. Real papers
    // number continuously (Q2 covers wines 4-6).
    paperWineOffset: composition.filter((c) => c.position < next.position).reduce((s, c) => s + c.flightSize, 0),
    paperWineTotal: composition.reduce((s, c) => s + c.flightSize, 0),
    // Round 5: "vary your structure" alone still produced clone scaffolds (round-4 judge:
    // "structurally near-identical clones"). Rotate a NAMED architecture per position so two
    // flights can never share one, and keep prior stems visible as the differ-from list.
    paperStemsContext: [
      ...priorStems,
      `SCAFFOLD DIRECTIVE for this question: ${SCAFFOLD_ROTATION[(next.position - 1) % SCAFFOLD_ROTATION.length]}`,
    ].join("\n"),
  });
  if ("error" in outcome) {
    // Release the claim so the candidate's retry starts immediately instead of waiting out the TTL.
    await releaseFlightPosition(paper.id, next.position);
    return { error: outcome.error ?? "Flight generation failed." };
  }

  // The unique index is the guarantee behind the claim: if a stale-claim takeover (or any future
  // caller that skips the claim) linked this position first, the loser retires its own session rather
  // than leaving an orphan pointing at a paper slot it doesn't own.
  if (!(await linkSessionToPaper(outcome.session.id, paper.id, next.position))) {
    await retireUnlinkedSession(outcome.session.id);
    return { done: false, position: next.position, busy: true };
  }
  return { done: next.position === composition.length ? (await getPaperSessions(paper.id)).length === composition.length : false, position: next.position, sessionId: outcome.session.id };
}
