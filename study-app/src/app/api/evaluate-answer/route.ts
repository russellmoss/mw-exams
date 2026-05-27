import Anthropic from "@anthropic-ai/sdk";
import { buildAnswerEvaluationSystemPrompt } from "@/lib/prompts/answer-evaluation-prompt";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { questionText, answer, modelAnswer, paper } = await request.json();

    if (!questionText || !answer || !paper) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
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
