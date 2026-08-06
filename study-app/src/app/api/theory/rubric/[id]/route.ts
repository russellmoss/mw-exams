import { getUser } from "@/lib/auth";
import { activeTheoryCoreRequirements, getTheoryRubric } from "@/lib/theory/rubric";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getUser(request);
  if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await context.params;
  const rubric = getTheoryRubric(id);
  if (!rubric) return Response.json({ error: `No examiner-derived rubric for ${id}.` }, { status: 404 });
  return Response.json({ rubric, activeCoreRequirements: activeTheoryCoreRequirements(rubric).length });
}
