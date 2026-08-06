// Loads the theory grading index built by scripts/sync-theory-data.mjs at prebuild.
//
// Read once and cached: the index is ~1MB and every grading request needs exactly one row
// from it. Server-only — the route runs on the Node runtime.

import { readFileSync } from "fs";
import { join } from "path";

export interface RubricQuote {
  quote: string;
}
export interface RubricRequirement extends RubricQuote {
  element: string;
}
export interface RubricSignal extends RubricQuote {
  signal: string;
}
export interface RubricTrap extends RubricQuote {
  trap: string;
}
export interface RubricDefinition extends RubricQuote {
  term: string;
}

export interface TheoryRubric {
  id: string;
  year: number;
  paper: number;
  question: number;
  section: "A" | "B" | null;
  domain: string;
  paperTitle: string | null;
  questionText: string;
  commandWord: string | null;
  commandWordDemand: string | null;
  definitionsRequired: RubricDefinition[];
  coreRequirements: RubricRequirement[];
  differentiators: RubricRequirement[];
  creditSignals: RubricSignal[];
  penaltySignals: RubricSignal[];
  scopeTraps: RubricTrap[];
  examplesExpected: {
    required?: boolean;
    specificity?: string;
    named_in_report?: string[];
    quote?: string;
  } | null;
  performanceNote: string | null;
  evidenceQuality: "rich" | "moderate" | "thin" | null;
  sourceReport: string | null;
  /**
   * `transcribed_render` means the examiners' report was an image-only PDF and its text was
   * transcribed from page renders. Quotes from those years are proven against the
   * transcription, not against the printed report — so they must never be presented to a
   * candidate as the examiners' exact words without that caveat.
   */
  textSource: "pdf_text_layer" | "transcribed_render";
  hasModelAnswer: boolean;
}

let cache: Map<string, TheoryRubric> | null = null;

function load(): Map<string, TheoryRubric> {
  if (cache) return cache;
  const path = join(process.cwd(), "public", "data", "theory-grading-index.json");
  try {
    const rows = JSON.parse(readFileSync(path, "utf-8")) as TheoryRubric[];
    cache = new Map(rows.map((r) => [r.id, r]));
  } catch {
    // Fails soft: the corpus may be absent in a partial checkout. Callers surface a clear
    // "no rubric" error rather than the build breaking.
    cache = new Map();
  }
  return cache;
}

export function getTheoryRubric(id: string): TheoryRubric | null {
  return load().get(id) ?? null;
}

/** Question ids are `th_{year}_p{paper}_q{question}`. */
export function theoryQuestionId(year: number, paper: number, question: number): string {
  return `th_${year}_p${paper}_q${question}`;
}

export function listTheoryRubrics(): TheoryRubric[] {
  return [...load().values()];
}

/**
 * Per-question writing time, from the IMW Student Guide's paper durations: papers 1/2/4 are
 * three hours for three answers, paper 3 is two hours for two, and paper 5 is three hours for
 * only TWO — so paper 5 alone gets 90 minutes.
 */
export function theoryTimeMinutes(paper: number): number {
  return paper === 5 ? 90 : 60;
}

/**
 * Realistic word band for the time available (~15 min planning + the rest writing). Used to
 * tell the grader what length was achievable, so it neither penalises an answer for omitting
 * what could not have fitted nor rewards one nobody could have finished.
 */
export function theoryWordBand(paper: number): { min: number; max: number } {
  return theoryTimeMinutes(paper) === 90 ? { min: 1050, max: 1450 } : { min: 700, max: 1000 };
}

/** Words in a candidate's answer, counted the same way the offline validator counts. */
export function countTheoryWords(text: string): number {
  return (text.match(/\b[\w'-]+\b/g) ?? []).length;
}
