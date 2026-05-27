import { createAttempt, updateAttempt } from "@/lib/db";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { action, attemptId, questionId, ...data } = await request.json();

    if (action === "create") {
      if (!questionId) {
        return Response.json({ error: "Missing questionId" }, { status: 400 });
      }
      const attempt = await createAttempt(questionId);
      return Response.json({ attempt });
    }

    if (action === "update") {
      if (!attemptId) {
        return Response.json({ error: "Missing attemptId" }, { status: 400 });
      }
      const attempt = await updateAttempt(attemptId, data);
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
