import { readFileSync } from "fs";
import { join } from "path";
import { FUNNELLING_PRINCIPLE } from "./funnelling";
import { MARKING_PRINCIPLES } from "./marking-principles";
import { deriveQuestion, SECTION_A_HEADING, SECTION_B_HEADING } from "@/lib/question-sections";
import { supportsAdaptiveThinking } from "../model-capabilities";
import {
  answerWordBudget,
  countAnswerBodyWords,
  marksForWineCount,
  WORDS_PER_MARK_TARGET,
} from "@/lib/answer-length";

// ── OUTPUT BUDGET ──────────────────────────────────────────────────────────────────────────────────
//
// One call emits FOUR sections (model answer ~420 words, proposed annotation, reasoning trace,
// study-diagram walkthrough), and truncation lands on the TAIL — so a cut response loses the
// annotation / reasoning trace / diagram assist rather than failing loudly.
//
// This has now been raised twice on the same evidence. 4000 left 15/104 banked questions with no
// model answer at all and 17-21 missing tail sections; that became 8000. Measured again over 14 days,
// 8000 is still truncating (model_usage where task_type='model_answer'):
//
//     claude-opus-5      106 calls   32 at the 8000 cap (30.2%)   avg 6,904
//     claude-sonnet-4-6  113 calls   17 at the 8000 cap (15.0%)   avg 5,105
//
// Two causes stack. The visible package alone is big — Sonnet 4.6 does not reason unless asked and
// still hits the ceiling on 15% of calls, so the PLAIN tier has to clear roughly 8-10k on its own.
// On top of that, `max_tokens` caps thinking + response TOGETHER and a reasoning model spends part of
// the budget before writing a word: Opus 4.7+/Sonnet 5 emit a thinking block whether or not one is
// requested (the default display is "omitted", so those tokens are spent and invisible — see
// thinkingParams). That is why Opus truncates at twice Sonnet's rate on the identical prompt.
//
// Hence two tiers, sized on the MODEL rather than on whether visible reasoning was requested — the
// same rule as generationMaxTokens in question-engine.ts, and for the same reason.
//
// Why 16k and not more. The averages above are depressed BY the cap (32 Opus calls stopped at exactly
// 8000, so the true uncapped distribution runs higher and is unknown), so the tiers are set with real
// margin rather than just above the observed mean — but NOT with unlimited margin, because every
// model-answer call site is non-streaming. Anthropic's guidance is to keep non-streaming max_tokens
// near ~16000: the SDK's HTTP timeout is what a longer generation runs into, and a timeout costs the
// whole call rather than truncating it. (The models themselves allow far more — 128K output on Opus 5
// and Sonnet 4.6, 64K on Haiku 4.5 — so the ceiling here is the transport, not the model.) Doubling
// the old cap covers the four-section package plus a reasoning model's thinking; going to 24k+ would
// trade a truncation failure for a timeout failure. If the tail still truncates at 16k, the fix is to
// switch these call sites to streaming, not to raise the cap again.
const MODEL_ANSWER_MAX_TOKENS_REASONING = 16_000;
const MODEL_ANSWER_MAX_TOKENS_PLAIN = 12_000;

/**
 * The output budget for one model-answer call.
 *
 * Every model-answer call site MUST use this — the live route, the engine's background generator, and
 * the two offline scripts. They previously carried four hand-copied 8000s, and this file's own header
 * notes that offline/production drift on this path is a recurring bug ("the offline path was the
 * correct one and production had drifted from it").
 */
export function modelAnswerMaxTokens(model: string): number {
  return supportsAdaptiveThinking(model)
    ? MODEL_ANSWER_MAX_TOKENS_REASONING
    : MODEL_ANSWER_MAX_TOKENS_PLAIN;
}

