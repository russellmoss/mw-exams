import type { Violation } from "@/lib/question-validator";

// The CORRECTION pass for a debrief whose prose asserts wine facts the answer key contradicts
// (validateAnswerKeyClaims → fb_188 / fb_175 / fb_135).
//
// Why a targeted correction rather than a fresh debrief: by the time the claims can be validated the
// whole debrief exists, and re-grading from scratch would re-roll the MARKS and the PASS/BORDERLINE/FAIL
// verdict — which the candidate has already watched stream in. Silently moving someone from PASS to FAIL
// while fixing a mislabelled banker is a worse defect than the one being fixed. So the corrector is
// given the finished debrief and permission to change only the offending sentences.
//
// Three things in the text are load-bearing and must survive verbatim; each has burned a surface before:
//  - `Result:` / `Estimated marks:` — parsed server-side into pass_estimate / marks_estimate
//    (live-tasting/[id]/grade/route.ts onComplete) and client-side in the study flow.
//  - `<!-- SECTION_MARKS ... -->` — parsed by components/SectionMarksRow.tsx for the Section A/B row.
//  - `[[IMG:...]]` / `[[HERO:...]]` — image tokens resolved AFTER this pass by enrichFeedbackWithImages;
//    several were already streamed to the client as resolved images, so a dropped token orphans one.

export function buildClaimCorrectionPrompt(
  feedback: string,
  violations: Violation[]
): { system: string; user: string } {
  const numbered = violations.map((v, i) => `${i + 1}. [${v.rule}] ${v.detail}`).join("\n");

  const system = `You are correcting a specific factual error in a Master of Wine practical debrief that has already been written and shown to the candidate. You are NOT re-grading it.

An automated check against the question's answer key found that the debrief asserts something about the wines that the answer key contradicts. Your job is to fix ONLY those assertions.

## What you MUST NOT change
- The marks awarded, anywhere — per sub-question or in total.
- The overall verdict. The line reading "Result: PASS" / "BORDERLINE" / "FAIL" must come through byte-identical, as must any "Estimated marks:" line.
- Any HTML comment, in particular <!-- SECTION_MARKS ... -->. Reproduce it exactly.
- Any image token of the form [[IMG:...]] or [[HERO:...]]. Reproduce each one exactly where it stands.
- The headings, section order, and overall structure.
- Any assessment of the candidate's answer that the check did not flag. Do not take the opportunity to improve unrelated prose, soften criticism, or add material.

## What you MUST change
Only the flagged claims. For each one, rewrite the minimum span of text — usually a clause or a sentence — so the statement is true of the keyed wine. Keep the examiner's register: direct, specific, unhedged. Do not add a note admitting a correction was made, and do not explain yourself to the candidate.

If a flagged claim is load-bearing for a criticism of the candidate's answer, and correcting the fact removes the grounds for that criticism, delete the criticism rather than rewording it into something else. Marks stay as they are; a debrief that keeps a mark while dropping a wrong reason for it is correct here — the marks were awarded by an examiner reading the whole script, not by this sentence.

## Output
Return the complete corrected debrief as markdown, and nothing else. No preamble, no commentary, no summary of what you changed.`;

  const user = `## The answer key contradicts these claims in the debrief below

${numbered}

## The debrief to correct

${feedback}`;

  return { system, user };
}
