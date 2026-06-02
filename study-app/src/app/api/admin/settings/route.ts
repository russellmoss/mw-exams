import { getUser } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const autoApply = await getSetting<boolean>("auto_apply_enabled", false);
  const autoFeature = await getSetting<boolean>("auto_feature_enabled", false);
  const hardDisabled = process.env.AUTO_APPLY_HARD_DISABLE === "1";
  const featureHardDisabled = process.env.AUTO_FEATURE_HARD_DISABLE === "1";
  return Response.json({ autoApply, autoFeature, hardDisabled, featureHardDisabled });
}

export async function POST(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  if (typeof body.autoApply === "boolean") {
    await setSetting("auto_apply_enabled", body.autoApply);
  }
  if (typeof body.autoFeature === "boolean") {
    await setSetting("auto_feature_enabled", body.autoFeature);
  }
  if (typeof body.autoApply !== "boolean" && typeof body.autoFeature !== "boolean") {
    return Response.json({ error: "autoApply or autoFeature (boolean) required" }, { status: 400 });
  }
  return Response.json({ ok: true });
}
