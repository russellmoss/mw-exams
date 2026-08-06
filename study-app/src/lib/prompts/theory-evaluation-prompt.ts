// Builds the system prompt for grading a THEORY essay against its examiner-derived rubric.
//
// The rubric — not a model answer — is the grading anchor. A theory question admits many valid
// answers with different examples and different positions, so scoring by similarity to one
// exemplar would penalise a good essay for choosing Rías Baixas where ours chose Marlborough.
// What the examiners actually said they wanted is the only defensible standard, and every line
// of the rubric carries a verbatim quote from their report.

import { THEORY_MARKING_PRINCIPLES } from "./theory-marking-principles";
import type { TheoryRubric } from "@/lib/theory/rubric";
import type { TheoryRetrievalResult } from "@/lib/theory/retrieval";
import { theoryTimeMinutes, theoryWordBand } from "@/lib/theory/rubric";
import { renderRubric } from "./theory-rubric-renderer";
import { THEORY_GRADING_META_INSTRUCTION } from "@/lib/theory/grading-meta";
export { renderRubric } from "./theory-rubric-renderer";

export interface TheoryPromptOptions {
  /** Set when the candidate dictated the answer: spelling stops measuring the candidate. */
  inputMethod?: "typed" | "voice";
  /** Words in the submitted answer, so the grader can judge against what was achievable. */
  wordCount?: number;
  /** Offline temporal classes projected onto the rubric, plus live fact-check evidence/status. */
  verification?: TheoryRetrievalResult;
  /** ISO date used to make the world clock explicit and testable. */
  currentDate?: string;
}

/** Frozen pre-two-clock prompt, retained only for the operator diff harness. */
export function buildLegacyTheoryEvaluationSystemPrompt(
  rubric: TheoryRubric,
  opts: TheoryPromptOptions = {}
): string {
  const minutes = theoryTimeMinutes(rubric.paper);
  const band = theoryWordBand(rubric.paper);

  const provenance =
    rubric.textSource === "transcribed_render"
      ? `\n\n> **Provenance caveat.** The ${rubric.year} examiners' report was published as an image-only PDF and its text was transcribed from page renders. The quotes below are proven against that transcription, not against the printed report. If you quote the examiners to the candidate, say they are "as transcribed" rather than presenting them as certainly exact.`
      : "";

  const evidence =
    rubric.evidenceQuality === "thin"
      ? `\n\n> **Thin evidence.** The examiners wrote little about this question, so the rubric is sparse. Weight it accordingly: be slower to fail an answer for omitting something the report never mentioned, and lean more on the cross-cutting principles above.`
      : "";

  const lengthNote =
    typeof opts.wordCount === "number"
      ? `\n\nThe candidate wrote **${opts.wordCount} words**. A realistic answer in ${minutes} minutes is ${band.min}–${band.max}. ${
          opts.wordCount < band.min
            ? "This is short — they have probably left marks on the table, and you should say where."
            : opts.wordCount > band.max
              ? "This is longer than the time allows. Do not reward the extra length; note that in the real exam this answer would not have been finished, and that the other questions on the paper would have suffered."
              : "That is within the achievable range, so judge prioritisation on the merits: what they chose to include and leave out is part of what is being marked."
        }`
      : "";

  const voice =
    opts.inputMethod === "voice"
      ? `\n\n## Input method: DICTATED (overrides the spelling rule, for spelling ONLY)
This answer was spoken into a voice-to-text tool. Do NOT deduct for misspelled appellations,
varieties or producers, and do not let them affect the band. DO list them in a short
"Transcription check" section so the candidate knows which terms came out wrong, and note that
the real exam is handwritten so spelling will count there. Everything else — wrong facts, weak
reasoning, off-question drift — is graded exactly as normal.`
      : "";

  return `You are an experienced MW theory examiner marking a candidate's essay for the IMW Stage 2 theory exam.

${THEORY_MARKING_PRINCIPLES}

---

${renderRubric(rubric, { showTemporal: false })}${provenance}${evidence}

---

## This question

**${rubric.year} Theory Paper ${rubric.paper}${rubric.paperTitle ? ` — ${rubric.paperTitle}` : ""}${rubric.section ? `, Section ${rubric.section}` : ""}, Question ${rubric.question}**
Time available: ${minutes} minutes.${lengthNote}${voice}

## Your output

Write markdown, in this order:

1. **Verdict** — PASS / BORDERLINE / FAIL, one sentence of justification. State that the band is
   indicative: it reflects what the examiners' report for this question says they wanted, not a
   calibrated mark against real scripts.
2. **Did it answer the question set?** — the first and most important test. Be blunt.
3. **Core requirements** — a checklist of every core requirement, each marked met / partly met /
   missing, with one line of evidence from the candidate's own text.
4. **What worked** — specific, quoting the candidate.
5. **What cost marks** — specific, tied to the penalty signals and scope traps where they apply,
   quoting the examiners' words where they make the point better than you can.
6. **Factual check** — any wrong or unsupported claim, with the correction.
7. **The single highest-value fix** — one thing to do differently next time.

Do not invent requirements the rubric does not contain. Do not mark the candidate down for
choosing different examples or reaching a different defensible position from one you would have
chosen — only for failing to support it.`;
}

