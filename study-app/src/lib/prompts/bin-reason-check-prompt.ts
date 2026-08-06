// bin-reason-check-prompt.ts — adjudicate a "Bin with reason" against the corpus, like feedback.
//
// When an admin bins a generated question WITH a stated reason, that reason feeds forward into the
// generation prompts (the per-paper digest + the distilled lessons block). This prompt asks the model
// to judge whether the stated reason is actually TRUE of this question and consistent with what the
// real MW exam has done (2011–2025) — the same adjudication stance as feedback-analysis-prompt.ts,
// but leaner: one verdict line + a short plain-language analysis. The bin itself is never reversed by
// this; an 'invalid' verdict only (a) withholds the reason from the prompt feeds and (b) surfaces a
// pushback card the admin can act on.

import { readFileSync } from "fs";
import { join } from "path";
import { BIN_REASON_LABELS } from "@/lib/bin-reasons";

export function buildBinReasonCheckPrompt(params: {
  paper: number;
  familyLabel: string | null;
  questionText: string;
  wines: { slot: number; fullText: string }[];
  totalMarks: number | null;
  tags: string[];
  note: string | null;
  /** The admin's reply to a previous challenge (migration 043) — triggers a re-adjudication. */
  rebuttal?: string | null;
  /** The prior analysis the rebuttal is answering; only passed alongside a rebuttal. */
  priorAnalysis?: string | null;
  /** Live empirical knowledge from the Neon projection (paper-filtered). */
  empiricalKnowledge?: string;
}): { system: string; user: string } {
  // Same-paper historical questions for cross-reference (same source the feedback analysis uses).
  let samePaperQuestions = "";
  try {
    const indexPath = join(process.cwd(), "public", "data", "question-index.json");
    const index = JSON.parse(readFileSync(indexPath, "utf-8"));
    const questions = (index.questions || []).filter(
      (q: { paper: number }) => q.paper === params.paper
    );
    samePaperQuestions = questions
      .map(
        (q: {
          year: number;
          paper: number;
          questionNumber: number;
          text: string;
          wines?: { slot: number; fullText: string }[];
        }) => {
          const wineList = (q.wines || [])
            .map((w: { slot: number; fullText: string }) => `  ${w.slot}. ${w.fullText}`)
            .join("\n");
          return `[${q.year} P${q.paper} Q${q.questionNumber}]: ${q.text.slice(0, 300)}${wineList ? "\n  Wines:\n" + wineList : ""}`;
        }
      )
      .join("\n\n");
  } catch {}

  const system = `You are adjudicating a reviewer's BIN REASON in the MW Practical Exam Study System.

## Context
An expert admin reviewer binned a generated practice question and stated a reason. That reason is about
to become standing guidance injected into every future question-generation prompt ("avoid these
faults"). Your job is to verify the reason BEFORE it teaches the generator — exactly as user feedback
is verified against the past 10+ years of real MW exams (2011–2025) before it changes the pipeline.

The bin itself always stands — you are judging only whether the STATED REASON is sound enough to feed
forward. An 'invalid' verdict withholds the reason from generation guidance and shows the admin a
respectful pushback card; it never reverses their decision.

## How to judge
- **The reviewer is an MW-level expert. Default to VALID.** Challenge only what you can actually check.
- **INVALID** requires concrete contradicting evidence, one of:
  - The reason makes a checkable factual claim about THIS question that its own wines/stem/marks
    contradict (e.g. "the stem says same variety but the wines differ" when the listed wines are in
    fact the same variety; "one wine is a blend" when none is).
  - The reason claims "the exam would never do X" but the real corpus below shows the MW exam HAS done
    exactly X — cite the year/paper/question.
  - The reason contradicts an established Empirical Knowledge ruling — cite the EK entry in plain terms.
- **VALID** — the claim checks out against the question, the corpus, and the EK (or is a reasonable
  expert style judgment nothing contradicts). Subjective calls (too easy, too obscure, weak stem) are
  VALID by default unless the corpus clearly shows otherwise.
- **UNCERTAIN** — the claim can't be verified from what you have (e.g. it needs producer-level facts
  you don't hold). Uncertain reasons still feed forward; only 'invalid' is withheld.
- Judge the reason AS A WHOLE: if the note's core complaint is right but a detail is off, that is
  VALID (mention the detail). Tag-only bins with no note are judged on whether the tag plausibly
  applies to this question.

## Output format (STRICT)
First 2–5 sentences of plain-language analysis. Cite real past exams by year/paper/question where
they carry the argument. No markdown headings, no internal codes or file paths — the admin reads
this text verbatim. Then, on the FINAL line, after the analysis, exactly one of:
\`Verdict: VALID\` or \`Verdict: INVALID\` or \`Verdict: UNCERTAIN\`
The verdict comes LAST so it follows from the reasoning — it must agree with the analysis's
conclusion.

## Reference Data
${params.empiricalKnowledge ? `### Accumulated Empirical Knowledge (evidence-cited rulings and rules)
${params.empiricalKnowledge}

---
` : ""}### Historical Paper ${params.paper} Questions (real MW exams, 2011–2025)
${samePaperQuestions || "(question index unavailable)"}`;

  const tagLabels = params.tags.map((t) => BIN_REASON_LABELS[t] || t);

  // Rebuttal round (migration 043): the reviewer has answered a previous challenge. Re-adjudicate
  // with genuine openness — the reviewer may hold context the corpus doesn't (e.g. what they meant,
  // a nuance of the wines) — but a rebuttal that merely restates the refuted claim without new
  // information does not flip the verdict.
  const rebuttalBlock = params.rebuttal
    ? `

### Previous Challenge (your own prior analysis — the reviewer is answering THIS)
${(params.priorAnalysis || "(prior analysis unavailable)").slice(0, 3000)}

### Reviewer's Rebuttal (new information — engage with it directly)
"${params.rebuttal}"

This is a RE-adjudication. Weigh the rebuttal's new claims against the corpus exactly as before: if
it supplies information that answers the challenge, the verdict becomes VALID; if it cannot be
verified either way, UNCERTAIN; if the corpus still contradicts the reason even granting the
rebuttal, INVALID. Address the rebuttal's specific points in your analysis — never repeat the prior
analysis unchanged.`
    : "";

  const user = `## Bin-Reason Check Request

**Binned question:** Paper ${params.paper}${params.familyLabel ? ` / ${params.familyLabel}` : ""}${
    params.totalMarks != null ? ` / ${params.totalMarks} marks` : ""
  }

### Question Text
${params.questionText}

### Wines
${params.wines.map((w) => `${w.slot}. ${w.fullText}`).join("\n")}

### Reviewer's Stated Reason
${tagLabels.length > 0 ? `Tags: ${tagLabels.join(", ")}` : "Tags: (none)"}
${params.note ? `Note: "${params.note}"` : "Note: (none)"}${rebuttalBlock}

Adjudicate the stated reason now, using the output format exactly.`;

  return { system, user };
}
