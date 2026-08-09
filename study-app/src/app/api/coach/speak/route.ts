import { getUser } from "@/lib/auth";
import { synthesizeSpeech } from "@/lib/elevenlabs";
import { getElevenLabsKeyForUserId } from "@/lib/elevenlabs-key";
import { resolveSpokenVoiceId } from "@/lib/persona-server";
import { isCoachEnabled } from "@/lib/settings";
import { toSpeakable } from "@/lib/voice/speech";

// Text-to-speech for the Coach: the speaker button on a finished answer, and the hands-free voice
// loop, both post one chunk at a time and get back MP3 bytes. The ElevenLabs key stays server-side.
//
// SESSION AUTH, NOT BYOK. Unlike /api/coach, this needs no Anthropic key — it is a different vendor
// entirely, billed to us, and gated by isCoachEnabled like the rest of the Coach surface.
//
// Goes through synthesizeSpeech rather than calling ElevenLabs directly so every synthesis lands in
// elevenlabs_usage and the Cost dashboard keeps totalling correctly. That helper returns base64
// (it was written for storing narration on a row); we decode back to bytes here rather than making
// the client do it, so the response is a plain audio/mpeg the Web Audio decoder can take directly.
export const runtime = "nodejs";
export const maxDuration = 30;

/** One spoken chunk. Generous, but bounds runaway synthesis cost. read-aloud.ts chunks well under. */
const MAX_TEXT = 1500;

export async function POST(request: Request) {
  if (!(await isCoachEnabled())) {
    return Response.json({ error: "The Coach is currently unavailable." }, { status: 503 });
  }

  const user = await getUser(request);
  if (!user) return Response.json({ error: "Auth required" }, { status: 401 });

  // BYOK, exactly as for Anthropic and Tavily: the candidate's own key, with the server key
  // available only to admins. 402 rather than 503 — this is a setup step they can complete, not a
  // deployment fault, and the client turns it into "add a key in Settings".
  const resolved = await getElevenLabsKeyForUserId(user.id);
  if (!resolved) {
    return Response.json(
      { error: "Add your ElevenLabs API key in Settings to have answers read aloud." },
      { status: 402 }
    );
  }

  const body = await request.json().catch(() => null);
  const raw = (body as { text?: unknown } | null)?.text;
  if (typeof raw !== "string") {
    return Response.json({ error: "text is required" }, { status: 400 });
  }

  // Defence in depth: the client already normalizes, but never trust it. toSpeakable is idempotent
  // precisely so running it twice is safe.
  const text = toSpeakable(raw).slice(0, MAX_TEXT).trim();
  if (!text) return Response.json({ error: "Nothing to say." }, { status: 400 });

  // The Coach speaks in the voice the candidate chose (Settings → Voice, migration 059) — unless
  // their persona pins one, which resolveSpokenVoiceId handles. This is the surface the setting
  // exists for: a read-aloud is minutes of listening, not one notification clip, so a voice someone
  // finds grating is a reason to stop using the feature. Fail-soft all the way down: nobody should
  // lose the ability to hear an answer because a preference lookup failed.
  const voiceId = await resolveSpokenVoiceId(user.id);

  const result = await synthesizeSpeech(text, {
    taskType: "coach_speak",
    userId: user.id,
    apiKey: resolved.key,
    voiceId: voiceId || undefined,
  });
  // synthesizeSpeech returns null on any failure and has already logged it.
  if (!result) return Response.json({ error: "Voice synthesis failed." }, { status: 502 });

  return new Response(Buffer.from(result.audioBase64, "base64"), {
    headers: {
      "Content-Type": "audio/mpeg",
      // Never cache: the same sentence can be re-read, and a stale clip is worse than a re-synth.
      "Cache-Control": "no-store",
    },
  });
}
