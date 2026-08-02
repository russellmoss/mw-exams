import { readFileSync } from "fs";
import { join } from "path";
import { FUNNELLING_PRINCIPLE } from "./funnelling";
import { MARKING_PRINCIPLES } from "./marking-principles";

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
  paper: number,
  lexiconGuidance?: string,
  // Retrieved tier-1 production references, already gated and formatted by
  // lib/knowledge/context.ts. Optional and usually absent: it is populated only for
  // production-shaped questions, and never for fortified/oxidative ones (the corpus has no
  // coverage there). Passed in rather than fetched here because retrieval is async and this
  // builder is sync and used by two call sites.
  knowledgeBlock?: string | null
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

## MARKING PRINCIPLES (write to what actually earns marks — the grader scores against these exact rules)
${MARKING_PRINCIPLES}

${FUNNELLING_PRINCIPLE}
${lexiconGuidance ? `\n${lexiconGuidance}\n` : ""}
## DECISION TREE FOR PAPER ${paper}
${decisionTree}

## STUDY DIAGRAM FOR PAPER ${paper}
${studyDiagram}${knowledgeBlock ? `\n\n${knowledgeBlock}` : ""}`;

  const wineList = wines
    .map((w) => `Wine ${w.slot}: ${w.fullText}`)
    .join("\n");

  const user = `## Question
${questionText}

## Wines (actual identities — candidate does not see this)
${wineList}

Generate ALL four sections:

### 1. Model Answer
Full answer addressing every sub-question. MW-note style, 250-420 words. **Demonstrate funnelling** (see the Funnelling principle above): commit to the leading variety + broad-region call early, but visibly weigh the 1–2 plausible alternatives and rule them out from structural evidence ("what it might have been, but was not"), then narrow to the specific call and land it decisively. Do not simply assert one wine with no alternatives considered. Follow the mock-answer-writer rules exactly.
**Differentiate the wines** (AT-1): when the question covers more than one wine, give each its own argument and shape — never apply the same winemaking technique, commercial framing, or sentence scaffold across wines. The grader marks down cut-and-paste even when each statement is individually defensible (Marking Principles Rule 9), so the exemplar must not model the failure it penalises.
**Land the distinction move selectively** (AT-2): rather than cataloguing every descriptor, resolve a genuine tension in the glass with one higher-order inference on the strongest wine — e.g. why an exceptional producer would exceed a classification's minimum sugar, or why high ripeness held by firm acidity reads as altitude rather than heat. This is the "under the skin" second-order insight the grader reserves the top band for; selectivity beats completeness, so deploy it once well rather than everywhere.

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

// Pull one "### N. <Header>" block out of a generated model-answer package. Tolerant of the
// numbering / "#"-level the model emits. `endHeader = null` means "to end of text".
function extractSection(
  text: string,
  startHeader: string,
  endHeader: string | null
): string | null {
  const startPattern = new RegExp(`#+\\s*\\d*\\.?\\s*${startHeader}[\\s\\S]*?\\n`, "i");
  const startMatch = text.match(startPattern);
  if (!startMatch) return null;
  const startIdx = text.indexOf(startMatch[0]) + startMatch[0].length;
  if (endHeader) {
    const endPattern = new RegExp(`#+\\s*\\d*\\.?\\s*${endHeader}`, "i");
    const remaining = text.slice(startIdx);
    const endMatch = remaining.match(endPattern);
    if (endMatch) {
      return remaining.slice(0, remaining.indexOf(endMatch[0])).trim();
    }
  }
  return text.slice(startIdx).trim();
}

// Split a generated package into its four stored fields. Single source of truth shared by the live
// generate-model-answer route and the offline regen-model-answers script so the two can't drift.
//
// The Model Answer is bounded by the (reliably-headed) "Proposed Annotation" section rather than by a
// "Model Answer" start label: the model titles section 1 inconsistently — sometimes "### 1. Model
// Answer", sometimes "# Mock answer — …" — and keying off the label let the model-answer field swallow
// sections 2-4 whenever the label was absent. Sections 2-4 are always headed, so slicing before the
// Proposed Annotation header is robust to however section 1 was titled.
export function parseModelAnswerSections(text: string): {
  modelAnswer: string;
  proposedAnnotation: string | null;
  reasoningTrace: string | null;
  studyDiagramAssist: string | null;
} {
  const annoStart = text.match(/\n#+\s*\d*\.?\s*Proposed Annotation/i);
  let modelAnswer =
    annoStart && annoStart.index !== undefined
      ? text.slice(0, annoStart.index)
      : extractSection(text, "Model Answer", "Proposed Annotation") || text;
  // Drop a leading "### N. Model Answer" label line if present (keep any YAML frontmatter / "# Mock
  // answer" title the established format uses).
  modelAnswer = modelAnswer.replace(/^#+\s*\d*\.?\s*Model Answer\s*\n+/i, "").trim();
  return {
    modelAnswer,
    proposedAnnotation: extractSection(text, "Proposed Annotation", "Reasoning Trace"),
    reasoningTrace: extractSection(text, "Reasoning Trace", "Study Diagram"),
    studyDiagramAssist: extractSection(text, "Study Diagram", null),
  };
}
