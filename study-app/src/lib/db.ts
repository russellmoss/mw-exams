import { neon } from "@neondatabase/serverless";
import { BUNDLED_TASTING_LEXICON, type TastingLexicon } from "./prompts/tasting-lexicon";
import { classifyP3Category } from "./p3-category.mjs";
import {
  deriveQuestionType,
  deriveCurveball,
  deriveFlightPriceBand,
  deriveFlightSize,
} from "./bank-health/derive";
import { getAppVersion } from "./app-version";
import { DEFAULT_PACE_PREFERENCE, isPaceMode, isSpeedSeconds, type PaceData, type PacePreference } from "./pace";

function getDb() {
  const sql = neon(process.env.DATABASE_URL!);
  return sql;
}

export interface GeneratedQuestion {
  id: number;
  question_id: string;
  paper: number;
  family: string;
  family_label: string;
  subcategory: string | null;
  question_text: string;
  // Stem Detail variants (migration 013). NULL until backfilled lazily by /api/get-question;
  // question_text is the canonical fallback for any that is null.
  stem_guided: string | null;
  stem_exam_real: string | null;
  wines: { slot: number; fullText: string; appearance?: string }[];
  total_marks: number;
  // Paper 3 style family (migration 015): sparkling|sweet|fortified|oxidative|rose|other. NULL for
  // Papers 1/2 and for any P3 row not yet backfilled. Server-only — the serve layer strips it from
  // every payload (see sanitizeQuestionMetadata) so the candidate never sees it.
  p3_category: string | null;
  model_answer: string | null;
  proposed_annotation: string | null;
  reasoning_trace: string | null;
  study_diagram_assist: string | null;
  metadata: Record<string, unknown>;
  wine_profiles: Record<string, unknown>;
  created_at: string;
  // Bank review gate (migration 022). 'approved' is the default and the only status ever served to a
  // candidate; 'pending' awaits admin review; 'rejected' was binned. batch_id links a bulk-generated
  // row to its bank_batches run.
  status: string;
  batch_id: string | null;
  reviewed_at: string | null;
  reviewed_by: number | null;
}

export interface UserAttempt {
  id: number;
  question_id: string;
  pre_glass_reasoning: string | null;
  pre_glass_feedback: string | null;
  tasting_notes: string[] | null;
  user_answer: string | null;
  answer_feedback: string | null;
  pass_estimate: "pass" | "fail" | "borderline" | null;
  marks_estimate: string | null;
  started_at: string;
  completed_at: string | null;
  user_feedback: string | null;
  feedback_submitted_at: string | null;
  feedback_status: string | null;
  feedback_admin_note: string | null;
  feedback_reviewed_at: string | null;
  // Who made the accept/reject decision: 'auto' (Auto-Apply pipeline) or 'manual' (admin).
  feedback_decided_by: string | null;
  // Set once feedback analysis has been kicked off (links to feedback_analyses.id). NULL means
  // the feedback was never analyzed — the "stranded" set the sweeper looks for.
  auto_analysis_id: number | null;
  // Flash Notes (mode = 'flash') per-card / per-deck metadata (migration 011). NULL for every
  // other mode.
  prompt_type: string | null;
  flight_wine_count: number | null;
  deck_id: string | null;
  card_index: number | null;
  deck_settings: Record<string, unknown> | null;
  // Stem Detail (migration 013): the level the attempt was STARTED at, and the level it ENDED at if
  // "Add detail" was used (NULL if never escalated).
  stem_detail: string;
  stem_detail_escalated_to: string | null;
  // Pace (migration 021): per-attempt pace report for 'full' / 'known-wine' attempts. NULL for
  // every other mode and for attempts predating the column.
  pace: PaceData | null;
  // Short git sha of the build that served this attempt (migration 019). NULL for local dev and for
  // attempts predating the column. Lets a bug report be pinned to the exact code that produced it.
  app_version: string | null;
}

// Persist derived Stem Detail variants for a question. COALESCE keeps any level that already has a
// stored value, so a concurrent/partial backfill can only ever fill blanks (never overwrite).
export async function updateStemVariants(
  questionId: string,
  variants: { guided?: string | null; exam_real?: string | null }
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE generated_questions SET
      stem_guided    = COALESCE(stem_guided,    ${variants.guided ?? null}),
      stem_exam_real = COALESCE(stem_exam_real, ${variants.exam_real ?? null})
    WHERE question_id = ${questionId}
  `;
}

// Fetch a single question by id. Used by the out-of-band Stem Detail backfill endpoint, which is
// handed only a question_id by the client.
export async function getQuestionById(questionId: string): Promise<GeneratedQuestion | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM generated_questions WHERE question_id = ${questionId} LIMIT 1`;
  return (rows[0] as GeneratedQuestion) ?? null;
}

export async function getUserStemDetailDefault(userId: number): Promise<string> {
  const sql = getDb();
  const rows = await sql`SELECT stem_detail_default FROM users WHERE id = ${userId}`;
  const v = rows[0]?.stem_detail_default;
  // Coerce any legacy/unknown value (including the retired 'blind') to the exam-real default.
  return v === "guided" || v === "exam_real" ? v : "exam_real";
}

export async function setUserStemDetailDefault(userId: number, level: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE users SET stem_detail_default = ${level} WHERE id = ${userId}`;
}

// Pace (migration 021): per-user default pace + Speed Notes length. Falls back to the system
// default (Exam Pace / 8 min) for legacy rows or unrecognised values.
export async function getUserPacePreference(userId: number): Promise<PacePreference> {
  const sql = getDb();
  const rows = await sql`SELECT pace_default, pace_speed_seconds FROM users WHERE id = ${userId}`;
  const pace = rows[0]?.pace_default;
  const speed = Number(rows[0]?.pace_speed_seconds);
  return {
    pace: isPaceMode(pace) ? pace : DEFAULT_PACE_PREFERENCE.pace,
    speedSeconds: isSpeedSeconds(speed) ? speed : DEFAULT_PACE_PREFERENCE.speedSeconds,
  };
}

export async function setUserPacePreference(userId: number, pref: PacePreference): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE users SET pace_default = ${pref.pace}, pace_speed_seconds = ${pref.speedSeconds}
    WHERE id = ${userId}
  `;
}

export async function saveGeneratedQuestion(q: {
  questionId: string;
  paper: number;
  family: string;
  familyLabel: string;
  subcategory?: string;
  questionText: string;
  wines: { slot: number; fullText: string; appearance?: string }[];
  totalMarks: number;
  modelAnswer?: string;
  proposedAnnotation?: string;
  reasoningTrace?: string;
  studyDiagramAssist?: string;
  metadata?: Record<string, unknown>;
  // Who generated it (migration 020). Global pool — this is provenance only, never a serve filter.
  createdByUserId?: number | null;
  // Bank review gate (migration 022). Omitted → DB default 'approved' (the on-the-fly study path is
  // pre-validated and served immediately). The Fill-the-Bank worker passes 'pending' + a batchId so
  // the row is held out of every candidate-facing read until an admin approves it. The ON CONFLICT
  // path deliberately never touches status/batch_id, so a background model-answer re-save can't flip
  // a pending question live.
  status?: string;
  batchId?: string | null;
}): Promise<GeneratedQuestion> {
  const sql = getDb();
  // Tag Paper 3 questions with their style family at insert (pure code, no LLM) so the weighted
  // sampler can serve them on-mix from the moment they land in the bank. Papers 1/2 stay NULL.
  const p3Category = q.paper === 3 ? classifyP3Category(q.wines) : null;
  // Bank Health slicing dimensions (migration 026), stamped at write time so the SQL GROUP BY slices
  // stay accurate for every new row. Re-derived here from the exact stem/wines/metadata being stored,
  // using the same logic migration 026 used to backfill the historical rows.
  const questionType = deriveQuestionType(q.questionText);
  const curveball = deriveCurveball(q.metadata);
  const priceBand = deriveFlightPriceBand(q.wines);
  const flightSize = deriveFlightSize(q.wines);
  const rows = await sql`
    INSERT INTO generated_questions (
      question_id, paper, family, family_label, subcategory,
      question_text, wines, total_marks, p3_category,
      model_answer, proposed_annotation, reasoning_trace, study_diagram_assist,
      metadata, created_by_user_id, status, batch_id, review_state,
      question_type, curveball, price_band, flight_size
    ) VALUES (
      ${q.questionId}, ${q.paper}, ${q.family}, ${q.familyLabel}, ${q.subcategory || null},
      ${q.questionText}, ${JSON.stringify(q.wines)}, ${q.totalMarks}, ${p3Category},
      ${q.modelAnswer || null}, ${q.proposedAnnotation || null},
      ${q.reasoningTrace || null}, ${q.studyDiagramAssist || null},
      ${JSON.stringify(q.metadata || {})}, ${q.createdByUserId ?? null},
      ${q.status ?? "approved"}, ${q.batchId ?? null},
      ${q.status === "pending" ? "pending" : q.status === "rejected" ? "binned" : "kept"},
      ${questionType}, ${curveball}, ${priceBand}, ${flightSize}
    )
    ON CONFLICT (question_id) DO UPDATE SET
      -- Keep an existing tag; only fill it if the row predates classification (COALESCE keeps the
      -- stored value when EXCLUDED is NULL, e.g. the background model-answer re-save).
      p3_category = COALESCE(generated_questions.p3_category, EXCLUDED.p3_category),
      model_answer = COALESCE(EXCLUDED.model_answer, generated_questions.model_answer),
      proposed_annotation = COALESCE(EXCLUDED.proposed_annotation, generated_questions.proposed_annotation),
      reasoning_trace = COALESCE(EXCLUDED.reasoning_trace, generated_questions.reasoning_trace),
      study_diagram_assist = COALESCE(EXCLUDED.study_diagram_assist, generated_questions.study_diagram_assist)
    RETURNING *
  `;
  return rows[0] as GeneratedQuestion;
}

