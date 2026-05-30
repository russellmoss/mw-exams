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

  // Route by the analysis's Kind line. Feedback CAN reach question generation and the validators
  // (the most common root cause), but those high-stakes code changes are PR-gated (reviewOnly);
  // answer-key data fixes auto-apply (scoped); a one-off bad question is quarantined here directly.
  const kind = (analysisText.match(/Kind:\s*\**(answer-key|question|generation|validator)\**/i)?.[1] || "").toLowerCase();
  const isStemSniper = /\[stem-sniper\]/i.test((r.user_feedback as string) || "");
  const questionId = r.question_id as string;

  // Kind: question — quarantine THIS question directly (no Action). Hides it from BOTH flows
  // (Stem Sniper via stem_answer_keys.validated, main flow via generated_questions.invalid_reasons).
  // Phase D regenerates it later.
  if (kind === "question") {
    const reason = [{ rule: "feedback-question", severity: "hard", detail: ((r.user_feedback as string) || "").slice(0, 300) }];
    await sql`ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
    await sql`UPDATE generated_questions SET invalid_reasons = ${JSON.stringify(reason)}::jsonb WHERE question_id = ${questionId}`;
    await sql`UPDATE stem_answer_keys SET validated = false, invalid_reasons = ${JSON.stringify(reason)}::jsonb WHERE question_id = ${questionId}`;
    await recordApply(analysisId, { apply_status: "quarantined", applied_by: appliedBy });
    await reviewFeedback(attemptId, "accepted", `Question quarantined as invalid (${appliedBy})`, appliedBy === "auto" ? "auto" : "manual");
    return { dispatched: false, workBranch, analysisId };
  }

  const STEM = [
    "study-app/src/app/stem-sniper/", "study-app/src/app/components/StemSniper",
    "study-app/src/app/api/stem-sniper/", "study-app/src/lib/stem-scoring.ts",
    "study-app/public/data/stem-autocomplete.json", "study-app/scripts/build-stem-",
    "study-app/scripts/test-stem-scoring.mjs", "data/variety_lexicon.json",
    "data/appellation_varieties.json", "data/stem_proprietary_blends.json", "data/stem_style_lexicon.json",
  ];
  const GEN = [
    "study-app/src/lib/prompts/question-generation-prompt.ts", "study-app/src/lib/wine-enrichment.ts",
    "study-app/src/lib/wine-bank-lookup.ts", "study-app/src/app/api/get-question/",
    "study-app/src/app/api/generate-tasting/", "data/mock_wine_bank.json",
  ];
  const VALIDATOR = [
    "study-app/src/lib/question-validator.ts", "study-app/scripts/audit-questions.mjs",
    "study-app/src/app/api/get-question/", "study-app/src/lib/prompts/question-generation-prompt.ts",
  ];

  // Feature isolation by Kind. generation/validator are PR-gated (reviewOnly) for human review;
  // answer-key is auto + scoped. No Kind + not Stem Sniper → repo-wide auto (legacy main-flow).
  let allowedPaths = "";
  let reviewOnly = false;
  if (kind === "answer-key" || (!kind && isStemSniper)) allowedPaths = STEM.join("\n");
  else if (kind === "generation") { allowedPaths = GEN.join("\n"); reviewOnly = true; }
  else if (kind === "validator") { allowedPaths = VALIDATOR.join("\n"); reviewOnly = true; }

  await dispatchAutoFeedback({
    attemptId,
    analysisId,
    appliedBy,
    workBranch,
    context,
    analysisText,
    allowedPaths,
    reviewOnly: reviewOnly ? "true" : "",
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
