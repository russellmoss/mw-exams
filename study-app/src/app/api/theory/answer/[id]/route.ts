import { getUser } from "@/lib/auth";
import { annotateTheoryAnswerMarkdown, getTheoryStudyAnswer } from "@/lib/theory/study";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await context.params;
  const answer = getTheoryStudyAnswer(id);
  if (!answer) {
    return Response.json({ error: `No model answer for ${id}.` }, { status: 404 });
  }

  return Response.json({
    ...answer,
    annotatedBody: annotateTheoryAnswerMarkdown(answer),
    banner: `Model answer for the ${answer.year} exam-year question. Time-sensitive facts are dated to that context, not presented as current.`,
  });
}
