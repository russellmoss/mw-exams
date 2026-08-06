// Server-side loader for the master decision trees shipped in public/data/question-index.json
// (built by scripts/build-question-index.js from outputs/master_trees/ + outputs/study_diagrams/).
//
// Exists so the stem-analysis graders (evaluate-reasoning's pre-glass coach and evaluate-full's
// debrief) reason from the ACTUAL tree text rather than the model's recall of it. Before 2026-08-06
// the full debrief asked the model to "walk Layer A and name specific tree nodes" without ever
// providing the tree — so corpus corrections (e.g. the 2018 P1 Q3 Riesling maturity-pair fix)
// could never reach the LLM. model-answer-prompt.ts has its own equivalent loader.
import { readFileSync } from "fs";
import { join } from "path";

const TREE_KEYS: Record<number, string> = {
  1: "p1_whites",
  2: "p2_reds",
  3: "p3_special",
};

let cached: {
  decisionTrees: Record<string, string>;
  studyDiagrams: Record<string, string>;
} | null = null;

// Fail-soft: grading must never 500 because a reference file is missing — callers get "" and
// their prompts simply omit the tree section.
function load() {
  if (cached) return cached;
  try {
    const raw = JSON.parse(
      readFileSync(join(process.cwd(), "public", "data", "question-index.json"), "utf-8")
    );
    cached = {
      decisionTrees: raw.decisionTrees || {},
      studyDiagrams: raw.studyDiagrams || {},
    };
  } catch (err) {
    console.error("master-trees: failed to load question-index.json:", err);
    cached = { decisionTrees: {}, studyDiagrams: {} };
  }
  return cached;
}

export function masterTreeForPaper(paper: number): string {
  const key = TREE_KEYS[paper] || TREE_KEYS[1];
  return load().decisionTrees[key] || "";
}

export function studyDiagramForPaper(paper: number): string {
  const key = TREE_KEYS[paper] || TREE_KEYS[1];
  return load().studyDiagrams[key] || "";
}
