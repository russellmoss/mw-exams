import Anthropic from "@anthropic-ai/sdk";
import { buildPreGlassSystemPrompt } from "@/lib/prompts/pre-glass-prompt";
import { requireApiKey } from "@/lib/api-key";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import { IMAGE_TOKEN_INSTRUCTIONS, enrichFeedbackWithImages, createImageStreamer } from "@/lib/media";
import { withThinking, thinkingFrame } from "@/lib/thinking-stream";

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
    // Adaptive thinking so the stem-analysis grader's reasoning is visible while it works. The
    // candidate has already committed their pre-glass answer, so nothing here is a spoiler.
    const stream = await client.messages.stream({
      model,
      system: systemPrompt + "\n" + IMAGE_TOKEN_INSTRUCTIONS,
      ...withThinking(model, 1500),
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
    } as Parameters<typeof client.messages.stream>[0]);

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let fullText = "";
          // Resolve image tokens AS THEY STREAM so the hero + inline images surface mid-generation.
          const imageStreamer = createImageStreamer(keyResult.user.id, (token, markdown) =>
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ image: { token, markdown } })}\n\n`))
          );
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              fullText += event.delta.text;
              imageStreamer.feed(fullText);
              const jsonChunk = JSON.stringify({ t: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${jsonChunk}\n\n`));
            } else if (
              event.type === "content_block_delta" &&
              event.delta.type === "thinking_delta"
            ) {
              controller.enqueue(encoder.encode(thinkingFrame(event.delta.thinking)));
            }
          }
          const final = await stream.finalMessage();
          logClaudeUsage(
            { taskType: "reasoning_grading", model, source: keyResult.source, userId: keyResult.user.id, abGroup },
            final.usage,
            { latencyMs: Date.now() - t0 }
          );
          // Wait for in-flight incremental image fetches, then send the enriched markdown as the
          // authoritative final text. Best-effort — tokens are stripped on failure.
          try {
            await imageStreamer.flush();
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
