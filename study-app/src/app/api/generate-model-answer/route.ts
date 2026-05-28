import Anthropic from "@anthropic-ai/sdk";
import { saveGeneratedQuestion } from "@/lib/db";
import { buildModelAnswerPrompt } from "@/lib/prompts/model-answer-prompt";
import { requireApiKey } from "@/lib/api-key";

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

    const prompt = buildModelAnswerPrompt(questionText, wines, paper);

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse sections
    const modelAnswer = extractSection(text, "Model Answer", "Proposed Annotation") || text;
    const proposedAnnotation = extractSection(text, "Proposed Annotation", "Reasoning Trace");
    const reasoningTrace = extractSection(text, "Reasoning Trace", "Study Diagram");
    const studyDiagramAssist = extractSection(text, "Study Diagram", null);

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

function extractSection(
  text: string,
  startHeader: string,
  endHeader: string | null
): string | null {
  const startPattern = new RegExp(
    `#+\\s*\\d*\\.?\\s*${startHeader}[\\s\\S]*?\\n`,
    "i"
  );
  const startMatch = text.match(startPattern);
  if (!startMatch) return null;

  const startIdx = text.indexOf(startMatch[0]) + startMatch[0].length;

  if (endHeader) {
    const endPattern = new RegExp(`#+\\s*\\d*\\.?\\s*${endHeader}`, "i");
    const remaining = text.slice(startIdx);
    const endMatch = remaining.match(endPattern);
    if (endMatch) {
      return remaining.slice(0, remaining.indexOf(endMatch[0])).trim();
    }
  }

  return text.slice(startIdx).trim();
}
