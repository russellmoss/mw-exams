import { after } from "next/server";
import { getUser } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";
import { sweepStrandedFeedback } from "@/lib/feedback-analysis";
import { reconcileOpenPrs } from "@/lib/pr-status";
import { recordApply } from "@/lib/db";

export const runtime = "nodejs";
// Opportunistic stranded-feedback sweep runs in `after()`, which can keep this
// invocation alive past the response while it analyzes a small batch.
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user || !user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Self-heal: any time an admin views the feedback queue, analyze a small batch of
    // feedback that was submitted but never analyzed. Runs post-response so the list
    // returns instantly; the cron sweeper covers times nobody is looking.
    after(async () => {
      try {
        await sweepStrandedFeedback(3);
      } catch (err) {
        console.error("[admin/feedback] opportunistic sweep failed:", err);
      }
    });

    const url = new URL(request.url);
    const status = url.searchParams.get("status");

    const sql = neon(process.env.DATABASE_URL!);

    // Each query also pulls the latest feedback_analysis per attempt (LATERAL) so the admin
    // UI can show auto-apply status, the recommendation, and links to the commit/PR/deploy.
    let attempts;
    if (status === "open") {
      attempts = await sql`
        SELECT a.*, u.name as user_name, u.email as user_email,
          COALESCE(q.paper, 0) as paper, COALESCE(q.family, '') as family,
          COALESCE(q.family_label, 'General') as family_label, q.subcategory,
          COALESCE(q.question_text, 'General feedback') as question_text,
          COALESCE(q.wines::text, '[]') as wines, q.model_answer, COALESCE(q.total_marks, 0) as total_marks,
          fa.id as analysis_id, fa.recommendation as auto_recommendation, fa.apply_status, fa.work_branch,
          fa.commit_sha, fa.pr_url, fa.deploy_state, fa.applied_by, fa.apply_error
        FROM user_attempts a
        JOIN users u ON a.user_id = u.id
        LEFT JOIN generated_questions q ON a.question_id = q.question_id
        LEFT JOIN LATERAL (
          SELECT * FROM feedback_analyses f WHERE f.attempt_id = a.id ORDER BY f.updated_at DESC LIMIT 1
        ) fa ON true
        WHERE a.mode = 'full'
          AND a.user_feedback IS NOT NULL AND a.feedback_status IS NULL
        ORDER BY a.feedback_submitted_at DESC NULLS LAST, a.completed_at DESC
      `;
    } else if (status === "accepted" || status === "rejected" || status === "endorsed") {
      // The Accepted bucket also surfaces PARTIAL items (valid points, core question sound) so
      // the admin sees them alongside full accepts (rendered orange in the UI). Endorsed is its own
      // bucket — praise, no defect, question flagged as an exemplar.
      const statuses =
        status === "accepted" ? ["accepted", "partial"] : status === "endorsed" ? ["endorsed"] : ["rejected"];
      attempts = await sql`
        SELECT a.*, u.name as user_name, u.email as user_email,
          COALESCE(q.paper, 0) as paper, COALESCE(q.family, '') as family,
          COALESCE(q.family_label, 'General') as family_label, q.subcategory,
          COALESCE(q.question_text, 'General feedback') as question_text,
          COALESCE(q.wines::text, '[]') as wines, q.model_answer, COALESCE(q.total_marks, 0) as total_marks,
          fa.id as analysis_id, fa.recommendation as auto_recommendation, fa.apply_status, fa.work_branch,
          fa.commit_sha, fa.pr_url, fa.deploy_state, fa.applied_by, fa.apply_error
        FROM user_attempts a
        JOIN users u ON a.user_id = u.id
        LEFT JOIN generated_questions q ON a.question_id = q.question_id
        LEFT JOIN LATERAL (
          SELECT * FROM feedback_analyses f WHERE f.attempt_id = a.id ORDER BY f.updated_at DESC LIMIT 1
        ) fa ON true
        WHERE a.mode = 'full'
          AND a.feedback_status = ANY(${statuses})
        ORDER BY a.feedback_submitted_at DESC NULLS LAST, a.feedback_reviewed_at DESC
      `;
    } else {
      attempts = await sql`
        SELECT a.*, u.name as user_name, u.email as user_email,
          COALESCE(q.paper, 0) as paper, COALESCE(q.family, '') as family,
          COALESCE(q.family_label, 'General') as family_label, q.subcategory,
          COALESCE(q.question_text, 'General feedback') as question_text,
          COALESCE(q.wines::text, '[]') as wines, q.model_answer, COALESCE(q.total_marks, 0) as total_marks,
          fa.id as analysis_id, fa.recommendation as auto_recommendation, fa.apply_status, fa.work_branch,
          fa.commit_sha, fa.pr_url, fa.deploy_state, fa.applied_by, fa.apply_error
        FROM user_attempts a
        JOIN users u ON a.user_id = u.id
        LEFT JOIN generated_questions q ON a.question_id = q.question_id
        LEFT JOIN LATERAL (
          SELECT * FROM feedback_analyses f WHERE f.attempt_id = a.id ORDER BY f.updated_at DESC LIMIT 1
        ) fa ON true
        WHERE a.mode = 'full'
          AND a.user_feedback IS NOT NULL
        ORDER BY a.feedback_submitted_at DESC NULLS LAST, a.completed_at DESC
      `;
    }

    // Same staleness as the Feature Request panel: the auto-feedback Action writes `pr_opened` and
    // never learns that the PR was merged. Stale `pr_opened` rows also block the in-flight guard in
    // apply-change.ts, so reconcile them against GitHub here and patch the rows we're about to send.
    const reconciled = await reconcileOpenPrs(
      attempts as unknown as { id: number; pr_url?: string | null; apply_status?: string | null; analysis_id?: number | null }[],
      (row) => row.apply_status === "pr_opened",
      async (row, state) => {
        if (row.analysis_id) await recordApply(row.analysis_id, { apply_status: state === "merged" ? "merged" : "pr_closed" });
      }
    );
    for (const row of attempts as unknown as { id: number; apply_status?: string | null }[]) {
      const state = reconciled.get(row.id);
      if (state) row.apply_status = state === "merged" ? "merged" : "pr_closed";
    }

    const counts = await sql`
      SELECT
        COUNT(CASE WHEN user_feedback IS NOT NULL AND feedback_status IS NULL THEN 1 END)::int as open,
        COUNT(CASE WHEN feedback_status IN ('accepted', 'partial') THEN 1 END)::int as accepted,
        COUNT(CASE WHEN feedback_status = 'partial' THEN 1 END)::int as partial,
        COUNT(CASE WHEN feedback_status = 'rejected' THEN 1 END)::int as rejected,
        COUNT(CASE WHEN feedback_status = 'endorsed' THEN 1 END)::int as endorsed
      FROM user_attempts
      WHERE mode = 'full'
        AND user_feedback IS NOT NULL
    `;

    return Response.json({
      attempts,
      counts: counts[0] || { open: 0, accepted: 0, partial: 0, rejected: 0 },
    });
  } catch (err) {
    console.error("GET admin/feedback error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
