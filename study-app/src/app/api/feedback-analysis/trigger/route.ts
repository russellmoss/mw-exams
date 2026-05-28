import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "@/lib/api-key";
import { buildFeedbackAnalysisPrompt } from "@/lib/prompts/feedback-analysis-prompt";
import { createFeedbackAnalysis, updateFeedbackAnalysis } from "@/lib/db";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const { attemptId } = await request.json();
    if (!attemptId) {
      return Response.json({ error: "Missing attemptId" }, { status: 400 });
    }

    const sql = neon(process.env.DATABASE_URL!);
    const attempts = await sql`
      SELECT a.id, a.user_feedback, a.user_answer, a.user_id,
        q.question_text, q.wines, q.paper, q.family, q.family_label, q.model_answer
      FROM user_attempts a
      JOIN generated_questions q ON a.question_id = q.question_id
      WHERE a.id = ${attemptId}
    `;

    if (!attempts[0] || !attempts[0].user_feedback) {
      return Response.json({ error: "No feedback found" }, { status: 404 });
    }

    const attempt = attempts[0];

    const existing = await sql`
      SELECT id, status FROM feedback_analyses
      WHERE attempt_id = ${attemptId} AND status = 'analyzing'
    `;
    if (existing.length > 0) {
      return Response.json({ id: existing[0].id, status: "already_analyzing" });
    }

    const analysis = await createFeedbackAnalysis(attemptId, attempt.user_id as number);

    const wines = typeof attempt.wines === "string"
      ? JSON.parse(attempt.wines)
      : attempt.wines;

    const prompt = buildFeedbackAnalysisPrompt({
      questionText: attempt.question_text as string,
      wines,
      paper: attempt.paper as number,
      family: attempt.family as string,
      familyLabel: attempt.family_label as string,
      modelAnswer: attempt.model_answer as string | null,
      userAnswer: attempt.user_answer as string | null,
      userFeedback: attempt.user_feedback as string,
    });

    const client = new Anthropic({ apiKey: keyResult.apiKey });
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });

    const analysisText = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    const recommendation = /recommendation:\s*\*?\*?accept/i.test(analysisText)
      ? "accept"
      : /recommendation:\s*\*?\*?reject/i.test(analysisText)
        ? "reject"
        : "pending";

    const thread = [{
      role: "system" as const,
      content: analysisText,
      timestamp: new Date().toISOString(),
    }];

    await updateFeedbackAnalysis(analysis.id, {
      status: "complete",
      recommendation,
      thread,
    });

    return Response.json({ id: analysis.id, status: "complete", recommendation });
  } catch (err) {
    console.error("feedback-analysis trigger error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Analysis failed" },
      { status: 500 }
    );
  }
}
