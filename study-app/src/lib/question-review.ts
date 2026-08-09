// question-review.ts — the Question Review surface: a two-expert rapid pass over the servable bank.
//
// Two named reviewers (users.can_review_questions, migration 066) go through the banked questions
// one at a time and give each a thumbs up or a thumbs down. This module owns the queue, the vote,
// and the disagreement set.
//
// THE KEY DESIGN DECISION: a thumbs-down does not get its own feedback store. It writes a
// user_attempts row tagged source='question_review' and hands it to the EXISTING pipeline —
// runFeedbackAnalysis -> verdict -> notification bell -> rebuttal thread -> quarantine-or-not. So a
// reviewer's ruling gets adjudicated, narrated, contestable and mined for root causes for free, and
// there is exactly one place in the codebase that decides what feedback means.
//
// A thumbs-up is NOT symmetric and deliberately costs nothing: it writes the endorsement columns
// (migration 057) directly, so the question becomes a generation exemplar without an LLM call.

import { neon } from "@neondatabase/serverless";
import { getAnswerKeyGroundTruths, type GeneratedQuestion } from "@/lib/db";
// The SAME gate the candidate serve path runs. Imported rather than reimplemented so the reviewer and
// the candidate can never be shown different sets — see applyServeGate below.
import { bankedServeRejection } from "@/lib/question-engine";
import { getAppVersion } from "@/lib/app-version";
import { verdictFromGroundTruth, type QuestionVerdict } from "@/lib/question-verdict";
import {
  REVIEW_REASON_LABELS,
  DEFAULT_REVIEW_FILTER,
  familyLabel,
  sanitizeReviewFilter,
  type ReviewBlock,
  type ReviewCard,
  type ReviewFilter,
  type ReviewOrder,
  type ReviewProgress,
  type ReviewVerdict,
  type ReviewViolation,
  type ReviewVerdictReport,
  type ReviewerStanding,
  type Disagreement,
} from "@/lib/question-review-shared";
import type { Violation } from "@/lib/question-validator";

// The client half. Re-exported so server code has a single import site, while client components
// import from question-review-shared directly — this module reaches the database, and anything a
// "use client" file imports is bundled for the browser (tests/client-server-boundary.test.ts).
export * from "@/lib/question-review-shared";

// Compile-time proof that the browser-safe mirrors still match the real validator types. If a field
// is added to Violation, this stops compiling instead of the card silently dropping it.
const _violationShapeMatches: ReviewViolation = null as unknown as Violation;
const _verdictShapeMatches: ReviewVerdictReport = null as unknown as QuestionVerdict;
void _violationShapeMatches;
void _verdictShapeMatches;

function db() {
  return neon(process.env.DATABASE_URL!);
}

// ── The servable set ─────────────────────────────────────────────────────────────────────────────
//
// Exactly the predicate the candidate-facing bank read uses (getQuestionsByFilter in db.ts), plus
// is_retired: review time should be spent only on questions a candidate can actually be served.
// A missing answer-key row does NOT exclude — keys derive ~30s after generation, so unkeyed is not
// known-bad.
//
// Written once and taken by table alias so the queue, the countdown and the standings cannot drift
// apart — three copies of this predicate that disagree would mean a reviewer's "N to go" never
// reaches zero, or reaches it early.
function servableWhere(alias = "generated_questions"): string {
  return `
    ${alias}.invalid_reasons IS NULL
    AND ${alias}.review_state = 'kept'
    AND ${alias}.is_retired IS NOT TRUE
    AND ${alias}.scope = 'pool'
    AND NOT EXISTS (
      SELECT 1 FROM stem_answer_keys k
      WHERE k.question_id = ${alias}.question_id AND k.validated = false
    )
  `;
}
const SERVABLE_WHERE = servableWhere();

