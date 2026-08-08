import { buildTheoryEvaluationSystemPrompt } from "@/lib/prompts/theory-evaluation-prompt";
import {
  normalizeGradingAnswer,
  prepareGradingRuntime,
  streamGradedResponse,
} from "@/lib/grading-stream";
import { resolveTavilyKey } from "@/lib/tavily-key";
import { getUserPersona } from "@/lib/persona-server";
import { personaBlock } from "@/lib/personas";
import {
  activeTheoryCoreRequirements,
  getTheoryRubric,
  theoryQuestionId,
  countTheoryWords,
  theoryTimeMinutes,
  theoryWordBand,
} from "@/lib/theory/rubric";
import {
  buildTheoryCitationBlock,
  buildTheoryRetrievalPlan,
  getTheoryRetrieval,
} from "@/lib/theory/retrieval";
import {
  beginTheoryAttempt,
  buildTheoryGradingProvenance,
  failTheoryAttempt,
  finishTheoryAttempt,
  saveTheoryRetrieval,
} from "@/lib/theory/attempts";
import { assertTheoryGradingMeta, extractTheoryGradingMeta } from "@/lib/theory/grading-meta";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Grades a candidate's THEORY essay against the examiner-derived rubric. The model answer is
 * intentionally absent: it is a study exemplar, never a grading anchor.
 */