export async function getQuestionsByFilter(
  paper: number,
  family?: string
): Promise<GeneratedQuestion[]> {
  // NOTE: badness is gated solely by `invalid_reasons IS NULL` (the quarantine flag set by the
  // validator/audit and the "question" feedback kind). We intentionally do NOT exclude questions
  // merely because some attempt has feedback_status='accepted': accepting a UX complaint (e.g.
  // "you repeated this") or an answer-key fix must not silently delete an otherwise-valid question
  // from everyone's bank. Per-user repetition is handled at the serve layer, not here.
  // status = 'approved' (migration 022): pending/rejected bank questions must never reach a
  // candidate, and this is a serve path (the study producer's stale tier + generation fallback).
  const sql = getDb();
  if (family && family !== "any") {
    return (await sql`
      SELECT * FROM generated_questions
      WHERE paper = ${paper} AND family = ${family}
        AND invalid_reasons IS NULL
        AND review_state = 'kept'
      ORDER BY created_at DESC
    `) as GeneratedQuestion[];
  }
  return (await sql`
    SELECT * FROM generated_questions
    WHERE paper = ${paper}
      AND invalid_reasons IS NULL
      AND review_state = 'kept'
    ORDER BY created_at DESC
  `) as GeneratedQuestion[];
}

export async function getRecentGeneratedQuestions(limit = 5): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM generated_questions
    WHERE invalid_reasons IS NULL
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as GeneratedQuestion[];
}

export async function getUnansweredQuestions(
  paper: number,
  family?: string,
  userId?: number | null
): Promise<GeneratedQuestion[]> {
  // "Unanswered" means not completed BY THIS USER. Previously the completed-attempt join was
  // global, so a question any user finished disappeared from everyone's pool — and, conversely,
  // one user's history could never protect a different user from repeats. Scoping the join to
  // `userId` fixes both. `uid` null (server/no-user context) preserves the old global behaviour.
  const uid = userId ?? null;
  const sql = getDb();
  if (family && family !== "any") {
    return (await sql`
      SELECT q.* FROM generated_questions q
      LEFT JOIN user_attempts a ON q.question_id = a.question_id
        AND a.completed_at IS NOT NULL
        AND (${uid}::int IS NULL OR a.user_id = ${uid})
      WHERE q.paper = ${paper}
        AND q.family = ${family}
        AND q.invalid_reasons IS NULL
        AND q.review_state = 'kept'
        AND q.model_answer IS NOT NULL
        AND length(q.model_answer) > 100
        AND a.id IS NULL
      ORDER BY q.created_at ASC
    `) as GeneratedQuestion[];
  }
  return (await sql`
    SELECT q.* FROM generated_questions q
    LEFT JOIN user_attempts a ON q.question_id = a.question_id
      AND a.completed_at IS NOT NULL
      AND (${uid}::int IS NULL OR a.user_id = ${uid})
    WHERE q.paper = ${paper}
      AND q.invalid_reasons IS NULL
      AND q.review_state = 'kept'
      AND q.model_answer IS NOT NULL
      AND length(q.model_answer) > 100
      AND a.id IS NULL
    ORDER BY q.created_at ASC
  `) as GeneratedQuestion[];
}

export async function getQuestionCounts(): Promise<
  { paper: number; family: string; count: number }[]
> {
  const sql = getDb();
  return (await sql`
    SELECT paper, family, COUNT(*)::int as count
    FROM generated_questions
    GROUP BY paper, family
    ORDER BY paper, family
  `) as { paper: number; family: string; count: number }[];
}

// ── Question bank + per-user exposure (migration 020) ───────────────────────────────────────────
//
// The bank IS `generated_questions` (a validated question is written there on every successful
// generation, independent of attempts). "Seen" is `question_views`: one row per (user, question)
// written the moment a question is served — from the bank OR freshly generated, finished or not.
//
// NOTE ON MODE: a generated question is mode-agnostic in this codebase — the same row is graded as
// full / stem-only / known-wine / flash without change (generation never reads mode), and
// question_views is keyed on (user, question) with no mode. So eligibility is by paper + family +
// unseen; `mode` is the practice mode the served question is then run in, not a pool partition.

// Record that a question has been served to a user. Idempotent: the unique(user_id, question_id)
// constraint means a re-serve keeps the original first_seen_at rather than resetting it.
export async function recordQuestionView(userId: number, questionId: string): Promise<void> {
  const sql = getDb();
  await sql`
    INSERT INTO question_views (user_id, question_id)
    VALUES (${userId}, ${questionId})
    ON CONFLICT (user_id, question_id) DO NOTHING
  `;
}

export async function incrementTimesServed(questionId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE generated_questions SET times_served = COALESCE(times_served, 0) + 1
    WHERE question_id = ${questionId}
  `;
}

// How many banked questions this user has NEVER seen, for a paper (+ optional family). Gated on
// both retirement flags: is_retired (soft switch) and invalid_reasons (validator/feedback
// quarantine). family 'any'/empty means "any family in this paper".
export async function getBankCount(
  userId: number,
  paper: number,
  family?: string
): Promise<number> {
  const sql = getDb();
  const fam = family && family !== "any" ? family : null;
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM generated_questions q
    WHERE q.paper = ${paper}
      AND (${fam}::text IS NULL OR q.family = ${fam})
      AND q.invalid_reasons IS NULL
      AND q.review_state = 'kept'
      AND q.is_retired IS NOT TRUE
      AND NOT EXISTS (
        SELECT 1 FROM question_views v
        WHERE v.question_id = q.question_id AND v.user_id = ${userId}
      )
  `) as { count: number }[];
  return rows[0]?.count ?? 0;
}

// The newest eligible (unseen, not retired) banked questions for a user, most-recent-first. The
// caller picks one at random from this window — recency weighting, per the feature spec: pick from
// the 20 newest eligible, or from all eligible when fewer than 20 exist.
export async function getEligibleBankedQuestions(
  userId: number,
  paper: number,
  family?: string,
  limit = 20
): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  const fam = family && family !== "any" ? family : null;
  return (await sql`
    SELECT q.* FROM generated_questions q
    WHERE q.paper = ${paper}
      AND (${fam}::text IS NULL OR q.family = ${fam})
      AND q.invalid_reasons IS NULL
      AND q.review_state = 'kept'
      AND q.is_retired IS NOT TRUE
      AND NOT EXISTS (
        SELECT 1 FROM question_views v
        WHERE v.question_id = q.question_id AND v.user_id = ${userId}
      )
    ORDER BY q.created_at DESC
    LIMIT ${limit}
  `) as GeneratedQuestion[];
}

// ── Fill the Bank: bulk generation + review gate (migration 022) ─────────────────────────────────
//
// A bank_batch is one bulk run. The worker (src/lib/bank-worker.ts) writes generated_count after
// every persisted item so progress survives a tab close; the Fill-the-Bank section of the Admin card polls the
// helpers below. Every question the worker creates lands as status='pending' with the batch_id set,
// and is invisible to candidates until an admin approves it (see the status='approved' filters above).

export interface BankBatch {
  id: string;
  paper: number;
  requested_count: number;
  generated_count: number;
  failed_count: number;
  status: "running" | "ready" | "complete" | "done" | "cancelled" | "error" | "failed" | "stalled";
  replace_rejected: boolean;
  replace_binned: boolean;
  kept_count: number;
  created_by: number | null;
  created_at: string;
  completed_at: string | null;
  // Stall recovery (migration 027). started_at is set once; updated_at is a heartbeat stamped on
  // every counter increment / status change, so a dead 'running' run can be told from a live one.
  started_at: string | null;
  updated_at: string | null;
  est_cost_usd: string | null;
  actual_cost_usd: string | null;
  est_cost_min_cents: number | null;
  est_cost_max_cents: number | null;
  actual_cost_cents: number | null;
  // Bank Health targeted generation (migration 026). The soft-constraint aim for this batch, or NULL
  // for an untargeted Fill-the-Bank run. Persisted so a resumed invocation keeps the same aim.
  targeting: BankTargeting | null;
}

