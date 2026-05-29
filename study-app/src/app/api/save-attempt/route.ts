import { createAttempt, createAttemptWithUser, updateAttempt, reviewFeedback } from "@/lib/db";
import { getUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, attemptId, questionId, userId, ...data } = body;

    if (action === "create") {
      if (!questionId) {
        return Response.json({ error: "Missing questionId" }, { status: 400 });
      }
      const attempt = userId
        ? await createAttemptWithUser(questionId, userId)
        : await createAttempt(questionId);
      return Response.json({ attempt });
    }

    if (action === "update") {
      if (!attemptId) {
        return Response.json({ error: "Missing attemptId" }, { status: 400 });
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
