import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "@/lib/api-key";
import { buildFeedbackAnalysisPrompt } from "@/lib/prompts/feedback-analysis-prompt";
import { getFeedbackAnalysis, updateFeedbackAnalysis } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const { id } = await params;
    const analysisId = parseInt(id);
    if (isNaN(analysisId)) {
      return Response.json({ error: "Invalid ID" }, { status: 400 });
    }

    const { content } = await request.json();
    if (!content?.trim()) {
      return Response.json({ error: "Missing reply content" }, { status: 400 });
    }

    const analysis = await getFeedbackAnalysis(analysisId);
    if (!analysis) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    if (analysis.user_id !== keyResult.user.id && !keyResult.user.isAdmin) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const thread = Array.isArray(analysis.thread) ? [...analysis.thread] : [];
    thread.push({
      role: "user" as const,
      content: content.trim(),
      timestamp: new Date().toISOString(),
    });

    await updateFeedbackAnalysis(analysisId, { thread, status: "analyzing" });

    const wines = typeof analysis.wines === "string"
      ? JSON.parse(analysis.wines)
      : analysis.wines;

    const prompt = buildFeedbackAnalysisPrompt({
      questionText: analysis.question_text,
      wines,
      paper: analysis.paper,
      family: analysis.family,
      familyLabel: analysis.family_label,
      modelAnswer: analysis.model_answer,
      userAnswer: analysis.user_answer,
      userFeedback: analysis.user_feedback,
      previousThread: thread,
    });

    const client = new Anthropic({ apiKey: keyResult.apiKey });
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });

    const encoder = new TextEncoder();
    let fullText = "";

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              fullText += event.delta.text;
              const jsonChunk = JSON.stringify({ t: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${jsonChunk}\n\n`));
            }
          }

          thread.push({
            role: "system" as const,
            content: fullText,
            timestamp: new Date().toISOString(),
          });

          const recommendation = /recommendation:\s*\*?\*?accept/i.test(fullText)
            ? "accept"
            : /recommendation:\s*\*?\*?reject/i.test(fullText)
              ? "reject"
              : /recommendation:\s*\*?\*?partial/i.test(fullText)
                ? "partial"
                : "pending";

          await updateFeedbackAnalysis(analysisId, {
            thread,
            status: "complete",
            recommendation,
          });

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : "unknown" })}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("feedback-analysis reply error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Reply failed" },
      { status: 500 }
    );
  }
}
