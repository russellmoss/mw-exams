// question-review-shared.ts — the half of the Question Review domain that the BROWSER is allowed to
// have: the reason-chip vocabulary, the payload shapes, and the pure validators.
//
// This file must stay free of `fs`, `path` and the Neon driver, directly and transitively. The
// server half (question-review.ts) reaches the database and pulls in db.ts, so a client component
// importing from it drags the Neon driver into the browser bundle and the production build fails
// with "Module not found: Can't resolve 'fs'" — green on tsc and vitest, red on Vercel. That split
// is enforced by tests/client-server-boundary.test.ts, which is what caught it here.
//
// Client components import from THIS module. Server code imports from question-review.ts, which
// re-exports everything below so there is still a single import site on that side.

export interface ReviewReasonOption {
  value: string;
  label: string;
  /** Shown on hover — these are experts, but the short-codes are ours, not theirs. */
  hint: string;
}

// Five of these are the SAME short-codes the "Bin with reason" panel uses (src/lib/bin-reasons.ts),
// deliberately: the root-cause miner clusters bins and feedback on these tags, so reusing the codes
// means an expert's down-vote lands in the same cluster as a candidate's bin for the same fault
// rather than starting a parallel vocabulary that never joins up.
//
// Three are new, and they exist because the most consequential defect in this bank is not "the stem
// is bad" but a MISMATCH between the question's parts — the answer key contradicting the model
// answer, or wines that don't serve the stem. One undifferentiated "thumbs down" blob loses exactly
// the distinction the generator most needs.
//
// Deliberately omitted from the bin vocabulary: wrong_paper, wrong_colour_for_paper, duplicate_wine.
// All three are caught mechanically by the hard validator and already shown on the card as a
// verdict, so spending a chip slot — and an expert's attention — on them buys no signal.
export const REVIEW_REASON_OPTIONS: readonly ReviewReasonOption[] = [
  { value: "factually_wrong", label: "Factually wrong", hint: "A wine, region or production claim is untrue" },
  { value: "answer_key_wrong", label: "Answer is wrong", hint: "The model answer or key contradicts the wines" },
  { value: "bad_wine_choice", label: "Wines don't fit", hint: "The flight doesn't serve what the stem asks" },
  { value: "not_realistic", label: "Not exam-realistic", hint: "The IMW would not set this" },
  { value: "weak_stem", label: "Weak stem", hint: "Vague, leading, or badly worded" },
  { value: "wrong_marks", label: "Wrong marks", hint: "Mark allocation doesn't match the task" },
  { value: "too_easy", label: "Too easy", hint: "No discrimination between candidates" },
  { value: "too_obscure", label: "Too obscure", hint: "Unfair even for a strong candidate" },
] as const;

export const REVIEW_REASON_LABELS: Record<string, string> = Object.fromEntries(
  REVIEW_REASON_OPTIONS.map((o) => [o.value, o.label])
);

// ── Per-wine role disputes ───────────────────────────────────────────────────────────────────────
//
// The most repeated judgement these reviewers make is not about the stem, it is about a WINE'S ROLE:
// "a flight like this would likely have a banker", "three out of four are curveballs, normally you'd
// see one, two at best". Until now that arrived as prose inside reason_note, was read by a human, and
// was hand-transcribed into a regex table. Several entries in data/banker_signals.json still carry a
// reviewer's name in their note because that is how they got there.
//
// A role dispute is therefore captured as DATA, per wine, at vote time. It is deliberately independent
// of the verdict: a reviewer may approve a question whose wines are fine but whose keyed roles are
// wrong, and that correction is worth just as much to the generator as a rejection.
//
// ONLY DISAGREEMENTS ARE STORED. A wine the reviewer left alone records nothing, because "they did not
// flip it" and "they inspected it and agreed" are different claims and we can only observe the first.
// Treating silence as endorsement would feed the calibration evidence it has not earned.

export type WineRole = "banker" | "curveball";

export interface RoleOverride {
  slot: number;
  /** What the answer key / signal table said at vote time. Snapshotted — the calibration changes. */
  keyed: WineRole;
  /** What the reviewer says it is. Always the opposite of `keyed`; equal values are dropped. */
  reviewer: WineRole;
}

export function isWineRole(v: unknown): v is WineRole {
  return v === "banker" || v === "curveball";
}

/**
 * Coerce a request body into a clean override list.
 *
 * Drops anything malformed, anything for a slot mentioned twice, and — importantly — any entry where
 * the reviewer's call MATCHES the keyed role. That last one is not defensive tidying: a no-op override
 * would create a `wine_role_rulings` row asserting a claim nobody made, which then costs an
 * adjudication and pollutes the calibration evidence.
 */
