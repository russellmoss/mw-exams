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