// ── REASONING EFFORT ───────────────────────────────────────────────────────────────────────────────
//
// Every model-answer call site sent no `output_config`, which is the API default `high` — the deepest
// and slowest setting. That is most of why this call is the slowest thing in the system: p50 102s,
// p90 115s on Opus (p90 158s on Sonnet).
//
// Measured on a real banked question (P1, 4 wines, Opus-5, same prompt, same max_tokens):
//     effort=medium   4,821 tokens   71s   4/4 sections   458-word answer
//     default (high)  8,167 tokens  114s   4/4 sections   520-word answer
//
// 38% faster with the package intact. That is the whole case for medium, and it stands on its own.
//
// The original note here made a SECOND argument that no longer holds and is worth correcting rather
// than deleting: that medium's 458 words landed closer to the brief than high's 520, against a flat
// ~430-word target. The target is no longer flat (see the mark-proportional budget in
// lib/answer-length.ts). That measurement was a 4-wine P1 question = 100 marks, which budgets ~650
// words with a 450-850 band — so BOTH samples are in band and high's 520 is the closer of the two.
// The length argument for medium is inverted under the real budget; the latency argument is not, and
// the length gate now handles length directly instead of hoping an effort setting does it.
const MODEL_ANSWER_EFFORT = "medium";

/**
 * Reasoning effort for one model-answer call. Gated on the same capability list as the token budget —
 * `output_config.effort` is a 400 on a model that does not accept it.
 */
export function modelAnswerEffort(model: string): Record<string, unknown> {
  return supportsAdaptiveThinking(model) ? { output_config: { effort: MODEL_ANSWER_EFFORT } } : {};
}

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

