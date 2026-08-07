/**
 * The narration voice catalog — shared by the Settings picker (client) and the synthesis path
 * (server), so this module must stay free of server-only imports.
 *
 * WHAT IS TASTE AND WHAT IS NOT. Which voice you hear is taste, so the app ships a short curated
 * list and lets any user paste their own ElevenLabs voice ID instead. The *model* is not taste:
 * `eleven_multilingual_v2` (see elevenlabs.ts) is chosen for pronunciation stability on non-English
 * words, because the vocabulary this app is made of is Grüner Veltliner, Gewürztraminer, Xinomavro,
 * Assyrtiko, Châteauneuf-du-Pape, Mtsvane, Rías Baixas. Voice affects timbre; the model is what
 * decides whether "Gewürztraminer" comes out as a German word or as four English syllables. Any
 * voice below sounds materially better on those terms under multilingual_v2 than under a turbo/flash
 * model, which is why the model is not user-selectable.
 *
 * ACCENT IS PART OF THE PEDAGOGY. The IMW is a British institution and its examiners are mostly
 * British, so the curated list leans RP — it is the register the candidate will actually be examined
 * in, and RP carries the French and German loanwords of wine more naturally than General American.
 * One American option is included because a steady deep narrator is easier for some people to
 * listen to for long stretches.
 *
 * EXPIRY WARNING — READ BEFORE TRUSTING THESE IDS. Every curated voice here is an ElevenLabs
 * *default* voice, and ElevenLabs has announced that default voices expire on 2026-12-31:
 * https://elevenlabs.io/docs/help-center/product/voice-customization/my-voices/how-do-i-access-eleven-labs-default-voices
 * After that date these IDs are expected to start failing. That degrades safely — synthesizeSpeech
 * returns null and the notification is simply silent — but the picker would be advertising voices
 * that no longer work. When it happens, replace the IDs below with permanent Voice Library voices.
 * The custom-ID field is the user-side escape hatch until then.
 */

export interface NarrationVoice {
  id: string;
  name: string;
  /** One-line accent/gender summary, shown as the card's subtitle. */
  descriptor: string;
  /** Why a candidate might pick this one. Written for this app, not copied from ElevenLabs. */
  rationale: string;
}

/**
 * The default. George is a warm middle-aged British narrator — the register of a patient tutor
 * rather than a newsreader, which is what a study app spends most of its words doing (explaining
 * why a verdict went the way it did). Chosen over the previous default, which was an arbitrary
 * voice picked when narration was a one-off feature.
 */
export const DEFAULT_ELEVENLABS_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";

/**
 * The voice the app shipped with before this picker existed. Kept as an explicit, selectable option
 * so changing the default takes nothing away from anyone who liked it — but it is not recommended,
 * because nobody chose it for its teaching qualities in the first place.
 */
export const LEGACY_ELEVENLABS_VOICE_ID = "Cb8NLd0sUB8jI4MW2f9M";

export const NARRATION_VOICES: NarrationVoice[] = [
  {
    id: DEFAULT_ELEVENLABS_VOICE_ID,
    name: "George",
    descriptor: "British · male · warm narrator",
    rationale:
      "The default. Unhurried and explanatory — reads a verdict like a tutor talking you through it, not like an announcement. Best all-rounder for coaching.",
  },
  {
    id: "onwK4e9ZLuTAKqWW03F9",
    name: "Daniel",
    descriptor: "British · male · authoritative, news-desk diction",
    rationale:
      "The crispest consonants of the five, which makes it the most reliable on French and German terms. Formal enough to sound like an examiner reading your feedback back to you.",
  },
  {
    id: "Xb7hH8MSUJpSbSDYk0k2",
    name: "Alice",
    descriptor: "British · female · confident, professional",
    rationale:
      "Brisk and precise. Good if you find the male narrators too slow to listen to repeatedly.",
  },
  {
    id: "pFZP5JQG7iQjIQuC4Bku",
    name: "Lily",
    descriptor: "British · female · warm, characterful",
    rationale:
      "The gentlest register here. Worth trying if hearing a rejected-feedback verdict in a newsreader voice grates.",
  },
  {
    id: "nPczCjzI2devNBz1zQrb",
    name: "Brian",
    descriptor: "American · male · deep, classic narrator",
    rationale:
      "The non-British option: very steady, easy to listen to for long stretches. Slightly more anglicised on French and German words than the RP voices.",
  },
  {
    id: LEGACY_ELEVENLABS_VOICE_ID,
    name: "Original app voice",
    descriptor: "The voice the notification bell used before this setting existed",
    rationale:
      "Kept so the change of default takes nothing away. Not recommended — it was never picked for teaching.",
  },
];

/**
 * The preview line. Nonsense on purpose ("Mairzy Doats", 1943): with no meaning to follow you judge
 * timbre, pace and warmth instead of getting drawn into the words. It is also a fair stress test of
 * a voice's handling of run-together syllables.
 */
export const PREVIEW_SCRIPT =
  "Mairzy doats and dozy doats and liddle lamzy divey, A kiddley divey too, wouldn't you?";

/**
 * The second preview line, for the thing that actually goes wrong in a wine app: loanwords. Six
 * terms across German, Greek, French and Spanish, which is where a voice/model pairing either holds
 * up or falls apart into English syllables.
 */
export const PRONUNCIATION_SCRIPT =
  "Gewürztraminer, Grüner Veltliner, Xinomavro, Assyrtiko, Châteauneuf-du-Pape, and Rías Baixas.";

export type PreviewScript = "nonsense" | "pronunciation";

export const PREVIEW_SCRIPTS: Record<PreviewScript, string> = {
  nonsense: PREVIEW_SCRIPT,
  pronunciation: PRONUNCIATION_SCRIPT,
};

/**
 * Shape check for a pasted voice ID. Every ElevenLabs voice ID observed is a 20-character
 * alphanumeric string, but the band is kept loose because this is a format sniff, not an
 * authority: only ElevenLabs can say whether a well-formed ID actually exists, and the preview
 * request is what settles that. The point is to reject obvious paste accidents — a whole URL, a
 * name, an API key — before spending a synthesis call on them.
 */
export function isPlausibleVoiceId(value: string): boolean {
  return /^[A-Za-z0-9]{16,40}$/.test(value.trim());
}

/** The curated entry for a voice ID, or undefined for a user-supplied one. */
export function findCuratedVoice(voiceId: string): NarrationVoice | undefined {
  return NARRATION_VOICES.find((v) => v.id === voiceId);
}
