import { getUser } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const autoApply = await getSetting<boolean>("auto_apply_enabled", false);
  const hardDisabled = process.env.AUTO_APPLY_HARD_DISABLE === "1";
  return Response.json({ autoApply, hardDisabled });
}

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body.autoApply !== "boolean") {
    return Response.json({ error: "autoApply (boolean) required" }, { status: 400 });
  }
  await setSetting("auto_apply_enabled", body.autoApply);
  return Response.json({ autoApply: body.autoApply });
}
