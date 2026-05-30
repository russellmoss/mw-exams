import { logElevenLabsUsage } from "@/lib/usage-log";

/**
 * ElevenLabs text-to-speech client.
 *
 * Used to voice the short Sonnet-written explanation of each feedback verdict
 * that the notification bell speaks aloud. Synthesis spend is recorded to
 * elevenlabs_usage (Cost dashboard) on every call. Like the other usage paths,
 * a synthesis failure is surfaced to the caller (returns null) but never throws
 * past the analysis pipeline — a missing clip just means a silent notification.
 */

const API_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
// Turbo v2.5: low-latency, cheaper credits, good enough for short narration.
const DEFAULT_MODEL_ID = "eleven_turbo_v2_5";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

export const DEFAULT_ELEVENLABS_VOICE_ID = "Cb8NLd0sUB8jI4MW2f9M";

export function getElevenLabsVoiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID || DEFAULT_ELEVENLABS_VOICE_ID;
}

export function isElevenLabsConfigured(): boolean {
  return !!process.env.ELEVENLABS_API_KEY;
}

export interface SynthesizeResult {
  /** base64-encoded mp3 (mp3_44100_128). */
  audioBase64: string;
  characters: number;
  voiceId: string;
  modelId: string;
}

/**
 * Synthesize speech for `text` and log the spend. Returns null when ElevenLabs
 * isn't configured or the call fails (caller treats that as "no narration").
 */
export async function synthesizeSpeech(
  text: string,
  ctx: {
    taskType: string;
    userId?: number | null;
    attemptId?: number | null;
    analysisId?: number | null;
    voiceId?: string;
    modelId?: string;
  }
): Promise<SynthesizeResult | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const clean = (text || "").trim();
  if (!apiKey || !clean) return null;

  const voiceId = ctx.voiceId || getElevenLabsVoiceId();
  const modelId = ctx.modelId || DEFAULT_MODEL_ID;
  const characters = clean.length;
  const t0 = Date.now();

  try {
    const res = await fetch(
      `${API_BASE}/${voiceId}?output_format=${DEFAULT_OUTPUT_FORMAT}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: clean,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      logElevenLabsUsage(
        { taskType: ctx.taskType, voiceId, modelId, characters, userId: ctx.userId, attemptId: ctx.attemptId, analysisId: ctx.analysisId },
        { latencyMs: Date.now() - t0, success: false, error: `HTTP ${res.status}: ${detail.slice(0, 200)}` }
      );
      console.error("[elevenlabs] synthesis failed:", res.status, detail.slice(0, 200));
      return null;
    }

    const buf = Buffer.from(await res.arrayBuffer());
    logElevenLabsUsage(
      { taskType: ctx.taskType, voiceId, modelId, characters, userId: ctx.userId, attemptId: ctx.attemptId, analysisId: ctx.analysisId },
      { latencyMs: Date.now() - t0, success: true }
    );
    return { audioBase64: buf.toString("base64"), characters, voiceId, modelId };
  } catch (err) {
    logElevenLabsUsage(
      { taskType: ctx.taskType, voiceId, modelId, characters, userId: ctx.userId, attemptId: ctx.attemptId, analysisId: ctx.analysisId },
      { latencyMs: Date.now() - t0, success: false, error: err instanceof Error ? err.message : "fetch failed" }
    );
    console.error("[elevenlabs] synthesis error:", err);
    return null;
  }
}
