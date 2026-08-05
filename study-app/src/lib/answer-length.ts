// answer-length.ts — Answer Length: hold generated MODEL ANSWERS to a mark-proportional word budget
// that is MEASURED IN CODE.
//
// ── Why this exists ──────────────────────────────────────────────────────────────────────────────
//
// The model-answer prompt used to set a flat "250-420 words" target and ask the model to report
// `actual_word_count` back in the answer's YAML frontmatter. Neither half worked.
//
// The self-report is fabricated. Across 319 banked answers the reported numbers span 392-447 with a
// median of 424 — a spread that narrow across hundreds of independently written answers is not a
// count, it is the model writing a number near the target it was given. Measured against the real
// body count it is >10% wrong in 77 of the 239 answers that report one at all (e.g.
// gen_p2_F3_1779900893323: 640 real body words, reports 441). Anything gating on that number is
// gating on a guess — including the `--repair` selector in scripts/regen-model-answers.mjs, whose
// "a filled-in count correlates with health" reasoning was true but conflated "not catastrophically
// bloated" with "on target".
//
// The flat target is also the wrong SHAPE. Measured body-only (below), the generator writes ~450-470
// words almost regardless of question size: 9.1 words/mark on a 50-mark two-wine question, 4.5 on a
// 100-mark four-wine one, 2.9 on a 150-mark six-wine one. So the corpus was never uniformly bloated —
// small questions are padded and large flights are starved, and a single flat ceiling cannot see the
// difference.
//
// ── Why words-per-MARK ───────────────────────────────────────────────────────────────────────────
//
// Measured over the 112 historical outputs/mock_answers/ — the canonical artifacts, written by the
// separate Python pipeline, which nobody ever tuned to a per-mark rule — words-per-mark is by far the
// most stable descriptor of a well-formed answer:
//
//     words / mark        cv 0.241     <- most stable
//     words / component   cv 0.386
//     words (flat)        cv 0.395
//
// Marks are also the unit the exam itself uses, and EK-0017 ("expected answer depth scales with
// marks") is the doctrinal statement of exactly this. Per-component would say almost the same thing —
// marks-per-component is pinned at 8.33 (cv 0.161) across the corpus — but it would require parsing
// "(4 x 8 marks)" out of every stem, where total_marks is already a column. Same signal, no regex.
//
// ── The rate ─────────────────────────────────────────────────────────────────────────────────────
//
// 6.5 words/mark, confirmed by the user (MW candidate) 2026-08-05, and triangulated three ways:
//   - Time: ~12 min/wine (EK-0003) of which ~8 is writing, at ~22 words/min handwritten under exam
//     pressure = ~176 words per wine; at 25 marks/wine (EK-0001) that is ~7.0 words/mark.
//   - The current generator's own median is 6.47 words/mark — the median answer is already about
//     right; it is the VARIANCE with question size that is wrong.
//   - The user judged gen_p2_F3_1779900893323 (6.4 words/mark) "long but the prose is good and not
//     padded".
//
// The +/-30% band is the historical corpus's own dispersion (cv 0.241), so it admits the natural
// spread of good answers and flags the rest. Deliberately NOT tighter: a 5.0-8.0 band puts 71% of the
// corpus off-target, which is a budget nobody can hit rather than a signal.
//
// This module is PURE — no imports, no I/O, no LLM. The correction loop that acts on it lives in
// answer-length-gate.ts; the prompt-side budget text is built from answerWordBudget() in
// prompts/model-answer-prompt.ts. Keeping it dependency-free is what lets the offline
// regen-model-answers.mjs selector measure stored rows with the SAME function the generator gates on.

// ── The budget ───────────────────────────────────────────────────────────────────────────────────

export const WORDS_PER_MARK_TARGET = 6.5;
export const WORDS_PER_MARK_MIN = 4.5;
export const WORDS_PER_MARK_MAX = 8.5;

// Modern-exam invariant (EK-0001): exactly 25 marks per wine. Used only to infer a budget when a
// caller has the flight but not the mark total.
export const MARKS_PER_WINE = 25;

// Fallback when a row carries no usable total_marks — a 4-wine/100-mark question, the corpus mode.
const FALLBACK_TOTAL_MARKS = 100;

export interface AnswerWordBudget {
  totalMarks: number;
  /** Words to aim for. */
  target: number;
  /** Below this the answer is starved for the marks on offer. */
  min: number;
  /** Above this the answer is not modelling the exam's time discipline. */
  max: number;
}

/** The word budget for an answer to a question worth `totalMarks`. */
export function answerWordBudget(totalMarks: number | null | undefined): AnswerWordBudget {
  const marks =
    typeof totalMarks === "number" && Number.isFinite(totalMarks) && totalMarks > 0
      ? totalMarks
      : FALLBACK_TOTAL_MARKS;
  return {
    totalMarks: marks,
    target: Math.round(marks * WORDS_PER_MARK_TARGET),
    min: Math.round(marks * WORDS_PER_MARK_MIN),
    max: Math.round(marks * WORDS_PER_MARK_MAX),
  };
}

