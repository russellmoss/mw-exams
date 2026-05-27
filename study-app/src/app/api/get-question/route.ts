import { getQuestionsByFilter, getRecentAttempts, getUnansweredQuestions } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";
import { saveGeneratedQuestion } from "@/lib/db";
import { buildQuestionGenerationPrompt } from "@/lib/prompts/question-generation-prompt";
import { buildModelAnswerPrompt } from "@/lib/prompts/model-answer-prompt";

export const runtime = "nodejs";
export const maxDuration = 120;

// Fire-and-forget background model answer generation
function generateModelAnswerInBackground(
  questionId: string,
  questionText: string,
  wines: { slot: number; fullText: string }[],
  paper: number,
  family: string
) {
  (async () => {
    try {
      const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

      const modelAnswer = extractSection(text, "Model Answer", "Proposed Annotation") || text;
      const proposedAnnotation = extractSection(text, "Proposed Annotation", "Reasoning Trace");
      const reasoningTrace = extractSection(text, "Reasoning Trace", "Study Diagram");
      const studyDiagramAssist = extractSection(text, "Study Diagram", null);

      await saveGeneratedQuestion({
        questionId,
        paper,
        family,
        familyLabel: "",
        questionText,
        wines,
        totalMarks: 100,
        modelAnswer,
        proposedAnnotation: proposedAnnotation || undefined,
        reasoningTrace: reasoningTrace || undefined,
        studyDiagramAssist: studyDiagramAssist || undefined,
      });

      console.log(`Background model answer generated for ${questionId}`);
    } catch (err) {
      console.error(`Background model answer failed for ${questionId}:`, err);
    }
  })();
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

export async function POST(request: Request) {
  try {
    const { paper, family } = await request.json();

    if (!paper) {
      return Response.json({ error: "Missing paper" }, { status: 400 });
    }

    // PRIORITY 1: Unanswered banked questions with model answers ready (instant, best UX)
    const unanswered = await getUnansweredQuestions(paper, family);
    if (unanswered.length > 0) {
      const picked = unanswered[Math.floor(Math.random() * unanswered.length)];
      console.log(`Serving unanswered banked question: ${picked.question_id}`);
      return Response.json({
        source: "pre-populated",
        question: picked,
        hasModelAnswer: true,
      });
    }

    // PRIORITY 2: Previously answered but stale (seen 7+ others since last attempt)
    const available = await getQuestionsByFilter(paper, family);
    const recentAttempts = await getRecentAttempts(100);

    const categoryAttempts = recentAttempts
      .filter((a) => a.paper === paper && (family === "any" || !family || a.family === family))
      .map((a) => a.question_id);

    const staleWithAnswers = available.filter((q) => {
      if (!q.model_answer || q.model_answer.length < 100) return false;
      const lastSeenIdx = categoryAttempts.indexOf(q.question_id);
      if (lastSeenIdx === -1) return false; // unanswered ones already handled above
      return lastSeenIdx >= 7; // seen but 7+ others since
    });

    if (staleWithAnswers.length > 0) {
      const picked = staleWithAnswers[Math.floor(Math.random() * staleWithAnswers.length)];
      console.log(`Serving stale banked question: ${picked.question_id}`);
      return Response.json({
        source: "pre-populated",
        question: picked,
        hasModelAnswer: true,
      });
    }

    // 2. No pre-populated questions available — generate on the fly
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const prompt = buildQuestionGenerationPrompt(paper, family || "any");

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Parse the generated question
    const parsed = parseGeneratedQuestion(text, paper, family || "F4");

    if (!parsed) {
      return Response.json(
        { error: "Failed to parse generated question" },
        { status: 500 }
      );
    }

    // Save to Neon (without model answer initially)
    const questionId = `gen_p${paper}_${family || "any"}_${Date.now()}`;
    const saved = await saveGeneratedQuestion({
      questionId,
      paper,
      family: parsed.family,
      familyLabel: parsed.familyLabel,
      subcategory: parsed.subcategory,
      questionText: parsed.questionText,
      wines: parsed.wines,
      totalMarks: parsed.totalMarks,
      metadata: { generatedOnTheFly: true },
    });

    // Fire-and-forget: kick off model answer generation immediately
    // This runs in the background while the user sees the question
    generateModelAnswerInBackground(
      questionId,
      parsed.questionText,
      parsed.wines,
      paper,
      parsed.family
    );

    return Response.json({
      source: "generated",
      question: saved,
      hasModelAnswer: false,
    });
  } catch (err) {
    console.error("get-question error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

function parseGeneratedQuestion(
  text: string,
  paper: number,
  family: string
): {
  family: string;
  familyLabel: string;
  subcategory: string;
  questionText: string;
  wines: { slot: number; fullText: string }[];
  totalMarks: number;
} | null {
  try {
    // Extract question text (between ## Question and ## Wines)
    const questionMatch = text.match(
      /## Question\s*\n([\s\S]*?)(?=\n## Wines|\n## Metadata)/i
    );
    const questionText = questionMatch ? questionMatch[1].trim() : "";

    // Extract wines
    const winesMatch = text.match(
      /## Wines\s*\n([\s\S]*?)(?=\n## Metadata|\n## |$)/i
    );
    const wines: { slot: number; fullText: string }[] = [];
    if (winesMatch) {
      const lines = winesMatch[1].split("\n").filter((l) => /^\d+\./.test(l.trim()));
      for (const line of lines) {
        const m = line.match(/^(\d+)\.\s+(.*)/);
        if (m) wines.push({ slot: parseInt(m[1]), fullText: m[2].trim() });
      }
    }

    // Extract metadata
    const familyMatch = text.match(/Family:\s*(F\d)/i);
    const familyLabelMatch = text.match(/Family:\s*F\d\s*[-–]\s*(.*)/i);
    const subcatMatch = text.match(/Subcategory:\s*(.*)/i);

    const FAMILY_LABELS: Record<string, string> = {
      F1: "Same Variety",
      F2: "Same Origin",
      F3: "Blend Logic",
      F4: "Mixed Breadth",
      F5: "Method / Production",
      F6: "Style Mechanism",
      F7: "Quality Hierarchy",
    };

    const parsedFamily = familyMatch ? familyMatch[1] : family;
    const parsedLabel = familyLabelMatch
      ? familyLabelMatch[1].trim()
      : FAMILY_LABELS[parsedFamily] || "Unknown";

    // Extract marks
    let totalMarks = 0;
    const mult = [...questionText.matchAll(/\((\d+)\s*[x×]\s*(\d+)\s*marks?\)/gi)];
    for (const m of mult) totalMarks += parseInt(m[1]) * parseInt(m[2]);
    const single = [...questionText.matchAll(/\((\d+)\s*marks?\)/gi)];
    for (const m of single) totalMarks += parseInt(m[1]);
    if (!totalMarks) totalMarks = 100;

    if (!questionText || wines.length === 0) return null;

    return {
      family: parsedFamily,
      familyLabel: parsedLabel,
      subcategory: subcatMatch ? subcatMatch[1].trim() : "",
      questionText,
      wines,
      totalMarks,
    };
  } catch {
    return null;
  }
}
