import type { RubricRequirement, TheoryRubric } from "@/lib/theory/rubric";

function bullets<T extends { quote: string }>(items: T[], label: (item: T) => string): string {
  return items.map((item) => `- ${label(item)}\n  > "${item.quote.trim()}"`).join("\n");
}

/** Renders one question's examiner-derived rubric as the marking scheme the grader must apply. */
function requirementLabel(requirement: RubricRequirement, showTemporal: boolean): string {
  if (!showTemporal) return requirement.element;
  if (requirement.temporalClass === "superseded") {
    const source = requirement.temporalSource;
    return `**[SUPERSEDED — EXCUSED]** ${requirement.element}${source ? ` ([tier-1 source](${source.url}))` : ""}`;
  }
  if (requirement.temporalClass === "year_bound") {
    return `**[YEAR-BOUND — CURRENT SUBSTITUTE ACCEPTED]** ${requirement.element}`;
  }
  return `**[EVERGREEN — APPLIES IN FULL]** ${requirement.element}`;
}

export function renderRubric(
  r: TheoryRubric,
  options: { showTemporal?: boolean } = {}
): string {
  const parts: string[] = [];
  const showTemporal = options.showTemporal ?? true;

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
${bullets(r.definitionsRequired, (definition) => `**${definition.term}**`)}

An answer that never defines these has lost real marks, however strong what follows.`);
  }

  if (r.coreRequirements.length) {
    const active = r.coreRequirements.filter((requirement) => requirement.temporalClass !== "superseded");
    const countLabel = showTemporal
      ? `${active.length} active${active.length !== r.coreRequirements.length ? `; ${r.coreRequirements.length - active.length} preclassified superseded` : ""}`
      : String(r.coreRequirements.length);
    parts.push(`### Core requirements — the PASS FLOOR (${countLabel})
The examiners treated each of these as needed to pass. Assess the answer against every one and
say explicitly which are met, partly met, or missing.
${bullets(r.coreRequirements, (requirement) => requirementLabel(requirement, showTemporal))}`);
  } else {
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
${bullets(r.differentiators, (requirement) => requirementLabel(requirement, showTemporal))}`);
  }

  if (r.creditSignals.length) {
    parts.push(`### What the best answers did
${bullets(r.creditSignals, (signal) => signal.signal)}`);
  }

  if (r.penaltySignals.length) {
    parts.push(`### What weak answers did — negative checks
Look for each of these in the candidate's answer and name any you find.
${bullets(r.penaltySignals, (signal) => signal.signal)}`);
  }

  if (r.scopeTraps.length) {
    parts.push(`### Misreadings the examiners explicitly warned about
If the candidate has fallen into one, that is the single most important thing to tell them.
${bullets(r.scopeTraps, (trap) => trap.trap)}`);
  }

  const examples = r.examplesExpected;
  if (examples && (examples.required || examples.specificity)) {
    const named = examples.named_in_report?.length
      ? `\nExamples the report itself praised: ${examples.named_in_report.join("; ")}. The candidate is NOT expected to use these — they are a calibration of the right grain, not a checklist.`
      : "";
    parts.push(`### Examples
Required: ${examples.required ? "yes" : "not explicitly"}.${examples.specificity ? ` Expected specificity: ${examples.specificity}` : ""}${named}${examples.quote ? `\n> "${examples.quote.trim()}"` : ""}`);
  }

  if (r.performanceNote) {
    parts.push(`### How candidates actually performed
${r.performanceNote}

Context only — do not grade this candidate against the cohort. The IMW standard is criterion-referenced.`);
  }

  return parts.join("\n\n");
}
