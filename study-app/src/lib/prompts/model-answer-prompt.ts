import { readFileSync } from "fs";
import { join } from "path";

let cachedIndex: { decisionTrees: Record<string, string>; studyDiagrams: Record<string, string>; examinerRubric: string } | null = null;

function loadReferenceData() {
  if (cachedIndex) return cachedIndex;
  const filePath = join(process.cwd(), "public", "data", "question-index.json");
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  cachedIndex = {
    decisionTrees: raw.decisionTrees || {},
    studyDiagrams: raw.studyDiagrams || {},
    examinerRubric: raw.examinerRubric || "",
  };
  return cachedIndex;
}

const TREE_KEYS: Record<number, { tree: string; diagram: string }> = {
  1: { tree: "p1_whites", diagram: "p1_whites" },
  2: { tree: "p2_reds", diagram: "p2_reds" },
  3: { tree: "p3_special", diagram: "p3_special" },
};

export function buildModelAnswerPrompt(
  questionText: string,
  wines: { slot: number; fullText: string }[],
  paper: number
): { system: string; user: string } {
  const refs = loadReferenceData();
  const keys = TREE_KEYS[paper] || TREE_KEYS[1];

  const decisionTree = refs.decisionTrees[keys.tree] || "";
  const studyDiagram = refs.studyDiagrams[keys.diagram] || "";
  const examinerRubric = refs.examinerRubric || "";

  const system = `You are a Master of Wine examiner creating a complete model answer package for an MW practical exam question (Paper ${paper}).

## EXAMINER RUBRIC (from 13 examiner reports, 2017-2025)
${examinerRubric}

## ANSWER STYLE RULES
- Write in MW-note style: decisive answer first, then sensory evidence, then elimination of alternatives.
- 8-minute time discipline: 250-420 words for the answer body.
- Be structured, not exhaustive.
- Lead with the call, then justify from the glass.
- Quality judgments must be contextualized with official classifications and price points.
- Commercial comments must be specific: channel, geography, price, competitive set.
- Maturity must include: current age, ready now?, how long to improve?, how long to hold?
- Winemaking must follow chronological order and link every technique to sensory evidence.

## DECISION TREE FOR PAPER ${paper}
${decisionTree}

## STUDY DIAGRAM FOR PAPER ${paper}
${studyDiagram}

## CONFIDENCE TIERS (not percentages)
- STRONG SIGNAL: high confidence
- PLAUSIBLE: worth considering
- CURVEBALL: low probability but historically seen`;

  const wineList = wines
    .map((w) => `Wine ${w.slot}: ${w.fullText}`)
    .join("\n");

  const user = `## Question
${questionText}

## Wines (actual identities — candidate does not see this)
${wineList}

Generate ALL four sections:

### 1. Model Answer
Full answer addressing every sub-question. MW-note style, 250-420 words. Lead with the call, justify from the glass.

### 2. Proposed Annotation
2-3 paragraphs: examiner intent, what the question tests, why these wines, what discriminates strong from weak candidates.

### 3. Reasoning Trace
- Stem signals
- Universe (plausible varieties/regions)
- Rule-outs
- Conclusion with confidence tiers

### 4. Study Diagram Assist
Walk through the Paper ${paper} decision tree:
- Layer A: stem routing (which branch, which leaf, with actual node labels from the diagram)
- Layer B: in-glass routing (which sensory nodes)
- Where the tree might mislead
- Recovery if the first branch is wrong`;

  return { system, user };
}
