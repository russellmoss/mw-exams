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

  // Pre-roll the flight size based on historical corpus distributions
  const flightSizeDistributions: Record<string, [number, number][]> = {
    F1: [[2, 44], [3, 32], [4, 12], [5, 8], [6, 4]],
    F2: [[2, 42], [3, 33], [4, 25]],
    F3: [[2, 33], [3, 17], [4, 50]],
    F4: [[2, 12], [3, 27], [4, 46], [5, 6], [6, 9]],
    F5: [[1, 8], [2, 33], [3, 25], [4, 17], [5, 17]],
    F6: [[2, 50], [4, 25], [5, 25]],
    F7: [[2, 50], [3, 13], [4, 12], [6, 25]],
    any: [[2, 33], [3, 28], [4, 29], [5, 5], [6, 5]],
  };

  // P1 never uses 5-wine flights
  const p1Adjust = (dist: [number, number][]) =>
    paper === 1 ? dist.filter(([size]) => size !== 5) : dist;

  const dist = p1Adjust(flightSizeDistributions[family || "any"] || flightSizeDistributions.any);
  const totalWeight = dist.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * totalWeight;
  let targetFlightSize = dist[0][0];
  for (const [size, weight] of dist) {
    roll -= weight;
    if (roll <= 0) { targetFlightSize = size; break; }
  }

  const system = `You are generating a SINGLE question (not a full exam) for Paper ${paper}. You follow the exact same rules as the mock-exam-writer agent below.

## ABSOLUTE PAPER SCOPE CONSTRAINT (VIOLATION = AUTOMATIC FAILURE)
Paper ${paper}: ${paperScope}
This is non-negotiable. If you include a wine that violates this scope, the entire question is invalid. Check every wine against this constraint before outputting.

## FLIGHT SIZE FOR THIS QUESTION: ${targetFlightSize} WINES (MANDATORY)
This question MUST have exactly ${targetFlightSize} ${targetFlightSize === 1 ? "wine" : "wines"}. This number was selected from the historical corpus distribution for ${family || "this paper"} to ensure realistic variety in flight sizes. Do NOT change it to a different number.
${targetFlightSize === 2 ? "This is a pair comparison — the most common format for this question type. Design the question around comparing and contrasting two wines." : ""}
${targetFlightSize === 3 ? "This is a three-wine flight — common for same-origin or same-variety questions with regional spread." : ""}
${targetFlightSize >= 5 ? "This is a larger comparative flight — use it for breadth questions, mechanism comparisons, or hierarchy ladders." : ""}

## YOUR TASK
Generate ONE question with exactly ${targetFlightSize} wines for Paper ${paper}${family !== "any" ? `, question family ${family}` : ""}. Follow every constraint in the agent instructions below — geographic vocabulary, wine selection, mark allocation, curveball design, etc.

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

## MARK ALLOCATION RULES (CRITICAL — violation = automatic failure)
Minimum marks per written sub-question: **5 marks**.
The MW exam ONLY uses 2-3 mark sub-questions for numerical "state" answers:
- 2 marks: "State the level of residual sugar" or "State the alcohol level" — one-number answers
- 3 marks: Same type of quick factual answers
NEVER allocate 2-4 marks for written answers like "Comment on commercial position" or "Discuss winemaking." These require sentences and always get 5+ marks.

Typical per-wine mark ranges for written sub-questions:
- Identification (variety + origin): 8-15 marks
- Winemaking / method of production: 5-10 marks
- Quality / maturity: 5-10 marks
- Commercial position: 5-10 marks
- Style: 5-10 marks (often combined with quality)

## STYLE SUB-QUESTIONS (MANDATORY — include in most questions)
"Style" is one of the most common sub-question types in the MW exam. It appears in 60+ questions across the corpus, and in nearly EVERY question in 2024-2025. The generation system must include style questions.

Common style phrasings from recent exams (use these as templates):
- "Comment on the style, quality, and commercial position" (combined — most common in 2024-2025)
- "Comment on the style and quality"
- "Discuss how climate and winemaking techniques have influenced the quality and style"
- "Comment on the style of the wine with reference to the relative importance of human inputs versus natural factors"
- "Compare and contrast the styles and consumer appeal"
- "Comment on the style, winemaking and quality"

At least ONE sub-question should reference "style" unless the question is purely identification-focused. This reflects the modern exam's emphasis on style convergence and differentiation.

Weight recent exam years (2021-2025) more heavily when designing sub-questions. The exam is evolving — style questions barely existed before 2016 but now appear on nearly every question.

## CRITICAL OUTPUT RULES
1. NO markdown formatting in the question stem. No **bold**, no *italic*, no &nbsp;. Plain text only.
2. Sub-questions use: a) b) c) d). NOT (a), NOT **(a)**.
3. Marks shown as: (15 marks) or (4 x 8 marks). Plain parentheses, no bold.
4. The question reads like it would appear on a printed exam paper.
5. Metadata must never reveal the answer. Family is only the code (F1-F7). Subcategory describes structure only and must not contain a country, region, appellation, producer, grape variety, or parenthetical answer clue.
6. If you self-correct during reasoning (e.g., replacing a wine that contradicts a constraint), the FINAL output must reflect the correction. Never output a pre-correction wine.
7. Every written sub-question must be worth at least 5 marks. Only "State RS" or "State ABV" can be 2-3 marks.`;

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
