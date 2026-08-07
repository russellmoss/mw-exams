/**
 * The voice turn state, in its own module.
 *
 * Separated from the session hook so the pure presentation decisions (inline-ui.ts) and the
 * visualizer can type against it without importing a client hook — which would drag React and a
 * MediaRecorder-dependent module into anything that touches a label.
 */
export type VoiceState =
  | "idle"
  /** Mic open, waiting for the candidate to finish. */
  | "listening"
  /** Utterance captured, being sent to Scribe. Distinct from `thinking` so "I heard you" and
   *  "I'm working on it" are not the same word — the first is the reassurance that matters most. */
  | "transcribing"
  | "thinking"
  | "speaking"
  | "error";
