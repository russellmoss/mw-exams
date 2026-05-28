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
  family: string,
  existingWines?: string[],
  latestQuestion?: {
    questionText: string;
    wines: { slot: number; fullText: string }[];
    paper: number;
    family: string;
  } | null
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

${existingWines && existingWines.length > 0 ? `## WINE DEDUPLICATION — DO NOT REUSE THESE PRODUCERS/WINES
The following wines already exist in the question bank. Do NOT select the same producer+cuvée combination for your new question. Choose different producers from the same variety/region instead.

${existingWines.join("\n")}
` : ""}
${latestQuestion ? `## LATEST GENERATED QUESTION - DO NOT REPEAT ITS SHAPE
The most recent generated question in the live system was:
Paper: ${latestQuestion.paper}
Family: ${latestQuestion.family}
Stem: ${latestQuestion.questionText}
Wines:
${latestQuestion.wines.map((w) => `${w.slot}. ${w.fullText}`).join("\n")}

Your new question must be materially different from this latest question. Do not reuse the same paper + family + country/region pattern with substantially the same grape/appellation set. If you choose the same broad country or family, change the question structure and the grape/region set enough that it is clearly a new exam problem.
` : ""}
## SAME-ORIGIN DIVERSITY GUARDRAIL
For F2 same-origin questions where the stem says the wines are from the same country/region and does NOT explicitly say "same single grape variety" or specify a smaller number of represented varieties, hidden variety repetition is invalid. The wines must be genuinely different identification targets, not just stylistic variants of the same grape.

CRITICAL: This includes BLEND OVERLAP. Do NOT include both a varietal wine and a blend where that same variety is the dominant grape. For example:
- BAD: Sancerre (100% Sauvignon Blanc) + Pessac-Léognan Blanc (Sauvignon Blanc/Sémillon blend) — both have Sauvignon Blanc as the primary variety, creating confusion about whether the flight tests four distinct varieties or not.
- BAD: Barolo + Gattinara — both are Nebbiolo unless the stem explicitly says a Nebbiolo comparison is intended.
- GOOD: Pessac-Léognan Blanc (SB/Sém) + Alsace Riesling + Muscadet (Melon) + Vouvray (Chenin) — four genuinely different primary varieties.
- GOOD: Barolo/Nebbiolo + Chianti Classico/Sangiovese + Taurasi/Aglianico + Etna Rosso/Nerello Mascalese.

Each wine in the flight must have a DIFFERENT primary/dominant grape variety so candidates face four distinct identification challenges. If a repeated grape is intentional, the stem must say so clearly, e.g. "same single grape variety" or "there are three single grape varieties represented."

## DIFFERENT-COUNTRY CONSTRAINT
When the stem says "different countries" (without specifying a number smaller than the wine count), EVERY wine MUST be from a genuinely different country. The MW exam is 100% truthful with geographic claims — in 10 years of exams, not a single "different countries" stem has ever had two wines from the same country. Two wines from different appellations in the same country (e.g., Vouvray and Anjou are both France; Barossa and Margaret River are both Australia) still count as the SAME country. Verify each wine's country before outputting.

If you want two wines from the same country, the stem must either:
- Say "N different countries" where N < wine count (e.g., "from three different countries" for 4 wines signals one country appears twice)
- Not mention "different countries" at all
- Say "same country" or "same region"

## SINGLE-VARIETY STEM CONSTRAINT
When the stem says "each from a different, single grape variety" or "each is made predominantly from a different, single grape variety" or similar per-wine single-variety language, EVERY wine must genuinely be a single-varietal wine. Do NOT include known blend categories:
- BAD: Tawny Port (always a multi-variety Douro blend), Champagne (typically Chardonnay/Pinot Noir/Meunier), Bordeaux blends, Chateauneuf-du-Pape (GSM blend), Amarone/Valpolicella (Corvina blend), Cava (Xarel-lo/Macabeo/Parellada)
- GOOD: Rutherglen Muscat (100% Muscat), Amontillado (100% Palomino), Banyuls (predominantly Grenache), single-varietal Riesling, Nebbiolo (Barolo/Barbaresco)
If you want to include a blend, remove the "single grape variety" language from the stem, or say "predominantly from a different grape variety" without the word "single."

## CRITICAL OUTPUT RULES
1. NO markdown formatting in the question stem. No **bold**, no *italic*, no &nbsp;. Plain text only.
2. Sub-questions use: a) b) c) d). NOT (a), NOT **(a)**.
3. Marks shown as: (15 marks) or (4 x 8 marks). Plain parentheses, no bold.
4. The question reads like it would appear on a printed exam paper.
5. Metadata must never reveal the answer. Family is only the code (F1-F7). Subcategory describes structure only and must not contain a country, region, appellation, producer, grape variety, or parenthetical answer clue.`;

  const user = `Generate ONE exam question for Paper ${paper}${family !== "any" ? `, type ${family}` : ""}.

Output in this EXACT format:

## Question

[Plain text question stem with lettered sub-questions and marks in parentheses]

## Wines

1. [Producer, Cuvee, Vintage. Region, Country. (ABV%)]
2. ...
${paper === 3 ? `
## Wine Appearance

For each wine, describe ONLY what the candidate would see in the glass before smelling or tasting — the visual cues a real candidate observes before picking up the glass. This replicates the real exam experience where candidates can see the wines.

1. [Brief visual description: color, clarity, bubbles if present, viscosity/legs. 10-20 words max.]
2. ...

RULES for appearance notes:
- Describe ONLY visual observations — no aroma, no taste, no wine-type labels.
- Do NOT name the wine category (do not say "fortified", "sparkling", "sweet", etc.).
- DO mention: color (pale lemon, deep gold, amber, tawny, ruby, garnet, salmon pink, etc.), clarity, bubbles/mousse if present, viscosity/tears.
- Be accurate for the specific wine — a 10-Year Tawny Port looks different from a Rutherglen Muscat.
- Keep each note to one line, 10-20 words.
` : ''}
## Metadata

- Paper: ${paper}
- Family: [F1-F7 only, no label text]
- Subcategory: [structure only; no country, region, appellation, producer, grape variety, or answer clue]
- Variety: [the key variety/varieties]
- Countries: [list]
- Curveball: [which wine and why, or "None"]

## Generation Reasoning

[2-4 sentences explaining: Why this question structure? Why these wines? What constraint trade-offs did you make? What examiner principle does this question test? This field is stored for debugging — be honest about your choices.]

## Paper Scope Check

[Confirm: "All ${paper === 1 ? 'wines are white still wines' : paper === 2 ? 'wines are red still wines' : 'wines are sparkling/fortified/sweet/rosé/oxidative'} — VERIFIED." List each wine and its color/type to prove compliance.]`;

  return { system, user };
}
