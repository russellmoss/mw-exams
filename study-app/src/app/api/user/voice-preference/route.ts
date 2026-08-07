import { getUser } from "@/lib/auth";
import { getUserVoiceId, setUserVoiceId } from "@/lib/db";
import {
  DEFAULT_ELEVENLABS_VOICE_ID,
  isPlausibleVoiceId,
  NARRATION_VOICES,
} from "@/lib/voices";

export const runtime = "nodejs";

// The narration voice preference (migration 059). GET reports the saved choice plus the catalog the
// picker renders, so Settings needs one round trip. PATCH saves either a curated ID or a voice ID
// the user pasted from their own ElevenLabs library — the whole point of the setting is that who
// they hear is their call, so a well-formed unknown ID is accepted, not rejected.

export async function GET(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const voiceId = await getUserVoiceId(user.id);
    return Response.json({
      voiceId,
      effectiveVoiceId: voiceId || DEFAULT_ELEVENLABS_VOICE_ID,
      defaultVoiceId: DEFAULT_ELEVENLABS_VOICE_ID,
      voices: NARRATION_VOICES,
    });
  } catch (err) {
    console.error("GET voice-preference error:", err);
    // Fall back to the default so the picker still renders rather than showing an error card.
    return Response.json({
      voiceId: null,
      effectiveVoiceId: DEFAULT_ELEVENLABS_VOICE_ID,
      defaultVoiceId: DEFAULT_ELEVENLABS_VOICE_ID,
      voices: NARRATION_VOICES,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    const body = await request.json();
    const raw = body?.voiceId;

    // null clears the choice and falls back to the app default.
    if (raw === null || raw === "") {
      await setUserVoiceId(user.id, null);
      return Response.json({ voiceId: null, effectiveVoiceId: DEFAULT_ELEVENLABS_VOICE_ID });
    }

    if (typeof raw !== "string") {
      return Response.json({ error: "voiceId must be a string or null" }, { status: 400 });
    }
    const voiceId = raw.trim();
    if (!isPlausibleVoiceId(voiceId)) {
      return Response.json(
        {
          error:
            "That doesn't look like an ElevenLabs voice ID. It should be a short code like " +
            "JBFqnCBsd6RMkjVDRZzb — not a name or a URL.",
        },
        { status: 400 }
      );
    }

    await setUserVoiceId(user.id, voiceId);
    return Response.json({ voiceId, effectiveVoiceId: voiceId });
  } catch (err) {
    console.error("PATCH voice-preference error:", err);
    return Response.json({ error: "Failed to save voice" }, { status: 500 });
  }
}