// The soft-constraint aim threaded into generation by a Bank Health "Generate more like this" run.
// Every field is optional — the panel only sends the ones a slice pins down.
export interface BankTargeting {
  paper?: number;
  questionType?: string;
  curveball?: string;
  flightSize?: string;
  grape?: string;
  region?: string;
  priceBand?: string;
}

export async function createBankBatch(input: {
  paper: number;
  requestedCount: number;
  replaceBinned: boolean;
  createdBy: number | null;
  estCostUsd: number;
  estCostMinCents?: number | null;
  estCostMaxCents?: number | null;
  targeting?: BankTargeting | null;
}): Promise<BankBatch> {
  const sql = getDb();
  // replace_rejected (migration 022) and replace_binned (migration 025) are the same flag under two
  // names; write both so either read path is correct.
  const rows = await sql`
    INSERT INTO bank_batches (
      paper, requested_count, replace_rejected, replace_binned, created_by,
      est_cost_usd, est_cost_min_cents, est_cost_max_cents, targeting
    )
    VALUES (
      ${input.paper}, ${input.requestedCount}, ${input.replaceBinned}, ${input.replaceBinned},
      ${input.createdBy}, ${input.estCostUsd},
      ${input.estCostMinCents ?? null}, ${input.estCostMaxCents ?? null},
      ${input.targeting ? JSON.stringify(input.targeting) : null}
    )
    RETURNING *
  `;
  return rows[0] as BankBatch;
}

export async function getBankBatch(id: string): Promise<BankBatch | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM bank_batches WHERE id = ${id} LIMIT 1`;
  return (rows[0] as BankBatch) ?? null;
}

// A paper may only have ONE live run at a time (the generate guard). 'running' is live.
export async function getRunningBatchForPaper(paper: number): Promise<BankBatch | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM bank_batches WHERE paper = ${paper} AND status = 'running'
    ORDER BY created_at DESC LIMIT 1
  `;
  return (rows[0] as BankBatch) ?? null;
}

// Every batch currently generating, newest first — the Admin card badges these per paper.
export async function getRunningBatches(): Promise<BankBatch[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM bank_batches WHERE status = 'running' ORDER BY created_at DESC
  `) as BankBatch[];
}

// Ready batches that still hold unreviewed (pending) questions — the "Review N questions" surface
// and the NotificationBell feed.
export async function getReviewableBatches(): Promise<(BankBatch & { pending_count: number })[]> {
  const sql = getDb();
  return (await sql`
    SELECT b.*, COUNT(q.id) FILTER (WHERE q.review_state = 'pending')::int AS pending_count
    FROM bank_batches b
    LEFT JOIN generated_questions q ON q.batch_id = b.id
    WHERE b.status IN ('ready', 'complete', 'done', 'stalled', 'cancelled')
    GROUP BY b.id
    HAVING COUNT(q.id) FILTER (WHERE q.review_state = 'pending') > 0
    ORDER BY b.completed_at DESC NULLS LAST, b.created_at DESC
  `) as (BankBatch & { pending_count: number })[];
}

// Atomically bump generated/failed counters. Returns the fresh row so the worker can decide whether
// the run is complete (generated + failed >= requested).
export async function incrementBatchCounts(
  id: string,
  delta: { generated?: number; failed?: number }
): Promise<BankBatch | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bank_batches SET
      generated_count = generated_count + ${delta.generated ?? 0},
      failed_count    = failed_count + ${delta.failed ?? 0},
      updated_at      = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return (rows[0] as BankBatch) ?? null;
}

// Heartbeat: bump updated_at without touching any counter. Called at the start of an invocation (and
// on resume) so a batch that is genuinely alive but between chunks is never mistaken for stalled.
export async function touchBankBatch(id: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE bank_batches SET updated_at = NOW() WHERE id = ${id}`;
}

// STALL RECOVERY (spec §1). Mark any batch left 'running' with a heartbeat older than the threshold
// (5 minutes) as 'stalled' and release it, so a new run can start for that paper. Already-persisted
// questions for the batch are untouched and remain reviewable (getReviewableBatches includes
// 'stalled'). Idempotent — safe to call on every status poll and at the start of any new run.
// Returns the released rows so callers can report "previous run stalled and was released".
export async function releaseStalledBatches(thresholdMinutes = 5): Promise<BankBatch[]> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bank_batches SET status = 'stalled'
    WHERE status = 'running'
      AND updated_at < NOW() - (${thresholdMinutes} * INTERVAL '1 minute')
    RETURNING *
  `;
  return rows as BankBatch[];
}

// CANCEL (spec §2). Flip a running batch to 'cancelled'. The worker re-reads status before each chunk
// and exits, keeping every question generated so far. Scoped to 'running' so a completed/stalled run
// isn't retro-cancelled.
export async function cancelBankBatch(id: string): Promise<BankBatch | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bank_batches SET status = 'cancelled', completed_at = NOW(), updated_at = NOW()
    WHERE id = ${id} AND status = 'running'
    RETURNING *
  `;
  return (rows[0] as BankBatch) ?? null;
}

// The most recent batch per paper (any status), with its live pending-review count. The Fill-the-Bank
// status endpoint reads this to drive the resting / running / stalled / done states without a
// round-trip per paper.
export async function getLatestBatchPerPaper(): Promise<(BankBatch & { pending_count: number })[]> {
  const sql = getDb();
  return (await sql`
    SELECT DISTINCT ON (b.paper) b.*,
      COALESCE(p.pending, 0)::int AS pending_count
    FROM bank_batches b
    LEFT JOIN (
      SELECT batch_id, COUNT(*)::int AS pending
      FROM generated_questions WHERE review_state = 'pending' GROUP BY batch_id
    ) p ON p.batch_id = b.id
    WHERE b.paper IN (1, 2, 3)
    ORDER BY b.paper, b.created_at DESC
  `) as (BankBatch & { pending_count: number })[];
}

// Add one more unit of work to a batch (used when an admin bins a question and replace_rejected is
// on). Re-opens the run to 'running' so the completion check fires again after the replacement lands.
export async function extendBatchForReplacement(id: string): Promise<BankBatch | null> {
  const sql = getDb();
  const rows = await sql`
    UPDATE bank_batches SET requested_count = requested_count + 1, status = 'running', completed_at = NULL
    WHERE id = ${id} AND status IN ('running', 'ready', 'complete')
    RETURNING *
  `;
  return (rows[0] as BankBatch) ?? null;
}

// The Fill-the-Bank reviewer's "Replace anything I bin" toggle writes here. Never re-opens a run; it only sets
// the flag the review endpoint reads when an admin bins a question.
export async function setBatchReplaceRejected(id: string, replaceRejected: boolean): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE bank_batches SET replace_rejected = ${replaceRejected}, replace_binned = ${replaceRejected}
    WHERE id = ${id}
  `;
}

export async function setBankBatchStatus(
  id: string,
  status: BankBatch["status"],
  opts?: { completed?: boolean; actualCostUsd?: number }
): Promise<void> {
  const sql = getDb();
  const actualCents =
    opts?.actualCostUsd == null ? null : Math.round(opts.actualCostUsd * 100);
  await sql`
    UPDATE bank_batches SET
      status = ${status},
      completed_at = ${opts?.completed ? new Date().toISOString() : null}::timestamptz,
      actual_cost_usd = COALESCE(${opts?.actualCostUsd ?? null}::numeric, actual_cost_usd),
      actual_cost_cents = COALESCE(${actualCents}::int, actual_cost_cents),
      updated_at = NOW()
    WHERE id = ${id}
  `;
}

// The pending items an admin reviews for a batch, oldest-first (review in generation order).
export async function getBatchPendingQuestions(batchId: string): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM generated_questions
    WHERE batch_id = ${batchId} AND review_state = 'pending'
    ORDER BY created_at ASC
  `) as GeneratedQuestion[];
}

