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
  const paperScope = paper === 1
    ? "WHITE STILL WINES ONLY. Every wine in this question MUST be a white still wine. No reds, no rosés, no sparkling, no fortified, no sweet wines (unless a white wine with residual sugar like Riesling Spätlese or Vouvray demi-sec)."
    : paper === 2
      ? "RED STILL WINES ONLY. Every wine in this question MUST be a red still wine. No whites, no rosés, no sparkling, no fortified. All wines must be made from red grape varieties."
      : "SPARKLING, FORTIFIED, SWEET, ROSÉ, AND OXIDATIVE WINES ONLY. Every wine in this question must be from one of these categories. No standard still dry whites or reds.";

  const system = `You are generating a SINGLE question (not a full exam) for Paper ${paper}. You follow the exact same rules as the mock-exam-writer agent below.

## ABSOLUTE PAPER SCOPE CONSTRAINT (VIOLATION = AUTOMATIC FAILURE)
Paper ${paper}: ${paperScope}
This is non-negotiable. If you include a wine that violates this scope, the entire question is invalid. Check every wine against this constraint before outputting.

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
- Curveball: [which wine and why, or "None"]

## Generation Reasoning

[2-4 sentences explaining: Why this question structure? Why these wines? What constraint trade-offs did you make? What examiner principle does this question test? This field is stored for debugging — be honest about your choices.]

## Paper Scope Check

[Confirm: "All ${paper === 1 ? 'wines are white still wines' : paper === 2 ? 'wines are red still wines' : 'wines are sparkling/fortified/sweet/rosé/oxidative'} — VERIFIED." List each wine and its color/type to prove compliance.]`;

  return { system, user };
}
