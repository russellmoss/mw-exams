import { after } from "next/server";
import { createAttempt, createAttemptWithUser, updateAttempt, reviewFeedback, recordUserFeedback, getAttemptById } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { isStemDetailLevel } from "@/lib/prompts/stemDetail";
import { normalizePaceData } from "@/lib/pace";
import { runFeedbackAnalysis } from "@/lib/feedback-analysis";

export const runtime = "nodejs";
// Feedback analysis runs in `after()` (post-response), so this invocation may stay
// alive up to ~2 minutes for that background work even though the response is instant.
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, attemptId, questionId, userId, mode, stemDetail, ...data } = body;

    if (action === "create") {
      if (!questionId) {
        return Response.json({ error: "Missing questionId" }, { status: 400 });
      }
      // Stem Detail level this attempt STARTED at. Validated here because the column carries a CHECK
      // constraint — an unrecognised value would fail the insert rather than degrade.
      const attemptStemDetail = isStemDetailLevel(stemDetail) ? stemDetail : "exam_real";
      // Persisted study mode: only non-default modes are stored (NULL means a normal "full"
      // study attempt). "known-wine" tags a Dry Notes attempt so /history can label/filter it.
      const attemptMode: string | null = mode ?? null;
      // Prefer an explicit userId, but fall back to the session user so feedback
      // created before a drill is submitted is still attributed (the analysis
      // pipeline joins on user_id, so an orphan attempt would never be analyzed).
      let uid: number | null = userId ?? null;
      if (!uid) {
        const sessionUser = await getUser(request);
        uid = sessionUser?.id ?? null;
      }
      const attempt = uid
        ? await createAttemptWithUser(questionId, uid, attemptMode, attemptStemDetail)
        : await createAttempt(questionId, attemptMode, attemptStemDetail);
      return Response.json({ attempt });
    }

    if (action === "update") {
      if (!attemptId) {
        return Response.json({ error: "Missing attemptId" }, { status: 400 });
      }

      // Same CHECK-constraint guard as create, for the "Add detail" escalation write.
      if (
        data.stem_detail_escalated_to !== undefined &&
        !isStemDetailLevel(data.stem_detail_escalated_to)
      ) {
        return Response.json({ error: "Invalid stem detail level" }, { status: 400 });
      }

      // Pace report (migration 021): normalise the client payload into a trusted shape before it is
      // written to the JSONB column. A malformed object is dropped rather than persisted raw.
      if (data.pace !== undefined) {
        const normalized = normalizePaceData(data.pace);
        if (normalized) data.pace = normalized;
        else delete data.pace;
      }

      // User feedback takes the no-overwrite path: a second, different feedback on an attempt that
      // already carries feedback is recorded on its OWN attempt row rather than clobbering the
      // existing one (which would strand it from analysis and diverge the ledger). All other update
      // fields (current_step, tasting_notes, answer_feedback, …) keep using updateAttempt.
      if (typeof data.user_feedback === "string" && data.user_feedback.trim()) {
        const { id, analyze } = await recordUserFeedback(attemptId, data.user_feedback);
        // Analysis is decoupled from the browser via `after()` — closing the tab can't strand it.
        // Each feedback record is analyzed exactly once against the text it holds.
        if (analyze) {
          after(async () => {
            try {
              await runFeedbackAnalysis({ attemptId: id, source: "server" });
            } catch (err) {
              console.error("[save-attempt] background feedback analysis failed:", err);
            }
          });
        }
        const rows = await getAttemptById(id);
        return Response.json({ attempt: rows });
      }

      const attempt = await updateAttempt(attemptId, data);
      return Response.json({ attempt });
    }

    if (action === "review-feedback") {
      const user = await getUser(request);
      if (!user || !user.isAdmin) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!attemptId || !body.feedbackStatus) {
        return Response.json({ error: "Missing attemptId or feedbackStatus" }, { status: 400 });
      }
      const attempt = await reviewFeedback(attemptId, body.feedbackStatus, body.adminNote || null, "manual");
      return Response.json({ attempt });
    }

    return Response.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("save-attempt error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
