"use client";

import { useEffect, useRef, useState } from "react";
import { voiceAnnouncement, voiceControlAvailability } from "@/lib/voice/inline-ui";
import type { VoiceSession } from "./useVoiceSession";

// Inline voice controls: a strip between the transcript and the composer.
//
// WHAT THIS IS NOT, deliberately: not fixed, not a dialog, not a focus trap, and above all not a
// takeover. The first version replaced the whole panel with a big orb, which meant the candidate
// could not see the answer they were being read — the transcript is the caption stream, and hiding
// it to show a decoration was backwards. Voice turns go through the same `send` as typed ones, so
// they land in the transcript above and stay readable while the conversation continues.
//
// The status orb is NOT here — it lives in the dock title bar (VoiceHeaderOrb), which is what makes
// this strip small enough to sit alongside the conversation instead of on top of it.

export function VoiceInlineBar({
  session,
  onClose,
  showHint,
}: {
  session: VoiceSession;
  onClose: () => void;
  /** True until the first turn lands, so the guidance retires itself. */
  showHint: boolean;
}) {
  const { canFinish, canInterrupt } = voiceControlAvailability(session.state);

  // ONE polite live region for the whole voice UI. The raw state label would fire four times per
  // exchange, which is unusable with a screen reader; voiceAnnouncement returns null for routine
  // cycling and speaks only the edges that carry information.
  const [announcement, setAnnouncement] = useState("");
  const prevStateRef = useRef(session.state);
  const turnCountRef = useRef(0);
  useEffect(() => {
    const prev = prevStateRef.current;
    const next = session.state;
    prevStateRef.current = next;
    if (prev === "speaking" && next === "listening") turnCountRef.current += 1;
    // Announcing a transition is inherently an effect of it, and voiceAnnouncement returns null for
    // routine cycling — so this settles rather than cascading.
    const message = voiceAnnouncement(prev, next, { turnCount: turnCountRef.current });
    if (message) setAnnouncement(message);
  }, [session.state]);

  return (
    <div className="shrink-0 border-t border-border px-3 py-2 space-y-1.5">
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>

      {session.error && (
        <p className="text-[11.5px] text-fail leading-snug">
          {session.error}{" "}
          <button
            type="button"
            onClick={onClose}
            className="underline text-accent hover:text-accent-hover cursor-pointer"
          >
            Switch to typing
          </button>
        </p>
      )}

      {showHint && !session.error && (
        <p className="text-[11px] text-muted leading-relaxed">
          Just talk — take your time and pause to think, it waits for you to finish. Tap Send now if
          you want an answer straight away, and cut in any time while it is speaking.
        </p>
      )}

      {/* Both controls are always rendered and go inert out of state. `aria-disabled` rather than
          `disabled` so they keep their place and stay announced; a control that vanishes and
          reappears mid-sentence reflows the row under the user's thumb every single turn. */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          aria-disabled={!canFinish}
          onClick={canFinish ? session.sendNow : undefined}
          className={`rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
            canFinish
              ? "border-accent text-accent hover:bg-accent hover:text-background cursor-pointer"
              : "border-border text-muted opacity-45 cursor-default"
          }`}
        >
          Send now
        </button>
        <button
          type="button"
          aria-disabled={!canInterrupt}
          onClick={canInterrupt ? session.interrupt : undefined}
          className={`rounded-lg border px-2.5 py-1 text-[12px] transition-colors ${
            canInterrupt
              ? "border-border text-foreground hover:border-muted cursor-pointer"
              : "border-border text-muted opacity-45 cursor-default"
          }`}
        >
          Interrupt
        </button>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded-lg border border-border px-2.5 py-1 text-[12px] text-muted hover:text-foreground hover:border-muted transition-colors cursor-pointer"
        >
          End
        </button>
      </div>
    </div>
  );
}