// All rows for a batch (any status) — lets the review page show kept/binned outcomes and the
// "N reviewed · X kept, Y binned" summary without a second round-trip.
export async function getBatchQuestions(batchId: string): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM generated_questions
    WHERE batch_id = ${batchId}
    ORDER BY created_at ASC
  `) as GeneratedQuestion[];
}

// Decide one pending bank question. Scoped to review_state='pending' so a double-click or a replayed
// request can't flip a decision that was already made. Returns the row's batch_id so the caller can
// trigger a replacement only on a genuine first-time bin.
//
// keep → review_state='kept' (servable) and the batch's kept_count is bumped.
// bin  → the row is HARD-DELETED (spec: binned rows are hard-deleted, no resurrect path, no reason
//        field). We RETURN the batch_id first so the caller can enqueue a replacement.
export async function reviewBankQuestion(
  questionId: string,
  decision: "keep" | "bin",
  reviewerId: number
): Promise<{ batchId: string | null; changed: boolean } | null> {
  const sql = getDb();

  if (decision === "bin") {
    const rows = await sql`
      DELETE FROM generated_questions
      WHERE question_id = ${questionId} AND review_state = 'pending'
      RETURNING batch_id
    `;
    if (rows.length === 0) return { batchId: null, changed: false };
    return { batchId: (rows[0].batch_id as string) ?? null, changed: true };
  }

  const rows = await sql`
    UPDATE generated_questions SET
      status = 'approved', review_state = 'kept', reviewed_at = NOW(), reviewed_by = ${reviewerId}
    WHERE question_id = ${questionId} AND review_state = 'pending'
    RETURNING batch_id
  `;
  if (rows.length === 0) return { batchId: null, changed: false };
  const batchId = (rows[0].batch_id as string) ?? null;
  if (batchId) {
    await sql`UPDATE bank_batches SET kept_count = kept_count + 1 WHERE id = ${batchId}`;
  }
  return { batchId, changed: true };
}

// Keep every pending question in a batch in one shot ("Keep all").
export async function keepAllPending(batchId: string, reviewerId: number): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    UPDATE generated_questions SET
      status = 'approved', review_state = 'kept', reviewed_at = NOW(), reviewed_by = ${reviewerId}
    WHERE batch_id = ${batchId} AND review_state = 'pending'
    RETURNING id
  `;
  if (rows.length > 0) {
    await sql`UPDATE bank_batches SET kept_count = kept_count + ${rows.length} WHERE id = ${batchId}`;
  }
  return rows.length;
}

// Per-paper bank health for the Admin card: how many APPROVED (servable) and PENDING (awaiting
// review) questions exist per paper.
export async function getBankStatusCounts(): Promise<
  { paper: number; approved: number; pending: number }[]
> {
  const sql = getDb();
  const rows = (await sql`
    SELECT paper,
      COUNT(*) FILTER (WHERE review_state = 'kept' AND invalid_reasons IS NULL AND is_retired IS NOT TRUE)::int AS approved,
      COUNT(*) FILTER (WHERE review_state = 'pending')::int AS pending
    FROM generated_questions
    WHERE paper IN (1, 2, 3)
    GROUP BY paper
    ORDER BY paper
  `) as { paper: number; approved: number; pending: number }[];
  return rows;
}

// Kept-bank composition per (paper, family) — how many APPROVED, servable questions of each
// question-family currently sit in the bank. The Admin card reads this to derive the "gap hint"
// (the least-represented family for a paper) and the diversity worker could reuse it to steer
// round-robin generation toward thin families.
export async function getBankFamilyHistogram(): Promise<
  { paper: number; family: string; count: number }[]
> {
  const sql = getDb();
  const rows = (await sql`
    SELECT paper, family, COUNT(*)::int AS count
    FROM generated_questions
    WHERE paper IN (1, 2, 3)
      AND review_state = 'kept'
      AND invalid_reasons IS NULL
      AND is_retired IS NOT TRUE
      AND family IS NOT NULL
    GROUP BY paper, family
  `) as { paper: number; family: string; count: number }[];
  return rows;
}

// Sum the real Claude spend attributed to a batch's questions (question_generation +
// model_answer + enrichment all stamp question_id), so bank_batches.actual_cost_usd reflects money
// actually spent rather than the up-front estimate.
export async function getBatchActualCost(batchId: string): Promise<number> {
  const sql = getDb();
  const rows = (await sql`
    SELECT COALESCE(SUM(m.cost_usd), 0) AS cost
    FROM model_usage m
    WHERE m.question_id IN (SELECT question_id FROM generated_questions WHERE batch_id = ${batchId})
  `) as { cost: string }[];
  return Number(rows[0]?.cost ?? 0);
}

// Real average Claude spend per banked question, derived from the SAME model_usage rows the
// /admin/costs dashboard reads: total spend attributed to bank-batch questions ÷ number of those
// questions. Every banked question pays for a generation + a model answer + an enrichment pass, so
// this rolls all three into one honest per-question figure. Returns 0 when no bank spend exists yet
// (the Admin card then falls back to the static EST_COST_PER_QUESTION estimate).
export async function getBankPerQuestionAvgCost(): Promise<number> {
  const sql = getDb();
  const rows = (await sql`
    SELECT COALESCE(SUM(m.cost_usd), 0) AS cost,
           COUNT(DISTINCT q.question_id)::int AS questions
    FROM generated_questions q
    JOIN model_usage m ON m.question_id = q.question_id
    WHERE q.batch_id IS NOT NULL
  `) as { cost: string; questions: number }[];
  const cost = Number(rows[0]?.cost ?? 0);
  const questions = Number(rows[0]?.questions ?? 0);
  return questions > 0 ? cost / questions : 0;
}

// ── Bank Health analytics (migration 026) ────────────────────────────────────────────────────────
//
// The Bank Health page aggregates the servable ("kept") pool. The scalar slices are computed as SQL
// GROUP BY over the indexed columns migration 026 added, so they stay fast at 10k+ rows; the
// free-text-dependent slices (grape/region coverage, mark focus, over-representation) read a lite
// projection and derive in TypeScript. The whole payload is cached for 60s by the route.

// A servable banked question is kept, not quarantined, not retired. This is the SAME gate the
// candidate-facing bank reads use, so Bank Health counts exactly what could be served.
const KEPT_BANK_SQL_WHERE = "review_state = 'kept' AND invalid_reasons IS NULL AND is_retired IS NOT TRUE";

export interface BankHealthLiteRow {
  question_id: string;
  paper: number;
  question_text: string;
  wines: unknown;
  total_marks: number;
  times_served: number;
  created_at: string;
}

// Total servable questions + how many have never been served.
export async function getBankHealthTotals(): Promise<{ total: number; unserved: number }> {
  const sql = getDb();
  const rows = (await sql`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE COALESCE(times_served, 0) = 0)::int AS unserved
    FROM generated_questions
    WHERE review_state = 'kept' AND invalid_reasons IS NULL AND is_retired IS NOT TRUE
  `) as { total: number; unserved: number }[];
  return { total: rows[0]?.total ?? 0, unserved: rows[0]?.unserved ?? 0 };
}

// GROUP BY count over one of the four scalar slice columns. `column` is a fixed whitelist member —
// never user input — so interpolating it into the query text is safe. NULLs are coalesced to a
// slice-appropriate default (curveball → 'low'; question_type → 'other') except price_band, whose
// NULLs (no price signal) are excluded so the slice's percentages are over rows that actually carry
// a band.
export async function getBankSliceCounts(
  column: "paper" | "question_type" | "curveball" | "price_band"
): Promise<{ key: string; count: number }[]> {
  const sql = getDb();
  const keyExpr =
    column === "curveball"
      ? "COALESCE(curveball, 'low')"
      : column === "question_type"
        ? "COALESCE(question_type, 'other')"
        : column;
  const extraWhere = column === "price_band" ? " AND price_band IS NOT NULL" : "";
  const rows = (await sql.query(
    `SELECT ${keyExpr}::text AS key, COUNT(*)::int AS count
       FROM generated_questions
      WHERE ${KEPT_BANK_SQL_WHERE}${extraWhere}
      GROUP BY ${keyExpr}`
  )) as { key: string; count: number }[];
  return rows;
}

