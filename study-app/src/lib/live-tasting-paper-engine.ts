import { samplePaperComposition, type PaperComposition } from "./live-tasting-paper";
import {
  createLiveTastingPaper,
  getPaperSessions,
  linkSessionToPaper,
  type LiveTastingPaper,
  type LiveTastingSession,
} from "./db";
import {
  createLiveTasting,
  buildByoGuidance,
  FAMILY_TO_ARCHETYPE,
  BYO_FAMILIES,
  type ArchetypeId,
} from "./live-tasting-engine";
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
      for (const c of composition) {
        const fam = BYO_FAMILIES[c.family] ?? BYO_FAMILIES.F1;
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
    const avail = (s.availability ?? {}) as { slots?: { wineKey?: string }[] };
    for (const slot of avail.slots ?? []) if (slot.wineKey) keys.add(slot.wineKey);
  }
  return { excludeWineKeys: keys, excludeVarieties: varieties };
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
  });
  if ("error" in outcome) return { error: outcome.error ?? "Flight generation failed." };

  await linkSessionToPaper(outcome.session.id, paper.id, next.position);
  return { done: next.position === composition.length ? (await getPaperSessions(paper.id)).length === composition.length : false, position: next.position, sessionId: outcome.session.id };
}
