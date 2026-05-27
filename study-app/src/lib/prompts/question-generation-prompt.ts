const FAMILY_DESCRIPTIONS: Record<string, string> = {
  F1: "Same Variety — all wines share the same single grape variety, from different countries or regions. Tests variety recognition under changing terroir/style conditions.",
  F2: "Same Origin — wines from the same country or region, different varieties or styles. Tests regional literacy and internal diversity.",
  F3: "Blend Logic — wines centered on blends or shared blend composition. Tests understanding of component roles.",
  F4: "Mixed Breadth — several wines with no shared anchor. Tests broad identification skills independently.",
  F5: "Method / Production — main intellectual burden is explaining how the wine was made. Tests technical understanding through tasting.",
  F6: "Style Mechanism — wines grouped to test one structural axis (sweetness, maturity, quality). Tests mechanism reasoning.",
  F7: "Quality Hierarchy — wines from same region at different legal classification tiers. Tests quality calibration within a formal system.",
};

const PAPER_CONTEXTS: Record<number, string> = {
  1: "Paper 1: White still wines. Typical varieties: Chardonnay, Riesling, Sauvignon Blanc, Chenin Blanc, Pinot Gris/Grigio, Semillon, Viognier, Gewurztraminer, Gruner Veltliner, Albarino, Verdejo, Godello, Marsanne, Roussanne.",
  2: "Paper 2: Red still wines. Typical varieties: Pinot Noir, Cabernet Sauvignon, Merlot, Syrah/Shiraz, Nebbiolo, Sangiovese, Tempranillo, Grenache/Garnacha, Cabernet Franc, Malbec, Aglianico, Nerello Mascalese, Mencia, Zinfandel/Primitivo, Tannat.",
  3: "Paper 3: Special wines — sparkling, fortified, sweet, rose, oxidative. Categories include: Champagne, Cremant, Cava, Franciacorta, English sparkling, Prosecco, Port (Ruby/Tawny/Vintage/LBV/Colheita), Sherry (Fino/Manzanilla/Amontillado/Oloroso/Palo Cortado/PX), Madeira, VDN, Sauternes, Tokaji, Icewine, Vin Santo, Recioto, late harvest Riesling.",
};

export function buildQuestionGenerationPrompt(
  paper: number,
  family: string
): { system: string; user: string } {
  const familyDesc =
    family !== "any" && FAMILY_DESCRIPTIONS[family]
      ? FAMILY_DESCRIPTIONS[family]
      : "Any question type — choose the most interesting and varied structure.";

  const paperContext = PAPER_CONTEXTS[paper] || PAPER_CONTEXTS[1];

  const system = `You are an expert Master of Wine exam question writer. You create authentic MW practical exam questions that follow the exact voice, structure, and conventions of the real IMW examination.

## Exam conventions
- The MW practical exam has three papers: Paper 1 (whites), Paper 2 (reds), Paper 3 (special).
- Each paper has 12 wines across 3-5 questions.
- Question stems use a strict abstract geographic vocabulary: "same country", "same region", "sub-region", "origin". NEVER use specific geographic features (valleys, rivers, mountains), NEVER use "appellation" (the IMW says "region" or "sub-region"), NEVER name specific places as clues.
- Marks are allocated per sub-question with specific values shown in parentheses.
- Total marks per question typically range from 50-100.
- Questions must allow marks even when identification fails — at least one sub-part should reward describing what is in the glass.

## Wine selection rules
- All wines must be REAL wines that exist — real producers, real cuvees, real regions.
- Use 2026-aware vintage realism: young whites 2024-2025, young reds 2023-2024, older only if maturity is tested.
- Include at least one curveball (lesser-known but defensible) per question of 4+ wines.
- Curveballs must be anchored by recognizable wines.
- Wines should span different quality/price tiers when the question tests quality calibration.
- Never exceed ~$400 retail per bottle (the IMW must buy ~25 bottles of each wine).

## ${paperContext}

## Question family for this question
${familyDesc}`;

  const user = `Generate ONE exam question for Paper ${paper}${family !== "any" ? ` of type ${family}` : ""}.

Output in this exact format:

## Question

[The question stem with sub-questions and mark allocations. Use authentic MW phrasing.]

## Wines

1. [Full wine details: Producer/Cuvee, Vintage. Region, Country. (ABV%)]
2. ...
[Continue for all wines in the question]

## Metadata

- Paper: ${paper}
- Family: [F1-F7]
- Subcategory: [specific subcategory]
- Variety: [the key variety/varieties]
- Countries: [list of countries represented]
- Curveball: [which wine if any, and why — or "None"]

Be creative. Don't default to the most obvious choice. Consider lesser-used but defensible varieties, regions, and structures.`;

  return { system, user };
}
