import Anthropic from "@anthropic-ai/sdk";
import { saveGeneratedQuestion, getTastingLexicon } from "@/lib/db";
import {
  buildModelAnswerPrompt,
  parseModelAnswerSections,
  modelAnswerMaxTokens,
  modelAnswerEffort,
} from "@/lib/prompts/model-answer-prompt";
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

    const { questionId, questionText, wines, paper, family } =
      await request.json();

    if (!questionId || !questionText || !wines || !paper) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

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
    const prompt = buildModelAnswerPrompt(questionText, wines, paper, lexiconGuidance, knowledgeBlock, wineProfiles);

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
    // Citations go on AFTER parsing, never before: parseModelAnswerSections slices on headers, and a
    // source list inserted earlier would be swallowed into whichever section preceded it.
    const modelAnswer = rawModelAnswer + buildCitationBlock(kbPassages);

    // Update the question in Neon
    const updated = await saveGeneratedQuestion({
      questionId,
      paper,
      family: family || "F4",
      familyLabel: "",
      questionText,
      wines,
      totalMarks: 100,
      modelAnswer,
      proposedAnnotation: proposedAnnotation || undefined,
      reasoningTrace: reasoningTrace || undefined,
      studyDiagramAssist: studyDiagramAssist || undefined,
    });

    return Response.json({ success: true, question: updated });
  } catch (err) {
    console.error("generate-model-answer error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
