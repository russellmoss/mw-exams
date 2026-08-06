import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "@/lib/api-key";
import { logClaudeUsage } from "@/lib/usage-log";
import { selectModel } from "@/lib/model-selector";
import { withThinking, thinkingFrame } from "@/lib/thinking-stream";
import { normalizeDictatedTerms } from "@/lib/dictation-normalizer";
import { loadWineTerms } from "@/lib/wine-terms";
import { buildTheoryEvaluationSystemPrompt } from "@/lib/prompts/theory-evaluation-prompt";
import {
  getTheoryRubric,
  theoryQuestionId,
  countTheoryWords,
  theoryTimeMinutes,
  theoryWordBand,
} from "@/lib/theory/rubric";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Grades a candidate's THEORY essay against the rubric extracted from that year's IMW
 * examiners' report.
 *
 * The rubric is the anchor, deliberately not a model answer. A theory question admits many
 * valid answers with different examples and different positions; grading by similarity to one
 * exemplar would fail a good essay for choosing different-but-equally-valid material. So the
 * model answer in outputs/theory_answers/ is study material for the candidate, never an input
 * to this route.
 *
 * Accepts either `{ id }` or `{ year, paper, question }`.
 */
export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const body = await request.json();
    const inputMethod: "typed" | "voice" = body.inputMethod === "voice" ? "voice" : "typed";
    let answer: string = typeof body.answer === "string" ? body.answer : "";

    const id: string =
      typeof body.id === "string" && body.id
        ? body.id
        : Number.isFinite(body.year) && Number.isFinite(body.paper) && Number.isFinite(body.question)
          ? theoryQuestionId(Number(body.year), Number(body.paper), Number(body.question))
          : "";

    if (!id || !answer.trim()) {
      return json({ error: "Provide an answer and either `id` or `year`/`paper`/`question`." }, 400);
    }

    const rubric = getTheoryRubric(id);
    if (!rubric) {
      // Being explicit here matters: 2015 and 2026 have no examiners' report, so no rubric
      // exists and there is nothing defensible to grade against. Refusing is the correct
      // outcome — grading them on generic principles would produce confident, unanchored
      // feedback, which is worse than none.
      return json(
        {
          error: `No examiner-derived rubric for ${id}.`,
          detail:
            "Theory rubrics exist for 2016-2019 and 2021-2025, the years with a usable IMW examiners' report. 2015 and 2026 have no published report, so there is no examiner standard to grade against.",
        },
        404
      );
    }

    // Repair mangled wine terms BEFORE the grader reads the answer, so it marks what the
    // candidate meant. Every change is disclosed rather than applied silently.
    let transcriptionFixes: { from: string; to: string }[] = [];
    if (inputMethod === "voice") {
      const normalized = normalizeDictatedTerms(answer, loadWineTerms());
      answer = normalized.text;
      transcriptionFixes = normalized.substitutions;
    }

    const wordCount = countTheoryWords(answer);
    const band = theoryWordBand(rubric.paper);
    const minutes = theoryTimeMinutes(rubric.paper);

    let systemPrompt = buildTheoryEvaluationSystemPrompt(rubric, { inputMethod, wordCount });
    if (transcriptionFixes.length) {
      systemPrompt += `\n\n## Transcription repairs already applied
These dictated terms were auto-corrected before you saw the answer. List them under
"Transcription check" so the candidate knows, and do not treat them as their own spelling errors:
${transcriptionFixes.map((s) => `- "${s.from}" → ${s.to}`).join("\n")}`;
    }

    const userMessage = `## Question
${rubric.questionText}

## Candidate's answer (${wordCount} words)
${answer}

Mark this against the rubric above.`;

    const client = new Anthropic({ apiKey: keyResult.apiKey });
    const { model, abGroup } = await selectModel("theory_grading", keyResult.apiKey, "sonnet");
    const t0 = Date.now();

    const stream = await client.messages.stream({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      ...(await withThinking(model, 2000)),
    } as Parameters<typeof client.messages.stream>[0]);

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          // Send the grading context first so the client can render the rubric alongside the
          // feedback — the candidate should be able to see WHAT they were marked against.
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                meta: {
                  id: rubric.id,
                  year: rubric.year,
                  paper: rubric.paper,
                  question: rubric.question,
                  paperTitle: rubric.paperTitle,
                  section: rubric.section,
                  domain: rubric.domain,
                  wordCount,
                  band,
                  timeMinutes: minutes,
                  coreRequirements: rubric.coreRequirements.length,
                  evidenceQuality: rubric.evidenceQuality,
                  sourceReport: rubric.sourceReport,
                  textSource: rubric.textSource,
                  hasModelAnswer: rubric.hasModelAnswer,
                },
              })}\n\n`
            )
          );

          for await (const event of stream) {
            if (event.type !== "content_block_delta") continue;
            if (event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ t: event.delta.text })}\n\n`));
            } else if (event.delta.type === "thinking_delta") {
              controller.enqueue(encoder.encode(thinkingFrame(event.delta.thinking)));
            }
          }

          const final = await stream.finalMessage();
          logClaudeUsage(
            {
              taskType: "theory_grading",
              model,
              source: keyResult.source,
              userId: keyResult.user.id,
              abGroup,
            },
            final.usage,
            { latencyMs: Date.now() - t0 }
          );

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                t: `\n\n[Error during streaming: ${err instanceof Error ? err.message : "unknown"}]`,
              })}\n\n`
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
    console.error("theory/grade error:", err);
    return json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  }
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
