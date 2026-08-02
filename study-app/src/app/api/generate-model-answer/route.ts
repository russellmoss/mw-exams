import Anthropic from "@anthropic-ai/sdk";
import { saveGeneratedQuestion, getTastingLexicon } from "@/lib/db";
import { buildModelAnswerPrompt, parseModelAnswerSections } from "@/lib/prompts/model-answer-prompt";
import { getKnowledgeContext } from "@/lib/knowledge/context";
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
    // Tier-1 production references, gated to production-shaped questions (and never fortified —
    // the corpus has no sherry/port coverage). Fails soft: null block => previous behaviour.
    const { block: knowledgeBlock } = await getKnowledgeContext({ questionText, family });
    const prompt = buildModelAnswerPrompt(questionText, wines, paper, lexiconGuidance, knowledgeBlock);

    const t0 = Date.now();
    const message = await client.messages.create({
      model,
      max_tokens: 4000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });
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
    const { modelAnswer, proposedAnnotation, reasoningTrace, studyDiagramAssist } =
      parseModelAnswerSections(text);

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
