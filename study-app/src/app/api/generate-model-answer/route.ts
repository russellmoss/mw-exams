import Anthropic from "@anthropic-ai/sdk";
import { saveGeneratedQuestion, getTastingLexicon, applyAnswerLength } from "@/lib/db";
import {
  buildModelAnswerPrompt,
  parseModelAnswerSections,
  modelAnswerMaxTokens,
  modelAnswerEffort,
} from "@/lib/prompts/model-answer-prompt";
import { marksForWineCount } from "@/lib/answer-length";
import { enforceAnswerLength } from "@/lib/answer-length-gate";
import { getKnowledgeContext, buildCitationBlock } from "@/lib/knowledge/context";
import { loadStoredWineProfiles } from "@/lib/wine-bank-lookup";
import { buildTastingLexiconGuidance } from "@/lib/prompts/tasting-lexicon";
import { requireApiKey } from "@/lib/api-key";
import { selectModel } from "@/lib/model-selector";
import { logClaudeUsage } from "@/lib/usage-log";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const keyResult = await requireApiKey(request);
    if (keyResult instanceof Response) return keyResult;

    const { questionId, questionText, wines, paper, family, totalMarks } =
      await request.json();

    if (!questionId || !questionText || !wines || !paper) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // The answer's word budget is mark-proportional, so the marks have to be known here. Callers may
    // send them; when they don't, 25 marks per wine is the modern exam's universal allocation
    // (EK-0001) and is what this route's own hardcoded 100 assumed for a 4-wine flight anyway.
    const marks = typeof totalMarks === "number" && totalMarks > 0
      ? totalMarks
      : marksForWineCount(Array.isArray(wines) ? wines.length : 0);

    const client = new Anthropic({ apiKey: keyResult.apiKey });
    const { model, abGroup } = await selectModel("model_answer", keyResult.apiKey, "opus");

    const lexiconGuidance = buildTastingLexiconGuidance(await getTastingLexicon());
    // Tier-1 production references. The gate decides: production-shaped questions, fortified,
    // botrytis/sweet, or a named appellation whose specification is in the corpus. (The "never
    // fortified" caveat that used to sit here is obsolete — that hole was filled and the gate
    // reopened.) Fails soft: null block => previous behaviour.
    const { block: knowledgeBlock, passages: kbPassages } = await getKnowledgeContext({ questionText, family });
    // Researched per-wine profiles, so a regenerated exemplar is anchored to the same evidence as the
    // tasting notes the candidate reads. Falls back to a bank lookup, then to {} — never blocks.
    const wineProfiles = await loadStoredWineProfiles(questionId, wines);
    const prompt = buildModelAnswerPrompt(questionText, wines, paper, lexiconGuidance, knowledgeBlock, wineProfiles, marks);

    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      // Sizing + evidence: modelAnswerMaxTokens in prompts/model-answer-prompt.ts. Shared with the
      // engine's background generator and both offline scripts.
      max_tokens: modelAnswerMaxTokens(model),
      ...modelAnswerEffort(model),
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
    if (message.stop_reason === "max_tokens") {
      console.warn(
        `[model-answer] ${questionId}: hit max_tokens (${modelAnswerMaxTokens(model)}) on ${model} — tail sections may be missing`
      );
    }
    logClaudeUsage(
      { taskType: "model_answer", model, source: keyResult.source, userId: keyResult.user.id, questionId, abGroup },
      message.usage,
      { latencyMs: Date.now() - t0 }
    );

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse sections (shared with the offline regen-model-answers script — one source of truth)
    const { modelAnswer: rawModelAnswer, proposedAnnotation, reasoningTrace, studyDiagramAssist } =
      parseModelAnswerSections(text);
    // Enforce the mark-proportional word budget BEFORE the citations go on: the rewriter must never
    // be handed a source list (it would edit or invent entries), and the count excludes it anyway.
    const lengthOutcome = await enforceAnswerLength(rawModelAnswer, marks, keyResult.apiKey, {
      meta: { source: keyResult.source, userId: keyResult.user.id },
      questionId,
      questionText,
    });
    // Citations go on AFTER parsing and after the length gate, never before: parseModelAnswerSections
    // slices on headers, and a source list inserted earlier would be swallowed into whichever section
    // preceded it.
    const modelAnswer =
      lengthOutcome.modelAnswer +
      buildCitationBlock(kbPassages, `${questionText} ${wines.map((w: { fullText?: string }) => w.fullText ?? "").join(" ")}`);

    // Update the question in Neon
    const updated = await saveGeneratedQuestion({
      questionId,
      paper,
      family: family || "F4",
      familyLabel: "",
      questionText,
      wines,
      totalMarks: marks,
      modelAnswer,
      proposedAnnotation: proposedAnnotation || undefined,
      reasoningTrace: reasoningTrace || undefined,
      studyDiagramAssist: studyDiagramAssist || undefined,
    });

    // Stamp the measured count + verdict. Best-effort: the answer is already saved, and a failure to
    // record its length must not turn a successful generation into a 500.
    try {
      await applyAnswerLength(questionId, {
        status: lengthOutcome.status,
        wordCount: lengthOutcome.wordCount,
        answerLength: lengthOutcome.answerLength as Record<string, unknown> | null,
      });
    } catch (err) {
      console.error(`[answer-length] failed to stamp ${questionId} (non-fatal):`, err);
    }

    return Response.json({ success: true, question: updated });
  } catch (err) {
    console.error("generate-model-answer error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
