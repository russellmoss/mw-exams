import { getUser } from "@/lib/auth";
import { applyFeedbackChange } from "@/lib/apply-change";

export const runtime = "nodejs";

/**
 * Manual "Apply & ship" — admin-triggered version of the auto-apply path.
 * Dispatches the verify-and-ship GitHub Action for the given attempt's accepted feedback.
 */
export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const attemptId = Number(body.attemptId);
  if (!attemptId || Number.isNaN(attemptId)) {
    return Response.json({ error: "attemptId (number) required" }, { status: 400 });
  }

  try {
    const result = await applyFeedbackChange({ attemptId, appliedBy: `admin:${user.id}` });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    console.error("apply-change error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Apply failed" },
      { status: 500 }
    );
  }
}
