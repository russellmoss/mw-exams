import { neon } from "@neondatabase/serverless";
import { dispatchAutoFeedback } from "./github-dispatch";
import { recordApply, reviewFeedback } from "./db";
import { reconcileOpenPrs } from "./pr-status";

export interface ApplyResult {
  dispatched: boolean;
  workBranch: string;
  analysisId: number;
}

// Feature-isolation path allow-lists, shared with the bin-fix miner (bin-fix-miner.ts) so a
// bin-driven fix is scoped exactly like a feedback-driven one of the same Kind.
export const STEM_PATHS = [
  "study-app/src/app/stem-sniper/", "study-app/src/app/components/StemSniper",
  "study-app/src/app/api/stem-sniper/", "study-app/src/lib/stem-scoring.ts",
  "study-app/src/lib/stem-answer-key.ts", "study-app/src/lib/stem-answer-key.mjs",
  "study-app/public/data/stem-autocomplete.json", "study-app/scripts/build-stem-",
  "study-app/scripts/test-stem-scoring.mjs", "data/variety_lexicon.json",
  "data/appellation_varieties.json", "data/stem_proprietary_blends.json", "data/stem_style_lexicon.json",
];
// db.ts is the QUERY layer where selection / dedup / per-user-scoping logic lives. It's included
// so the agent can propose COMPLETE fixes for that class of bug (e.g. repetition) instead of
// route-only partials — but generation/validator changes are reviewOnly (PR-gated), so a db.ts
// change is never auto-merged; a human reviews it. (High blast radius: scrutinise these PRs.)
export const GEN_PATHS = [
  "study-app/src/lib/prompts/question-generation-prompt.ts", "study-app/src/lib/wine-enrichment.ts",
  "study-app/src/lib/wine-bank-lookup.ts", "study-app/src/app/api/get-question/",
  "study-app/src/lib/question-engine.ts", "study-app/src/app/api/generate-tasting/",
  "study-app/src/lib/tasting.ts", "study-app/src/lib/tasting-validators.ts",
  "study-app/src/lib/prompts/tasting-prompt.ts", "data/mock_wine_bank.json", "study-app/src/lib/db.ts",
  // The grader rubric. The analysis prompt already routes a valid scoring dispute here
  // ("Kind: generation naming marking-principles.ts"), but the path was missing from this
  // allow-list, so such a fix could be recommended and never written. Now that the analysis sees
  // the verbatim grading output, scoring accepts are far more likely — and still PR-gated.
  "study-app/src/lib/prompts/marking-principles.ts", "study-app/src/lib/prompts/funnelling.ts",
];
export const VALIDATOR_PATHS = [
  "study-app/src/lib/question-validator.ts", "study-app/scripts/audit-questions.mjs",
  "study-app/src/lib/question-engine.ts", "study-app/src/lib/tasting-validators.ts",
  "study-app/src/app/api/get-question/", "study-app/src/lib/prompts/question-generation-prompt.ts",
  "study-app/src/lib/db.ts",
];

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
      fa.id AS analysis_id, fa.thread, fa.recommendation, fa.analyzed_feedback,
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

  // Use the EXACT feedback the analysis ran on (snapshot), not a later re-read of the mutable
  // column — so routing/context can't drift from what was analyzed. Legacy rows (pre-009) have a
  // null snapshot; fall back to the live column for those.
  const analyzedFeedback = (r.analyzed_feedback as string | null) ?? null;
  const liveFeedback = (r.user_feedback as string) || "";
  const feedbackText = analyzedFeedback ?? liveFeedback;

  // A4 — fail loud on divergence. If the snapshot the analysis saw no longer matches the attempt's
  // current feedback, the no-overwrite guard (recordUserFeedback) was bypassed somehow; do NOT
  // auto-merge — force the change through human review (reviewOnly) and log it.
  const feedbackMismatch = !!analyzedFeedback && analyzedFeedback.trim() !== liveFeedback.trim();
  if (feedbackMismatch) {
    console.error(
      `[apply-change] feedback snapshot mismatch on attempt ${attemptId} / analysis ${analysisId}: ` +
        `analysis ran on text that differs from the attempt's current user_feedback. Forcing reviewOnly.`
    );
  }

  const context = [
    `Paper ${r.paper} — ${r.family_label} (${r.family})`,
    `Question ID: ${r.question_id}`,
    ``,
    `## User feedback`,
    feedbackText || "(none)",
    ``,
    `## Question text`,
    (r.question_text as string) || "(none)",
  ].join("\n");

  // Route by the analysis's Kind line. Feedback CAN reach question generation and the validators
  // (the most common root cause), but those high-stakes code changes are PR-gated (reviewOnly);
  // answer-key data fixes auto-apply (scoped); a one-off bad question is quarantined here directly.
  const kind = (analysisText.match(/Kind:\s*\**(answer-key|question|generation|validator)\**/i)?.[1] || "").toLowerCase();
  // Prefix-match so the context-aware tags ([stem-sniper:stem|reverse-stem|reverse-tasting|result|
  // reverse-result]) and the legacy [stem-sniper] all route to the STEM/answer-key file-set.
  const isStemSniper = /\[stem-sniper/i.test(feedbackText);
  const questionId = r.question_id as string;

  // Kind: question — quarantine THIS question directly (no Action). Hides it from BOTH flows
  // (Stem Sniper via stem_answer_keys.validated, main flow via generated_questions.invalid_reasons).
  // Phase D regenerates it later.
  if (kind === "question") {
    const reason = [{ rule: "feedback-question", severity: "hard", detail: feedbackText.slice(0, 300) }];
    await sql`ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
    await sql`UPDATE generated_questions SET invalid_reasons = ${JSON.stringify(reason)}::jsonb WHERE question_id = ${questionId}`;
    await sql`UPDATE stem_answer_keys SET validated = false, invalid_reasons = ${JSON.stringify(reason)}::jsonb WHERE question_id = ${questionId}`;
    await recordApply(analysisId, { apply_status: "quarantined", applied_by: appliedBy });
    await reviewFeedback(attemptId, "accepted", `Question quarantined as invalid (${appliedBy})`, appliedBy === "auto" ? "auto" : "manual");
    return { dispatched: false, workBranch, analysisId };
  }

  const STEM = STEM_PATHS;
  const GEN = GEN_PATHS;
  const VALIDATOR = VALIDATOR_PATHS;

  // Feature isolation by Kind. generation/validator are PR-gated (reviewOnly) for human review;
  // answer-key is auto + scoped. No Kind + not Stem Sniper → repo-wide auto (legacy main-flow).
  let allowedPaths = "";
  let reviewOnly = false;
  if (kind === "answer-key" || (!kind && isStemSniper)) allowedPaths = STEM.join("\n");
  else if (kind === "generation") { allowedPaths = GEN.join("\n"); reviewOnly = true; }
  else if (kind === "validator") { allowedPaths = VALIDATOR.join("\n"); reviewOnly = true; }
  // A4 — a divergent snapshot must never auto-merge: send it to PR review regardless of Kind.
  if (feedbackMismatch) reviewOnly = true;

  // Duplicate-PR guard. Two unrelated feedback items previously opened overlapping auto-feedback PRs
  // on the same file (PRs #4/#5, both editing get-question/route.ts) which then merge-conflicted.
  // Serialize AUTO, PR-gated dispatches: at most one auto-feedback PR in flight at a time. The next
  // accept defers (stays in the open queue) until a human reviews/merges the open one. A manual admin
  // "Apply & ship" (appliedBy != 'auto') is exempt, and a 7-day window stops an abandoned PR blocking forever.
  if (reviewOnly && appliedBy === "auto") {
    const candidates = await sql`
      SELECT id, pr_url, apply_status FROM feedback_analyses
      WHERE id <> ${analysisId}
        AND apply_status IN ('dispatched', 'pr_opened')
        AND updated_at > now() - interval '7 days'
      ORDER BY updated_at DESC
      LIMIT 10
    `;
    // A PR merged by hand leaves apply_status stuck at 'pr_opened' (nothing pushes the merge back to
    // us), and that stale row would block every later auto-fix for the full 7 days. Ask GitHub what
    // actually happened first, then only defer for a PR that is genuinely still open.
    const settled = await reconcileOpenPrs(
      candidates as { id: number; pr_url: string | null; apply_status: string }[],
      (row) => row.apply_status === "pr_opened",
      async (row, state) => recordApply(row.id, { apply_status: state === "merged" ? "merged" : "pr_closed" })
    );
    const inflight = candidates.filter((row) => !settled.has(row.id as number));
    if (inflight.length > 0) {
      const ref = (inflight[0].pr_url as string) || `analysis #${inflight[0].id}`;
      const note = `Deferred by Auto-Apply: another auto-fix PR is already in flight (${ref}). Review/merge it first, then re-apply this from the admin dashboard.`;
      await recordApply(analysisId, { apply_status: "deferred", applied_by: appliedBy });
      // Leave feedback_status untouched (stays in the open queue) — only annotate, so a human can
      // pick it up via the (guard-exempt) manual "Apply & ship" once the in-flight PR clears.
      await sql`UPDATE user_attempts SET feedback_admin_note = ${note} WHERE id = ${attemptId}`;
      return { dispatched: false, workBranch, analysisId };
    }
  }

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