// Flight-size slice, bucketed to the 2 / 3 / 4+ benchmark keys in SQL.
export async function getFlightSizeCounts(): Promise<{ key: string; count: number }[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT CASE
             WHEN flight_size = 2 THEN '2'
             WHEN flight_size = 3 THEN '3'
             WHEN flight_size >= 4 THEN '4plus'
           END AS key,
           COUNT(*)::int AS count
    FROM generated_questions
    WHERE ${sql.unsafe(KEPT_BANK_SQL_WHERE)}
      AND flight_size >= 2
    GROUP BY key
  `) as { key: string; count: number }[];
  return rows;
}

// Keep/bin funnel across completed bulk runs: how many drafts were generated vs kept. Binned rows
// are hard-deleted, so the bin count is (generated − kept). Feeds the overview keep/binned rates.
export async function getBankBatchKeepStats(): Promise<{ generated: number; kept: number }> {
  const sql = getDb();
  const rows = (await sql`
    SELECT COALESCE(SUM(generated_count), 0)::int AS generated,
           COALESCE(SUM(kept_count), 0)::int AS kept
    FROM bank_batches
    WHERE status IN ('ready', 'complete')
  `) as { generated: number; kept: number }[];
  return { generated: rows[0]?.generated ?? 0, kept: rows[0]?.kept ?? 0 };
}

// The rule names that most often caused a draft to be rejected, from the generation attempt log.
// Powers the "top bin reason" caption. Rule names are internal; the UI maps them to plain copy.
export async function getTopRejectionReasons(
  limit = 5
): Promise<{ reason: string; count: number }[]> {
  const sql = getDb();
  try {
    const rows = (await sql`
      SELECT rule AS reason, COUNT(*)::int AS count
      FROM generation_attempts, LATERAL unnest(rules_fired) AS rule
      WHERE passed = false
      GROUP BY rule
      ORDER BY count DESC
      LIMIT ${limit}
    `) as { reason: string; count: number }[];
    return rows;
  } catch {
    // generation_attempts may not be migrated in every environment — degrade to no reasons.
    return [];
  }
}

// Lite projection of the servable pool for the TypeScript-derived slices. Only the columns those
// derivations need, so even a 10k-row scan stays a few MB and is cached for 60s upstream.
export async function getKeptBankLite(): Promise<BankHealthLiteRow[]> {
  const sql = getDb();
  const rows = (await sql`
    SELECT question_id, paper, question_text, wines, total_marks,
           COALESCE(times_served, 0)::int AS times_served, created_at
    FROM generated_questions
    WHERE review_state = 'kept' AND invalid_reasons IS NULL AND is_retired IS NOT TRUE
  `) as BankHealthLiteRow[];
  return rows;
}

export interface BankSliceItemRow {
  question_id: string;
  paper: number;
  question_text: string;
  wines: unknown;
  total_marks: number;
  times_served: number;
  created_at: string;
}

// Items for a column-backed slice (paper / questionType / curveball / flightSize / priceBand),
// paginated by created_at + id. Free-text slices (grape/region/markFocus/overRepetition) are
// filtered in TypeScript by the route from getKeptBankLite instead.
export async function getBankSliceItemsByColumn(
  column: "paper" | "question_type" | "curveball" | "price_band" | "flight_size",
  key: string,
  limit: number,
  offset: number
): Promise<BankSliceItemRow[]> {
  const sql = getDb();
  let predicate: string;
  const params: unknown[] = [];
  if (column === "flight_size") {
    predicate = key === "4plus" ? "flight_size >= 4" : "flight_size = $1";
    if (key !== "4plus") params.push(Number(key));
  } else if (column === "curveball") {
    predicate = "COALESCE(curveball, 'low') = $1";
    params.push(key);
  } else if (column === "question_type") {
    predicate = "COALESCE(question_type, 'other') = $1";
    params.push(key);
  } else if (column === "paper") {
    predicate = "paper = $1";
    params.push(Number(key));
  } else {
    predicate = "price_band = $1";
    params.push(key);
  }
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;
  params.push(limit, offset);
  const rows = (await sql.query(
    `SELECT question_id, paper, question_text, wines, total_marks,
            COALESCE(times_served, 0)::int AS times_served, created_at
       FROM generated_questions
      WHERE ${KEPT_BANK_SQL_WHERE} AND ${predicate}
      ORDER BY created_at DESC, question_id DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    params
  )) as BankSliceItemRow[];
  return rows;
}

export async function createAttempt(
  questionId: string,
  mode: string | null = null,
  stemDetail: string = "exam_real"
): Promise<UserAttempt> {
  const sql = getDb();
  // `mode` is NOT NULL DEFAULT 'full' in the DB. A column default only applies when the column is
  // OMITTED from the INSERT — an explicit NULL violates the constraint and 500s. A "normal" study
  // attempt is canonically 'full' (the query layer already treats NULL and 'full' as equivalent),
  // so coalesce null → 'full' here rather than inserting NULL. stem_detail is likewise NOT NULL.
  const rows = await sql`
    INSERT INTO user_attempts (question_id, mode, stem_detail, app_version)
    VALUES (${questionId}, ${mode ?? "full"}, ${stemDetail || "exam_real"}, ${getAppVersion()})
    RETURNING *
  `;
  return rows[0] as UserAttempt;
}

export async function createAttemptWithUser(
  questionId: string,
  userId: number,
  mode: string | null = null,
  stemDetail: string = "exam_real"
): Promise<UserAttempt> {
  const sql = getDb();
  // See createAttempt: coalesce null → 'full' so the explicit insert satisfies the NOT NULL mode column.
  const rows = await sql`
    INSERT INTO user_attempts (question_id, user_id, mode, stem_detail, app_version)
    VALUES (${questionId}, ${userId}, ${mode ?? "full"}, ${stemDetail || "exam_real"}, ${getAppVersion()})
    RETURNING *
  `;
  return rows[0] as UserAttempt;
}

// Record user feedback WITHOUT ever overwriting an attempt that already carries different
// feedback. Two distinct submissions used to clobber one row's `user_feedback` (the attempt-188
// incident); the one-shot analysis guard then meant the second was never analyzed, and apply/sync
// re-read the mutated column at different times → divergent ledger. Now each distinct feedback gets
// its own attempt row (multiple attempts per question are already supported and rendered), so every
// feedback has an immutable home that is analyzed exactly once against the text it contains.
//
// Returns the attempt id the feedback now lives on, and whether the caller should run analysis
// (true for a fresh write or a forked row; false for an idempotent re-submit of identical text).
export async function getAttemptById(attemptId: number): Promise<UserAttempt | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM user_attempts WHERE id = ${attemptId}`;
  return (rows[0] as UserAttempt) ?? null;
}

export async function recordUserFeedback(
  attemptId: number,
  text: string
): Promise<{ id: number; analyze: boolean }> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, question_id, user_id, mode, user_feedback, app_version
    FROM user_attempts WHERE id = ${attemptId}
  `;
  const existing = rows[0] as
    | {
        id: number;
        question_id: string;
        user_id: number | null;
        mode: string | null;
        user_feedback: string | null;
        app_version: string | null;
      }
    | undefined;
  if (!existing) {
    // No such attempt — fall back to a plain update so behaviour matches the legacy path.
    await sql`
      UPDATE user_attempts SET
        user_feedback = ${text},
        feedback_submitted_at = COALESCE(feedback_submitted_at, NOW())
      WHERE id = ${attemptId}
    `;
    return { id: attemptId, analyze: true };
  }

  const current = (existing.user_feedback || "").trim();
  // First feedback on this attempt → record it on the row.
  if (!current) {
    await sql`
      UPDATE user_attempts SET
        user_feedback = ${text},
        feedback_submitted_at = COALESCE(feedback_submitted_at, NOW())
      WHERE id = ${attemptId}
    `;
    return { id: attemptId, analyze: true };
  }
  // Identical re-submission → idempotent no-op (don't spawn a duplicate or re-analyze).
  if (current === text.trim()) {
    return { id: attemptId, analyze: false };
  }
  // A different second feedback → give it its own attempt row instead of overwriting. The fork
  // inherits the parent's build stamp (it describes the same study episode); only a parent from
  // before migration 019 falls back to the build recording the feedback.
  const ins = await sql`
    INSERT INTO user_attempts (question_id, user_id, mode, user_feedback, feedback_submitted_at, app_version)
    VALUES (
      ${existing.question_id}, ${existing.user_id}, ${existing.mode ?? "full"}, ${text}, NOW(),
      ${existing.app_version ?? getAppVersion()}
    )
    RETURNING id
  `;
  return { id: ins[0].id as number, analyze: true };
}

