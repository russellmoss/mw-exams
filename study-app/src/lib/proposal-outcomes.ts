// proposal-outcomes.ts — did a shipped root-cause fix actually make its fault go away?
//
// The bin-fix miner has shipped 21 proposals and has never once been told whether any of them
// worked. That is not a small gap: it is how fifteen rules accumulated while the measured reject
// rate went 34% -> 42%. A loop that only ever adds is not a loop.
//
// WHAT THIS CAN AND CANNOT MEASURE — the design is shaped by the data, not by what would be nicest.
//
// NOT SUPPORTED: per-proposal first-pass rate before/after. Daily first-pass swings 12% -> 55% -> 17%
// on generation volumes that fall from 605/day to 20/day, and 21 ships land inside four days. Any
// before/after window is dominated by that noise and by whatever else shipped the same day. Emitting
// a number here would manufacture precision, which is the failure this module exists to correct — so
// the report states the limitation instead of printing a delta nobody should act on.
//
// THE PRIMARY SIGNAL IS RULE PERSISTENCE. generation_attempts.rules_fired names the rule that
// rejected each draft, per attempt, with a timestamp. A fix aimed at a fault should make its rule
// fire LESS. A rule still firing at the same rate after a fix shipped for it did not work, whatever
// the PR said. Directly attributable, no causal hand-waving, and it needs no mapping from proposal
// text to code.
//
// THEME RECURRENCE IS A WEAK SECONDARY, AND KNOWING WHY IT IS WEAK MATTERS MORE THAN THE SIGNAL.
// The intuition is sound — if the miner proposes the same fault again after a fix shipped, the fix
// missed. Two things defeat it in practice:
//
//   1. The miner is INSTRUCTED not to duplicate an existing proposal's theme. So the clearest
//      evidence a fix failed is exactly what the prompt suppresses. The detector looks for something
//      the system prevents from being written down.
//   2. Themes are 80-character model-written prose, and a restatement rarely reuses the words.
//      Measured on a real pair — #3 "Flight has no banker and/or too many curveballs" (shipped
//      2026-08-06) and #23 "Banker status judged by grape variety alone" (raised 2026-08-09), the
//      same fault three days later — token containment scores 0.20. No threshold that catches this
//      avoids matching unrelated themes.
//
// So a "no recurrence" result is NOT evidence a fix held, and outcomeLabel below says "not validated"
// rather than anything reassuring. Recurrence is reported when found, because a hit is meaningful
// even though a miss is not.

/** Words carrying no discriminating power between proposal themes. */
const THEME_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "in", "on", "at", "to", "for", "with", "without",
  "is", "are", "was", "were", "be", "been", "that", "this", "these", "those", "not", "no",
  "flight", "flights", "question", "questions", "wine", "wines", "paper", "papers",
  "must", "should", "when", "where", "which", "from", "into", "than", "then", "but",
]);

