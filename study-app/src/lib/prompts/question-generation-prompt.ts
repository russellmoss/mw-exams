import { readFileSync } from "fs";
import { join } from "path";

let cachedContext: PipelineContext | null = null;

interface PipelineContext {
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

const FAMILY_DESCRIPTIONS: Record<string, string> = {
  F1: "Same Variety — all wines share the same single grape variety, from different countries or regions. Tests variety recognition under changing terroir/style conditions.",
  F2: "Same Origin — wines from the same country or region, different varieties or styles. Tests regional literacy and internal diversity.",
  F3: "Blend Logic — wines centered on blends or shared blend composition. Tests understanding of component roles.",
  F4: "Mixed Breadth — several wines with no shared anchor. Tests broad identification skills independently.",
  F5: "Method / Production — main intellectual burden is explaining how the wine was made. Tests technical understanding through tasting.",
  F6: "Style Mechanism — wines grouped to test one structural axis (sweetness, maturity, quality). Tests mechanism reasoning.",
  F7: "Quality Hierarchy — wines from same region at different legal classification tiers. Tests quality calibration within a formal system.",
};

export function buildQuestionGenerationPrompt(
  paper: number,
  family: string
): { system: string; user: string } {
  const ctx = loadPipelineContext();

  const familyDesc =
    family !== "any" && FAMILY_DESCRIPTIONS[family]
      ? FAMILY_DESCRIPTIONS[family]
      : "Any question type — choose the most interesting and varied structure.";

  const examples = ctx.historicalQuestionExamples[`p${paper}`] || [];
  const exampleText = examples
    .map(
      (e) =>
        `[${e.year} P${paper}, ${e.family}, ${e.wineCount} wines]: ${e.text}`
    )
    .join("\n\n");

  const system = `You are an expert Master of Wine exam question writer creating a single question for Paper ${paper}. You follow the EXACT voice, structure, and constraints of the real IMW examination.

## GEOGRAPHIC VOCABULARY RULES (MANDATORY)
${ctx.geographicVocabularyRules}

## EXAMINER EXPECTATIONS (from 13 examiner reports, 2017-2025)
${ctx.examinerReportSynthesis}

## CURVEBALL DESIGN CONSTRAINTS
${ctx.curveballAnalysis}

## WINE SOURCING GUIDE
${ctx.sourcingGuide}

## WINE COMPOSITION RULES (variety repetition, mechanism diversity, price tiers)
${ctx.wineCompositionAnalysis}

## QUESTION FAMILY FOR THIS QUESTION
${familyDesc}

## REAL HISTORICAL QUESTION EXAMPLES (Paper ${paper})
Study these carefully. Your question must sound like these — same voice, same abstraction level, same mark allocation style:

${exampleText}

## CRITICAL OUTPUT RULES
1. Question stems use ONLY abstract geographic vocabulary: "same country", "same region", "same sub-region", "different countries". NEVER name valleys, rivers, mountains, or appellations.
2. Sub-questions use lettered labels: a), b), c), d). NOT (a), NOT **(a)**.
3. Marks shown as: (15 marks) or (4 x 8 marks). NOT **(25 marks)**, NOT bold marks.
4. NO markdown formatting in the question stem. No bold, no italic, no &nbsp;. Plain text only.
5. The question stem is what a candidate reads on paper. It must read naturally as printed text.
6. Wines must be REAL — real producers, real cuvees, verifiable in wine-searcher.
7. Use 2026-appropriate vintages: young whites 2024-2025, young reds 2023-2024, older only when maturity is the point.
8. Total marks for a single question: 50-120 (not always 100).
9. Mark allocation must reflect examiner priorities: identification 35-45%, quality/maturity 20-35%, winemaking 15-21%, commercial 5-15%.`;

  const user = `Generate ONE exam question for Paper ${paper}${family !== "any" ? `, type ${family}` : ""}.

Output in this EXACT format (no markdown formatting in the question text):

## Question

[Plain text question stem. Lettered sub-questions: a) b) c) d). Marks in parentheses. NO bold, NO italic.]

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
