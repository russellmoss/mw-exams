import Anthropic from "@anthropic-ai/sdk";
import { buildPreGlassSystemPrompt } from "@/lib/prompts/pre-glass-prompt";
import { requireApiKey } from "@/lib/api-key";
import { getLatestOpus } from "@/lib/model-resolver";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const { questionText, reasoning, paper, decisionMatrixContent, wineAppearances } =
      await request.json();

    if (!questionText || !reasoning || !paper) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const client = new Anthropic({ apiKey: keyResult.apiKey });

    const systemPrompt = buildPreGlassSystemPrompt(
      paper,
      decisionMatrixContent,
      wineAppearances
    );

    const opusModel = await getLatestOpus(keyResult.apiKey);
    const stream = await client.messages.stream({
      model: opusModel,
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `## Question stem
${questionText}

## Candidate's pre-glass reasoning
${reasoning}

Please evaluate this stem analysis. What did the candidate identify well? What signals from the stem did they miss? What should they look for in the glass based on this stem?`,
        },
      ],
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
    console.error("evaluate-reasoning error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Internal server error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
