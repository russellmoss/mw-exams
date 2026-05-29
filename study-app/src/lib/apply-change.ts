import { neon } from "@neondatabase/serverless";
import { dispatchAutoFeedback } from "./github-dispatch";
import { recordApply, reviewFeedback } from "./db";

export interface ApplyResult {
  dispatched: boolean;
  workBranch: string;
  analysisId: number;
}

/**
 * Shared orchestrator for the "accept → verified code change → ship" pipeline.
 * Used by both the auto path (feedback-analysis trigger, when the toggle is on) and the
 * manual admin "Apply & ship" button. It does NOT edit code or commit — it gathers context
 * and fires a GitHub repository_dispatch; the GitHub Action does the editing, verification,
 * self-heal, merge, and deploy confirmation where a real toolchain exists.
 */
export async function applyFeedbackChange(opts: {
  attemptId: number;
  appliedBy: string; // 'auto' | 'admin:{id}'
}): Promise<ApplyResult> {
  const { attemptId, appliedBy } = opts;
  const sql = neon(process.env.DATABASE_URL!);

  const rows = await sql`
    SELECT
      a.id AS attempt_id, a.user_feedback, a.question_id,
      fa.id AS analysis_id, fa.thread, fa.recommendation,
      q.paper, q.family, q.family_label, q.question_text
    FROM user_attempts a
    JOIN feedback_analyses fa ON fa.attempt_id = a.id
    JOIN generated_questions q ON a.question_id = q.question_id
    WHERE a.id = ${attemptId}
    ORDER BY fa.updated_at DESC
    LIMIT 1
  `;

  const r = rows[0];
  if (!r) throw new Error(`No feedback analysis found for attempt ${attemptId}`);

  const thread =
    typeof r.thread === "string" ? JSON.parse(r.thread as string) : (r.thread as { role: string; content: string }[]);
  // The analysis (with the "Proposed Change" section) is the most recent system message.
  const analysisText =
    [...(thread || [])].reverse().find((m) => m.role === "system")?.content || "";

  const analysisId = r.analysis_id as number;
  const workBranch = `auto-feedback/attempt-${attemptId}`;

  await dispatchAutoFeedback({
    attemptId,
    analysisId,
    appliedBy,
    workBranch,
    questionId: r.question_id as string,
    paper: r.paper as number,
    family: r.family as string,
    familyLabel: r.family_label as string,
    questionText: r.question_text as string,
    userFeedback: (r.user_feedback as string) ?? null,
    analysisText,
  });

  await recordApply(analysisId, {
    apply_status: "dispatched",
    work_branch: workBranch,
    applied_by: appliedBy,
  });

  // Move the item out of the open-feedback queue; the Action updates the final state.
  await reviewFeedback(attemptId, "accepted", `Auto-apply dispatched (${appliedBy})`);

  return { dispatched: true, workBranch, analysisId };
}