/** Marks implied by a flight when the caller has wines but no mark total (EK-0001). */
export function marksForWineCount(wineCount: number): number {
  return wineCount > 0 ? wineCount * MARKS_PER_WINE : FALLBACK_TOTAL_MARKS;
}

// ── Counting the BODY ────────────────────────────────────────────────────────────────────────────

// The lead-in of the block appended by buildCitationBlock() in lib/knowledge/context.ts. Those source
// lines are retrieval provenance, not the candidate's prose, and they are appended AFTER generation —
// counting them would penalise an answer for how many passages the retriever happened to return.
// Coupled to that function by this string; answer-length.test.ts asserts the two stay in step.
const CITATION_MARKER = "**Sources consulted**";

/**
 * Word count of the ANSWER PROSE only.
 *
 * Excludes, in order: the YAML frontmatter block, the appended citation block, every markdown ATX
 * header line, and horizontal rules. Those four together inflate the raw field by a mean of 17.4%
 * across the banked corpus (raw median 567 words vs body median 458), which is why the raw
 * `length(model_answer)` / `regexp_split_to_array(model_answer, '\s+')` measures that motivated this
 * work read ~100 words high on every single row.
 *
 * Safe to call on either a freshly parsed answer body (no citations yet) or a stored `model_answer`
 * (citations appended) — that is the point of it, since the generator gates on one and the offline
 * repair selector measures the other.
 */
export function countAnswerBodyWords(modelAnswer: string | null | undefined): number {
  if (!modelAnswer) return 0;

  // 1. YAML frontmatter. Same expression as stripFrontmatter() in model-answer-prompt.ts, including
  //    the optional BOM, because the stored answers really do carry one sometimes.
  let text = modelAnswer.replace(/^﻿?\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");

  // 2. The appended citation block — cut back to the horizontal rule that introduces it.
  const cite = text.indexOf(CITATION_MARKER);
  if (cite !== -1) {
    const hr = text.lastIndexOf("\n---", cite);
    text = hr === -1 ? text.slice(0, cite) : text.slice(0, hr);
  }

  // 3. Header lines and horizontal rules. "## b) Identify the origin (4 x 8 marks)" is the question's
  //    own scaffolding echoed back, not writing the candidate is credited for.
  const prose = text
    .split(/\r?\n/)
    .filter((line) => !/^\s*#{1,6}\s/.test(line))
    .filter((line) => !/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line))
    .join("\n");

  return prose.match(/\S+/g)?.length ?? 0;
}

// ── Verdict ──────────────────────────────────────────────────────────────────────────────────────

/**
 * 'clean'     — in band first time (no badge).
 * 'corrected' — was off-budget, the rewrite pass brought it into band.
 * 'over'      — still above budget after the rewrite passes.
 * 'under'     — still below budget after the rewrite passes.
 * NULL in the DB — pre-feature row, never checked; read as 'clean'.
 */
export type AnswerLengthStatus = "clean" | "corrected" | "over" | "under";

export type AnswerLengthVerdict = "ok" | "over" | "under";

export function classifyAnswerLength(wordCount: number, budget: AnswerWordBudget): AnswerLengthVerdict {
  if (wordCount > budget.max) return "over";
  if (wordCount < budget.min) return "under";
  return "ok";
}

/** How far outside the band a count sits (0 when in band). Used to keep the best of several attempts. */
export function distanceOutsideBand(wordCount: number, budget: AnswerWordBudget): number {
  if (wordCount > budget.max) return wordCount - budget.max;
  if (wordCount < budget.min) return budget.min - wordCount;
  return 0;
}

/** One measured attempt, kept for the admin panel so a reviewer can see what the rewrite did. */
export interface AnswerLengthAttempt {
  attempt: number;
  wordCount: number;
  verdict: AnswerLengthVerdict;
}

/** The JSONB persisted on generated_questions.answer_length. */
export interface StoredAnswerLength {
  wordCount: number;
  totalMarks: number;
  target: number;
  min: number;
  max: number;
  wordsPerMark: number;
  attempts: AnswerLengthAttempt[];
  summary: string;
}

export function buildStoredAnswerLength(
  wordCount: number,
  budget: AnswerWordBudget,
  attempts: AnswerLengthAttempt[]
): StoredAnswerLength {
  const verdict = classifyAnswerLength(wordCount, budget);
  const wordsPerMark = Number((wordCount / budget.totalMarks).toFixed(2));
  const summary =
    verdict === "ok"
      ? `${wordCount} words for ${budget.totalMarks} marks (${wordsPerMark}/mark) — within the ${budget.min}-${budget.max} band.`
      : verdict === "over"
        ? `${wordCount} words for ${budget.totalMarks} marks (${wordsPerMark}/mark) — over the ${budget.max}-word ceiling; a real candidate could not write this in the time the paper allows.`
        : `${wordCount} words for ${budget.totalMarks} marks (${wordsPerMark}/mark) — under the ${budget.min}-word floor; too thin for the marks on offer.`;
  return {
    wordCount,
    totalMarks: budget.totalMarks,
    target: budget.target,
    min: budget.min,
    max: budget.max,
    wordsPerMark,
    attempts,
    summary,
  };
}
