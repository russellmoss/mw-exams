import { getUser } from "@/lib/auth";
import { getElevenLabsKeyForUserId } from "@/lib/elevenlabs-key";
import { isCoachEnabled } from "@/lib/settings";
import { transcribeAudio } from "@/lib/voice/transcribe";

// Speech-to-text for the Coach's hands-free mode. The client records one utterance and posts it as
// multipart/form-data; we return the transcript. Same vendor and same key as /api/coach/speak, and
// like it, session-authed rather than BYOK — transcription is not an Anthropic call.
export const runtime = "nodejs";
export const maxDuration = 30;

/** ElevenLabs' own ceiling. A conversational turn is orders of magnitude smaller; this bounds abuse. */
const MAX_BYTES = 25 * 1024 * 1024;

export async function POST(request: Request) {
  if (!(await isCoachEnabled())) {
    return Response.json({ error: "The Coach is currently unavailable." }, { status: 503 });
  }

  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

  // BYOK — see the speak route. 402 so the client can offer the fix rather than reporting a fault.
  const resolved = await getElevenLabsKeyForUserId(user.id);
  if (!resolved) {
    return Response.json(
      { error: "Add your ElevenLabs API key in Settings to talk to the Coach." },
      { status: 402 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Bad request body." }, { status: 400 });
  }

  const file = form.get("audio");
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "Missing audio." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "Audio too large." }, { status: 413 });
  }

  try {
    const text = await transcribeAudio(file, { userId: user.id, apiKey: resolved.key });
    return Response.json({ text });
  } catch (err) {
    // The detail is logged, not returned: an upstream error body can carry account information.
    console.error(
      "[coach/transcribe] failed:",
      err instanceof Error ? err.message : err,
      "| audio:",
      file.type,
      file.size,
      "bytes"
    );
    return Response.json({ error: "Transcription failed." }, { status: 502 });
  }
}
