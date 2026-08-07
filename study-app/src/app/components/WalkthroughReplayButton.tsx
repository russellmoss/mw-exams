"use client";

// Replay entry point for the guided diagram walkthrough. It runs once automatically during
// first-run onboarding (see ShellOnboarding); this is how a user gets back to it afterwards,
// placed in the Library header because that is where the diagrams themselves live.

import { useState } from "react";
import { DiagramWalkthrough } from "./DiagramWalkthrough";

export function WalkthroughReplayButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors cursor-pointer"
      >
        How to use these diagrams
      </button>
      {/* Replay is presentation-only — it must not re-write walkthrough_seen. */}
      {open && <DiagramWalkthrough onDone={() => setOpen(false)} />}
    </>
  );
}
