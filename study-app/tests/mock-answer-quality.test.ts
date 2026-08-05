// mock-answer-quality.test.ts — guards outputs/mock_answers/ against the four defect
// classes found when the corpus was regenerated to the mark-proportional budget (2026-08-05).
//
// The budget check alone was not enough. Three of these defects produce files that are
// perfectly sized and still worthless, so length is no signal:
//
//   1. UNDER/OVER BUDGET     — answers written to a flat ~250-word target regardless of marks.
//                              97 of 120 were outside the band; 2015 P1 Q3 was 297 words
//                              against 150 marks (2.0 w/mark, floor 4.5).
//   2. TEMPLATE STUBS        — machine-generated from a template, repeating "Evidence:
//                              varietal/blend profile (X), N% alcohol and ... supports X"
//                              per wine instead of reasoning. 15 files. Two were IN BAND.
//   3. BARE-LABEL LISTS      — a "Wine 11" line followed by comma-separated fragments rather
//                              than prose. 16 files. 2017 P3 Q6 was in band AND lacked the
//                              stub signature, so it survived both other checks.
//   4. UNRESOLVED RESEARCH   — "Source needed" placeholders left in the answer body, and
//                              stale target_word_count/actual_word_count frontmatter whose
//                              numbers no longer matched the file.
//
// Answer bodies are also blind-tasting deductions, so a stale word count in frontmatter is
// worse than none: it asserts a measurement that is no longer true.
//
// Word counting uses the app's own countAnswerBodyWords so this can never drift from the
// budget the generator enforces at runtime. scripts/check_mock_answer_budget.py mirrors the
// same function for ad-hoc checks from the repo root.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  countAnswerBodyWords,
  answerWordBudget,
} from "../src/lib/answer-length";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXAMS = join(ROOT, "data", "exams.json");
const ANSWERS = join(ROOT, "outputs", "mock_answers");

const HAVE_ALL = existsSync(EXAMS) && existsSync(ANSWERS);

type Exam = {
  year: number;
  papers: { paper: number; questions: { n: number; text: string }[] }[];
};

/** "(4 x 10 marks)" -> 40, "(15 marks)" -> 15; a question's marks are the sum. */
const MARK_RE = /\((?:(\d+)\s*x\s*)?(\d+)\s*marks?\)/gi;
function marksFromText(text: string): number {
  let total = 0;
  for (const m of text.matchAll(MARK_RE)) {
    total += (m[1] ? parseInt(m[1], 10) : 1) * parseInt(m[2], 10);
  }
  return total;
}

/** qid -> total marks, e.g. "2026_p1_q1" -> 100. */
function marksByQuestion(): Map<string, number> {
  const exams = JSON.parse(readFileSync(EXAMS, "utf8")) as Exam[];
  const out = new Map<string, number>();
  for (const e of exams) {
    for (const p of e.papers) {
      for (const q of p.questions) {
        out.set(`${e.year}_p${p.paper}_q${q.n}`, marksFromText(q.text));
      }
    }
  }
  return out;
}

function answerFiles(): { qid: string; body: string }[] {
  return readdirSync(ANSWERS)
    .filter((f) => /^\d{4}_p\d_q\d+\.md$/.test(f))
    .sort()
    .map((f) => ({
      qid: f.replace(/\.md$/, ""),
      body: readFileSync(join(ANSWERS, f), "utf8"),
    }));
}

/** Frontmatter stripped — these checks are about the answer body, not its metadata. */
const stripFrontmatter = (t: string) =>
  t.replace(/^﻿?\s*---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");

describe.skipIf(!HAVE_ALL)("mock answers stay usable as study artifacts", () => {
  it("sits inside the mark-proportional word band", () => {
    const marks = marksByQuestion();
    const offenders: string[] = [];

    for (const { qid, body } of answerFiles()) {
      const total = marks.get(qid);
      if (!total) {
        offenders.push(`${qid}: no question in data/exams.json`);
        continue;
      }
      const words = countAnswerBodyWords(body);
      const budget = answerWordBudget(total);
      if (words < budget.min || words > budget.max) {
        const rate = (words / total).toFixed(1);
        offenders.push(
          `${qid}: ${words}w on ${total} marks = ${rate} w/mark ` +
            `(${words < budget.min ? "UNDER" : "OVER"}, band ${budget.min}-${budget.max})`,
        );
      }
    }

    expect(offenders, "answers outside the 4.5-8.5 words/mark band").toEqual([]);
  });

  // The three checks below catch files that are correctly sized but are not answers.
  it("contains no generated-template or bare-label placeholder text", () => {
    const stubs: string[] = [];
    const labelLists: string[] = [];

    for (const { qid, body } of answerFiles()) {
      const prose = stripFrontmatter(body);
      if (prose.includes("Evidence: varietal/blend profile")) stubs.push(qid);
      // A handful of "Wine 3" lines is normal formatting; a wall of them means the file
      // is a label list rather than argued prose.
      const bareLabels = prose.match(/^Wine \d+\s*$/gm)?.length ?? 0;
      if (bareLabels >= 4) labelLists.push(`${qid} (${bareLabels} label lines)`);
    }

    expect(stubs, "template-stub answers — regenerate via mock-answer-writer").toEqual([]);
    expect(labelLists, "bare-label lists, not prose — regenerate via mock-answer-writer").toEqual([]);
  });

  it("leaves no unresolved research placeholders in the body", () => {
    const offenders = answerFiles()
      .filter(({ body }) => stripFrontmatter(body).includes("Source needed"))
      .map(({ qid }) => qid);

    expect(offenders, '"Source needed" left in a finished answer').toEqual([]);
  });

  it("carries no stale word-count frontmatter", () => {
    const offenders = answerFiles()
      .filter(({ body }) => /^(?:target|actual)_word_count:/m.test(body))
      .map(({ qid }) => qid);

    // These fields were written against a flat 250-word target and no longer describe the
    // file. The budget is derived from total_marks, so the counts are redundant as well as wrong.
    expect(offenders, "remove target_word_count/actual_word_count").toEqual([]);
  });
});
