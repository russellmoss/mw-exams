import Anthropic from "@anthropic-ai/sdk";
import { buildPreGlassSystemPrompt } from "@/lib/prompts/pre-glass-prompt";
import { masterTreeForPaper } from "@/lib/master-trees";
import { requireApiKey } from "@/lib/api-key";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";
import { IMAGE_TOKEN_INSTRUCTIONS, enrichFeedbackWithImages, createImageStreamer } from "@/lib/media";
import { withThinking, thinkingFrame } from "@/lib/thinking-stream";
import { getUserPersona } from "@/lib/persona-server";
import { restyleForPersona } from "@/lib/persona-restyle";
import { DEFAULT_PERSONA, gradedRestyleEnabled, personaBlock } from "@/lib/personas";

export const runtime = "nodejs";
// Generous budget: after the text streams we resolve the hero + up to 3 illustration images.
// Raised from 120 when the persona re-voicing pass landed. Measured on a real debrief: pass 1
// (grading, Opus) 61s + pass 2 (re-voicing, Sonnet) 43s = ~104s, which left 16s of headroom against
// the old cap — a longer script would have timed out mid-stream and cost the candidate their graded
// attempt. 300 matches /api/coach, the other long-running streaming route.
export const maxDuration = 300;

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
      wineAppearances,
      masterTreeForPaper(paper)
    );

    const chosenPersona = await getUserPersona(keyResult.user.id);
    const willRestyle = chosenPersona !== DEFAULT_PERSONA && gradedRestyleEnabled("grading");

    const { model, abGroup } = await selectModel("reasoning_grading", keyResult.apiKey, "opus");
    const t0 = Date.now();
    // Adaptive thinking so the stem-analysis grader's reasoning is visible while it works. The
    // candidate has already committed their pre-glass answer, so nothing here is a spoiler.
    const stream = await client.messages.stream({
      model,
      // Neutral by construction: personaBlock pins the grading surface to the Tutor, so this call
      // cannot be swayed by the chosen voice. The voice is applied to the finished critique below.
      system:
        systemPrompt + "\n" + IMAGE_TOKEN_INSTRUCTIONS + "\n\n" + personaBlock(chosenPersona, "grading"),
      ...(await withThinking(model, 1500, keyResult.user.id)),
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
              // Withheld when a re-voicing pass is coming — the styled text streams instead.
              if (!willRestyle) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: event.delta.text })}\n\n`));
              }
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
          // Pass 2 — the candidate's voice, applied after the critique is written. Before image
          // enrichment so the rewrite sees compact [[IMG:...]] tokens rather than resolved markup.
          let critique = fullText;
          if (willRestyle) {
            const restyled = await restyleForPersona({
              neutralText: critique,
              persona: chosenPersona,
              surface: "grading",
              client,
              apiKey: keyResult.apiKey,
              usage: {
                taskType: "reasoning_grading_persona_restyle",
                source: keyResult.source,
                userId: keyResult.user.id,
              },
              onDelta: (t) => controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t })}\n\n`)),
            });
            critique = restyled.text;
            if (restyled.outcome !== "applied") {
              console.warn(`[reasoning-eval] restyle not applied: ${restyled.outcome}`);
            }
          }
          // Wait for in-flight incremental image fetches, then send the enriched markdown as the
          // authoritative final text — which also corrects the client's buffer if a rewrite was
          // streamed and then discarded. Best-effort — tokens are stripped on failure.
          try {
            await imageStreamer.flush();
            const enriched = await enrichFeedbackWithImages(critique, keyResult.user.id);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ enriched })}\n\n`));
          } catch (enrichErr) {
            console.error("reasoning-eval image enrichment failed:", enrichErr);
            // The buffer the client is holding may be a rejected rewrite; the corrected text has
            // to reach it even without images.
            if (willRestyle) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ enriched: critique })}\n\n`));
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
