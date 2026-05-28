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
  userName?: string;
  questionMetadata?: Record<string, unknown> | null;
  previousThread?: ThreadMessage[];
}): { system: string; user: string } {
  // Load ALL historical questions for cross-reference (not just same paper)
  let allQuestions = "";
  let samePaperQuestions = "";
  try {
    const indexPath = join(process.cwd(), "public", "data", "question-index.json");
    const index = JSON.parse(readFileSync(indexPath, "utf-8"));
    const questions = index.questions || [];
    // All questions for broad cross-reference
    allQuestions = questions
      .map((q: { year: number; paper: number; questionNumber: number; text: string; wines?: { slot: number; fullText: string }[] }) => {
        const wineList = (q.wines || []).map((w: { slot: number; fullText: string }) => `  ${w.slot}. ${w.fullText}`).join("\n");
        return `[${q.year} P${q.paper} Q${q.questionNumber}]: ${q.text.slice(0, 300)}${wineList ? "\n  Wines:\n" + wineList : ""}`;
      })
      .join("\n\n");
    // Same paper for focused reference
    const samePaper = questions.filter((q: { paper: number }) => q.paper === params.paper);
    samePaperQuestions = samePaper
      .map((q: { year: number; paper: number; questionNumber: number; text: string; wines?: { slot: number; fullText: string }[] }) => {
        const wineList = (q.wines || []).map((w: { slot: number; fullText: string }) => `  ${w.slot}. ${w.fullText}`).join("\n");
        return `[${q.year} P${q.paper} Q${q.questionNumber}]: ${q.text.slice(0, 300)}${wineList ? "\n  Wines:\n" + wineList : ""}`;
      })
      .join("\n\n");
  } catch {}

  // Load examiner report synthesis and curveball analysis
  let examinerSynthesis = "";
  let curveballAnalysis = "";
  let wineComposition = "";
  try {
    const ctxPath = join(process.cwd(), "public", "data", "pipeline-context.json");
    const ctx = JSON.parse(readFileSync(ctxPath, "utf-8"));
    if (ctx.examinerReportSynthesis) examinerSynthesis = ctx.examinerReportSynthesis;
    if (ctx.curveballAnalysis) curveballAnalysis = ctx.curveballAnalysis;
    if (ctx.wineCompositionAnalysis) wineComposition = ctx.wineCompositionAnalysis.slice(0, 3000);
  } catch {}

  const system = `You are running feedback analysis for the MW Practical Exam Study System.

## Purpose

Users leave feedback on generated MW exam questions — often disagreeing with the AI evaluation, questioning the wine selection, or flagging issues with question design. Your job is to determine whether each piece of feedback should be **ACCEPTED** (leading to a pipeline change) or **REJECTED** (the system is already correct), grounded in what the real MW exam has actually done over the past 10+ years (2011–2025).

The key principle: the MW exam has done surprising things historically. A candidate saying "this would NEVER happen" may be wrong — if the past exams show it HAS happened, the feedback should be rejected and the system preserved. Conversely, if the feedback identifies a genuine gap or error not seen in any past exam, it should be accepted.

## Your Workflow

### Step 1: Understand the feedback
Parse the user's feedback to identify their specific claim(s):
- Are they saying the question design is flawed? (e.g., variety overlap, unrealistic wine selection)
- Are they disputing the AI evaluation? (e.g., "I was right about the variety")
- Are they saying the wines don't match what MW exams actually do?
- Are they suggesting a structural change to how questions are generated?

### Step 2: Cross-reference against the past 10+ years of real MW exams
Check if the pattern the user says "would never happen" has actually occurred in real MW exams (2011–2025). Look for:
- Similar question structures (same family type, same number of wines)
- Similar wine selections (same varieties, same regions, same blend patterns)
- Similar stem phrasing patterns
- Evidence that the MW DOES or DOES NOT do what the generated question did

### Step 3: Produce your analysis

## Your Output Format

Produce EXACTLY this structure:

### Claim Analysis
{What exactly is the user claiming? Break it into specific testable assertions.}

### Evidence from Past MW Exams (2011–2025)
{What do the real MW exams from the past 10+ years show? Cite specific years/papers/questions.
If the pattern HAS occurred in a real exam, cite the exact instance with year, paper, and question number.
If it HASN'T appeared in any past exam, note the absence but consider whether it's a deliberate gap or just hasn't come up yet.}

### Current Pipeline Check
{Does the current generation prompt or validation logic already handle this?
If so, how? If not, what's the gap?}

### Recommendation: ACCEPT or REJECT

**Reasoning:** {2-3 sentences explaining why}

**If ACCEPT — Proposed Change:**
{Specific, actionable change to make. Name the constraint, the section, the wording.}

**If REJECT — Explanation for User:**
{What to tell the user — respectful, educational, citing evidence from past real MW exams.}

## Important Rules

1. **The past exams are authoritative.** If the real MW exam has done something in any year from 2011–2025, the generated questions should be allowed to do it too. "This seems unusual" is not a valid reason to reject a pattern that appears in a real past exam.

2. **Don't over-correct.** A single feedback item about an edge case doesn't warrant a sweeping prompt change. Scope the fix tightly to the actual issue.

3. **Distinguish evaluation feedback from generation feedback.** If the user is saying "I was right and the AI scored me wrong," that's an evaluation quality issue, not a generation pipeline issue. Note this difference.

4. **Consider the candidate's level.** MW candidates are experts. Their feedback often contains genuine insight. Don't dismiss it reflexively — but do verify it against what the real exams have actually done.

5. **Be specific about changes.** Don't say "update the prompt." Say exactly what constraint should be added or modified.

## Reference Data

### Examiner Report Synthesis (2017–2025)
${examinerSynthesis}

### Curveball Analysis
${curveballAnalysis}

${wineComposition ? `### Wine Composition Rules\n${wineComposition}` : ""}

### Historical Paper ${params.paper} Questions (same paper as the feedback question)
${samePaperQuestions}`;

  let threadContext = "";
  if (params.previousThread && params.previousThread.length > 0) {
    threadContext = "\n\n## Previous Analysis Thread\n" +
      params.previousThread.map((m) =>
        `**${m.role === "system" ? "Analysis" : "User follow-up"}** (${m.timestamp}):\n${m.content}`
      ).join("\n\n---\n\n") +
      "\n\n## Instructions\nThe user has sent a follow-up to the previous analysis. Re-evaluate considering their additional context. You may change your recommendation if the new information warrants it.";
  }

  const userName = params.userName || "User";

  const user = `## Feedback Analysis Request

**User:** ${userName}
**Question:** Paper ${params.paper} / ${params.familyLabel}

### Question Text
${params.questionText}

### Wines
${params.wines.map((w) => `${w.slot}. ${w.fullText}`).join("\n")}

### User's Feedback
"${params.userFeedback}"

${params.userAnswer ? `### User's Answer\n${params.userAnswer}` : ""}

${params.modelAnswer ? `### Model Answer (reference — for context on what the system told the user)\n${params.modelAnswer.slice(0, 4000)}` : ""}

${params.questionMetadata ? `### Question Generation Metadata (internal — shows WHY the system made its choices)
This is the system's internal reasoning when it generated this question. Use it to understand what the system already considered and whether the user's feedback points to something the system missed vs something it deliberately chose.

**Generation Reasoning:** ${(params.questionMetadata as Record<string, unknown>).generationReasoning || "Not available"}

**Validation Results:**
${(params.questionMetadata as Record<string, unknown>).paperScopeCheck ? `- Paper Scope Check: ${JSON.stringify((params.questionMetadata as Record<string, unknown>).paperScopeCheck)}` : ""}
${(params.questionMetadata as Record<string, unknown>).varietyCheck ? `- Variety Check: ${JSON.stringify((params.questionMetadata as Record<string, unknown>).varietyCheck)}` : ""}
${(params.questionMetadata as Record<string, unknown>).originDiversityCheck ? `- Origin Diversity Check: ${JSON.stringify((params.questionMetadata as Record<string, unknown>).originDiversityCheck)}` : ""}
${(params.questionMetadata as Record<string, unknown>).countryDiversityCheck ? `- Country Diversity Check: ${JSON.stringify((params.questionMetadata as Record<string, unknown>).countryDiversityCheck)}` : ""}
${(params.questionMetadata as Record<string, unknown>).noveltyCheck ? `- Novelty Check: ${JSON.stringify((params.questionMetadata as Record<string, unknown>).noveltyCheck)}` : ""}` : ""}
${threadContext}

Please analyze this feedback using the workflow above and produce your structured recommendation.`;

  return { system, user };
}
