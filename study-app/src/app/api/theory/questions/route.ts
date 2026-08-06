import { getUser } from "@/lib/auth";
import { listTheoryRubrics, theoryTimeMinutes, theoryWordBand } from "@/lib/theory/rubric";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  // This list is rubric-backed by construction. The 54 questions from 2015/2026 never enter the
  // learner API, picker, appendix, or grading route.
  const questions = listTheoryRubrics().map((rubric) => ({
    id: rubric.id,
    year: rubric.year,
    paper: rubric.paper,
    question: rubric.question,
    section: rubric.section,
    domain: rubric.domain,
    paperTitle: rubric.paperTitle,
    questionText: rubric.questionText,
    timeMinutes: theoryTimeMinutes(rubric.paper),
    wordBand: theoryWordBand(rubric.paper),
    evidenceQuality: rubric.evidenceQuality,
    exAnte: rubric.exAnte,
    searchText: [
      rubric.questionText,
      rubric.domain,
      rubric.paperTitle,
      ...rubric.definitionsRequired.map((definition) => definition.term),
      ...rubric.coreRequirements.map((requirement) => requirement.element),
      ...rubric.differentiators.map((requirement) => requirement.element),
      ...rubric.creditSignals.map((signal) => signal.signal),
    ].filter(Boolean).join(" "),
  }));
  return Response.json({ questions, count: questions.length });
}
