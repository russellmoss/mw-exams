import Anthropic from "@anthropic-ai/sdk";
import { buildPreGlassSystemPrompt } from "@/lib/prompts/pre-glass-prompt";
import { requireApiKey } from "@/lib/api-key";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import { IMAGE_TOKEN_INSTRUCTIONS, enrichFeedbackWithImages } from "@/lib/media";

export const runtime = "nodejs";
// Generous budget: after the text streams we resolve the hero + up to 3 illustration images.
export const maxDuration = 120;

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

    const { model, abGroup } = await selectModel("reasoning_grading", keyResult.apiKey, "opus");
    const t0 = Date.now();
    const stream = await client.messages.stream({
      model,
      max_tokens: 1500,
      system: systemPrompt + "\n" + IMAGE_TOKEN_INSTRUCTIONS,
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
          let fullText = "";
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              fullText += event.delta.text;
              const jsonChunk = JSON.stringify({ t: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${jsonChunk}\n\n`));
            }
          }
          const final = await stream.finalMessage();
          logClaudeUsage(
            { taskType: "reasoning_grading", model, source: keyResult.source, userId: keyResult.user.id, abGroup },
            final.usage,
            { latencyMs: Date.now() - t0 }
          );
          // Resolve the hero + inline image tokens and send the enriched markdown as the
          // authoritative final text. Best-effort — tokens are stripped on failure.
          try {
            const enriched = await enrichFeedbackWithImages(fullText, keyResult.user.id);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ enriched })}\n\n`));
          } catch (enrichErr) {
            console.error("reasoning-eval image enrichment failed:", enrichErr);
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
