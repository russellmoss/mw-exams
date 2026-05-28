import { neon } from "@neondatabase/serverless";

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
  const sql = getDb();
  if (family && family !== "any") {
    return (await sql`
      SELECT * FROM generated_questions
      WHERE paper = ${paper} AND family = ${family}
        AND question_id NOT IN (
          SELECT DISTINCT ua.question_id FROM user_attempts ua
          WHERE ua.feedback_status = 'accepted'
        )
      ORDER BY created_at DESC
    `) as GeneratedQuestion[];
  }
  return (await sql`
    SELECT * FROM generated_questions
    WHERE paper = ${paper}
      AND question_id NOT IN (
        SELECT DISTINCT ua.question_id FROM user_attempts ua
        WHERE ua.feedback_status = 'accepted'
      )
    ORDER BY created_at DESC
  `) as GeneratedQuestion[];
}

export async function getRecentGeneratedQuestions(limit = 5): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  return (await sql`
    SELECT * FROM generated_questions
    ORDER BY created_at DESC
    LIMIT ${limit}
  `) as GeneratedQuestion[];
}

export async function getUnansweredQuestions(
  paper: number,
  family?: string
): Promise<GeneratedQuestion[]> {
  const sql = getDb();
  if (family && family !== "any") {
    return (await sql`
      SELECT q.* FROM generated_questions q
      LEFT JOIN user_attempts a ON q.question_id = a.question_id AND a.completed_at IS NOT NULL
      WHERE q.paper = ${paper}
        AND q.family = ${family}
        AND q.model_answer IS NOT NULL
        AND length(q.model_answer) > 100
        AND a.id IS NULL
        AND q.question_id NOT IN (
          SELECT DISTINCT ua.question_id FROM user_attempts ua
          WHERE ua.feedback_status = 'accepted'
        )
      ORDER BY q.created_at ASC
    `) as GeneratedQuestion[];
  }
  return (await sql`
    SELECT q.* FROM generated_questions q
    LEFT JOIN user_attempts a ON q.question_id = a.question_id AND a.completed_at IS NOT NULL
    WHERE q.paper = ${paper}
      AND q.model_answer IS NOT NULL
      AND length(q.model_answer) > 100
      AND a.id IS NULL
      AND q.question_id NOT IN (
        SELECT DISTINCT ua.question_id FROM user_attempts ua
        WHERE ua.feedback_status = 'accepted'
      )
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
  }>
): Promise<UserAttempt> {
  const sql = getDb();

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
    const rows = await sql`
      UPDATE user_attempts SET user_feedback = ${data.user_feedback} WHERE id = ${attemptId} RETURNING *
    `;
    return rows[0] as UserAttempt;
  }

  const rows = await sql`SELECT * FROM user_attempts WHERE id = ${attemptId}`;
  return rows[0] as UserAttempt;
}

export async function reviewFeedback(
  attemptId: number,
  status: string,
  adminNote: string | null
): Promise<UserAttempt> {
  const sql = getDb();
  const rows = await sql`
    UPDATE user_attempts SET
      feedback_status = ${status},
      feedback_admin_note = ${adminNote},
      feedback_reviewed_at = NOW()
    WHERE id = ${attemptId} RETURNING *
  `;
  return rows[0] as UserAttempt;
}

export async function getRecentAttempts(limit = 20): Promise<
  (UserAttempt & { paper: number; family: string; family_label: string })[]
> {
  const sql = getDb();
  return (await sql`
    SELECT a.*, q.paper, q.family, q.family_label
    FROM user_attempts a
    JOIN generated_questions q ON a.question_id = q.question_id
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
  by_family: { family: string; family_label: string; total: number; pass: number }[];
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

export async function getUserNotifications(userId: number): Promise<{
  unreadCount: number;
  analyses: (FeedbackAnalysis & { question_text: string; paper: number; family_label: string; user_feedback: string })[];
}> {
  const sql = getDb();
  const countRows = await sql`
    SELECT COUNT(*)::int as count FROM feedback_analyses
    WHERE user_id = ${userId} AND is_read = false AND status IN ('complete', 'error')
  `;
  const analyses = await sql`
    SELECT fa.*, a.user_feedback,
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
    analyses: analyses as (FeedbackAnalysis & { question_text: string; paper: number; family_label: string; user_feedback: string })[],
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
      COUNT(CASE WHEN a.pass_estimate = 'pass' THEN 1 END)::int as pass
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