export function sanitizeRoleOverrides(raw: unknown): RoleOverride[] | null {
  if (!Array.isArray(raw)) return null;
  const bySlot = new Map<number, RoleOverride>();
  for (const item of raw) {
    const r = (item ?? {}) as Record<string, unknown>;
    const slot = Number(r.slot);
    if (!Number.isInteger(slot) || slot < 1) continue;
    if (!isWineRole(r.keyed) || !isWineRole(r.reviewer)) continue;
    if (r.keyed === r.reviewer) continue;
    bySlot.set(slot, { slot, keyed: r.keyed, reviewer: r.reviewer });
  }
  const out = [...bySlot.values()].sort((a, b) => a.slot - b.slot);
  return out.length > 0 ? out : null;
}

/**
 * The role a card should show for a wine before anyone touches it.
 *
 * `role` on the card comes from the answer key where the generator DECLARED it and the classifier
 * agreed (stem-answer-key.mjs stamps a role only on agreement). Where they disagreed the key holds no
 * role at all — and a blank chip is exactly the wine a reviewer most needs to rule on, so it falls
 * back to the derived classification rather than rendering nothing.
 */
export function displayedRole(w: { role: string | null; derivedRole?: string | null }): WineRole | null {
  if (isWineRole(w.role)) return w.role;
  if (isWineRole(w.derivedRole)) return w.derivedRole;
  return null;
}

export const MAX_REVIEW_NOTE_CHARS = 2000;

export function sanitizeReviewTags(tags: unknown): string[] | null {
  if (!Array.isArray(tags)) return null;
  const known = new Set(REVIEW_REASON_OPTIONS.map((o) => o.value));
  const out = tags.filter((t): t is string => typeof t === "string" && known.has(t));
  return out.length > 0 ? Array.from(new Set(out)) : null;
}

export function sanitizeReviewNote(note: unknown): string | null {
  if (typeof note !== "string") return null;
  const trimmed = note.trim().slice(0, MAX_REVIEW_NOTE_CHARS);
  return trimmed.length > 0 ? trimmed : null;
}

// ── Blocks: one paper × family at a time ─────────────────────────────────────────────────────────
//
// The review walk is grouped so a reviewer settles into one question type instead of being thrown
// between a Paper 1 same-variety flight and a Paper 3 fortified style question on consecutive cards.
// Judging exam-realism needs a frame of reference, and the frame IS the paper and the family.

export const REVIEW_PAPERS = [1, 2, 3] as const;

/** Canonical family order. The default walk is papers ascending, families in THIS order. */
export const REVIEW_FAMILIES = ["F1", "F2", "F3", "F4", "F5", "F6", "F7"] as const;

export const FAMILY_LABELS: Record<string, string> = {
  F1: "Same variety",
  F2: "Same origin",
  F3: "Blend logic",
  F4: "Mixed breadth",
  F5: "Method / production",
  F6: "Style mechanism",
  F7: "Quality hierarchy",
};

export const PAPER_LABELS: Record<number, string> = {
  1: "Whites",
  2: "Reds",
  3: "Mixed / special",
};

export function familyLabel(family: string): string {
  return FAMILY_LABELS[family] ?? family;
}

export type ReviewOrder = "grouped" | "random";

export interface ReviewFilter {
  papers: number[];
  families: string[];
  order: ReviewOrder;
}

/** Everything, in the fixed P1 F1 → P3 F7 walk. What a reviewer gets before they touch the filter. */
export const DEFAULT_REVIEW_FILTER: ReviewFilter = {
  papers: [...REVIEW_PAPERS],
  families: [...REVIEW_FAMILIES],
  order: "grouped",
};

/**
 * Coerce anything (a stored JSONB blob, a request body) into a usable filter.
 *
 * An EMPTY selection is treated as "all", never as "nothing". A reviewer who unticks the last paper
 * should see the whole bank again, not an empty queue that looks identical to having finished it —
 * those two states are indistinguishable on screen and one of them is alarming.
 */
export function sanitizeReviewFilter(raw: unknown): ReviewFilter {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const papers = Array.isArray(obj.papers)
    ? obj.papers.map(Number).filter((p) => (REVIEW_PAPERS as readonly number[]).includes(p))
    : [];
  const families = Array.isArray(obj.families)
    ? obj.families.filter(
        (f): f is string => typeof f === "string" && (REVIEW_FAMILIES as readonly string[]).includes(f)
      )
    : [];

  return {
    papers: papers.length > 0 ? Array.from(new Set(papers)).sort() : [...REVIEW_PAPERS],
    families:
      families.length > 0
        ? REVIEW_FAMILIES.filter((f) => families.includes(f))
        : [...REVIEW_FAMILIES],
    order: obj.order === "random" ? "random" : "grouped",
  };
}

