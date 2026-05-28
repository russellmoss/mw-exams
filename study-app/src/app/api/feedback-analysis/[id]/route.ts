import { getUser } from "@/lib/auth";
import { getFeedbackAnalysis, updateFeedbackAnalysis } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getUser(request);
    if (!user) {
      return Response.json({ error: "Auth required" }, { status: 401 });
    }

    const { id } = await params;
    const analysisId = parseInt(id);
    if (isNaN(analysisId)) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }

    const analysis = await getFeedbackAnalysis(analysisId);
    if (!analysis) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (analysis.user_id !== user.id && !user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!analysis.is_read && analysis.user_id === user.id) {
      await updateFeedbackAnalysis(analysisId, { is_read: true });
    }

    return Response.json(analysis);
  } catch (err) {
    console.error("feedback-analysis GET error:", err);
    return Response.json({ error: "Failed to fetch analysis" }, { status: 500 });
  }
}
