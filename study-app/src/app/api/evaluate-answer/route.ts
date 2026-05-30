import Anthropic from "@anthropic-ai/sdk";
import { buildAnswerEvaluationSystemPrompt } from "@/lib/prompts/answer-evaluation-prompt";
import { requireApiKey } from "@/lib/api-key";
import { logClaudeUsage } from "@/lib/usage-log";
import { selectModel } from "@/lib/model-selector";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const { questionText, answer, modelAnswer, paper } = await request.json();

    if (!questionText || !answer || !paper) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const client = new Anthropic({ apiKey: keyResult.apiKey });

    const systemPrompt = buildAnswerEvaluationSystemPrompt(paper);

    let userMessage = `## Question
${questionText}

## Candidate's Answer
${answer}`;

    if (modelAnswer) {
      userMessage += `

## Model Answer (reference for evaluation)
${modelAnswer}`;
    }

    userMessage += `

Please evaluate this candidate's answer against the model answer. Assess identification accuracy, reasoning quality, specificity, and completeness for each sub-question.`;

    const { model, abGroup } = await selectModel("answer_grading", keyResult.apiKey, "sonnet");
    const t0 = Date.now();
    const stream = await client.messages.stream({
      model,
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const jsonChunk = JSON.stringify({ t: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${jsonChunk}\n\n`));
            }
          }
          const final = await stream.finalMessage();
          logClaudeUsage(
            { taskType: "answer_grading", model, source: keyResult.source, userId: keyResult.user.id, abGroup },
            final.usage,
            { latencyMs: Date.now() - t0 }
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `data: \n\n[Error during streaming: ${err instanceof Error ? err.message : "unknown"}]\n\n`
            )
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
    console.error("evaluate-answer error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
