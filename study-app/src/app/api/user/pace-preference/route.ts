import { getUser } from "@/lib/auth";
import { getUserPacePreference, setUserPacePreference } from "@/lib/db";
import { DEFAULT_PACE_PREFERENCE, isPaceMode, isSpeedSeconds } from "@/lib/pace";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });
    const pref = await getUserPacePreference(user.id);
    return Response.json(pref);
  } catch {
    return Response.json(DEFAULT_PACE_PREFERENCE);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

    const { pace, speedSeconds } = await request.json();
    if (!isPaceMode(pace)) {
      return Response.json({ error: "Invalid pace" }, { status: 400 });
    }
    // Only 480 or 540 are valid Speed Notes lengths; fall back to the default (8 min) otherwise so a
    // Speed-Notes save always carries a usable length even if the sub-choice was omitted.
    const normalizedSpeed = isSpeedSeconds(speedSeconds)
      ? speedSeconds
      : DEFAULT_PACE_PREFERENCE.speedSeconds;
    await setUserPacePreference(user.id, { pace, speedSeconds: normalizedSpeed });
    return Response.json({ pace, speedSeconds: normalizedSpeed });
  } catch {
    return Response.json({ error: "Failed to update" }, { status: 500 });
  }
}
