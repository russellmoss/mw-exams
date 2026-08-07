import { logElevenLabsUsage } from "@/lib/usage-log";
import { DEFAULT_ELEVENLABS_VOICE_ID } from "@/lib/voices";

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

/**
 * Multilingual v2, not Turbo v2.5.
 *
 * Turbo was chosen when narration was a one-off feature and latency/credits were the only concerns.
 * They are the wrong concerns for THIS app: every clip is 2–3 sentences of wine vocabulary, so
 * latency is irrelevant and the spend is fractions of a cent — while the words most likely to appear
 * are exactly the ones a turbo/flash model mangles (Gewürztraminer, Xinomavro, Châteauneuf-du-Pape).
 * Multilingual v2 is the most stable current model on non-English words, which is the only axis that
 * matters here. It bills ~1 credit/char against turbo's ~0.5 — note that logElevenLabsUsage already
 * assumed 1 credit/char, so this makes the recorded cost exact rather than overstated.
 *
 * ELEVENLABS_MODEL_ID overrides it without a deploy, in case a future model supersedes this one.
 */
const DEFAULT_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const DEFAULT_OUTPUT_FORMAT = "mp3_44100_128";

// Re-exported for the callers that imported it from here before the catalog moved to voices.ts.
export { DEFAULT_ELEVENLABS_VOICE_ID };

/**
 * The app-wide fallback voice, used when the listener has no per-user choice saved. Per-user voices
 * live on `users.elevenlabs_voice_id` (migration 059) and are resolved by the caller, so the
 * precedence is: the listener's choice → this default.
 *
 * ELEVENLABS_VOICE_ID IS DELIBERATELY NO LONGER READ. It existed to configure the app's single voice
 * before a picker existed, and it is currently set in the deployed environment to the old voice — so
 * leaving it in this chain would mean the curated default in voices.ts is silently inert for every
 * user who hasn't picked, and the "better default" decision would appear to have simply not worked.
 * A per-user setting plus a reviewed default is strictly better than an env var nobody can see, so
 * the env var is retired rather than kept as a trap. It can be deleted from the Vercel project.
 */
export function getElevenLabsVoiceId(): string {
  return DEFAULT_ELEVENLABS_VOICE_ID;
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
    /**
     * The key to bill. Pass the CANDIDATE's resolved key for anything they triggered — the Coach
     * speaking, a read-aloud — so their voice usage is theirs (see lib/elevenlabs-key.ts).
     * Omitting it falls back to the server key, which is correct only for our own background work,
     * such as the feedback-verdict narration that runs from a cron with no user in scope.
     */
    apiKey?: string | null;
  }
): Promise<SynthesizeResult | null> {
  const apiKey = ctx.apiKey || process.env.ELEVENLABS_API_KEY;
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
