import { getUser } from "@/lib/auth";
import { getSetting, setSetting, REASONING_SETTING_KEY } from "@/lib/settings";
import { invalidateReasoningCache } from "@/lib/thinking-stream";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getUser(request);
  if (!user || !user.isAdmin) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const autoApply = await getSetting<boolean>("auto_apply_enabled", false);
  const autoFeature = await getSetting<boolean>("auto_feature_enabled", false);
  // Defaults ON — this is a kill switch over shipped behaviour, so an absent row means "as built".
  const reasoning = (await getSetting<boolean>(REASONING_SETTING_KEY, true)) !== false;
  const hardDisabled = process.env.AUTO_APPLY_HARD_DISABLE === "1";
  const featureHardDisabled = process.env.AUTO_FEATURE_HARD_DISABLE === "1";
  const reasoningHardDisabled = process.env.REASONING_HARD_DISABLE === "1";
  return Response.json({
    autoApply,
    autoFeature,
    reasoning,
    hardDisabled,
    featureHardDisabled,
    reasoningHardDisabled,
  });
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
  if (typeof body.reasoning === "boolean") {
    await setSetting(REASONING_SETTING_KEY, body.reasoning);
    // Drop this instance's cached value so the change takes effect on the next call rather than
    // up to the 30s TTL later. Other serverless instances catch up within the TTL.
    invalidateReasoningCache();
  }
  if (
    typeof body.autoApply !== "boolean" &&
    typeof body.autoFeature !== "boolean" &&
    typeof body.reasoning !== "boolean"
  ) {
    return Response.json(
      { error: "autoApply, autoFeature, or reasoning (boolean) required" },
      { status: 400 }
    );
  }
  return Response.json({ ok: true });
}
