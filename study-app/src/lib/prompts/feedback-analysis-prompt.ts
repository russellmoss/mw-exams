import { readFileSync } from "fs";
import { join } from "path";

interface ThreadMessage {
  role: "system" | "user";
  content: string;
  timestamp: string;
}

export function buildFeedbackAnalysisPrompt(params: {
  questionText: string;
  wines: { slot: number; fullText: string }[];
  paper: number;
  family: string;
  familyLabel: string;
  modelAnswer: string | null;
  userAnswer: string | null;
  userFeedback: string;
  previousThread?: ThreadMessage[];
}): { system: string; user: string } {
  let corpusExamples = "";
  try {
    const indexPath = join(process.cwd(), "public", "data", "question-index.json");
    const index = JSON.parse(readFileSync(indexPath, "utf-8"));
    const questions = index.questions || [];
    const samePaper = questions.filter((q: { paper: number }) => q.paper === params.paper);
    corpusExamples = samePaper
      .slice(0, 20)
      .map((q: { year: number; paper: number; questionNumber: number; text: string }) =>
        `[${q.year} P${q.paper} Q${q.questionNumber}]: ${q.text.slice(0, 200)}`
      )
      .join("\n");
  } catch {}

  let contextJson = "";
  try {
    const ctxPath = join(process.cwd(), "public", "data", "pipeline-context.json");
    const ctx = JSON.parse(readFileSync(ctxPath, "utf-8"));
    contextJson = [
      ctx.examinerReportSynthesis ? `## Examiner Report Synthesis\n${ctx.examinerReportSynthesis.slice(0, 3000)}` : "",
      ctx.curveballAnalysis ? `## Curveball Analysis\n${ctx.curveballAnalysis.slice(0, 2000)}` : "",
    ].filter(Boolean).join("\n\n");
  } catch {}

  const system = `You are an MW exam study system analyst. A user has submitted feedback on a generated exam question. Your job is to determine whether the feedback should be ACCEPTED (leading to a pipeline change) or REJECTED (the system is already correct), grounded in the actual MW exam corpus.

## Key Principle
The MW exam corpus is authoritative. If the corpus shows the exam HAS done something the user says "would never happen," reject the feedback. If the feedback identifies a genuine gap not seen in the corpus, accept it.

## What you have access to
- The question text, wines, and model answer
- The user's answer and feedback
- Historical MW exam examples from the same paper
- Examiner report synthesis and curveball analysis

## Your output format
Produce a structured analysis:

### Claim Analysis
What exactly is the user claiming? Break it into testable assertions.

### Corpus Evidence
What does the MW exam corpus say? Cite specific years/papers if relevant. If the pattern HAS occurred historically, cite it. If it HASN'T, note the absence.

### Current Pipeline Check
Does the current system already handle this? If so, how? If not, what's the gap?

### Recommendation: ACCEPT or REJECT

**Reasoning:** 2-3 sentences explaining why.

**If ACCEPT:** What specific change should be made?
**If REJECT:** A respectful explanation for the user citing evidence.

${contextJson}

## Historical Paper ${params.paper} Questions (for cross-reference)
${corpusExamples}

## Rules
1. Be respectful — MW candidates are experts. Their feedback often contains genuine insight.
2. Be specific — cite actual exam years and patterns when possible.
3. Distinguish evaluation feedback (AI scored wrong) from generation feedback (question design flaw).
4. Don't over-correct — a single edge case doesn't warrant a sweeping change.`;

  let threadContext = "";
  if (params.previousThread && params.previousThread.length > 0) {
    threadContext = "\n\n## Previous Analysis Thread\n" +
      params.previousThread.map((m) =>
        `**${m.role === "system" ? "Analysis" : "User follow-up"}** (${m.timestamp}):\n${m.content}`
      ).join("\n\n---\n\n") +
      "\n\n## Instructions\nThe user has sent a follow-up to the previous analysis. Re-evaluate considering their additional context. You may change your recommendation if the new information warrants it.";
  }

  const user = `## Question
Paper ${params.paper} / ${params.familyLabel}

${params.questionText}

## Wines
${params.wines.map((w) => `${w.slot}. ${w.fullText}`).join("\n")}

## User's Answer
${params.userAnswer || "(No answer submitted)"}

## User's Feedback
${params.userFeedback}

${params.modelAnswer ? `## Model Answer (reference)\n${params.modelAnswer.slice(0, 3000)}` : ""}
${threadContext}

Please analyze this feedback and provide your recommendation.`;

  return { system, user };
}
