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

  const context = [
    `Paper ${r.paper} — ${r.family_label} (${r.family})`,
    `Question ID: ${r.question_id}`,
    ``,
    `## User feedback`,
    (r.user_feedback as string) || "(none)",
    ``,
    `## Question text`,
    (r.question_text as string) || "(none)",
  ].join("\n");

  // Feature isolation: Stem Sniper feedback (data or logic) must stay within Stem Sniper-owned
  // files. The Action diff-guards the change against these prefixes and opens a PR (instead of
  // merging) if it strays. Empty allowedPaths = repo-wide (existing tasting/question feedback).
  const isStemSniper = /\[stem-sniper\]/i.test((r.user_feedback as string) || "");
  const allowedPaths = isStemSniper
    ? [
        "study-app/src/app/stem-sniper/",
        "study-app/src/app/components/StemSniper",
        "study-app/src/app/api/stem-sniper/",
        "study-app/src/lib/stem-scoring.ts",
        "study-app/public/data/stem-autocomplete.json",
        "study-app/scripts/build-stem-",
        "study-app/scripts/test-stem-scoring.mjs",
        "data/variety_lexicon.json",
        "data/appellation_varieties.json",
        "data/stem_proprietary_blends.json",
        "data/stem_style_lexicon.json",
      ].join("\n")
    : "";

  await dispatchAutoFeedback({
    attemptId,
    analysisId,
    appliedBy,
    workBranch,
    context,
    analysisText,
    allowedPaths,
  });

  await recordApply(analysisId, {
    apply_status: "dispatched",
    work_branch: workBranch,
    applied_by: appliedBy,
  });

  // Move the item out of the open-feedback queue; the Action updates the final state.
  // appliedBy is 'auto' for the Auto-Apply pipeline, 'admin:{id}' for a manual "Apply & ship".
  await reviewFeedback(
    attemptId,
    "accepted",
    `Auto-apply dispatched (${appliedBy})`,
    appliedBy === "auto" ? "auto" : "manual"
  );

  return { dispatched: true, workBranch, analysisId };
}
