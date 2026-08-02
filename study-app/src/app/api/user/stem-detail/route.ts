import { getUser } from "@/lib/auth";
import { getUserStemDetailDefault, setUserStemDetailDefault } from "@/lib/db";
import { isStemDetailLevel } from "@/lib/prompts/stemDetail";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
    const stemDetailDefault = await getUserStemDetailDefault(user.id);
    return Response.json({ stemDetailDefault });
  } catch {
    return Response.json({ stemDetailDefault: "exam_real" });
  }
}

export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

    const { stemDetailDefault } = await request.json();
    if (!isStemDetailLevel(stemDetailDefault)) {
      return Response.json({ error: "Invalid level" }, { status: 400 });
    }
    await setUserStemDetailDefault(user.id, stemDetailDefault);
    return Response.json({ stemDetailDefault });
  } catch {
    return Response.json({ error: "Failed to update" }, { status: 500 });
  }
}
