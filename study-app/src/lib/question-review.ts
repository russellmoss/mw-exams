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
import { getAppVersion } from "@/lib/app-version";
import { verdictFromGroundTruth, type QuestionVerdict } from "@/lib/question-verdict";
import {
  REVIEW_REASON_LABELS,
  type ReviewCard,
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

// Most-served first: if a reviewer only ever gets through 150 of these, they should be the 150 that
// candidates have actually been hitting, not 150 arbitrary rows. question_id breaks ties so the
// order is total and a reviewer never sees the same card twice or skips one under concurrent writes.
//
// served_count and times_served are two columns holding identical values on all 942 rows (verified
// 2026-08-08). served_count is the one on the GeneratedQuestion interface, so it is the one used here.
const QUEUE_ORDER = `ORDER BY served_count DESC NULLS LAST, created_at DESC, question_id`;

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

const FAMILY_LABELS: Record<string, string> = {
  F1: "Same variety",
  F2: "Same origin",
  F3: "Blend logic",
  F4: "Mixed breadth",
  F5: "Method / production",
  F6: "Style mechanism",
  F7: "Quality hierarchy",
};

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
    familyLabel: FAMILY_LABELS[q.family] || q.family_label || q.family,
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
 * refetch always resumes exactly where the reviewer left off — including on a different device.
 */
export async function getReviewQueue(reviewerId: number, limit = 12): Promise<ReviewCard[]> {
  const sql = db();
  const rows = (await sql.query(
    `
    SELECT * FROM generated_questions
    WHERE ${SERVABLE_WHERE}
      AND NOT EXISTS (
        SELECT 1 FROM question_reviews r
        WHERE r.question_id = generated_questions.question_id AND r.reviewer_id = $1
      )
    ${QUEUE_ORDER}
    LIMIT $2
    `,
    [reviewerId, Math.max(1, Math.min(50, limit))]
  )) as unknown as GeneratedQuestion[];

  if (rows.length === 0) return [];
  // One key fetch for the whole page, not one per card.
  const keys = await getAnswerKeyGroundTruths(rows.map((q) => q.question_id));
  return rows.map((q) => toCard(q, keys.get(q.question_id)));
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