export function themeTokens(theme: string): Set<string> {
  return new Set(
    (theme || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter((t) => t.length > 2 && !THEME_STOPWORDS.has(t))
  );
}

/**
 * How much two themes overlap, 0..1 — the share of the SMALLER theme's tokens present in the larger.
 *
 * Containment rather than Jaccard on purpose: themes are truncated to 80 characters, so a later
 * proposal restating an earlier fault more specifically ("Banker status judged by grape variety
 * alone") is a subset of the broader original ("Flight has no banker and/or too many curveballs"),
 * and Jaccard would score that pair low precisely when it matters most.
 */
export function themeOverlap(a: string, b: string): number {
  const ta = themeTokens(a);
  const tb = themeTokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let hits = 0;
  for (const t of small) if (large.has(t)) hits++;
  return hits / small.size;
}

export interface ProposalRow {
  id: number | string;
  theme: string;
  kind: string;
  status: string;
  /** When the fix landed. retired_at is the ledger's ship stamp; null while a proposal is in flight. */
  shippedAt: string | null;
  createdAt: string;
}

export interface Recurrence {
  /** The shipped proposal whose fault came back. */
  proposalId: string;
  theme: string;
  shippedAt: string;
  /** Proposals raised AFTER it shipped that restate the same fault. */
  recurredAs: { proposalId: string; theme: string; createdAt: string; overlap: number }[];
}

/**
 * Shipped proposals whose fault was re-proposed afterwards.
 *
 * A later proposal counts as a recurrence when its theme overlaps a shipped one by `threshold` AND it
 * was raised after that one shipped. 0.5 by default — half the shorter theme's meaningful tokens —
 * which is loose enough to catch a restatement and tight enough that two unrelated banker/marks
 * themes do not collide. Tune with evidence, not by taste; the report prints the overlap so a wrong
 * threshold is visible rather than silent.
 */
export function findRecurrences(proposals: ProposalRow[], threshold = 0.5): Recurrence[] {
  const shipped = proposals.filter((p) => p.status === "shipped" && p.shippedAt);
  const out: Recurrence[] = [];
  for (const s of shipped) {
    const later = proposals.filter(
      (p) =>
        String(p.id) !== String(s.id) &&
        // Raised after this one shipped — a proposal predating the fix is not evidence it failed.
        new Date(p.createdAt).getTime() > new Date(s.shippedAt!).getTime() &&
        themeOverlap(s.theme, p.theme) >= threshold
    );
    if (later.length === 0) continue;
    out.push({
      proposalId: String(s.id),
      theme: s.theme,
      shippedAt: s.shippedAt!,
      recurredAs: later
        .map((p) => ({
          proposalId: String(p.id),
          theme: p.theme,
          createdAt: p.createdAt,
          overlap: Number(themeOverlap(s.theme, p.theme).toFixed(2)),
        }))
        .sort((a, b) => b.overlap - a.overlap),
    });
  }
  return out;
}

export interface RuleWindow {
  rule: string;
  /** Attempts the rule fired on, and total attempts, in each window. Rates are per-attempt. */
  beforeFired: number;
  beforeTotal: number;
  afterFired: number;
  afterTotal: number;
}

export interface RuleTrend extends RuleWindow {
  beforeRate: number;
  afterRate: number;
  /** afterRate - beforeRate, in percentage points. Negative = firing less. */
  deltaPp: number;
  /** False when either window is too thin to read. Never suppressed — surfaced, so it can be judged. */
  reliable: boolean;
}

/**
 * Rate change for each rule across a cut point, with an explicit reliability flag.
 *
 * MIN_WINDOW is what stops this becoming the thing it replaces. Generation volume is bursty — 605
 * attempts one day, 20 the next — so a rule "firing 100% less" can mean five attempts happened. Below
 * the floor the row still prints, marked unreliable, because hiding it would look like the rule was
 * fine rather than unmeasured.
 */
export function ruleTrends(windows: RuleWindow[], minWindow = 50): RuleTrend[] {
  return windows
    .map((w) => {
      const beforeRate = w.beforeTotal > 0 ? w.beforeFired / w.beforeTotal : 0;
      const afterRate = w.afterTotal > 0 ? w.afterFired / w.afterTotal : 0;
      return {
        ...w,
        beforeRate: Number((beforeRate * 100).toFixed(1)),
        afterRate: Number((afterRate * 100).toFixed(1)),
        deltaPp: Number(((afterRate - beforeRate) * 100).toFixed(1)),
        reliable: w.beforeTotal >= minWindow && w.afterTotal >= minWindow,
      };
    })
    .sort((a, b) => b.afterRate - a.afterRate);
}

/**
 * The one-line outcome label for a proposal, as the miner sees it in its prompt.
 *
 * Kept deliberately blunt. The miner's existing-proposals block previously read "[shipped] theme",
 * which presents twenty-one rows as a track record; the whole point of this module is that shipping
 * is not evidence, so the label says what is actually known.
 */
export function outcomeLabel(p: ProposalRow, recurrences: Recurrence[]): string {
  if (p.status !== "shipped") return p.status;
  const rec = recurrences.find((r) => r.proposalId === String(p.id));
  // "not validated", never "no recurrence seen" — the detector's misses are uninformative (see the
  // header), so the absence of a hit must not read as a pass. This label is the whole reason the
  // module exists: twenty-one rows saying "[shipped]" presented as a track record nobody had earned.
  if (!rec) return "shipped — NOT VALIDATED (nothing has measured whether the fault stopped)";
  const ids = rec.recurredAs.map((r) => `#${r.proposalId}`).join(", ");
  return `shipped — DID NOT HOLD, fault re-proposed as ${ids}`;
}
