"use client";

import { orbShouldAnimate, voiceStatusLabel } from "@/lib/voice/inline-ui";
import type { VoiceState } from "@/lib/voice/state-types";
import { AudioVisualizer } from "./AudioVisualizer";

// The voice status indicator in the Coach dock's title bar.
//
// Three constraints shaped this, and all three are easy to break by accident:
//
// 1. POINTER-INERT. The title bar is the dock's drag handle, and that handler only bails on
//    `closest("button")` (CoachDock's onPointerDown). A <canvas> is not a button, so without
//    `pointer-events: none` a drag started on the orb would be swallowed and the panel would feel
//    stuck. Deliberately not fixed by extending the bail-out list — the next person to add a header
//    element would re-break it. The orb has no interaction, so it takes no pointers, full stop.
// 2. SILENT TO SCREEN READERS. The inline bar owns the single aria-live region; announcing here too
//    would double every transition.
// 3. STILL UNLESS AUDIO IS FLOWING. See orbShouldAnimate — DESIGN.md forbids decorative animation,
//    and this is persistent chrome.

export function VoiceHeaderOrb({ state, getLevel }: { state: VoiceState; getLevel: () => number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex items-center gap-1.5 min-w-0 pointer-events-none"
    >
      <AudioVisualizer getLevel={getLevel} state={state} size={22} animate={orbShouldAnimate(state)} />
      {/* Below a narrow dock the word is the first thing to go; the orb alone still says
          "voice is on". */}
      <span
        className={`hidden sm:inline text-[11px] whitespace-nowrap truncate ${
          state === "error" ? "text-fail" : "text-muted"
        }`}
      >
        {voiceStatusLabel(state)}
      </span>
    </span>
  );
}
