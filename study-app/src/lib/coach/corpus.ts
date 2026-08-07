// Server-side loaders for the two bundled corpora the Coach answers precedent and examiner-thinking
// questions from. Module-cached: these files are ~7MB and ~1.2MB of JSON and never change between
// deploys, so parsing them once per lambda instance is the whole optimisation.
//
// WHY THIS IS NOT RAG. The obvious instinct is to embed the exam corpus and let the model search it.
// That would be wrong for the questions candidates actually ask. "Has Paper 1 single-variety ever
// been all Semillon?" is a claim about the ABSENCE of a thing across a complete, small, enumerable
// set — 162 real questions. Vector search cannot establish absence; it returns the nearest matches
// and the model confidently narrates them as if they were the whole picture. A deterministic filter
// over the full set can answer "never" and be right. The RAG stack stays where it belongs, on the
// production-technique corpus (src/lib/knowledge/), which is far too large to enumerate.
//
// master-trees.ts loads decisionTrees/studyDiagrams from the same file with its own cache. Left
// separate on purpose: it is imported by the graders, and the Coach should not be able to break
// grading by changing how it loads a corpus.

import { readFileSync } from "fs";
import { join } from "path";

export interface CorpusWine {
  slot: number;
  fullText: string;
}

export interface CorpusQuestion {
  id: string;
  source: "historical" | "mock";
  year: number;
  paper: number;
  questionNumber: number;
  text: string;
  wines: CorpusWine[];
  totalMarks: number | null;
  family: string | null;
  familyLabel: string | null;
  subcategory: string | null;
}

export interface TheoryRubricEntry {
  id: string;
  year: number;
  paper: number;
  question: number;
  paperTitle: string;
  questionText: string;
  commandWord: string | null;
  commandWordDemand: string | null;
  coreRequirements: { element: string; quote: string }[];
  differentiators: { element: string; quote: string }[];
  creditSignals: { signal: string; quote: string }[];
  penaltySignals: { signal: string; quote: string }[];
  scopeTraps: { trap: string; quote: string }[];
  performanceNote: string | null;
  evidenceQuality: string | null;
  sourceReport: string | null;
  /**
   * 'pdf_text_layer' | 'transcribed_render'. Surfaced to the model because a transcribed quote is
   * marginally weaker evidence — the quote gate can prove it matches the transcription, not that the
   * transcription matches the printed report. The Coach must not present those as the examiners'
   * exact words without that caveat.
   */
  textSource: string | null;
}

interface PracticalCorpus {
  questions: CorpusQuestion[];
  examinerRubric: string;
}

let practical: PracticalCorpus | null = null;
let theory: TheoryRubricEntry[] | null = null;

function dataPath(file: string): string {
  return join(process.cwd(), "public", "data", file);
}

/** Fail-soft, like master-trees: a missing bundle degrades a tool, it never 500s a chat turn. */
export function loadPracticalCorpus(): PracticalCorpus {
  if (practical) return practical;
  try {
    const raw = JSON.parse(readFileSync(dataPath("question-index.json"), "utf-8"));
    practical = {
      questions: Array.isArray(raw.questions) ? raw.questions : [],
      examinerRubric: typeof raw.examinerRubric === "string" ? raw.examinerRubric : "",
    };
  } catch (err) {
    console.error("[coach] failed to load question-index.json:", err);
    practical = { questions: [], examinerRubric: "" };
  }
  return practical;
}

export function loadTheoryRubrics(): TheoryRubricEntry[] {
  if (theory) return theory;
  try {
    const raw = JSON.parse(readFileSync(dataPath("theory-grading-index.json"), "utf-8"));
    theory = Array.isArray(raw) ? raw : [];
  } catch (err) {
    console.error("[coach] failed to load theory-grading-index.json:", err);
    theory = [];
  }
  return theory;
}

/**
 * Only real IMW papers count as precedent.
 *
 * The bundle mixes 162 historical questions with 116 generated mocks under a `source` field. A
 * precedent claim built on our own mocks would be circular — the Coach would be citing this app's
 * output back to the candidate as evidence about the examiners. Every precedent query goes through
 * here.
 */
export function historicalQuestions(): CorpusQuestion[] {
  return loadPracticalCorpus().questions.filter((q) => q.source === "historical");
}

/**
 * Accent- and case-insensitive haystack for matching variety/region text inside a wine's full label.
 * The corpus is full of `Grüner`, `Rías Baixas`, `Château` — an ASCII query must still match them,
 * and this exact class of bug has bitten generation validators here before.
 */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}
