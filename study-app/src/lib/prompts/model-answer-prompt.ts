import { readFileSync } from "fs";
import { join } from "path";

let cachedIndex: {
  decisionTrees: Record<string, string>;
  studyDiagrams: Record<string, string>;
  examinerRubric: string;
} | null = null;

let cachedPipeline: {
  mockAnswerWriterAgent: string;
  sharedRules: string;
  examinerReportSynthesis: string;
} | null = null;

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

function loadPipelineContext() {
  if (cachedPipeline) return cachedPipeline;
  const filePath = join(process.cwd(), "public", "data", "pipeline-context.json");
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  cachedPipeline = {
    mockAnswerWriterAgent: raw.mockAnswerWriterAgent || "",
    sharedRules: raw.sharedRules || "",
    examinerReportSynthesis: raw.examinerReportSynthesis || "",
  };
  return cachedPipeline;
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
  const ctx = loadPipelineContext();
  const keys = TREE_KEYS[paper] || TREE_KEYS[1];

  const decisionTree = refs.decisionTrees[keys.tree] || "";
  const studyDiagram = refs.studyDiagrams[keys.diagram] || "";

  const system = `You are generating a model answer package for a Paper ${paper} MW practical exam question. Follow the exact same rules as the mock-answer-writer agent below.

## MOCK ANSWER WRITER AGENT INSTRUCTIONS (CANONICAL — follow these exactly)
${ctx.mockAnswerWriterAgent}

## SHARED RULES
${ctx.sharedRules}

## EXAMINER REPORT SYNTHESIS
${ctx.examinerReportSynthesis}

## DECISION TREE FOR PAPER ${paper}
${decisionTree}

## STUDY DIAGRAM FOR PAPER ${paper}
${studyDiagram}`;

  const wineList = wines
    .map((w) => `Wine ${w.slot}: ${w.fullText}`)
    .join("\n");

  const user = `## Question
${questionText}

## Wines (actual identities — candidate does not see this)
${wineList}

Generate ALL four sections:

### 1. Model Answer
Full answer addressing every sub-question. MW-note style, 250-420 words. Lead with the call, justify from the glass. Follow the mock-answer-writer rules exactly.

### 2. Proposed Annotation
2-3 paragraphs: examiner intent, what the question tests, why these wines, what discriminates strong from weak candidates.

### 3. Reasoning Trace
- Stem signals
- Universe (plausible varieties/regions with confidence tiers: STRONG SIGNAL / PLAUSIBLE / CURVEBALL)
- Rule-outs
- Conclusion

### 4. Study Diagram Assist
Walk through the Paper ${paper} decision tree step by step:
- Layer A: stem routing (which branch, which leaf, using actual node labels from the diagram)
- Layer B: in-glass routing (which sensory nodes confirm variety/origin)
- Where the tree might mislead (specific ambiguity points for these wines)
- Recovery if the first branch is wrong`;

  return { system, user };
}