export async function POST(request: Request) {
  let startedAttempt: { attemptId: number; userId: number } | null = null;
  try {
    const gradingRuntime = await prepareGradingRuntime(request, "theory_grading", "sonnet");
    if (gradingRuntime instanceof Response) return gradingRuntime;

    const body = await request.json();
    const inputMethod: "typed" | "voice" = body.inputMethod === "voice" ? "voice" : "typed";
    const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";
    let answer: string = typeof body.answer === "string" ? body.answer : "";
    const elapsedSeconds = Number.isFinite(body.elapsedSeconds)
      ? Math.max(0, Math.round(Number(body.elapsedSeconds)))
      : null;

    const id: string =
      typeof body.id === "string" && body.id
        ? body.id
        : Number.isFinite(body.year) && Number.isFinite(body.paper) && Number.isFinite(body.question)
          ? theoryQuestionId(Number(body.year), Number(body.paper), Number(body.question))
          : "";

    if (!id || !answer.trim() || !submissionId || submissionId.length > 128) {
      return json(
        { error: "Provide an answer, a submissionId, and either `id` or `year`/`paper`/`question`." },
        400
      );
    }

    const rubric = getTheoryRubric(id);
    if (!rubric) {
      // There is no defensible grading standard where no examiner-derived rubric exists.
      return json(
        {
          error: `No examiner-derived rubric for ${id}.`,
          detail:
            "Theory rubrics exist for 2016-2019 and 2021-2025. Questions without a usable examiners' report cannot be graded.",
        },
        404
      );
    }

    const normalized = normalizeGradingAnswer(answer, inputMethod);
    answer = normalized.answer;
    const transcriptionFixes = normalized.substitutions;

    // The insert is the submit lock. It happens before retrieval or model spend and explicitly
    // supplies every NOT NULL practical-era column with a deliberate Theory value.
    const attempt = await beginTheoryAttempt({
      questionId: rubric.id,
      userId: gradingRuntime.user.id,
      submissionId,
      answer,
      inputMethod,
      elapsedSeconds,
      temporalAsOf: rubric.temporalAsOf,
    });
    if (attempt.duplicate || attempt.attemptId == null) {
      return json({ error: "This Theory submission is already being graded.", duplicate: true }, 409);
    }
    startedAttempt = { attemptId: attempt.attemptId, userId: gradingRuntime.user.id };

    const retrievalPlan = buildTheoryRetrievalPlan(rubric);
    let tavilyKey: string | null = null;
    let tavilyKeyError: string | null = null;
    if (retrievalPlan.route === "web") {
      try {
        tavilyKey = (await resolveTavilyKey(gradingRuntime.user.id))?.key ?? null;
      } catch (error) {
        tavilyKeyError = error instanceof Error ? error.message : "unknown key lookup error";
      }
    }
    const retrieval = await getTheoryRetrieval(rubric, { tavilyKey, tavilyKeyError });
    await saveTheoryRetrieval(attempt.attemptId, gradingRuntime.user.id, retrieval);

    const wordCount = countTheoryWords(answer);
    const band = theoryWordBand(rubric.paper);
    const minutes = theoryTimeMinutes(rubric.paper);
    let systemPrompt = buildTheoryEvaluationSystemPrompt(rubric, {
      inputMethod,
      wordCount,
      verification: retrieval,
      currentDate: new Date().toISOString().slice(0, 10),
    });
    if (transcriptionFixes.length) {
      systemPrompt += `\n\n## Transcription repairs already applied
These dictated terms were auto-corrected before you saw the answer. List them under
"Transcription check" so the candidate knows, and do not treat them as their own spelling errors:
${transcriptionFixes.map((substitution) => `- "${substitution.from}" -> ${substitution.to}`).join("\n")}`;
    }
    // Appended last so it overrides the tone guidance inside THEORY_MARKING_PRINCIPLES. The block's
    // own invariants hold the band, the rubric coverage and the required sections fixed.
    systemPrompt += `\n\n${personaBlock(
      await getUserPersona(gradingRuntime.user.id),
      "grading"
    )}`;

    const userMessage = `## Question
${rubric.questionText}

## Candidate's answer (${wordCount} words)
${answer}

Mark this against the rubric above.`;

    return streamGradedResponse({
      runtime: gradingRuntime,
      taskType: "theory_grading",
      system: systemPrompt,
      userMessage,
      maxTokens: 2400,
      usage: { attemptId: attempt.attemptId, questionId: rubric.id },
      initialFrames: [
        {
          meta: {
            attemptId: attempt.attemptId,
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
            activeCoreRequirements: activeTheoryCoreRequirements(rubric).length,
            evidenceQuality: rubric.evidenceQuality,
            sourceReport: rubric.sourceReport,
            textSource: rubric.textSource,
            hasModelAnswer: rubric.hasModelAnswer,
            temporalAsOf: rubric.temporalAsOf,
            exAnte: rubric.exAnte,
          },
        },
        {
          sources: {
            route: retrieval.route,
            status: retrieval.status,
            notice: retrieval.notice,
            checkedAt: retrieval.checkedAt,
            fromCache: retrieval.fromCache,
            citations: retrieval.citations,
          },
        },
      ],
      onComplete: async ({ fullText, runtime }) => {
        const { meta, cleanedText } = extractTheoryGradingMeta(fullText);
        assertTheoryGradingMeta(meta, retrieval);
        const visibleFeedback = `${cleanedText}\n\n${buildTheoryCitationBlock(retrieval)}`.trim();
        const provenance = buildTheoryGradingProvenance(rubric, retrieval, meta, runtime.model);
        await finishTheoryAttempt({
          attemptId: attempt.attemptId!,
          userId: runtime.user.id,
          feedback: visibleFeedback,
          verdict: meta?.verdict ?? null,
          provenance,
        });
        return [{ final: visibleFeedback, attemptId: attempt.attemptId, verdict: meta?.verdict ?? null }];
      },
      onError: async (error) => {
        await failTheoryAttempt(
          attempt.attemptId!,
          gradingRuntime.user.id,
          error instanceof Error ? error.message : "unknown grading stream error"
        );
      },
    });
  } catch (error) {
    if (startedAttempt) {
      try {
        await failTheoryAttempt(
          startedAttempt.attemptId,
          startedAttempt.userId,
          error instanceof Error ? error.message : "unknown grading error"
        );
      } catch (persistenceError) {
        console.error("theory/grade failure persistence error:", persistenceError);
      }
    }
    console.error("theory/grade error:", error);
    return json({ error: error instanceof Error ? error.message : "Internal server error" }, 500);
  }
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
