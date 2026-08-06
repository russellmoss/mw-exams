import { buildAnswerEvaluationSystemPrompt } from "@/lib/prompts/answer-evaluation-prompt";
import { scanDislikedWording } from "@/lib/prompts/tasting-lexicon";
import { extractGradingMeta, recordGradingOverrideCheck } from "@/lib/grading-telemetry";
import { IMAGE_TOKEN_INSTRUCTIONS, enrichFeedbackWithImages } from "@/lib/media";
import { getKnowledgeContext, buildVerificationBlock, buildCitationBlock } from "@/lib/knowledge/context";
import {
  normalizeGradingAnswer,
  prepareGradingRuntime,
  streamGradedResponse,
} from "@/lib/grading-stream";

export const runtime = "nodejs";
// Generous budget: after the text streams we resolve up to 3 illustration images (Tavily + download).
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    const gradingRuntime = await prepareGradingRuntime(request, "answer_grading", "sonnet");
    if (gradingRuntime instanceof Response) return gradingRuntime;

    const body = await request.json();
    const { questionText, modelAnswer, paper } = body;
    let answer: string = body.answer;
    const inputMethod: "typed" | "voice" = body.inputMethod === "voice" ? "voice" : "typed";

    if (!questionText || !answer || !paper) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Repair wine terms the speech-to-text engine mangled BEFORE anything reads the answer, so the
    // grader (and the disliked-wording scan) sees what the candidate meant. Conservative by design:
    // only unambiguous matches are rewritten. Every change is disclosed to the candidate below
    // rather than applied silently — they need to know a term came out wrong.
    const normalized = normalizeGradingAnswer(answer, inputMethod);
    answer = normalized.answer;
    const transcriptionFixes = normalized.substitutions;

    const dislikedFound = scanDislikedWording(answer);

    // Tier-1 references for FACT-CHECKING the candidate's production and appellation claims. Gated by
    // the same rules as model-answer generation, so a question the corpus cannot speak to retrieves
    // nothing. Verification is the higher-value use of the corpus: the grader writes fine prose
    // unaided, but cannot reliably notice that a confident claim about ageing minima is wrong.
    // Fails soft — a retrieval error grades exactly as before.
    const { passages: kbPassages } = await getKnowledgeContext({ questionText, family: null });
    const verification = buildVerificationBlock(kbPassages);
    const systemPrompt =
      buildAnswerEvaluationSystemPrompt(paper, dislikedFound, inputMethod) +
      (verification ? `

${verification}` : "") +
      (transcriptionFixes.length
        ? `

## Transcription repairs already applied
Before you saw it, these dictated terms were auto-corrected to the nearest known wine term. List them under "Transcription check" so the candidate knows, and do not treat them as the candidate's own spelling errors:
${transcriptionFixes.map((s) => `- "${s.from}" → ${s.to}`).join("\n")}`
        : "");

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

    return streamGradedResponse({
      runtime: gradingRuntime,
      taskType: "answer_grading",
      system: systemPrompt + "\n" + IMAGE_TOKEN_INSTRUCTIONS,
      userMessage,
      maxTokens: 2000,
      onComplete: async ({ fullText, runtime }) => {
        // Phase 4b (detect-only): pull the hidden GRADING_META tag, strip it from the saved text, and
        // log any howler/cascade override the grader should have applied. Does NOT change the verdict.
        const { meta, cleanedText } = extractGradingMeta(fullText);
        await recordGradingOverrideCheck(meta, {
          grader: "answer_grading",
          userId: runtime.user.id,
          paper,
        });
        try {
          const enriched = await enrichFeedbackWithImages(cleanedText, runtime.user.id);
          const withSources =
            enriched +
            buildCitationBlock(kbPassages, [questionText, modelAnswer].filter(Boolean).join(" "));
          return [{ enriched: withSources }];
        } catch (enrichErr) {
          console.error("answer-eval image enrichment failed:", enrichErr);
        }
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
