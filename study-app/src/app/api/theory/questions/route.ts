import { getUser } from "@/lib/auth";
import { listTheoryRubrics, theoryTimeMinutes, theoryWordBand } from "@/lib/theory/rubric";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  // Lightweight stat mode for the home launcher's Theory pillar tile: ?count=1 returns the corpus
  // shape without serializing 243 full question rows.
  if (new URL(request.url).searchParams.get("count") === "1") {
    const rubrics = listTheoryRubrics();
    const years = rubrics.map((rubric) => rubric.year);
    return Response.json({
      count: rubrics.length,
      papers: new Set(rubrics.map((rubric) => rubric.paper)).size,
      yearMin: Math.min(...years),
      yearMax: Math.max(...years),
    });
  }

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
