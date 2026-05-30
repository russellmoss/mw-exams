import { after } from "next/server";
import { createAttempt, createAttemptWithUser, updateAttempt, reviewFeedback } from "@/lib/db";
import { getUser } from "@/lib/auth";
import { runFeedbackAnalysis } from "@/lib/feedback-analysis";

export const runtime = "nodejs";
// Feedback analysis runs in `after()` (post-response), so this invocation may stay
// alive up to ~2 minutes for that background work even though the response is instant.
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, attemptId, questionId, userId, ...data } = body;

    if (action === "create") {
      if (!questionId) {
        return Response.json({ error: "Missing questionId" }, { status: 400 });
      }
      // Prefer an explicit userId, but fall back to the session user so feedback
      // created before a drill is submitted is still attributed (the analysis
      // pipeline joins on user_id, so an orphan attempt would never be analyzed).
      let uid: number | null = userId ?? null;
      if (!uid) {
        const sessionUser = await getUser(request);
        uid = sessionUser?.id ?? null;
      }
      const attempt = uid
        ? await createAttemptWithUser(questionId, uid)
        : await createAttempt(questionId);
      return Response.json({ attempt });
    }

    if (action === "update") {
      if (!attemptId) {
        return Response.json({ error: "Missing attemptId" }, { status: 400 });
      }
      const attempt = await updateAttempt(attemptId, data);

      // If this update is what added the user's feedback, kick off analysis SERVER-SIDE
      // (decoupled from the browser). `after()` keeps the function alive past the response,
      // so closing the tab can no longer strand the feedback. We only fire the first time
      // (attempt had no analysis yet); runFeedbackAnalysis also guards against concurrent runs.
      if (
        typeof data.user_feedback === "string" &&
        data.user_feedback.trim() &&
        !attempt.auto_analysis_id
      ) {
        const id = attempt.id;
        after(async () => {
          try {
            await runFeedbackAnalysis({ attemptId: id, source: "server" });
          } catch (err) {
            console.error("[save-attempt] background feedback analysis failed:", err);
          }
        });
      }

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
