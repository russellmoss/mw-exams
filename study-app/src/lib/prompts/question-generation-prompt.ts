import { readFileSync } from "fs";
import { join } from "path";

let cachedContext: PipelineContext | null = null;

interface PipelineContext {
  mockExamWriterAgent: string;
  mockAnswerWriterAgent: string;
  sharedRules: string;
  examinerReportSynthesis: string;
  curveballAnalysis: string;
  sourcingGuide: string;
  wineCompositionAnalysis: string;
  geographicVocabularyRules: string;
  historicalQuestionExamples: Record<
    string,
    { year: number; family: string; text: string; wineCount: number }[]
  >;
}

function loadPipelineContext(): PipelineContext {
  if (cachedContext) return cachedContext;
  const filePath = join(process.cwd(), "public", "data", "pipeline-context.json");
  cachedContext = JSON.parse(readFileSync(filePath, "utf-8"));
  return cachedContext!;
}

export function buildQuestionGenerationPrompt(
  paper: number,
  family: string
): { system: string; user: string } {
  const ctx = loadPipelineContext();

  const examples = ctx.historicalQuestionExamples[`p${paper}`] || [];
  const exampleText = examples
    .map(
      (e) =>
        `[${e.year} P${paper}, ${e.family}, ${e.wineCount} wines]: ${e.text}`
    )
    .join("\n\n");

  // Use the actual mock-exam-writer agent instructions as the core system prompt
  // This keeps the app and CLI pipeline in perfect sync
  const system = `You are generating a SINGLE question (not a full exam) for Paper ${paper}. You follow the exact same rules as the mock-exam-writer agent below.

## YOUR TASK
Generate ONE question with wines for Paper ${paper}${family !== "any" ? `, question family ${family}` : ""}. Follow every constraint in the agent instructions below — geographic vocabulary, wine selection, mark allocation, curveball design, etc.

## MOCK EXAM WRITER AGENT INSTRUCTIONS (CANONICAL — follow these exactly)
${ctx.mockExamWriterAgent}

## SHARED RULES
${ctx.sharedRules}

## EXAMINER REPORT SYNTHESIS
${ctx.examinerReportSynthesis}

## CURVEBALL ANALYSIS
${ctx.curveballAnalysis}

## WINE SOURCING GUIDE
${ctx.sourcingGuide}

## WINE COMPOSITION RULES
${ctx.wineCompositionAnalysis}

## REAL HISTORICAL QUESTION EXAMPLES (Paper ${paper} — match this voice exactly)
${exampleText}

## CRITICAL OUTPUT RULES
1. NO markdown formatting in the question stem. No **bold**, no *italic*, no &nbsp;. Plain text only.
2. Sub-questions use: a) b) c) d). NOT (a), NOT **(a)**.
3. Marks shown as: (15 marks) or (4 x 8 marks). Plain parentheses, no bold.
4. The question reads like it would appear on a printed exam paper.`;

  const user = `Generate ONE exam question for Paper ${paper}${family !== "any" ? `, type ${family}` : ""}.

Output in this EXACT format:

## Question

[Plain text question stem with lettered sub-questions and marks in parentheses]

## Wines

1. [Producer, Cuvee, Vintage. Region, Country. (ABV%)]
2. ...

## Metadata

- Paper: ${paper}
- Family: [F1-F7]
- Subcategory: [specific subcategory]
- Variety: [the key variety/varieties]
- Countries: [list]
- Curveball: [which wine and why, or "None"]`;

  return { system, user };
}