// ── Queue order ──────────────────────────────────────────────────────────────────────────────────
//
// GROUPED (the default): the twenty-one paper × family blocks walked in a fixed sequence, P1 F1
// through P3 F7, so the reviewer settles into one question type instead of being thrown between a
// Paper 1 same-variety flight and a Paper 3 fortified style question on consecutive cards.
//
// Within a block, most-served first: if a reviewer only gets halfway through P1 F1, those should be
// the ones candidates have actually been hitting, not an arbitrary half. question_id breaks ties so
// the order is TOTAL — without it, two rows with equal served_count and created_at could swap places
// between fetches and the reviewer would see one card twice and never see the other.
//
// RANDOM: a shuffle that is stable per reviewer. md5(question_id || reviewer_id) is deterministic, so
// re-fetching mid-session returns the same order rather than reshuffling the remaining pile — which
// would do exactly the double-show/skip thing the tie-breaker above exists to prevent. Keying on the
// reviewer as well means the two of them get different orders, so their passes aren't correlated.
//
// served_count and times_served hold identical values on all 942 rows (verified 2026-08-08).
// served_count is the one on the GeneratedQuestion interface, so it is the one used here.
function queueOrder(order: ReviewOrder, reviewerParam: string): string {
  if (order === "random") {
    return `ORDER BY md5(generated_questions.question_id || ${reviewerParam}::text)`;
  }
  // Paper × family grouping is the point of this order — the walk works one block at a time and the
  // UI renders a block-complete interstitial against it. What is NOT the point is the old
  // `created_at DESC` tiebreaker, which sorted a block into GENERATION BATCHES: questions written
  // seconds apart by one run arrived back to back, so a reviewer met four variations on one idea in a
  // row. Mike Juergens binned gen_p1_F2_1786074180419 with "this is the same as the question I just
  // saw and rejected" — and it was not the same question (that one was Spanish, this one three
  // Marlborough whites), it was the next card off the same batch with the same shape.
  //
  // The tiebreaker is now a per-reviewer hash, which interleaves batches while staying deterministic —
  // this queue has no cursor and relies on a stable order to resume where the reviewer left off.
  // served_count still leads, so the questions candidates actually meet are still reviewed first.
  return `ORDER BY generated_questions.paper,
                  generated_questions.family,
                  generated_questions.served_count DESC NULLS LAST,
                  md5(generated_questions.question_id || ${reviewerParam}::text),
                  generated_questions.question_id`;
}

/** The filter as SQL, appended to the servable predicate. Values are bound, never interpolated. */
function filterClause(alias: string, papersParam: string, familiesParam: string): string {
  return `AND ${alias}.paper = ANY(${papersParam}) AND ${alias}.family = ANY(${familiesParam})`;
}

/** Read the reviewer's stored selection, falling back to "everything, grouped". */
export async function getReviewFilter(reviewerId: number): Promise<ReviewFilter> {
  const sql = db();
  const rows = await sql`SELECT review_filter FROM users WHERE id = ${reviewerId}`;
  return sanitizeReviewFilter(rows[0]?.review_filter ?? null);
}

export async function saveReviewFilter(
  reviewerId: number,
  filter: ReviewFilter
): Promise<ReviewFilter> {
  const clean = sanitizeReviewFilter(filter);
  const sql = db();
  await sql`
    UPDATE users SET review_filter = ${JSON.stringify(clean)}::jsonb WHERE id = ${reviewerId}
  `;
  return clean;
}

/**
 * Every paper × family block in the walk, in order, with this reviewer's standing in each.
 *
 * Returns blocks the FILTER selects, including ones already finished (done = total, remaining = 0) —
 * the UI needs those to render a walk with ticks against what's complete, and the block-complete
 * interstitial needs to know what comes next.
 *
 * Block sizes are very uneven and that is a property of the bank, not a bug: P3 F6 holds 93 of the
 * 511 because Paper 3 is the style-mechanism paper, while P3 F3 holds 2.
 */
export async function getReviewBlocks(
  reviewerId: number,
  filter: ReviewFilter
): Promise<ReviewBlock[]> {
  const sql = db();
  const rows = (await sql.query(
    `
    SELECT g.paper, g.family,
      count(*)                                        AS total,
      count(r.id)                                     AS done,
      count(*) FILTER (WHERE r.verdict = 'up')        AS up,
      count(*) FILTER (WHERE r.verdict = 'down')      AS down,
      count(*) FILTER (WHERE r.verdict = 'skip')      AS skipped
    FROM generated_questions g
    LEFT JOIN question_reviews r
      ON r.question_id = g.question_id AND r.reviewer_id = $1
    WHERE ${servableWhere("g")}
      ${filterClause("g", "$2", "$3")}
    GROUP BY g.paper, g.family
    ORDER BY g.paper, g.family
    `,
    [reviewerId, filter.papers, filter.families]
  )) as unknown as Record<string, unknown>[];

  return rows.map((r) => {
    const total = Number(r.total ?? 0);
    const done = Number(r.done ?? 0);
    return {
      paper: Number(r.paper),
      family: String(r.family),
      familyLabel: familyLabel(String(r.family)),
      total,
      done,
      remaining: Math.max(0, total - done),
      up: Number(r.up ?? 0),
      down: Number(r.down ?? 0),
      skipped: Number(r.skipped ?? 0),
    };
  });
}

