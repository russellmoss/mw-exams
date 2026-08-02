import Anthropic from "@anthropic-ai/sdk";
import { buildAnswerEvaluationSystemPrompt } from "@/lib/prompts/answer-evaluation-prompt";
import { scanDislikedWording } from "@/lib/prompts/tasting-lexicon";
import { extractGradingMeta, recordGradingOverrideCheck } from "@/lib/grading-telemetry";
import { requireApiKey } from "@/lib/api-key";
import { logClaudeUsage } from "@/lib/usage-log";
import { selectModel } from "@/lib/model-selector";
import { IMAGE_TOKEN_INSTRUCTIONS, enrichFeedbackWithImages } from "@/lib/media";
import { withThinking, thinkingFrame } from "@/lib/thinking-stream";

export const runtime = "nodejs";
// Generous budget: after the text streams we resolve up to 3 illustration images (Tavily + download).
export const maxDuration = 120;

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

    const dislikedFound = scanDislikedWording(answer);
    const systemPrompt = buildAnswerEvaluationSystemPrompt(paper, dislikedFound);

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
    // Adaptive thinking so the candidate can watch the grader reason instead of staring at a gap
    // before the first token. Safe to show un-gated here: the answer is already submitted.
    const stream = await client.messages.stream({
      model,
      system: systemPrompt + "\n" + IMAGE_TOKEN_INSTRUCTIONS,
      messages: [{ role: "user", content: userMessage }],
      ...withThinking(model, 2000),
    } as Parameters<typeof client.messages.stream>[0]);

    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          let fullText = "";
          for await (const event of stream) {
            if (event.type !== "content_block_delta") continue;
            if (event.delta.type === "text_delta") {
              fullText += event.delta.text;
              const jsonChunk = JSON.stringify({ t: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${jsonChunk}\n\n`));
            } else if (event.delta.type === "thinking_delta") {
              controller.enqueue(encoder.encode(thinkingFrame(event.delta.thinking)));
            }
          }
          const final = await stream.finalMessage();
          logClaudeUsage(
            { taskType: "answer_grading", model, source: keyResult.source, userId: keyResult.user.id, abGroup },
            final.usage,
            { latencyMs: Date.now() - t0 }
          );
          // Phase 4b (detect-only): pull the hidden GRADING_META tag, strip it from the saved text, and
          // log any howler/cascade override the grader should have applied. Does NOT change the verdict.
          const { meta, cleanedText } = extractGradingMeta(fullText);
          await recordGradingOverrideCheck(meta, { grader: "answer_grading", userId: keyResult.user.id, paper });
          // Resolve the model's image tokens to cached, subtitled images and send the enriched
          // markdown as the authoritative final text (the client saves this version). Best-effort:
          // on any failure the tokens are stripped so the user still gets clean feedback.
          try {
            const enriched = await enrichFeedbackWithImages(cleanedText, keyResult.user.id);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ enriched })}\n\n`));
          } catch (enrichErr) {
            console.error("answer-eval image enrichment failed:", enrichErr);
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
