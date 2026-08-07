// Presentation decisions for inline voice mode.
//
// These live here, not in the components, for one blunt reason: vitest runs in a node environment
// and this repo has no jsdom or testing-library, so NO voice component can be unit-tested. Anything
// that is a real decision — which word to show, whether the orb may move, whether to announce a
// transition — is pulled out to a pure function so at least the judgment is covered. What is left in
// the components is markup.
//
// Ported from the Wine-inventory assistant, where the same constraint produced the same split.

import type { VoiceState } from "./state-types";

/** The word beside the orb in the dock title bar. */
const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Starting…",
  listening: "Listening…",
  transcribing: "Got it…",
  thinking: "Thinking…",
  speaking: "Speaking…",
  error: "Voice unavailable",
};

export function voiceStatusLabel(state: VoiceState): string {
  return STATE_LABEL[state];
}

/**
 * May the orb animate in this state?
 *
 * DESIGN.md's motion rule is calm and editorial, with no decorative animation. A 60fps
 * audio-reactive orb is defensible as the focal point of a surface the candidate deliberately
 * entered — but pinned in a dock title bar that follows them across every route, a permanently
 * moving object is exactly what that rule forbids. Gating motion on "audio is actually flowing"
 * makes the movement mean something: it is state, not decoration.
 */
export function orbShouldAnimate(state: VoiceState): boolean {
  return state === "listening" || state === "speaking";
}

/**
 * Which of the two turn controls are live right now.
 *
 * They are two separate always-rendered buttons rather than one relabelling button on purpose: the
 * row sits in a 420px dock and the label would change on every state transition, reflowing the
 * controls under the user's thumb mid-sentence. Same reasoning as `aria-disabled` over `disabled`
 * where they are rendered — the control keeps its place and stays announced, it just stops acting.
 *
 * "Send now" exists because the listen VAD is deliberately patient (it waits out mid-thought pauses
 * instead of answering over them); without a way to say "I'm finished", that patience reads as lag.
 */
export function voiceControlAvailability(state: VoiceState): {
  canFinish: boolean;
  canInterrupt: boolean;
} {
  return {
    canFinish: state === "listening",
    // Interrupting a synthesis that has not started yet does nothing useful, so this is speaking
    // only — `thinking` is covered by End, which tears the whole session down.
    canInterrupt: state === "speaking",
  };
}

export type VoiceAnnouncementContext = {
  /** Completed Coach turns so far. Used to announce the first reply only. */
  turnCount: number;
};

/**
 * What (if anything) a screen reader should say about a state change.
 *
 * Putting `aria-live="polite"` on the raw state label fires four announcements per exchange
 * (listening → transcribing → thinking → speaking), which is unusable. Routine cycling returns
 * null; only edges carrying information a blind user cannot otherwise get are announced.
 *
 * Note the asymmetry with sighted users: they can see the orb, so they need less. A screen-reader
 * user hears the Coach's own speech, so mid-turn narration is redundant — what they actually need is
 * "we started", "something went wrong", and one confirmation that the loop is round-tripping.
 */
export function voiceAnnouncement(
  prev: VoiceState,
  next: VoiceState,
  ctx: VoiceAnnouncementContext
): string | null {
  if (prev === next) return null;
  if (next === "error") return "Voice unavailable.";
  if (next === "listening") {
    if (prev === "idle") return "Voice mode on. Listening.";
    if (prev === "speaking" && ctx.turnCount <= 1) return "Listening again.";
    return null;
  }
  return null;
}

/**
 * Turn a mic-acquisition failure into something the candidate can act on.
 *
 * `getUserMedia` rejects with a DOMException whose `name` is the only reliable signal — the messages
 * are browser-specific prose. Each case here maps to a different fix, which is the point: "it didn't
 * work" tells them nothing, "something else is using the microphone" tells them what to close.
 */
export function micErrorMessage(err: unknown): string {
  const name =
    typeof err === "object" && err !== null && "name" in err
      ? String((err as { name: unknown }).name)
      : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "The browser is blocking the mic for this site. Allow it in the address bar, then tap Talk again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "I can't find a microphone on this device.";
    case "NotReadableError":
      return "Something else is using the microphone. Close the other app or tab, then tap Talk again.";
    default:
      return "I couldn't start the microphone. You can keep typing instead.";
  }
}
