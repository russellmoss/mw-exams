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

## FLIGHT SIZE DISTRIBUTION (CRITICAL — do not default to 4 wines)
The MW exam uses a wide range of flight sizes. The system is over-generating 4-wine flights. Use these historically observed distributions to select the RIGHT number of wines for the question family:

Overall corpus (153 questions): 2 wines=33%, 3 wines=28%, 4 wines=29%, 5-6 wines=10%

By family:
- F1 Same Variety: 2 wines=44%, 3 wines=32%, 4 wines=12%. DEFAULT TO 2 OR 3, not 4.
- F2 Same Origin: 2 wines=42%, 3 wines=33%, 4 wines=25%. DEFAULT TO 2 OR 3, not 4.
- F3 Blend Logic: 2 wines=33%, 4 wines=50%. Either 2 or 4.
- F4 Mixed Breadth: 4 wines=46%, 3 wines=27%, 6 wines=9%. 4 is appropriate here but 3 is also common.
- F5 Method/Production: 2 wines=33%, 3 wines=25%, 4 wines=17%, 5 wines=17%. Spread across all sizes.
- F6 Style Mechanism: 2 wines=50%, 4-5 wines=50%. Either a pair or a larger comparative set.
- F7 Hierarchy: 2 wines=50%, 6 wines=25%. Pairs dominate; occasionally large comparison sets.

Paper-specific:
- P1: Never uses 5-wine flights. 2-wine (35%), 3-wine (27%), 4-wine (29%), 6-wine (10%).
- P2: 4-wine is most common (35%) but 2 and 3 are equally frequent (29% each).
- P3: Most varied — 2-wine (35%), 3-wine (27%), 4-wine (22%), 5-wine (8%), 6-wine (6%).

DO NOT always generate 4 wines. Match the family's historical distribution. For F1 and F2, a 2-wine pair comparison is the MOST COMMON format — use it frequently.

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

## BANKER MINIMUM RULE (mandatory for flights of 3+ wines)
Every flight of 3 or more wines MUST include at least one "banker" — a benchmark or iconic wine that any well-prepared MW candidate should identify confidently. The MW exam always does this. In 6 examined France same-country P1 flights (2012-2025), EVERY flight had at least 1 benchmark/iconic wine. Most had 2+.

What counts as a banker:
- Premier Cru or Grand Cru Burgundy (not generic Bourgogne or regional)
- Classified Bordeaux (Cru Classé, not generic)
- Marlborough Sauvignon Blanc from a recognized producer
- Barolo/Barbaresco DOCG from a known producer
- Fino/Manzanilla Sherry, classified Sauternes, Vintage/LBV Port
- Any wine with a specific official classification or appellation hierarchy that a candidate can name

What does NOT count as a banker:
- Generic regional wines (Bourgogne Blanc, basic Côtes du Rhône)
- Obscure producers from well-known regions
- Curveball wines that happen to be from famous countries
- Wines where the variety or style is unusual for the region

The banker is the anchor that establishes the baseline. The curveball(s) then differentiate candidates above that baseline. A flight with no banker is disproportionately difficult and prevents the examiners from evaluating mastery of the classics.

BAD: Montlouis sparkling + Bourgogne Blanc + Hermitage Blanc + Deiss field blend (0 bankers, 2 curveballs)
GOOD: Puligny-Montrachet 1er Cru + Sancerre + Hermitage Blanc + Deiss field blend (2 bankers, 1 curveball)
GOOD: Chablis Grand Cru + Pouilly-Fumé + Condrieu + Jurançon Sec (2 bankers, 1 curveball)

## WINE NAME / LABEL INTEGRITY
For same-variety flights ("same single grape variety"), NO wine's name, cuvée, or producer name may contain a DIFFERENT grape variety name. If a wine is labeled "Blaufränkisch" it IS Blaufränkisch, not Syrah. If a wine is labeled "Pinot Noir" it cannot appear in a Riesling flight. Verify every wine name against the declared variety before outputting. If you catch a contradiction during your reasoning, you MUST apply the correction to your final output — do not output the pre-correction version.

## CRITICAL OUTPUT RULES
1. NO markdown formatting in the question stem. No **bold**, no *italic*, no &nbsp;. Plain text only.
2. Sub-questions use: a) b) c) d). NOT (a), NOT **(a)**.
3. Marks shown as: (15 marks) or (4 x 8 marks). Plain parentheses, no bold.
4. The question reads like it would appear on a printed exam paper.
5. Metadata must never reveal the answer. Family is only the code (F1-F7). Subcategory describes structure only and must not contain a country, region, appellation, producer, grape variety, or parenthetical answer clue.
6. If you self-correct during reasoning (e.g., replacing a wine that contradicts a constraint), the FINAL output must reflect the correction. Never output a pre-correction wine.`;

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
- Be accurate for the SPECIFIC wine you selected — a 10-Year Tawny Port looks different from a Rutherglen Muscat. An old-vine concentrated Syrah is NOT "pale ruby." A Vin Santo is NOT "pale gold." Base your description on what THIS wine actually looks like, not a generic version of the variety.
- If you know the wine's structural profile (e.g., style, oak treatment, RS level, quality tier), use that knowledge to inform the visual description.
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