export async function updateAttempt(
  attemptId: number,
  data: Partial<{
    pre_glass_reasoning: string;
    pre_glass_feedback: string;
    tasting_notes: string[];
    user_answer: string;
    // How the answer was produced (migration 023). Written alongside user_answer.
    input_method: "typed" | "voice";
    answer_feedback: string;
    pass_estimate: string;
    marks_estimate: string;
    completed_at: string;
    user_feedback: string;
    elapsed_seconds: number;
    current_step: string;
    // Flash Notes per-card / per-deck metadata (migration 011). Written once, right after the
    // attempt is created, in a single update before the card is graded.
    prompt_type: string;
    flight_wine_count: number;
    deck_id: string | null;
    card_index: number | null;
    deck_settings: Record<string, unknown> | null;
    // Stem Detail escalation ("Add detail"): the level the candidate ended at. One-way.
    stem_detail_escalated_to: string;
    // Pace (migration 021): the per-attempt pace report, written once at submit.
    pace: PaceData;
  }>
): Promise<UserAttempt> {
  const sql = getDb();

  if (data.pace !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET pace = ${JSON.stringify(data.pace)} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }

  if (data.stem_detail_escalated_to !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET stem_detail_escalated_to = ${data.stem_detail_escalated_to} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }

  // Flash Notes metadata write — set the per-card/per-deck columns in one shot. Detected by
  // prompt_type (always present for a Flash card) so it can't collide with the field-at-a-time
  // study updates below.
  if (data.prompt_type !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET
        prompt_type = ${data.prompt_type},
        flight_wine_count = ${data.flight_wine_count ?? null},
        deck_id = ${data.deck_id ?? null},
        card_index = ${data.card_index ?? null},
        deck_settings = ${data.deck_settings ? JSON.stringify(data.deck_settings) : null}
      WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }

  if (data.current_step !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET current_step = ${data.current_step} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.pre_glass_reasoning !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET pre_glass_reasoning = ${data.pre_glass_reasoning} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.pre_glass_feedback !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET pre_glass_feedback = ${data.pre_glass_feedback} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.tasting_notes !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET tasting_notes = ${JSON.stringify(data.tasting_notes)} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.user_answer !== undefined) {
    // input_method rides along with the answer it describes (migration 023) — 'voice' means the
    // grader reported spelling without deducting for it. Guarded to the two legal values because
    // the column carries a CHECK constraint; anything else keeps the 'typed' default.
    const inputMethod = data.input_method === "voice" ? "voice" : "typed";
    const rows = await sql`
      UPDATE user_attempts SET user_answer = ${data.user_answer}, input_method = ${inputMethod}
      WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.answer_feedback !== undefined) {
    const rows = await sql`
      UPDATE user_attempts SET
        answer_feedback = ${data.answer_feedback},
        pass_estimate = ${data.pass_estimate || null},
        marks_estimate = ${data.marks_estimate || null},
        elapsed_seconds = ${data.elapsed_seconds || null},
        completed_at = NOW()
      WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }
  if (data.user_feedback !== undefined) {
    // Stamp when feedback was left (kept stable across later edits via COALESCE) so
    // the admin dashboard can sort by feedback recency rather than question completion.
    const rows = await sql`
      UPDATE user_attempts SET
        user_feedback = ${data.user_feedback},
        feedback_submitted_at = COALESCE(feedback_submitted_at, NOW())
      WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }

  const rows = await sql`SELECT * FROM user_attempts WHERE id = ${attemptId}`;
  return rows[0] as UserAttempt;
}

export async function reviewFeedback(
  attemptId: number,
  status: string,
  adminNote: string | null,
  decidedBy: "auto" | "manual" = "manual"
): Promise<UserAttempt> {
  const sql = getDb();
  const rows = await sql`
    UPDATE user_attempts SET
      feedback_status = ${status},
      feedback_admin_note = ${adminNote},
      feedback_decided_by = ${decidedBy},
      feedback_reviewed_at = NOW()
    WHERE id = ${attemptId} RETURNING *
  `;
  return rows[0] as UserAttempt;
}

// Serve a cached feedback image (base64 bytes) by id. Used by /api/media/[id].
export async function getMediaById(
  id: number
): Promise<{ content_type: string; image_base64: string } | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT content_type, image_base64 FROM media_cache
    WHERE id = ${id} AND image_base64 IS NOT NULL`;
  return rows.length ? (rows[0] as { content_type: string; image_base64: string }) : null;
}

export type RecentAttempt = UserAttempt & {
  paper: number;
  family: string;
  family_label: string;
  p3_category: string | null;
};

export async function getRecentAttempts(
  limit = 20,
  userId?: number | null
): Promise<RecentAttempt[]> {
  // When `userId` is given, returns only that user's recent attempts — so the serve layer can build
  // a per-user "recently served" set instead of one polluted by other users' activity. `uid` null
  // preserves the prior global behaviour for any caller that wants a cross-user view.
  //
  // p3_category rides along so the Paper 3 weighted sampler can count recently-served style families
  // without a second query.
  const uid = userId ?? null;
  const sql = getDb();
  return (await sql`
    SELECT a.*, q.paper, q.family, q.family_label, q.p3_category
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE (${uid}::int IS NULL OR a.user_id = ${uid})
    ORDER BY a.started_at DESC
    LIMIT ${limit}
  `) as RecentAttempt[];
}

export interface AttemptWithDetails extends UserAttempt {
  paper: number;
  family: string;
  family_label: string;
  question_text: string;
  wines: { slot: number; fullText: string }[];
  model_answer: string | null;
  total_marks: number;
  subcategory: string | null;
  // Drill attempts (Stem Sniper / Reverse Tasting): mode + the full scored payload. Returned by the
  // a.* select in getUserAttempts; history renders these instead of the study answer/debrief fields.
  mode: string | null;
  drill_payload: unknown;
  // Stem Detail (migration 013): start level + escalation target (via a.* in getUserAttempts).
  stem_detail: string;
  stem_detail_escalated_to: string | null;
  // Pace (migration 021): per-attempt pace report (via a.* in getUserAttempts). NULL when absent.
  pace: PaceData | null;
  // The AI's response to this attempt's feedback (latest feedback_analyses row): recommendation +
  // the conversation thread (system = "Analysis", user = follow-ups). History shows it inline.
  ai_recommendation: "accept" | "reject" | "pending" | null;
  ai_thread: unknown;
  ai_status: string | null;
}

export async function getUserAttempts(userId: number, limit = 50): Promise<AttemptWithDetails[]> {
  const sql = getDb();
  return (await sql`
    SELECT
      a.*,
      q.paper,
      q.family,
      q.family_label,
      q.subcategory,
      q.question_text,
      q.wines,
      q.model_answer,
      q.total_marks,
      fa.recommendation AS ai_recommendation,
      fa.thread AS ai_thread,
      fa.status AS ai_status
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
    LEFT JOIN LATERAL (
      SELECT recommendation, thread, status
      FROM feedback_analyses
      WHERE attempt_id = a.id
      ORDER BY updated_at DESC
      LIMIT 1
    ) fa ON true
    WHERE a.user_id = ${userId}
    ORDER BY a.started_at DESC
    LIMIT ${limit}
  `) as AttemptWithDetails[];
}

export interface UserStats {
  total_attempts: number;
  completed_attempts: number;
  pass_count: number;
  fail_count: number;
  borderline_count: number;
  by_paper: { paper: number; total: number; pass: number; fail: number; borderline: number }[];
  by_family: { family: string; family_label: string; total: number; pass: number; borderline: number; fail: number }[];
  recent_results: { pass_estimate: string; started_at: string }[];
}

// ── Feedback Analyses ──

export interface FeedbackAnalysis {
  id: number;
  attempt_id: number;
  user_id: number;
  recommendation: "accept" | "reject" | "pending" | null;
  thread: { role: "system" | "user"; content: string; timestamp: string }[];
  is_read: boolean;
  status: "analyzing" | "complete" | "error";
  error_message: string | null;
  created_at: string;
  updated_at: string;
  // Auto-apply pipeline audit (set by the dispatch path and the GitHub Action)
  apply_status: string | null; // dispatched|verifying|merged|deployed|pr_opened|pr_closed|failed
  work_branch: string | null;
  commit_sha: string | null;
  pr_url: string | null;
  deploy_state: string | null;
  applied_by: string | null; // 'auto' | 'admin:{id}'
  applied_at: string | null;
  apply_error: string | null;
}

/**
 * Update the auto-apply audit columns on a feedback_analyses row. Only non-null fields are
 * written (COALESCE), and applied_at is stamped once on first write. The GitHub Action also
 * writes these columns directly via scripts/record-apply.mjs.
 */
export async function recordApply(
  analysisId: number,
  data: Partial<{
    apply_status: string;
    work_branch: string;
    commit_sha: string;
    pr_url: string;
    deploy_state: string;
    applied_by: string;
    apply_error: string;
  }>
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE feedback_analyses SET
      apply_status = COALESCE(${data.apply_status ?? null}::text, apply_status),
      work_branch  = COALESCE(${data.work_branch ?? null}::text, work_branch),
      commit_sha   = COALESCE(${data.commit_sha ?? null}::text, commit_sha),
      pr_url       = COALESCE(${data.pr_url ?? null}::text, pr_url),
      deploy_state = COALESCE(${data.deploy_state ?? null}::text, deploy_state),
      applied_by   = COALESCE(${data.applied_by ?? null}::text, applied_by),
      apply_error  = COALESCE(${data.apply_error ?? null}::text, apply_error),
      applied_at   = CASE WHEN applied_at IS NULL THEN NOW() ELSE applied_at END,
      updated_at   = NOW()
    WHERE id = ${analysisId}
  `;
}

export async function createFeedbackAnalysis(attemptId: number, userId: number): Promise<FeedbackAnalysis> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO feedback_analyses (attempt_id, user_id, status, thread)
    VALUES (${attemptId}, ${userId}, 'analyzing', '[]'::jsonb)
    RETURNING *
  `;
  const analysis = rows[0] as FeedbackAnalysis;
  await sql`UPDATE user_attempts SET auto_analysis_id = ${analysis.id} WHERE id = ${attemptId}`;
  return analysis;
}

export async function updateFeedbackAnalysis(
  id: number,
  data: Partial<{
    recommendation: string;
    thread: unknown[];
    status: string;
    error_message: string;
    is_read: boolean;
  }>
): Promise<FeedbackAnalysis> {
  const sql = getDb();
  if (data.status === "complete" && data.thread && data.recommendation) {
    const rows = await sql`
      UPDATE feedback_analyses SET
        status = 'complete',
        recommendation = ${data.recommendation},
        thread = ${JSON.stringify(data.thread)},
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return rows[0] as FeedbackAnalysis;
  }
  if (data.status === "error") {
    const rows = await sql`
      UPDATE feedback_analyses SET
        status = 'error',
        error_message = ${data.error_message || "Unknown error"},
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return rows[0] as FeedbackAnalysis;
  }
  if (data.is_read !== undefined) {
    const rows = await sql`
      UPDATE feedback_analyses SET is_read = ${data.is_read}, updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return rows[0] as FeedbackAnalysis;
  }
  if (data.thread) {
    const rows = await sql`
      UPDATE feedback_analyses SET
        thread = ${JSON.stringify(data.thread)},
        status = ${data.status || "analyzing"},
        is_read = false,
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `;
    return rows[0] as FeedbackAnalysis;
  }
  const rows = await sql`SELECT * FROM feedback_analyses WHERE id = ${id}`;
  return rows[0] as FeedbackAnalysis;
}

/**
 * Store the spoken-verdict narration on an analysis row. Best-effort: called
 * just before the row flips to 'complete' so the audio is ready the instant the
 * notification surfaces. audioBase64 is base64-encoded mp3 (kept inline).
 */
export async function saveNarration(
  analysisId: number,
  data: { text: string; audioBase64: string; voiceId: string; characters: number }
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE feedback_analyses SET
      narration_text  = ${data.text},
      narration_audio = ${data.audioBase64},
      narration_voice = ${data.voiceId},
      narration_chars = ${data.characters}
    WHERE id = ${analysisId}
  `;
}

/** Fetch just the narration audio (base64 mp3) for one analysis, scoped to its owner. */
export async function getNarrationAudio(
  analysisId: number,
  userId: number
): Promise<string | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT narration_audio FROM feedback_analyses
    WHERE id = ${analysisId} AND user_id = ${userId}
  `;
  return (rows[0]?.narration_audio as string | null) || null;
}

/**
 * Mark a user's verdict narrations as already spoken so the bell never replays
 * them. Called once playback actually starts. Stamps the given analysis plus any
 * other still-unplayed narrations the user has, so a backlog that accumulated
 * while they were away is consumed by the single clip they just heard (at most
 * one sound per catch-up, nothing refires later). Returns rows affected.
 */
export async function markNarrationsPlayed(userId: number): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    UPDATE feedback_analyses SET narration_played_at = NOW()
    WHERE user_id = ${userId}
      AND narration_audio IS NOT NULL
      AND narration_played_at IS NULL
    RETURNING id
  `;
  return rows.length;
}

export async function getFeedbackAnalysis(id: number): Promise<(FeedbackAnalysis & {
  question_text: string;
  wines: unknown;
  paper: number;
  family: string;
  family_label: string;
  user_feedback: string;
  user_answer: string | null;
  model_answer: string | null;
  // The attempt's generated artifacts, so a follow-up reply is grounded in the same evidence the
  // first-pass analysis saw (runFeedbackAnalysis selects the identical set).
  tasting_notes: unknown;
  pre_glass_reasoning: string | null;
  pre_glass_feedback: string | null;
  answer_feedback: string | null;
  pass_estimate: string | null;
  marks_estimate: string | null;
  mode: string | null;
  stem_detail: string | null;
  stem_detail_escalated_to: string | null;
  app_version: string | null;
  reasoning_trace: string | null;
}) | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT fa.*, a.user_feedback, a.user_answer,
      a.tasting_notes, a.pre_glass_reasoning, a.pre_glass_feedback, a.answer_feedback,
      a.pass_estimate, a.marks_estimate, a.mode, a.stem_detail, a.stem_detail_escalated_to,
      a.app_version,
      q.question_text, q.wines, q.paper, q.family, q.family_label, q.model_answer, q.reasoning_trace
    FROM feedback_analyses fa
    JOIN user_attempts a ON fa.attempt_id = a.id
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE fa.id = ${id}
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rows[0] as any) || null;
}

