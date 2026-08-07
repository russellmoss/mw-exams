import { getUser } from "@/lib/auth";
import { isElevenLabsConfigured, synthesizeSpeech } from "@/lib/elevenlabs";
import { isPlausibleVoiceId, PREVIEW_SCRIPTS, type PreviewScript } from "@/lib/voices";

export const runtime = "nodejs";

/**
 * Synthesize one of the two fixed preview lines in a given voice, so a user can hear a voice before
 * committing to it.
 *
 * SPEND IS BOUNDED BY DESIGN. The caller chooses a voice and which of two scripts to hear — never
 * the text. Both scripts are server-side constants under 100 characters, so the worst a caller can
 * do per request is a sub-cent synthesis, and there is no path from this route to arbitrary
 * ElevenLabs spend. That is why there is no rate limiter: the cache below means the realistic cost
 * of the whole feature is one synthesis per (voice, script) pair per warm instance.
 */

/**
 * Per-instance memo of rendered previews, keyed by voice+script. Previews are immutable — the same
 * voice reading the same fixed line — so a repeat click should be free and instant rather than
 * another API call. Serverless instances recycle, which is fine: a cold miss just re-synthesizes.
 * Capped so a user pasting many voice IDs can't grow it without bound.
 */
const previewCache = new Map<string, Buffer>();
const PREVIEW_CACHE_MAX = 40;

function rememberPreview(key: string, buf: Buffer) {
  if (previewCache.size >= PREVIEW_CACHE_MAX) {
    // Oldest-first eviction — Map preserves insertion order.
    const oldest = previewCache.keys().next().value;
    if (oldest !== undefined) previewCache.delete(oldest);
  }
  previewCache.set(key, buf);
}

function mp3Response(buf: Buffer) {
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "audio/mpeg",
      "Content-Length": String(buf.length),
      // Fixed text in a fixed voice — safe to keep for a day, and it makes re-previewing instant.
      "Cache-Control": "private, max-age=86400",
    },
  });
}

export async function POST(request: Request) {
  try {
    const user = await getUser(request);
    if (!user) return Response.json({ error: "Not authenticated" }, { status: 401 });

    if (!isElevenLabsConfigured()) {
      return Response.json(
        { error: "Voice previews are unavailable — this server has no ElevenLabs key configured." },
        { status: 503 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const voiceId = typeof body?.voiceId === "string" ? body.voiceId.trim() : "";
    const script: PreviewScript = body?.script === "pronunciation" ? "pronunciation" : "nonsense";

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

    const cacheKey = `${voiceId}:${script}`;
    const cached = previewCache.get(cacheKey);
    if (cached) return mp3Response(cached);

    const result = await synthesizeSpeech(PREVIEW_SCRIPTS[script], {
      taskType: "voice_preview",
      userId: user.id,
      voiceId,
    });

    // synthesizeSpeech swallows the upstream error (a failed narration must never break analysis),
    // so all we know here is that it didn't come back. For a preview that is almost always a voice
    // ID the account can't use — say that, since it's the actionable case.
    if (!result) {
      return Response.json(
        {
          error:
            "Couldn't synthesize that voice. Check the voice ID exists in your ElevenLabs library " +
            "and hasn't been retired.",
        },
        { status: 502 }
      );
    }

    const buf = Buffer.from(result.audioBase64, "base64");
    rememberPreview(cacheKey, buf);
    return mp3Response(buf);
  } catch (err) {
    console.error("voice preview error:", err);
    return Response.json({ error: "Failed to generate preview" }, { status: 500 });
  }
}