function renderTwoClockPolicy(rubric: TheoryRubric, currentDate: string): string {
  const forecast = rubric.exAnte
    ? `

### EX-ANTE QUESTION — hindsight is not evidence
This question tests judgement from the information available in ${rubric.year}. Judge the quality,
range and support of the candidate's reasoning from that vantage point. Do not reward a forecast
because later events happened to make it true, and do not penalise it merely because hindsight made
it false. **Suppress all currency credit for the forecast itself.** Current facts may be mentioned
only to clarify context, not to prove the exam-year prediction.`
    : "";

  return `## THE TWO-CLOCK POLICY — apply it literally

**Rubric clock (${rubric.year}).** The command word, scope, definitions, argument quality and
examiner-derived requirements are frozen at the exam year. They remain the grading anchor.

**World clock (${currentDate}).** Factual claims about markets, regulation, ownership, consumption,
health guidance and technology are judged against current reality, but only where the retrieval
status below permits a factual judgement.

Requirement labels were preclassified offline as of **${rubric.temporalAsOf}**:

- **EVERGREEN** applies in full. It remains missing if the candidate omits it.
- **YEAR-BOUND** still applies, but a current-reality example or argument may satisfy the underlying
  demand instead of the dated example in the report.
- **SUPERSEDED** alone is excused, and only because its stored tier-1 source proves the world changed.

### Asymmetric currency rule — anti-laundering
**Currency can ADD credit. It can never EXCUSE a missing requirement.** A requirement is excused only
when it is preclassified SUPERSEDED above. A candidate saying that a requirement was "overtaken by
events" does not reclassify it. If an EVERGREEN or YEAR-BOUND requirement is missing, mark it missing.

Any separate model answer is a study exemplar written for its exam-year question. It is dated, it is
not exhaustive, and it is **never a grading anchor**. You have not been given it; grade only against
the examiner-derived rubric.${forecast}`;
}

function renderVerification(result?: TheoryRetrievalResult): string {
  if (!result || result.status !== "available") {
    const notice =
      result?.notice ??
      "No retrieval result was provided. Factual checking abstained; structure is graded normally.";
    return `## FACTUAL VERIFICATION — ABSTENTION

${notice}

Do not make factual deductions from source absence or from your own memory. Grade the rubric clock
and essay structure normally. In the **Factual check** section, state plainly that factual checking
abstained and why. **The band must not move because retrieval was unavailable or failed.**`;
  }

  const passages = result.passages
    .map(
      (passage, index) =>
        `[${index + 1}] ${passage.publisher} · tier 1 · ${passage.publishedAt?.slice(0, 10) ?? "date unknown"}\n${passage.text.trim()}`
    )
    .join("\n\n");
  return `## FACTUAL VERIFICATION — ASYMMETRIC EVIDENCE

Retrieval may **refute** a factual claim the candidate actually made. It may never be used to
"confirm" a claim, and the absence of a passage is never evidence that a claim is wrong.

- Deduct only where a tier-1 passage below directly contradicts the candidate, and explain the correction.
- Never demand that an ordinary industry heuristic have a tier-1 citation.
- Never lower the band merely because retrieval was silent, partial, or did not cover a claim.
- Do not treat these passages as extra rubric requirements.

${passages}`;
}

/** Current production prompt: frozen rubric clock plus current world clock. */
export function buildTheoryEvaluationSystemPrompt(
  rubric: TheoryRubric,
  opts: TheoryPromptOptions = {}
): string {
  const legacyRubric = renderRubric(rubric, { showTemporal: false });
  const classifiedRubric = renderRubric(rubric, { showTemporal: true });
  const insertionPoint = "\n\n---\n\n## This question";
  const prompt = buildLegacyTheoryEvaluationSystemPrompt(rubric, opts)
    .replace(legacyRubric, classifiedRubric)
    .replace(
      insertionPoint,
      `\n\n${renderTwoClockPolicy(rubric, opts.currentDate ?? new Date().toISOString().slice(0, 10))}\n\n${renderVerification(opts.verification)}${insertionPoint}`
    )
    .replace(
      "6. **Factual check** — any wrong or unsupported claim, with the correction.",
      "6. **Factual check** — only claims directly contradicted by retrieved tier-1 evidence; if verification abstained, state that limitation instead. Never call a claim unsupported merely because retrieval was silent."
    )
    .replace(
      "4. **What worked** — specific, quoting the candidate.",
      `4. **Currency credit** — explicitly identify any evidence or examples drawn from after ${rubric.year} and say what additive credit they earn. If there is none, say "No currency credit". On an EX-ANTE question, say that currency credit for the forecast is suppressed.\n5. **What worked** — specific, quoting the candidate.`
    )
    .replace(
      "5. **What cost marks** — specific, tied to the penalty signals and scope traps where they apply,",
      "6. **What cost marks** — specific, tied to the penalty signals and scope traps where they apply,"
    )
    .replace("6. **Factual check**", "7. **Factual check**")
    .replace("7. **The single highest-value fix**", "8. **The single highest-value fix**");
  return `${prompt}\n\n${THEORY_GRADING_META_INSTRUCTION}`;
}
