import { requireApiKey } from "@/lib/api-key";
import { runFeedbackAnalysis } from "@/lib/feedback-analysis";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Thin wrapper over the shared server-side analysis core. Kept for backward
 * compatibility (manual re-trigger), but feedback is now primarily analyzed
 * server-side from /api/save-attempt (decoupled from the browser) and self-healed
 * by the cron sweeper — so a dropped request here can no longer strand feedback.
 */
export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const { attemptId } = await request.json();
    if (!attemptId) {
      return Response.json({ error: "Missing attemptId" }, { status: 400 });
    }

    const result = await runFeedbackAnalysis({
      attemptId,
      apiKey: keyResult.apiKey,
      source: keyResult.source,
    });

    if (result.status === "not_found") {
      return Response.json({ error: "Attempt not found" }, { status: 404 });
    }
    if (result.status === "no_feedback") {
      return Response.json({ error: "No feedback found" }, { status: 404 });
    }
    if (result.status === "already_analyzing") {
      return Response.json({ id: result.analysisId, status: "already_analyzing" });
    }
    if (result.status === "error") {
      return Response.json({ error: result.error || "Analysis failed" }, { status: 500 });
    }

    return Response.json({
      id: result.analysisId,
      status: "complete",
      recommendation: result.recommendation,
      autoApplied: result.autoApplied,
      autoRejected: result.autoRejected,
      autoPartial: result.autoPartial,
    });
  } catch (err) {
    console.error("feedback-analysis trigger error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