/**
 * The reviewer's countdown.
 *
 * `total` is `|servable ∪ already-reviewed-by-me|`, not `|servable|`. That union matters: this
 * reviewer's own down-vote can get its question quarantined by the analysis that follows, which
 * removes it from the servable set. Counting only the servable set would make `done` fall as the
 * reviewer works — a progress bar that runs backwards while you use it.
 */
export async function getReviewProgress(reviewerId: number): Promise<ReviewProgress> {
  const sql = db();
  const rows = await sql.query(
    `
    WITH mine AS (
      SELECT verdict FROM question_reviews WHERE reviewer_id = $1
    ),
    left_to_do AS (
      SELECT 1 FROM generated_questions
      WHERE ${SERVABLE_WHERE}
        AND NOT EXISTS (
          SELECT 1 FROM question_reviews r
          WHERE r.question_id = generated_questions.question_id AND r.reviewer_id = $1
        )
    )
    SELECT
      (SELECT count(*) FROM mine)                            AS done,
      (SELECT count(*) FROM left_to_do)                      AS remaining,
      (SELECT count(*) FROM mine WHERE verdict = 'up')       AS up,
      (SELECT count(*) FROM mine WHERE verdict = 'down')     AS down,
      (SELECT count(*) FROM mine WHERE verdict = 'skip')     AS skipped
    `,
    [reviewerId]
  );
  const r = (rows as unknown as Record<string, string>[])[0] ?? {};
  const done = Number(r.done ?? 0);
  const remaining = Number(r.remaining ?? 0);
  return {
    done,
    remaining,
    total: done + remaining,
    up: Number(r.up ?? 0),
    down: Number(r.down ?? 0),
    skipped: Number(r.skipped ?? 0),
  };
}

/**
 * Every reviewer's countdown, so each can see how the other is getting on.
 *
 * COUNTS ONLY — never which way anyone voted, and never on which question. That distinction is what
 * keeps this compatible with voting blind: knowing Mike is 200 in tells you nothing that could
 * anchor your verdict on the question in front of you, whereas knowing he rejected THIS one tells
 * you everything. The Disagreements view is the only place a vote becomes visible to the other
 * reviewer, and only after both have already committed.
 */
export async function getReviewerStandings(): Promise<ReviewerStanding[]> {
  const sql = db();
  const rows = await sql.query(
    `
    SELECT u.id, u.name,
      (SELECT count(*) FROM question_reviews r WHERE r.reviewer_id = u.id) AS done,
      (SELECT count(*) FROM generated_questions g
        WHERE ${servableWhere("g")}
          AND NOT EXISTS (
            SELECT 1 FROM question_reviews r2
            WHERE r2.question_id = g.question_id AND r2.reviewer_id = u.id
          )
      ) AS remaining
    FROM users u
    WHERE u.can_review_questions = true AND u.is_active IS NOT false
    ORDER BY u.id
    `,
    []
  );
  return (rows as unknown as Record<string, unknown>[]).map((r) => ({
    reviewerId: Number(r.id),
    name: (r.name as string) ?? "Reviewer",
    done: Number(r.done ?? 0),
    remaining: Number(r.remaining ?? 0),
  }));
}

/**
 * What this reviewer's down-votes have cost in Opus calls since UTC midnight.
 *
 * Every down-vote triggers one immediate feedback analysis, which is a real Opus call against a real
 * key. That is a deliberate product choice (the reviewer gets a verdict while the question is still
 * fresh and can rebut it), but "deliberate" and "invisible" are different things — this project cut
 * bulk generation after a $1,053 week, and a review sprint that quietly runs up hundreds would be
 * the same mistake in a new costume. So the number goes on screen while they work.
 *
 * MEASURED 2026-08-08: one rejection cost $1.58 (85k input / 4k output on claude-opus-5 — the prompt
 * carries the empirical-knowledge slice, a Tavily fact-check, the model answer and the reasoning
 * trace). Budget from that, not from a guess: a 25%-rejection pass over 511 questions by two
 * reviewers is roughly 255 analyses, or about $400. If that is too much, the lever is
 * selectModel("feedback_analysis", …) rather than anything in this file.
 *
 * Counts every feedback_analysis row for this user today, not only review rejections — feedback left
 * elsewhere in the app lands in the same bucket. Narration (ElevenLabs) is billed separately and is
 * not included, so treat this as the Claude-side floor rather than the total.
 */