/**
 * Decision-relevant empirical knowledge for the feedback-analysis agent, read live from the
 * `empirical_knowledge` projection (kept in sync with mw_exam_empirical_knowledge.md). Always
 * includes the generation rules / prior-rulings ledger / bug catalog (§5/§6/§7); includes the
 * structure/distribution facts (§1/§4) only when they're paper-agnostic or match this paper.
 * Returns a compact text block grouped by section, or "" if the table is empty/unavailable.
 */
export async function getEmpiricalKnowledgeForAnalysis(paper: number): Promise<string> {
  const sql = getDb();
  let rows: Record<string, unknown>[];
  try {
    rows = (await sql`
      SELECT ek_id, section, tier, title, claim
      FROM empirical_knowledge
      WHERE status = 'live'
        AND (section IN (2, 3, 5, 6, 7) OR (section IN (1, 4) AND (paper IS NULL OR paper = ${paper})))
      ORDER BY section, ek_id
    `) as Record<string, unknown>[];
  } catch {
    return ""; // table not present yet → caller falls back to the build-time digest
  }
  if (!rows.length) return "";
  const LABELS: Record<number, string> = {
    1: "§1 · Exam structure",
    // §2/§3 are the grading/examiner-cognition canon (trust account, plausibility gradient,
    // confidence≠correctness, contamination law, under-the-skin). Paper-agnostic, so always included —
    // they are the authoritative grounding when a candidate disputes the AI's EVALUATION/score.
    2: "§2 · Examiner mindset & grading philosophy",
    3: "§3 · Answer grading guidelines",
    4: "§4 · Wine selection & distribution (paper-relevant)",
    5: "§5 · Question-generation rules",
    6: "§6 · Prior feedback rulings (precedent)",
    7: "§7 · App bug catalog / known fixes",
  };
  const bySection = new Map<number, string[]>();
  for (const r of rows) {
    const sec = Number(r.section);
    const arr = bySection.get(sec) || [];
    arr.push(`- ${r.ek_id} · ${r.title} [${r.tier}]: ${r.claim}`);
    bySection.set(sec, arr);
  }
  return [...bySection.entries()]
    .map(([sec, items]) => `### ${LABELS[sec] || `§${sec}`}\n${items.join("\n")}`)
    .join("\n\n");
}

// Compact, cross-paper digest of the live empirical knowledge for the Feature Request engine, so
// proposals are grounded in how the exam actually works (id · title — short claim). Length-capped to
// keep the prompt bounded; the build Action reads the full doc. Empty string if the table is absent.
export async function getEmpiricalKnowledgeDigest(maxChars = 12000): Promise<string> {
  const sql = getDb();
  let rows: Record<string, unknown>[];
  try {
    rows = (await sql`
      SELECT ek_id, title, claim FROM empirical_knowledge
      WHERE status = 'live' ORDER BY ek_id
    `) as Record<string, unknown>[];
  } catch {
    return "";
  }
  const lines: string[] = [];
  let total = 0;
  for (const r of rows) {
    const claim = String(r.claim || "").replace(/\s+/g, " ").trim().slice(0, 240);
    const line = `- ${r.ek_id} · ${r.title} — ${claim}`;
    if (total + line.length > maxChars) break;
    lines.push(line);
    total += line.length + 1;
  }
  return lines.join("\n");
}

// The tasting lexicon, read from the editable Neon `tasting_lexicon` table with the bundled copy as
// fallback. Cached in-memory per server instance (the lexicon changes rarely) with a short TTL so
// admin edits take effect without a redeploy. On any error / empty table it returns the bundled copy.
let lexiconCache: { value: TastingLexicon; at: number } | null = null;
const LEXICON_TTL_MS = 5 * 60 * 1000;

export async function getTastingLexicon(): Promise<TastingLexicon> {
  if (lexiconCache && Date.now() - lexiconCache.at < LEXICON_TTL_MS) {
    return lexiconCache.value;
  }
  try {
    const sql = getDb();
    const rows = (await sql`
      SELECT group_kind, category, term
      FROM tasting_lexicon
      WHERE active = TRUE
      ORDER BY group_kind, category, sort_order, id
    `) as { group_kind: string; category: string; term: string }[];
    if (!rows.length) {
      lexiconCache = { value: BUNDLED_TASTING_LEXICON, at: Date.now() };
      return BUNDLED_TASTING_LEXICON;
    }
    const value: TastingLexicon = { dimensions: {}, rhetoric: {} };
    for (const r of rows) {
      const bucket = r.group_kind === "rhetoric" ? value.rhetoric : value.dimensions;
      (bucket[r.category] ||= []).push(r.term);
    }
    lexiconCache = { value, at: Date.now() };
    return value;
  } catch {
    // table absent / unreachable → bundled copy keeps generation working
    lexiconCache = { value: BUNDLED_TASTING_LEXICON, at: Date.now() };
    return BUNDLED_TASTING_LEXICON;
  }
}

