import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ELEVENLABS_VOICE_ID,
  findCuratedVoice,
  isPlausibleVoiceId,
  LEGACY_ELEVENLABS_VOICE_ID,
  NARRATION_VOICES,
  PREVIEW_SCRIPT,
  PREVIEW_SCRIPTS,
  PRONUNCIATION_SCRIPT,
} from "@/lib/voices";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => fs.readFileSync(path.join(appDir, p), "utf8");

// ── Why this file exists ─────────────────────────────────────────────────────────────────────────
//
// The curated voices are ElevenLabs *default* voices, which ElevenLabs says expire on 2026-12-31.
// Someone will therefore edit this list, under time pressure, after previews start failing. These
// tests pin the invariants that a hurried edit is most likely to break: that the default is actually
// one of the offered voices, that every ID is a shape ElevenLabs will accept, that the voice the app
// used before the picker existed is still selectable (changing the default must not take it away),
// and that the preview line is the exact one that was asked for.

describe("narration voice catalog", () => {
  it("offers at least five voices with no duplicate IDs or names", () => {
    expect(NARRATION_VOICES.length).toBeGreaterThanOrEqual(5);
    const ids = NARRATION_VOICES.map((v) => v.id);
    const names = NARRATION_VOICES.map((v) => v.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("gives every voice an ID the API will accept and copy a human can choose from", () => {
    for (const voice of NARRATION_VOICES) {
      expect(isPlausibleVoiceId(voice.id), `${voice.name} has a malformed voice ID`).toBe(true);
      expect(voice.descriptor.length).toBeGreaterThan(10);
      expect(voice.rationale.length).toBeGreaterThan(30);
    }
  });

  it("makes the default one of the selectable voices", () => {
    // A default that isn't in the list renders a picker where nothing looks selected.
    expect(findCuratedVoice(DEFAULT_ELEVENLABS_VOICE_ID)).toBeDefined();
    expect(isPlausibleVoiceId(DEFAULT_ELEVENLABS_VOICE_ID)).toBe(true);
  });

  it("keeps the pre-picker voice selectable, so changing the default removes nothing", () => {
    expect(findCuratedVoice(LEGACY_ELEVENLABS_VOICE_ID)).toBeDefined();
    expect(LEGACY_ELEVENLABS_VOICE_ID).not.toBe(DEFAULT_ELEVENLABS_VOICE_ID);
  });

  it("previews the exact requested line, plus a loanword pronunciation test", () => {
    expect(PREVIEW_SCRIPT).toBe(
      "Mairzy doats and dozy doats and liddle lamzy divey, A kiddley divey too, wouldn't you?"
    );
    expect(PREVIEW_SCRIPTS.nonsense).toBe(PREVIEW_SCRIPT);
    expect(PREVIEW_SCRIPTS.pronunciation).toBe(PRONUNCIATION_SCRIPT);
    // The point of the second line is non-English orthography — umlauts and accents must survive.
    expect(PRONUNCIATION_SCRIPT).toMatch(/Gewürztraminer/);
    expect(PRONUNCIATION_SCRIPT).toMatch(/Châteauneuf-du-Pape/);
    // Preview spend is bounded by these being short server-side constants; keep them short.
    for (const script of Object.values(PREVIEW_SCRIPTS)) {
      expect(script.length).toBeLessThan(200);
    }
  });

  it("rejects the paste accidents a voice-ID field actually receives", () => {
    expect(isPlausibleVoiceId("JBFqnCBsd6RMkjVDRZzb")).toBe(true);
    expect(isPlausibleVoiceId("  JBFqnCBsd6RMkjVDRZzb  ")).toBe(true);
    expect(isPlausibleVoiceId("https://elevenlabs.io/app/voice-library/JBFqnCBsd6RMkjVDRZzb")).toBe(false);
    expect(isPlausibleVoiceId("George")).toBe(false);
    expect(isPlausibleVoiceId("")).toBe(false);
    expect(isPlausibleVoiceId("sk_abc-123_def")).toBe(false); // punctuation → not a voice ID
  });
});

describe("narration synthesis wiring", () => {
  const elevenlabs = read("src/lib/elevenlabs.ts");
  const feedbackAnalysis = read("src/lib/feedback-analysis.ts");
  const migration = read("migrations/059_voice_preference.sql");

  it("synthesizes with a multilingual model, not a turbo/flash one", () => {
    // The app's vocabulary is German, French, Greek and Italian wine terms. Turbo/flash models
    // anglicise them; that is the whole reason for this default and it must not silently regress.
    expect(elevenlabs).toMatch(/eleven_multilingual_v2/);
    expect(elevenlabs).not.toMatch(/DEFAULT_MODEL_ID\s*=\s*"eleven_turbo/);
  });

  it("does not let a stale ELEVENLABS_VOICE_ID env var override the curated default", () => {
    // That env var is set in the deployed environment to the pre-picker voice. If it were still in
    // the precedence chain, the reviewed default would be inert for every user who hasn't chosen.
    expect(elevenlabs).not.toMatch(/process\.env\.ELEVENLABS_VOICE_ID/);
  });

  it("speaks in the listener's chosen voice, not just the app default", () => {
    // resolveSpokenVoiceId, not getUserVoiceId directly: the shared resolver applies a persona's
    // pinned voice first and then falls through to this preference. The intent asserted here is
    // unchanged — the listener's choice must reach the synthesis call.
    expect(feedbackAnalysis).toMatch(/resolveSpokenVoiceId/);
    expect(feedbackAnalysis).toMatch(/voiceId:\s*userVoiceId/);
  });

  it("uses the chosen voice for the Coach, which is the surface it matters most on", () => {
    // A read-aloud is minutes of listening. If /api/coach/speak ignored the preference, the picker
    // would only affect a handful of notification clips and look broken to anyone who set it.
    const speak = read("src/app/api/coach/speak/route.ts");
    expect(speak).toMatch(/resolveSpokenVoiceId/);
    expect(speak).toMatch(/voiceId:\s*voiceId\s*\|\|\s*undefined/);
  });

  it("bills previews to the candidate's own ElevenLabs key, not the server's", () => {
    // BYOK contract: a non-admin with their own key must be able to preview, and an admin with a key
    // of their own must not have previews land on our account.
    const preview = read("src/app/api/user/voice-preview/route.ts");
    expect(preview).toMatch(/getElevenLabsKeyForUserId/);
    expect(preview).toMatch(/apiKey:\s*resolved\.key/);
    // Match the import, not the word: the route's comment explains why this helper is the wrong
    // gate here, and a bare substring check would flag that explanation as the bug it warns about.
    expect(preview).not.toMatch(/import\s*\{[^}]*isElevenLabsConfigured/);
  });

  it("stores the preference additively and idempotently", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS elevenlabs_voice_id/);
    // No CHECK constraint: users may paste any voice ID from their own library.
    expect(migration).not.toMatch(/CHECK\s*\(/i);
  });
});
