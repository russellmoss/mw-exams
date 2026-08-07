import "server-only";
import { logElevenLabsUsage } from "@/lib/usage-log";

// Speech-to-text via ElevenLabs "Scribe", raw fetch (no SDK).
//
// Reuses the same ELEVENLABS_API_KEY as TTS, so voice mode needs exactly one vendor and one key.
// Claude has no audio-transcription API, so the Anthropic key cannot do this; Scribe keeps us off a
// second vendor (OpenAI Whisper) for the sake of one call.
//
// Calls are logged to elevenlabs_usage like synthesis, so transcription failures and latency show up
// in the same place as the rest of the voice path. COST IS NOT TRACKED HERE, deliberately: Scribe
// bills by audio duration and that table costs by character, so `characters` stays 0 rather than
// carrying a fabricated equivalent that would quietly understate — or invent — a line on the Cost
// dashboard. Giving STT a real cost column is a schema change, not a guess to make here.

const ELEVEN_STT_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const DEFAULT_STT_MODEL = "scribe_v1";

/**
 * True when transcription is configured AT ALL (a server key exists).
 *
 * NOT the same question as "may this user transcribe" — that is answered by resolving their own key,
 * because the server key is an admin-only fallback. Routes check the user's key; this exists for the
 * deployment-level "voice was never set up" case.
 */
export function transcribeEnabled(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/**
 * Transcribe a recorded audio blob to text. Throws if the key is missing (routes gate on
 * `transcribeEnabled()` first) or on a non-2xx upstream response.
 */
export async function transcribeAudio(
  audio: Blob,
  ctx: {
    userId?: number | null;
    filename?: string;
    /** The candidate's resolved key — their speech, their usage. See lib/elevenlabs-key.ts. */
    apiKey?: string | null;
  } = {}
): Promise<string> {
  const apiKey = ctx.apiKey || process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("No ElevenLabs key available; transcription is unavailable.");

  const model = process.env.ELEVENLABS_STT_MODEL || DEFAULT_STT_MODEL;
  // Pin the language rather than letting Scribe auto-detect. On near-silence or room noise
  // auto-detect "hears" another language and hallucinates a junk transcript, which then gets sent
  // to the Coach as if the candidate had said it.
  const language = process.env.ELEVENLABS_STT_LANGUAGE || "eng";
  const t0 = Date.now();

  const form = new FormData();
  form.append("file", audio, ctx.filename || "speech.webm");
  form.append("model_id", model);
  form.append("language_code", language);
  // Only words. Without this, non-speech comes back as "(laughter)" and gets asked as a question.
  form.append("tag_audio_events", "false");

  let res: Response;
  try {
    res = await fetch(ELEVEN_STT_URL, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: form,
    });
  } catch (err) {
    logElevenLabsUsage(
      { taskType: "coach_transcribe", voiceId: "-", modelId: model, characters: 0, userId: ctx.userId },
      { latencyMs: Date.now() - t0, success: false, error: err instanceof Error ? err.message : "fetch failed" }
    );
    throw err;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    logElevenLabsUsage(
      { taskType: "coach_transcribe", voiceId: "-", modelId: model, characters: 0, userId: ctx.userId },
      { latencyMs: Date.now() - t0, success: false, error: `HTTP ${res.status}: ${detail.slice(0, 200)}` }
    );
    throw new Error(`ElevenLabs STT failed (${res.status}). ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as { text?: unknown };
  logElevenLabsUsage(
    { taskType: "coach_transcribe", voiceId: "-", modelId: model, characters: 0, userId: ctx.userId },
    { latencyMs: Date.now() - t0, success: true }
  );
  return typeof data.text === "string" ? data.text.trim() : "";
}
