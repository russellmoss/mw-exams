const TREE_MAP: Record<number, string> = {
  1: "P1 Whites — Layer A routes by stem (same variety? same country? blend? method?), Layer B routes by aroma family (citrus/petrol = Riesling, wax/lanolin = Chenin, pyrazine = SB, apple/chalk = Chardonnay, lychee/rose = Gewurz).",
  2: "P2 Reds — Layer A routes by stem, Layer B routes by tannin+fruit (cassis/cedar = Cab Sauv, cherry/earth = Pinot, pepper/violet = Syrah, cherry/dust = Tempranillo, tar/rose = Nebbiolo, sour-cherry/herb = Sangiovese).",
  3: "P3 Special — Layer A routes by production family (sparkling/fortified/sweet/rose/oxidative), Layer B routes within each family by method (traditional vs tank, biological vs oxidative aging, botrytis vs passerillage vs fortification vs arrested ferment).",
};

export function buildModelAnswerPrompt(
  questionText: string,
  wines: { slot: number; fullText: string }[],
  paper: number
): { system: string; user: string } {
  const treeContext = TREE_MAP[paper] || TREE_MAP[1];

  const system = `You are a Master of Wine examiner creating a complete model answer package for an MW practical exam question.

## Answer style
Write in MW-note style: decisive answer first, then sensory evidence, then elimination of alternatives. 8-minute time discipline (250-420 words for the answer body). Be structured, not exhaustive.

## The Seven Cardinal Rules
1. Reasoning > Identification — a wrong answer with sound logic earns marks
2. Quality must be contextualized — use official classifications, price points, quality ladders
3. No shoehorning — decide identity from structure first, verify with aromatics
4. Answer the question as asked — address each sub-part separately
5. Maturity has four elements: current age, ready now?, how long to improve, how long to hold
6. Commercial must be specific: channel, geography, price, competitive set, target consumer
7. Structural evidence is foundation — alcohol, acidity, tannin, RS are diagnostic

## Decision tree context for Paper ${paper}
${treeContext}

## Confidence tiers (not percentages)
- STRONG SIGNAL: high confidence
- PLAUSIBLE: worth considering
- CURVEBALL: low probability but historically seen`;

  const wineList = wines.map((w) => `Wine ${w.slot}: ${w.fullText}`).join("\n");

  const user = `## Question
${questionText}

## Wines (these are the actual wines — the candidate does not see this)
${wineList}

Generate ALL four sections in one response:

### 1. Model Answer
Write the full model answer addressing every sub-question. MW-note style, 250-420 words.

### 2. Proposed Annotation
2-3 paragraphs on examiner intent: what the question tests, why these wines were chosen, what discriminates strong from weak candidates.

### 3. Reasoning Trace
- Stem signals (what the question text tells you before tasting)
- Universe (what varieties/regions are plausible)
- Rule-outs (what's eliminated and why)
- Conclusion (what the wines are and confidence level)

### 4. Study Diagram Assist
Walk through the Paper ${paper} decision tree step by step:
- Layer A: stem routing (which branch, which leaf)
- Layer B: in-glass routing (which sensory nodes confirm the variety/origin)
- Where the tree might mislead (specific ambiguity points)
- Recovery if the first branch is wrong`;

  return { system, user };
}
