// Question loader: fetches the question index, filters, and selects questions

import type { Question } from "./study-session";

export interface QuestionIndex {
  generated: string;
  totalQuestions: number;
  questions: Question[];
}

export const FAMILY_LABELS: Record<string, string> = {
  F1: "Same Variety",
  F2: "Same Origin",
  F3: "Blend Logic",
  F4: "Mixed Breadth",
  F5: "Method / Production",
  F6: "Style Mechanism",
  F7: "Quality Hierarchy",
};

export const PAPER_LABELS: Record<number, string> = {
  1: "Paper 1 -- Whites",
  2: "Paper 2 -- Reds",
  3: "Paper 3 -- Special",
};

let cachedIndex: QuestionIndex | null = null;

export async function loadQuestionIndex(): Promise<QuestionIndex> {
  if (cachedIndex) return cachedIndex;

  const res = await fetch("/data/question-index.json");
  if (!res.ok) {
    throw new Error(`Failed to load question index: ${res.status}`);
  }
  cachedIndex = (await res.json()) as QuestionIndex;
  return cachedIndex;
}

export function filterQuestions(
  questions: Question[],
  paper: number,
  family?: string
): Question[] {
  return questions.filter((q) => {
    if (q.paper !== paper) return false;
    if (family && family !== "any" && q.family !== family) return false;
    return true;
  });
}

export function selectRandomQuestion(questions: Question[]): Question | null {
  if (questions.length === 0) return null;
  const idx = Math.floor(Math.random() * questions.length);
  return questions[idx];
}

export function getQuestionCounts(
  questions: Question[],
  paper: number
): Record<string, number> {
  const counts: Record<string, number> = { any: 0 };
  for (const q of questions) {
    if (q.paper !== paper) continue;
    counts.any++;
    counts[q.family] = (counts[q.family] || 0) + 1;
  }
  return counts;
}
