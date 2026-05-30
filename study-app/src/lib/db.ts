import { neon } from "@neondatabase/serverless";
import { BUNDLED_TASTING_LEXICON, type TastingLexicon } from "./prompts/tasting-lexicon";

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
  wines: { slot: number; fullText: string; appearance?: string }[];
  total_marks: number;
  model_answer: string | null;
  proposed_annotation: string | null;
  reasoning_trace: string | null;
  study_diagram_assist: string | null;
  metadata: Record<string, unknown>;
  wine_profiles: Record<string, unknown>;
  created_at: string;
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
}): Promise<GeneratedQuestion> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO generated_questions (
      question_id, paper, family, family_label, subcategory,
      question_text, wines, total_marks,
      model_answer, proposed_annotation, reasoning_trace, study_diagram_assist,
      metadata
    ) VALUES (
      ${q.questionId}, ${q.paper}, ${q.family}, ${q.familyLabel}, ${q.subcategory || null},
      ${q.questionText}, ${JSON.stringify(q.wines)}, ${q.totalMarks},
      ${q.modelAnswer || null}, ${q.proposedAnnotation || null},
      ${q.reasoningTrace || null}, ${q.studyDiagramAssist || null},
      ${JSON.stringify(q.metadata || {})}
    )
    ON CONFLICT (question_id) DO UPDATE SET
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
  const sql = getDb();
  if (family && family !== "any") {
    return (await sql`
      SELECT * FROM generated_questions
      WHERE paper = ${paper} AND family = ${family}
        AND invalid_reasons IS NULL
      ORDER BY created_at DESC
    `) as GeneratedQuestion[];
  }
  return (await sql`
    SELECT * FROM generated_questions
    WHERE paper = ${paper}
      AND invalid_reasons IS NULL
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

export async function createAttempt(questionId: string): Promise<UserAttempt> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO user_attempts (question_id)
    VALUES (${questionId})
    RETURNING *
  `;
  return rows[0] as UserAttempt;
}

export async function createAttemptWithUser(questionId: string, userId: number): Promise<UserAttempt> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO user_attempts (question_id, user_id)
    VALUES (${questionId}, ${userId})
    RETURNING *
  `;
  return rows[0] as UserAttempt;
}

export async function updateAttempt(
  attemptId: number,
  data: Partial<{
    pre_glass_reasoning: string;
    pre_glass_feedback: string;
    tasting_notes: string[];
    user_answer: string;
    answer_feedback: string;
    pass_estimate: string;
    marks_estimate: string;
    completed_at: string;
    user_feedback: string;
    elapsed_seconds: number;
    current_step: string;
  }>
): Promise<UserAttempt> {
  const sql = getDb();

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
    const rows = await sql`
      UPDATE user_attempts SET user_answer = ${data.user_answer} WHERE id = ${attemptId} RETURNING *
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

export async function getRecentAttempts(limit = 20, userId?: number | null): Promise<
  (UserAttempt & { paper: number; family: string; family_label: string })[]
> {
  // When `userId` is given, returns only that user's recent attempts — so the serve layer can build
  // a per-user "recently served" set instead of one polluted by other users' activity. `uid` null
  // preserves the prior global behaviour for any caller that wants a cross-user view.
  const uid = userId ?? null;
  const sql = getDb();
  return (await sql`
    SELECT a.*, q.paper, q.family, q.family_label
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE (${uid}::int IS NULL OR a.user_id = ${uid})
    ORDER BY a.started_at DESC
    LIMIT ${limit}
  `) as (UserAttempt & { paper: number; family: string; family_label: string })[];
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
      q.total_marks
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
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
  apply_status: string | null; // dispatched|verifying|merged|deployed|pr_opened|failed
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
}) | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT fa.*, a.user_feedback, a.user_answer,
      q.question_text, q.wines, q.paper, q.family, q.family_label, q.model_answer
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
        AND (section IN (5, 6, 7) OR (section IN (1, 4) AND (paper IS NULL OR paper = ${paper})))
      ORDER BY section, ek_id
    `) as Record<string, unknown>[];
  } catch {
    return ""; // table not present yet → caller falls back to the build-time digest
  }
  if (!rows.length) return "";
  const LABELS: Record<number, string> = {
    1: "§1 · Exam structure",
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

  // Aggregate totals
  const totals = await sql`
    SELECT
      COUNT(*)::int as total_attempts,
      COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END)::int as completed_attempts,
      COUNT(CASE WHEN pass_estimate = 'pass' THEN 1 END)::int as pass_count,
      COUNT(CASE WHEN pass_estimate = 'fail' THEN 1 END)::int as fail_count,
      COUNT(CASE WHEN pass_estimate = 'borderline' THEN 1 END)::int as borderline_count
    FROM user_attempts
    WHERE user_id = ${userId}
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
    WHERE a.user_id = ${userId} AND a.completed_at IS NOT NULL
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
    WHERE a.user_id = ${userId} AND a.completed_at IS NOT NULL
    GROUP BY q.family, q.family_label
    ORDER BY total DESC
  `;

  // Recent 5 results
  const recentResults = await sql`
    SELECT pass_estimate, started_at
    FROM user_attempts
    WHERE user_id = ${userId} AND completed_at IS NOT NULL AND pass_estimate IS NOT NULL
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