/** True when the filter selects the whole bank — used to label the UI honestly. */
export function isDefaultFilter(f: ReviewFilter): boolean {
  return (
    f.papers.length === REVIEW_PAPERS.length &&
    f.families.length === REVIEW_FAMILIES.length &&
    f.order === "grouped"
  );
}

/** One paper × family group, with this reviewer's standing in it. */
export interface ReviewBlock {
  paper: number;
  family: string;
  familyLabel: string;
  /** Servable questions in this block, regardless of who has reviewed them. */
  total: number;
  /** How many of them this reviewer has ruled on. */
  done: number;
  remaining: number;
  // The verdict split, read from the database rather than accumulated in the browser: a reviewer who
  // resumes a half-finished block mid-week would otherwise be shown a completion tally covering only
  // today's votes, which reads as though the earlier ones were lost.
  up: number;
  down: number;
  skipped: number;
}

export type ReviewVerdict = "up" | "down" | "skip";

export function isReviewVerdict(v: unknown): v is ReviewVerdict {
  return v === "up" || v === "down" || v === "skip";
}

// Structural mirrors of Violation / QuestionVerdict from question-validator.ts. Declared here rather
// than imported because that module's graph reaches the database. question-review.ts asserts at
// compile time that the real types are still assignable to these, so the two cannot drift silently.
export interface ReviewViolation {
  rule: string;
  severity: "hard" | "soft";
  detail: string;
}

export interface ReviewVerdictReport {
  ok: boolean;
  hard: ReviewViolation[];
  soft: ReviewViolation[];
}

export interface ReviewCardWine {
  slot: number;
  text: string;
  variety: string | null;
  region: string | null;
  country: string | null;
  vintage: string | null;
  /** From the answer key: whether this slot is the flight's banker or its curveball. */
  role: string | null;
  /**
   * The signal table's own classification (isBanker), shown when the key holds no role — which
   * happens precisely when the generator and the classifier disagreed, i.e. on the wines whose role
   * is most in doubt and most worth a reviewer's call.
   */
  derivedRole: WineRole | null;
  /** Which line of data/banker_signals.json made it a banker. null on a curveball. */
  bankerSignalId: string | null;
}

export interface ReviewCard {
  id: string;
  paper: number;
  family: string;
  familyLabel: string;
  stem: string;
  totalMarks: number;
  wines: ReviewCardWine[];
  /** The generator's own deliberation — why these wines, why this stem. The examiner intent. */
  reasoningTrace: string | null;
  /** The examiner-style annotation written alongside the question. */
  examinerIntent: string | null;
  modelAnswer: string | null;
  timesServed: number;
  curveball: string | null;
  createdAt: string | null;
  /** Live hard/soft validator findings. null = no answer key yet, so no verdict is available. */
  verdict: ReviewVerdictReport | null;
  /**
   * Set when this question has been REPAIRED since a reviewer last ruled on it — a wine was swapped
   * after an upheld role ruling and the question rebuilt around the corrected flight.
   *
   * The card must say so. A reviewer handed a question they already rejected, with no indication that
   * anything moved, will reasonably reject it again on the strength of their own earlier reasoning —
   * and the repair loop would then read that as "the fix did not work" when what actually happened is
   * that nobody told them there was a fix.
   */
  repair: {
    count: number;
    at: string | null;
    /** Plain-language summary of what changed, e.g. "Wine 3: Somló Furmint → Tokaji Furmint". */
    note: string | null;
  } | null;
}

export interface ReviewProgress {
  /** Votes this reviewer has cast (up + down + skip). Never decreases. */
  done: number;
  /** Servable questions this reviewer hasn't ruled on yet. */
  remaining: number;
  /** done + remaining. */
  total: number;
  up: number;
  down: number;
  skipped: number;
}

/**
 * One reviewer's headline numbers, shown to BOTH reviewers.
 *
 * Counts only — never a verdict, never a question id. Knowing the other reviewer is 200 in cannot
 * anchor your judgement on the question in front of you; knowing they rejected that question would.
 */
export interface ReviewerStanding {
  reviewerId: number;
  name: string;
  done: number;
  remaining: number;
}

export interface Disagreement {
  questionId: string;
  paper: number;
  stem: string;
  votes: {
    reviewerId: number;
    reviewerName: string;
    verdict: ReviewVerdict;
    note: string | null;
    tags: string[] | null;
  }[];
}