export async function getUserNotifications(userId: number): Promise<{
  unreadCount: number;
  analyses: (FeedbackAnalysis & { question_text: string; paper: number; family_label: string; user_feedback: string; has_narration: boolean; pending_narration: boolean })[];
}> {
  const sql = getDb();
  const countRows = await sql`
    SELECT COUNT(*)::int as count FROM feedback_analyses
    WHERE user_id = ${userId} AND is_read = false AND status IN ('complete', 'error')
  `;
  const analyses = await sql`
    SELECT fa.id, fa.attempt_id, fa.user_id, fa.recommendation, fa.thread,
      fa.is_read, fa.status, fa.error_message, fa.created_at, fa.updated_at,
      (fa.narration_audio IS NOT NULL) AS has_narration,
      -- Narration that exists but the bell has not yet spoken. Drives play-once.
      (fa.narration_audio IS NOT NULL AND fa.narration_played_at IS NULL) AS pending_narration,
      a.user_feedback,
      q.question_text, q.paper, q.family_label
    FROM feedback_analyses fa
    JOIN user_attempts a ON fa.attempt_id = a.id
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE fa.user_id = ${userId} AND fa.status IN ('complete', 'error')
    ORDER BY fa.updated_at DESC
    LIMIT 10
  `;
  return {
    unreadCount: (countRows[0]?.count as number) || 0,
    analyses: analyses as (FeedbackAnalysis & { question_text: string; paper: number; family_label: string; user_feedback: string; has_narration: boolean; pending_narration: boolean })[],
  };
}

export async function getUserStats(userId: number): Promise<UserStats> {
  const sql = getDb();

  // The exam-readiness scoreboard reflects full study reps only — Stem Sniper / Reverse Tasting
  // drills have no pass/fail and would deflate the pass rate and inflate the totals, so exclude them.
  const totals = await sql`
    SELECT
      COUNT(*)::int as total_attempts,
      COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END)::int as completed_attempts,
      COUNT(CASE WHEN pass_estimate = 'pass' THEN 1 END)::int as pass_count,
      COUNT(CASE WHEN pass_estimate = 'fail' THEN 1 END)::int as fail_count,
      COUNT(CASE WHEN pass_estimate = 'borderline' THEN 1 END)::int as borderline_count
    FROM user_attempts
    WHERE user_id = ${userId} AND (mode IS NULL OR mode = 'full')
  `;

  // By paper
  const byPaper = await sql`
    SELECT
      q.paper,
      COUNT(*)::int as total,
      COUNT(CASE WHEN a.pass_estimate = 'pass' THEN 1 END)::int as pass,
      COUNT(CASE WHEN a.pass_estimate = 'fail' THEN 1 END)::int as fail,
      COUNT(CASE WHEN a.pass_estimate = 'borderline' THEN 1 END)::int as borderline
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE a.user_id = ${userId} AND a.completed_at IS NOT NULL AND (a.mode IS NULL OR a.mode = 'full')
    GROUP BY q.paper
    ORDER BY q.paper
  `;

  // By family
  const byFamily = await sql`
    SELECT
      q.family,
      q.family_label,
      COUNT(*)::int as total,
      COUNT(CASE WHEN a.pass_estimate = 'pass' THEN 1 END)::int as pass,
      COUNT(CASE WHEN a.pass_estimate = 'borderline' THEN 1 END)::int as borderline,
      COUNT(CASE WHEN a.pass_estimate = 'fail' THEN 1 END)::int as fail
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE a.user_id = ${userId} AND a.completed_at IS NOT NULL AND (a.mode IS NULL OR a.mode = 'full')
    GROUP BY q.family, q.family_label
    ORDER BY total DESC
  `;

  // Recent 5 results
  const recentResults = await sql`
    SELECT pass_estimate, started_at
    FROM user_attempts
    WHERE user_id = ${userId} AND completed_at IS NOT NULL AND pass_estimate IS NOT NULL
      AND (mode IS NULL OR mode = 'full')
    ORDER BY completed_at DESC
    LIMIT 5
  `;

  const t = totals[0] || { total_attempts: 0, completed_attempts: 0, pass_count: 0, fail_count: 0, borderline_count: 0 };

  return {
    total_attempts: t.total_attempts as number,
    completed_attempts: t.completed_attempts as number,
    pass_count: t.pass_count as number,
    fail_count: t.fail_count as number,
    borderline_count: t.borderline_count as number,
    by_paper: byPaper as UserStats["by_paper"],
    by_family: byFamily as UserStats["by_family"],
    recent_results: recentResults as UserStats["recent_results"],
  };
}

// ── Feature Requests ──
// Admin-only Feature Request engine: an admin describes a feature; Opus clarifies + proposes
// (user-facing) and writes a technical spec; on confirm, the feature-build workflow implements it.
// Feedback classified as a feature request is logged here too (never auto-built). See migration 010.

export interface FeatureRequest {
  id: number;
  created_by: number | null;
  title: string | null;
  // drafting|clarifying|proposed|ready|building|built|pr_opened|pr_merged|pr_closed|answered|failed
  // `answered` is terminal and set by hand: the report was a question, and answering it was the
  // whole resolution. No automated writer ever produces it.
  // pr_merged / pr_closed are written by the PR reconciler (src/lib/pr-status.ts), not the pipeline.
  status: string;
  // mockups (optional) carry rendered UI samples on a proposing assistant turn — stored in the JSONB
  // thread so re-opening a request re-renders them. No schema change needed.
  thread: { role: "user" | "assistant"; content: string; timestamp: string; mockups?: { title: string; html: string }[] }[];
  user_facing_proposal: string | null;
  technical_spec: string | null;
  work_branch: string | null;
  commit_sha: string | null;
  pr_url: string | null;
  apply_status: string | null;
  apply_error: string | null;
  applied_by: string | null;
  created_at: string;
  updated_at: string;
}

export async function createFeatureRequest(
  createdBy: number | null,
  title: string | null,
  thread: FeatureRequest["thread"],
  status = "drafting"
): Promise<FeatureRequest> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO feature_requests (created_by, title, status, thread)
    VALUES (${createdBy}, ${title}, ${status}, ${JSON.stringify(thread)}::jsonb)
    RETURNING *
  `;
  return rows[0] as FeatureRequest;
}

// Seed a Feature Request from a piece of user feedback that was classified as a feature request
// (not a fix). Stored as a 'drafting' row whose first turn is the raw feedback, so an admin can open
// it in the engine and continue the clarify → propose → build flow. Returns the new id.
export async function createFeatureRequestFromFeedback(opts: {
  userId: number | null;
  feedbackText: string;
  analysisText: string;
}): Promise<number> {
  const sql = getDb();
  const title = opts.feedbackText.replace(/^\[[^\]]*\]\s*/, "").trim().slice(0, 80);
  const thread = [
    { role: "user" as const, content: opts.feedbackText, timestamp: new Date().toISOString() },
  ];
  const rows = await sql`
    INSERT INTO feature_requests (created_by, title, status, thread)
    VALUES (${opts.userId}, ${title || "Feature request from feedback"}, 'drafting', ${JSON.stringify(thread)}::jsonb)
    RETURNING id
  `;
  return rows[0].id as number;
}

export async function getFeatureRequest(id: number): Promise<FeatureRequest | null> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM feature_requests WHERE id = ${id}`;
  return (rows[0] as FeatureRequest) ?? null;
}

export async function listFeatureRequests(limit = 50): Promise<FeatureRequest[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM feature_requests ORDER BY created_at DESC LIMIT ${limit}
  `) as FeatureRequest[];
}

// Patch a subset of fields (thread / proposal / spec / status / audit). Only provided keys are written.
export async function updateFeatureRequest(
  id: number,
  data: Partial<{
    title: string;
    status: string;
    thread: FeatureRequest["thread"];
    user_facing_proposal: string;
    technical_spec: string;
    work_branch: string;
    applied_by: string;
    apply_status: string;
  }>
): Promise<FeatureRequest> {
  const sql = getDb();
  const rows = await sql`
    UPDATE feature_requests SET
      title = COALESCE(${data.title ?? null}, title),
      status = COALESCE(${data.status ?? null}, status),
      thread = COALESCE(${data.thread ? JSON.stringify(data.thread) : null}::jsonb, thread),
      user_facing_proposal = COALESCE(${data.user_facing_proposal ?? null}, user_facing_proposal),
      technical_spec = COALESCE(${data.technical_spec ?? null}, technical_spec),
      work_branch = COALESCE(${data.work_branch ?? null}, work_branch),
      applied_by = COALESCE(${data.applied_by ?? null}, applied_by),
      apply_status = COALESCE(${data.apply_status ?? null}::text, apply_status),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `;
  return rows[0] as FeatureRequest;
}
