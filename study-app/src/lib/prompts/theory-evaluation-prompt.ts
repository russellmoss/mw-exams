// Builds the system prompt for grading a THEORY essay against its examiner-derived rubric.
//
// The rubric — not a model answer — is the grading anchor. A theory question admits many valid
// answers with different examples and different positions, so scoring by similarity to one
// exemplar would penalise a good essay for choosing Rías Baixas where ours chose Marlborough.
// What the examiners actually said they wanted is the only defensible standard, and every line
// of the rubric carries a verbatim quote from their report.

import { THEORY_MARKING_PRINCIPLES } from "./theory-marking-principles";
import type { TheoryRubric } from "@/lib/theory/rubric";
import { theoryTimeMinutes, theoryWordBand } from "@/lib/theory/rubric";

function bullets(items: { quote: string }[], label: (i: never) => string): string {
  return items
    .map((i) => `- ${label(i as never)}\n  > "${i.quote.trim()}"`)
    .join("\n");
}

/** Renders one question's rubric as the marking scheme the grader must apply. */
export function renderRubric(r: TheoryRubric): string {
  const parts: string[] = [];

  parts.push(`## The marking scheme for THIS question

Every line below is extracted from the IMW examiners' report for ${r.year} (${r.sourceReport ?? "report"}),
and each carries the examiners' own words. Quote them back to the candidate where useful — the
examiners' phrasing is far more persuasive than your own.`);

  if (r.commandWord) {
    parts.push(`### Command word: "${r.commandWord}"
${r.commandWordDemand ? `What the examiners said it demanded: ${r.commandWordDemand}` : ""}

Check this FIRST. An answer that does something other than what the command word demands —
describing where it should assess — is off-brief however knowledgeable it is.`);
  }

  if (r.definitionsRequired.length) {
    parts.push(`### Terms the examiners expected to be DEFINED
${bullets(r.definitionsRequired, (d: RubricDefLike) => `**${d.term}**`)}

An answer that never defines these has lost real marks, however strong what follows.`);
  }

  if (r.coreRequirements.length) {
    parts.push(`### Core requirements — the PASS FLOOR (${r.coreRequirements.length})
The examiners treated each of these as needed to pass. Assess the answer against every one and
say explicitly which are met, partly met, or missing.
${bullets(r.coreRequirements, (e: RubricReqLike) => e.element)}`);
  } else {
    // The examiners' commentary for this question described what strong answers did without
    // stating anything as required to pass, so the extractor recorded differentiators only.
    // Say so rather than leaving the grader with a silently absent floor: without this it
    // would either invent a floor or treat every differentiator as mandatory, and both
    // penalise the candidate for something the examiners never asked.
    parts.push(`### Core requirements — NONE STATED
The examiners' commentary on this question set out what strong answers did, but did not treat
anything as required to pass. So there is no explicit pass floor here. Judge the pass/fail line
on the cross-cutting principles above — above all, whether the question set was answered, and
whether the answer argues rather than describes. Treat the differentiators below as evidence of
a strong answer, NOT as a checklist the candidate had to satisfy.`);
  }

  if (r.differentiators.length) {
    parts.push(`### Differentiators — what lifted strong answers above a bare pass
Not required to pass. Do not mark an answer down for omitting these; DO credit them when present.
${bullets(r.differentiators, (e: RubricReqLike) => e.element)}`);
  }

  if (r.creditSignals.length) {
    parts.push(`### What the best answers did
${bullets(r.creditSignals, (s: RubricSigLike) => s.signal)}`);
  }

  if (r.penaltySignals.length) {
    parts.push(`### What weak answers did — negative checks
Look for each of these in the candidate's answer and name any you find.
${bullets(r.penaltySignals, (s: RubricSigLike) => s.signal)}`);
  }

  if (r.scopeTraps.length) {
    parts.push(`### Misreadings the examiners explicitly warned about
If the candidate has fallen into one, that is the single most important thing to tell them.
${bullets(r.scopeTraps, (t: RubricTrapLike) => t.trap)}`);
  }

  const ex = r.examplesExpected;
  if (ex && (ex.required || ex.specificity)) {
    const named = ex.named_in_report?.length
      ? `\nExamples the report itself praised: ${ex.named_in_report.join("; ")}. The candidate is NOT expected to use these — they are a calibration of the right grain, not a checklist.`
      : "";
    parts.push(`### Examples
Required: ${ex.required ? "yes" : "not explicitly"}.${ex.specificity ? ` Expected specificity: ${ex.specificity}` : ""}${named}${ex.quote ? `\n> "${ex.quote.trim()}"` : ""}`);
  }

  if (r.performanceNote) {
    parts.push(`### How candidates actually performed
${r.performanceNote}

Context only — do not grade this candidate against the cohort. The IMW standard is criterion-referenced.`);
  }

  return parts.join("\n\n");
}

export interface TheoryPromptOptions {
  /** Set when the candidate dictated the answer: spelling stops measuring the candidate. */
  inputMethod?: "typed" | "voice";
  /** Words in the submitted answer, so the grader can judge against what was achievable. */
  wordCount?: number;
}

export function buildTheoryEvaluationSystemPrompt(
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

${renderRubric(rubric)}${provenance}${evidence}

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

// Minimal structural aliases so the bullet renderer stays type-safe without leaking the
// full rubric types into every call site.
interface RubricDefLike {
  term: string;
}
interface RubricReqLike {
  element: string;
}
interface RubricSigLike {
  signal: string;
}
interface RubricTrapLike {
  trap: string;
}
