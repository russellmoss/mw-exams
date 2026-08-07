import { samplePaperComposition, type PaperComposition } from "./live-tasting-paper";
import {
  createLiveTastingPaper,
  getPaperSessions,
  getQuestionById,
  linkSessionToPaper,
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
}): Promise<{ done: boolean; position?: number; sessionId?: string } | { error: string }> {
  const { paper, apiKey, emit, keepAlive } = opts;
  if (paper.mode !== "pick-for-me") return { error: "BYO papers get their wines from the partner entry, not generation." };

  const composition = paperComposition(paper);
  const children = await getPaperSessions(paper.id);
  const have = new Set(children.map((c) => c.paper_position));
  const next = composition.find((c) => !have.has(c.position));
  if (!next) return { done: true };

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
    const isLastFlight = children.length === composition.length - 1;
    if (isLastFlight && !usedCats.includes("still_sweet")) p3RequireCategory = "still_sweet";
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
    // Round 5: "vary your structure" alone still produced clone scaffolds (round-4 judge:
    // "structurally near-identical clones"). Rotate a NAMED architecture per position so two
    // flights can never share one, and keep prior stems visible as the differ-from list.
    paperStemsContext: [
      ...priorStems,
      `SCAFFOLD DIRECTIVE for this question: ${SCAFFOLD_ROTATION[(next.position - 1) % SCAFFOLD_ROTATION.length]}`,
    ].join("\n"),
  });
  if ("error" in outcome) return { error: outcome.error ?? "Flight generation failed." };

  await linkSessionToPaper(outcome.session.id, paper.id, next.position);
  return { done: next.position === composition.length ? (await getPaperSessions(paper.id)).length === composition.length : false, position: next.position, sessionId: outcome.session.id };
}