// These fields hold whole .claude/agents/*.md files, and those begin with YAML frontmatter written
// for the agent RUNNER, not for the model: name, description, model — and `tools: Read, Write, Edit,
// Bash, Grep`.
//
// Pasted verbatim into a system prompt, that last line reads as a tool grant. The model duly
// role-played using them: answers opened "I'll load the necessary files and wine research data
// before writing the answer" followed by fabricated <function_calls> blocks, and ran to 29,000
// characters instead of the ~430 words the prompt asks for. 15 of 62 pending questions and 3
// already-approved ones were in that state.
//
// Stripped at load so every consumer of the context is fixed at once, and so it stays fixed however
// the JSON is regenerated.
function stripFrontmatter(md: string): string {
  return md.replace(/^﻿?\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trimStart();
}

function loadPipelineContext() {
  if (cachedPipeline) return cachedPipeline;
  const filePath = join(process.cwd(), "public", "data", "pipeline-context.json");
  const raw = JSON.parse(readFileSync(filePath, "utf-8"));
  cachedPipeline = {
    mockAnswerWriterAgent: stripFrontmatter(raw.mockAnswerWriterAgent || ""),
    sharedRules: stripFrontmatter(raw.sharedRules || ""),
    examinerReportSynthesis: stripFrontmatter(raw.examinerReportSynthesis || ""),
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
  // lib/knowledge/context.ts. Optional: populated for production-shaped questions, fortified,
  // botrytis/sweet, or a named appellation whose specification is in the corpus. (An earlier version
  // of this comment said fortified was never populated because the corpus had no sherry/port
  // coverage — that hole has since been filled and the gate reopened.) Passed in rather than fetched
  // here because retrieval is async and this builder is sync and used by two call sites.
  knowledgeBlock?: string | null,
  // Researched per-wine reference profiles (lib/wine-enrichment.ts: Tavily notes/tech sheets, gaps
  // filled from model knowledge), keyed by wine slot. Optional and fails soft — omit it and the
  // prompt is byte-identical to before.
  //
  // This exists because the exemplar used to be written from the wine's NAME alone while the
  // enrichment ran concurrently and was handed only to the tasting-note generator. The candidate
  // therefore read a glass description anchored to real notes, then compared their answer against a
  // model answer whose sensory claims were the model's recall of that producer — so the two could
  // disagree about the wine in front of them, and the exemplar was the less well-sourced of the pair.
  wineProfiles?: Record<string, {
    tasting_profile?: {
      appearance?: string;
      nose_summary?: string;
      palate_summary?: string;
      structural_summary?: string;
    } | null;
  }> | null,
  // Marks the question is worth — the answer's word budget is derived from it (lib/answer-length.ts).
  // Optional so no call site is forced to thread it: omitted, it falls back to 25 marks per wine,
  // which is the modern exam's universal allocation (EK-0001).
  totalMarks?: number | null
): { cachedPrefix: string; system: string; user: string } {
  const refs = loadReferenceData();
  const ctx = loadPipelineContext();
  const keys = TREE_KEYS[paper] || TREE_KEYS[1];
  const budget = answerWordBudget(totalMarks ?? marksForWineCount(wines.length));

  const decisionTree = refs.decisionTrees[keys.tree] || "";
  const studyDiagram = refs.studyDiagrams[keys.diagram] || "";

  // Cacheable prefix — same rationale as the generation prompt (see question-generation-prompt.ts).
  // model_answer is the single most expensive task in the system: measured 2026-08-07 it ran $148
  // over 30 hours, ahead of question generation, because it is Opus-5 by default and re-sent this
  // corpus text on every call at a 0.0% cache-hit rate. Nothing per-question may be interpolated
  // here — `${paper}` only, which is what makes the prefix per-paper.
  const cachedPrefix = `## MOCK ANSWER WRITER AGENT INSTRUCTIONS (CANONICAL — follow these exactly)
${ctx.mockAnswerWriterAgent}

## SHARED RULES
${ctx.sharedRules}

## EXAMINER REPORT SYNTHESIS
${ctx.examinerReportSynthesis}

## MARKING PRINCIPLES (write to what actually earns marks — the grader scores against these exact rules)
${MARKING_PRINCIPLES}`;

  const system = `You are generating a model answer package for a Paper ${paper} MW practical exam question. Follow the exact same rules as the mock-answer-writer agent above.

## ANSWER LENGTH — MARK-PROPORTIONAL (OVERRIDES any flat word target above)
The agent instructions may quote a flat word target ("around 250–420 words", "absolute max 450"). That flat number is SUPERSEDED and must be ignored. It does not scale with the size of the question, so it starves a six-wine flight and pads a two-wine one.

- This question is worth **${budget.totalMarks} marks**. The answer body must land between **${budget.min} and ${budget.max} words**, aiming at **~${budget.target}**.
- The rate is ${WORDS_PER_MARK_TARGET} words per mark, because expected depth scales with the marks on offer, not with a fixed page count. Spend the words where the marks are: a 20-mark variety call earns a full paragraph; a 6-mark commercial note earns two sentences.
- Only PROSE counts. YAML frontmatter, markdown headers and any appended source list are excluded from the measurement, so you cannot buy room by cutting headers — and padding headers buys you nothing either.
- **Do NOT report a word count.** Omit \`actual_word_count\` from the frontmatter entirely (and never write \`TBD\`). The count is measured from your output in code; a self-reported number is ignored.
- The budget is enforced. An answer outside the band is sent back to be rewritten, and the rewrite can only cut padding — so write to length the first time and keep the funnelling, the per-wine differentiation and the "under the skin" insight, which are never what gets cut.


${FUNNELLING_PRINCIPLE}
${lexiconGuidance ? `\n${lexiconGuidance}\n` : ""}
## DECISION TREE FOR PAPER ${paper}
${decisionTree}

## STUDY DIAGRAM FOR PAPER ${paper}
${studyDiagram}${knowledgeBlock ? `\n\n${knowledgeBlock}` : ""}`;

  let anyProfile = false;
  const wineList = wines
    .map((w) => {
      let line = `Wine ${w.slot}: ${w.fullText}`;
      const tp = wineProfiles?.[String(w.slot)]?.tasting_profile;
      if (tp && (tp.appearance || tp.nose_summary || tp.palate_summary || tp.structural_summary)) {
        anyProfile = true;
        line += `\n  [RESEARCHED PROFILE — what this wine actually shows in the glass:`;
        if (tp.appearance) line += `\n   Appearance: ${tp.appearance}`;
        if (tp.nose_summary) line += `\n   Nose: ${tp.nose_summary}`;
        if (tp.palate_summary) line += `\n   Palate: ${tp.palate_summary}`;
        if (tp.structural_summary) line += `\n   Structure: ${tp.structural_summary}`;
        line += `]`;
      }
      return line;
    })
    .join("\n");

  // Deliberately NOT a licence to quote the profile. The profile constrains what the answer may claim
  // about the glass; the reasoning still has to be the candidate's, derived blind and reproducible
  // from a tasting note. Sources are withheld from this prompt for the same reason — an exemplar that
  // cites a critic is modelling something the candidate cannot do in the exam room.
  const profileGuidance = anyProfile
    ? `
## USING THE RESEARCHED PROFILES
Some wines above carry a researched reference profile. It is ground truth about the liquid — the candidate is smelling and tasting THAT wine, and the tasting notes they were shown were built from the same profile.
- Every sensory claim you make about a wine must be consistent with its profile. Do not describe a deep, opaque red as "pale ruby" because the variety usually is, and do not give a wine tertiary development the profile does not support.
- Where the profile CONTRADICTS the textbook expectation for that variety/region, that tension is usually the most markable thing in the glass — use it, don't smooth it over.
- Reason FORWARD from the sensory evidence to the conclusion, exactly as a candidate must. Never write as though you had the profile, the label, or a critic in front of you: no "the producer's tech sheet notes...", no citations, no stated ABV figures (see AT-3 below), no reference to this block existing.
- A wine with no profile above is unchanged: reason from your knowledge of the producer and appellation as before.
`
    : "";

  const user = `## Question
${questionText}

## Wines (actual identities — candidate does not see this)
${wineList}
${profileGuidance}

${(() => {
    // Split Sections: when the flight's sub-parts span both scopes, tell the exemplar to organise its
    // Model Answer under the SAME two headings the app renders, so ModelAnswerReveal can key the prose
    // to each section. Single-scope questions are unchanged.
    const d = deriveQuestion(questionText, wines.length);
    if (d.scopes.length <= 1) return "";
    return `## SPLIT SECTIONS — KEY THE MODEL ANSWER BY SECTION
This question is organised into two sections. Structure your Model Answer under these EXACT sub-headings (verbatim), addressing that section's sub-parts under each; do NOT renumber the sub-part letters:
#### ${SECTION_A_HEADING}
#### ${SECTION_B_HEADING}

`;
  })()}Generate ALL four sections:

### 1. Model Answer
Full answer addressing every sub-question. MW-note style, **${budget.min}-${budget.max} words (aim ~${budget.target})** for this ${budget.totalMarks}-mark question — see the mark-proportional length rule above, which overrides any flat word target in the agent instructions. **Demonstrate funnelling** (see the Funnelling principle above): commit to the leading variety + broad-region call early, but visibly weigh the 1–2 plausible alternatives and rule them out from structural evidence ("what it might have been, but was not"), then narrow to the specific call and land it decisively. Do not simply assert one wine with no alternatives considered. Follow the mock-answer-writer rules exactly.
**Differentiate the wines** (AT-1): when the question covers more than one wine, give each its own argument and shape — never apply the same winemaking technique, commercial framing, or sentence scaffold across wines. The grader marks down cut-and-paste even when each statement is individually defensible (Marking Principles Rule 9), so the exemplar must not model the failure it penalises.
**Land the distinction move selectively** (AT-2): rather than cataloguing every descriptor, resolve a genuine tension in the glass with one higher-order inference on the strongest wine — e.g. why an exceptional producer would exceed a classification's minimum sugar, or why high ripeness held by firm acidity reads as altitude rather than heat. This is the "under the skin" second-order insight the grader reserves the top band for; selectivity beats completeness, so deploy it once well rather than everywhere.
**Reason from PERCEIVED alcohol, not the label** (AT-3): alcohol (read alongside acidity) is a primary structural marker for deducing climate and origin, and examiners rate this hard evidence above the flavour profile — so lead with it where it discriminates. But express it as it is assessed in the glass — warmth, weight, and an estimated band ("warm, medium-plus body, ~14%") — NEVER as a bare stated ABV figure lifted from the wine key ("13% alcohol rules out Pinot Noir"). The candidate has no label; the reasoning must be reproducible from the tasting note. Where a flight sits in a narrow alcohol band, say so and cross-reference acidity, tannin quality, and oak rather than leaning on ABV alone.

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

  return { cachedPrefix, system, user };
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
  // Body words of `modelAnswer`, MEASURED HERE — the only word count anything downstream should
  // trust. The model used to be asked to report its own count in the frontmatter and it fabricated
  // one on roughly half the corpus (see the header of lib/answer-length.ts); this is computed after
  // section slicing, so it is the answer prose alone — no frontmatter, no headers, and no citation
  // block (which is appended by the caller AFTER this returns, and is excluded either way).
  modelAnswerWordCount: number;
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
    modelAnswerWordCount: countAnswerBodyWords(modelAnswer),
  };
}