export async function getReviewSpendToday(reviewerId: number): Promise<number> {
  const sql = db();
  const rows = await sql`
    SELECT COALESCE(sum(cost_usd), 0) AS spend
    FROM model_usage
    WHERE user_id = ${reviewerId}
      AND task_type = 'feedback_analysis'
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
  `;
  return Number(rows[0]?.spend ?? 0);
}

function parseJson<T>(v: unknown, fallback: T): T {
  if (v == null) return fallback;
  if (typeof v === "string") {
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return v as T;
}

function toCard(q: GeneratedQuestion, groundTruth: unknown[] | undefined): ReviewCard {
  const wines = parseJson<Record<string, unknown>[]>(q.wines, []);
  // The answer key carries the resolved variety/region and the banker/curveball role (migration 064
  // and #118). Zipping it in by slot is what turns "Wine 3: some label" into something a reviewer
  // can rule on without opening a second surface.
  const keyBySlot = new Map(
    (Array.isArray(groundTruth) ? groundTruth : []).map((w) => {
      const rec = w as Record<string, unknown>;
      return [Number(rec.slot), rec] as const;
    })
  );

  return {
    id: q.question_id,
    paper: q.paper,
    family: q.family,
    familyLabel: familyLabel(q.family) || q.family_label || q.family,
    stem: q.question_text,
    totalMarks: q.total_marks,
    wines: (Array.isArray(wines) ? wines : []).map((w) => {
      const slot = Number(w.slot);
      const key = keyBySlot.get(slot);
      const text = String(w.fullText ?? "");
      const vintageMatch = /\b(19|20)\d{2}\b/.exec(text);
      // The key stores `varieties` as an array (a blend has several); the stored wine JSON, where it
      // carries anything at all, uses the singular `variety`. Prefer the key — it is the resolved,
      // validated truth, and it is what the reviewer is being asked to rule the question against.
      const keyVarieties = Array.isArray(key?.varieties)
        ? (key.varieties as unknown[]).map(String).filter(Boolean)
        : [];
      return {
        slot,
        text,
        variety:
          keyVarieties.length > 0
            ? keyVarieties.join(" / ")
            : ((w.variety as string) ?? null),
        region: (key?.region as string) ?? (w.region as string) ?? null,
        country: (key?.country as string) ?? (w.country as string) ?? null,
        vintage: (w.vintage as string) ?? (vintageMatch ? vintageMatch[0] : null),
        role: (key?.role as string) ?? null,
      };
    }),
    reasoningTrace: q.reasoning_trace ?? null,
    examinerIntent: q.proposed_annotation ?? null,
    modelAnswer: q.model_answer ?? null,
    timesServed: Number(q.served_count ?? 0),
    curveball: q.curveball_level ?? null,
    createdAt: q.created_at ? String(q.created_at) : null,
    verdict: verdictFromGroundTruth(q, groundTruth),
  };
}

/**
 * The next `limit` questions this reviewer hasn't ruled on, in queue order, each fully hydrated.
 *
 * There is no cursor and none is needed: casting a vote (including a skip) writes a question_reviews
 * row, which removes that question from this query's result set. The queue self-advances, so a
 * refetch always resumes exactly where the reviewer left off — including on a different device, and
 * including after they change the filter mid-pass.
 */
export async function getReviewQueue(
  reviewerId: number,
  limit = 12,
  filter: ReviewFilter = DEFAULT_REVIEW_FILTER
): Promise<ReviewCard[]> {
  const sql = db();
  const want = Math.max(1, Math.min(50, limit));
  const rows = (await sql.query(
    `
    SELECT * FROM generated_questions
    WHERE ${SERVABLE_WHERE}
      ${filterClause("generated_questions", "$2", "$3")}
      AND NOT EXISTS (
        SELECT 1 FROM question_reviews r
        WHERE r.question_id = generated_questions.question_id AND r.reviewer_id = $1
      )
    ${queueOrder(filter.order, "$1")}
    LIMIT $4
    `,
    // Over-fetch, because the serve gate below drops rows the SQL predicate cannot see. Twice the page
    // is ample: the gate rejects a few percent of the servable set, so a short page only happens if a
    // whole batch of neighbours is bad, and the next fetch picks up where this one stopped anyway.
    [reviewerId, filter.papers, filter.families, want * 2]
  )) as unknown as GeneratedQuestion[];

  const page = await applyServeGate(rows, want);
  if (page.length === 0) return [];
  // One key fetch for the whole page, not one per card.
  const keys = await getAnswerKeyGroundTruths(page.map((q) => q.question_id));
  return page.map((q) => toCard(q, keys.get(q.question_id)));
}

/**
 * Run the SERVE GATE over a page of queue candidates, and quarantine what it refuses.
 *
 * The reviewer's queue selects on DATABASE COLUMNS (servableWhere above) while the candidate's study
 * path additionally runs bankedServeRejection in-process on every question it is about to serve. So
 * the two disagreed by exactly the questions the gate refuses: a reviewer could be handed a flight no
 * candidate could ever be shown, and spend a vote ruling on it. Closing that by running the same gate
 * here is item 3 of the 2026-08-09 sweep review.
 *
 * IT QUARANTINES RATHER THAN JUST SKIPPING, and that is what keeps the countdown honest. The block
 * standings and the "N to go" counter are SQL COUNTs over the same predicate; if this filtered the page
 * in memory and left the rows servable, the counter would include questions the queue would never hand
 * over and a reviewer's remaining count would never reach zero — the precise drift servableWhere()'s
 * comment exists to prevent. Writing invalid_reasons removes the row from BOTH, and from the
 * candidate-facing pool that was already refusing it at serve time. It is the same write the nightly
 * sweep makes, applied lazily to the handful of rows someone is about to look at.
 *
 * Safe against a bad rule in the way the sweep is: audit-questions.mjs --apply clears a flag whose rule
 * has stopped firing, so a false positive here is undone by the next pass rather than being permanent
 * (the un-quarantine now reaches unkeyed rows too, which is how the R-OW-ANCHOR/Cabernet false positive
 * would have been released without hand-editing).
 */
async function applyServeGate(
  candidates: GeneratedQuestion[],
  want: number
): Promise<GeneratedQuestion[]> {
  const sql = db();
  const kept: GeneratedQuestion[] = [];
  for (const q of candidates) {
    if (kept.length >= want) break; // stop gating once the page is full — the rest are next fetch's
    let reason: string | null = null;
    try {
      reason = bankedServeRejection(q);
    } catch (err) {
      // A throwing rule must not take the review surface down with it. Treat as servable and let the
      // corpus sweep, which runs the same gate with logging, be the one to rule on it.
      console.error(`[review] serve gate threw on ${q.question_id}:`, err);
    }
    if (!reason) {
      kept.push(q);
      continue;
    }
    console.log(`[review] serve gate refused ${q.question_id}: ${reason}`);
    // MERGE, matching the scoped path in audit-questions.mjs: another rule may already have recorded a
    // reason on this row and quarantining for the gate must not erase it.
    const payload = JSON.stringify([{ rule: "serve-gate", severity: "hard", detail: reason }]);
    await sql`
      UPDATE generated_questions SET invalid_reasons = (
        SELECT jsonb_agg(DISTINCT v) FROM jsonb_array_elements(
          (CASE WHEN jsonb_typeof(invalid_reasons) = 'array' THEN invalid_reasons ELSE '[]'::jsonb END)
          || ${payload}::jsonb) v)
      WHERE question_id = ${q.question_id}`;
  }
  return kept;
}

/**
 * Of the question ids a reviewer is holding in their local buffer, which are no longer servable.
 *
 * THE BUFFER GOES STALE THE MOMENT THE CORPUS IMPROVES, and that is the whole problem this solves.
 * The client fetches a page of twelve and tops it up when it runs down to four; the top-up merges by
 * id and only ever ADDS. So a question quarantined mid-session — by a rule that just merged, by the
 * corpus sweep, by the serve gate on someone else's fetch — stays in the reviewer's hand and gets
 * shown to them anyway. During a live session the corpus is being fixed underneath them precisely
 * because of the votes they are casting, which is the moment a stale buffer is most likely and most
 * annoying: they get handed the very defect they just reported, one card later.
 *
 * Called on every vote, so the buffer reconciles continuously rather than at a page refresh. One
 * indexed lookup over at most a page of ids.
 *
 * Returns ids to DROP. Anything unrecognised is dropped too — a question archived out of the table
 * cannot be reviewed either.
 */
export async function staleBufferedIds(reviewerId: number, ids: string[]): Promise<string[]> {
  const wanted = [...new Set(ids)].filter((id) => typeof id === "string" && id).slice(0, 100);
  if (wanted.length === 0) return [];
  const sql = db();
  const rows = (await sql.query(
    `
    SELECT question_id FROM generated_questions
    WHERE question_id = ANY($2)
      AND ${SERVABLE_WHERE}
      AND NOT EXISTS (
        SELECT 1 FROM question_reviews r
        WHERE r.question_id = generated_questions.question_id AND r.reviewer_id = $1
      )
    `,
    [reviewerId, wanted]
  )) as unknown as { question_id: string }[];
  const stillGood = new Set(rows.map((r) => r.question_id));
  return wanted.filter((id) => !stillGood.has(id));
}

// ── Recording a vote ─────────────────────────────────────────────────────────────────────────────

export interface RecordedVote {
  reviewId: number;
  /** The user_attempts row a down-vote created, for the caller to hand to runFeedbackAnalysis. */
  attemptId: number | null;
  /** True when this replaced an earlier vote on the same question by the same reviewer. */
  revote: boolean;
}

/**
 * Compose the feedback text the analyzer will adjudicate.
 *
 * The analyzer's prompt is written for a CANDIDATE's complaint about a question they just sat. This
 * is a different speech act — an examiner-grade reviewer ruling on a question cold — so the text
 * says so up front. Without that framing the analyzer reads "the wines don't fit" as a candidate
 * who found the flight hard, which is close to the opposite of what it means here.
 */
export function composeReviewFeedback(params: {
  reviewerName: string;
  tags: string[] | null;
  note: string | null;
}): string {
  const { reviewerName, tags, note } = params;
  const lines = [
    `[Question Review] ${reviewerName} reviewed this banked question directly (not as a candidate ` +
      `attempt) and rejected it.`,
  ];
  if (tags && tags.length > 0) {
    lines.push(`Fault(s) identified: ${tags.map((t) => REVIEW_REASON_LABELS[t] ?? t).join(", ")}.`);
  }
  if (note) lines.push("", note);
  return lines.join("\n");
}

/**
 * Upsert the reviewer's verdict and carry out its side effect.
 *
 *   up   → endorse the question (migration 057) so it becomes a generation exemplar. No LLM call.
 *   down → create the user_attempts row the caller hands to runFeedbackAnalysis. The question is
 *          NOT quarantined here: the product decision is that the pool never dips on a reviewer's
 *          word alone — only an 'accept' verdict from the analysis quarantines it (apply-change.ts).
 *   skip → recorded and nothing else, so the question leaves this reviewer's queue without becoming
 *          either a complaint or an exemplar.
 *
 * Re-voting is allowed and idempotent on the (question, reviewer) pair. What it does NOT do is
 * retract an analysis a previous down-vote already started: that analysis may already have a verdict
 * and a rebuttal thread attached, and silently deleting a decided ledger row to match a changed mind
 * is how audit trails start lying. Changing down→up leaves the old attempt in place and endorses.
 */
export async function recordReviewVote(params: {
  reviewerId: number;
  reviewerName: string;
  questionId: string;
  verdict: ReviewVerdict;
  tags: string[] | null;
  note: string | null;
  route: string;
}): Promise<RecordedVote> {
  const { reviewerId, reviewerName, questionId, verdict, tags, note, route } = params;
  const sql = db();

  let attemptId: number | null = null;

  if (verdict === "down") {
    const text = composeReviewFeedback({ reviewerName, tags, note });
    // A fresh 'full' row per down-vote. Unlike recordTabFeedback we never attach to or fork an
    // existing attempt: the reviewer did not sit this question, so hanging an expert ruling off some
    // candidate's attempt would mis-attribute it in the admin queue and in History.
    const ins = await sql`
      INSERT INTO user_attempts (
        question_id, user_id, mode, stem_detail, user_feedback, feedback_submitted_at, app_version,
        source, category, scope, route
      ) VALUES (
        ${questionId}, ${reviewerId}, 'full', 'exam_real', ${text}, NOW(), ${getAppVersion()},
        'question_review', 'wrong_misleading', 'question', ${route}
      ) RETURNING id
    `;
    attemptId = (ins[0]?.id as number) ?? null;
  }

  const existing = await sql`
    SELECT id FROM question_reviews
    WHERE question_id = ${questionId} AND reviewer_id = ${reviewerId}
  `;
  const revote = existing.length > 0;

  const rows = await sql`
    INSERT INTO question_reviews (
      question_id, reviewer_id, verdict, reason_tags, reason_note, attempt_id
    ) VALUES (
      ${questionId}, ${reviewerId}, ${verdict},
      ${tags ? JSON.stringify(tags) : null}::jsonb, ${note}, ${attemptId}
    )
    ON CONFLICT (question_id, reviewer_id) DO UPDATE SET
      verdict     = EXCLUDED.verdict,
      reason_tags = EXCLUDED.reason_tags,
      reason_note = EXCLUDED.reason_note,
      -- COALESCE, not EXCLUDED: a re-vote to 'up' must not orphan the attempt whose analysis is
      -- already running (or already decided) from the earlier down-vote.
      attempt_id  = COALESCE(EXCLUDED.attempt_id, question_reviews.attempt_id),
      updated_at  = NOW()
    RETURNING id
  `;

  if (verdict === "up") {
    // Endorsement note: the reviewer's own words when they left any, otherwise a plain statement of
    // provenance. Never fabricate praise the reviewer didn't write — this string is injected into
    // the generation prompt as an exemplar rationale.
    const endorsementNote = note
      ? note.slice(0, 600)
      : `Approved on review by ${reviewerName}.`;
    await sql`
      UPDATE generated_questions SET
        endorsed_at = NOW(),
        endorsement_note = ${endorsementNote},
        endorsement_source = ${`question_review:${reviewerId}`}
      WHERE question_id = ${questionId}
    `;
  } else if (revote) {
    // Was endorsed by this reviewer, now isn't. Clear it so a question they've changed their mind
    // about stops being fed to the generator as an example of good work.
    await sql`
      UPDATE generated_questions SET
        endorsed_at = NULL, endorsement_note = NULL, endorsement_source = NULL
      WHERE question_id = ${questionId}
        AND endorsement_source = ${`question_review:${reviewerId}`}
    `;
  }

  return { reviewId: rows[0].id as number, attemptId, revote };
}

/** Attach the analysis id once runFeedbackAnalysis has created it, so the card can deep-link to it. */
export async function attachAnalysisToReview(reviewId: number, analysisId: number): Promise<void> {
  const sql = db();
  await sql`UPDATE question_reviews SET analysis_id = ${analysisId} WHERE id = ${reviewId}`;
}

// ── Disagreements ────────────────────────────────────────────────────────────────────────────────

/**
 * Questions where the reviewers landed on opposite verdicts — one up, one down.
 *
 * This is the highest-signal set the surface produces, and the reason the two reviewers vote blind:
 * a split between two examiner-grade judges is information that neither an agreement nor a single
 * opinion can give you. Skips are excluded — a skip is an absence of a verdict, not a dissent.
 */
export async function getDisagreements(): Promise<Disagreement[]> {
  const sql = db();
  const rows = (await sql`
    SELECT r.question_id, r.reviewer_id, r.verdict, r.reason_note, r.reason_tags,
           u.name AS reviewer_name, g.paper, g.question_text
    FROM question_reviews r
    JOIN users u ON u.id = r.reviewer_id
    JOIN generated_questions g ON g.question_id = r.question_id
    WHERE r.verdict IN ('up', 'down')
      AND r.question_id IN (
        SELECT question_id FROM question_reviews WHERE verdict IN ('up', 'down')
        GROUP BY question_id
        HAVING count(DISTINCT verdict) > 1
      )
    ORDER BY r.question_id, r.reviewer_id
  `) as Record<string, unknown>[];

  const byQuestion = new Map<string, Disagreement>();
  for (const row of rows) {
    const qid = row.question_id as string;
    if (!byQuestion.has(qid)) {
      byQuestion.set(qid, {
        questionId: qid,
        paper: Number(row.paper),
        stem: row.question_text as string,
        votes: [],
      });
    }
    byQuestion.get(qid)!.votes.push({
      reviewerId: Number(row.reviewer_id),
      reviewerName: (row.reviewer_name as string) ?? "Unknown",
      verdict: row.verdict as ReviewVerdict,
      note: (row.reason_note as string) ?? null,
      tags: parseJson<string[] | null>(row.reason_tags, null),
    });
  }
  return Array.from(byQuestion.values());
}
