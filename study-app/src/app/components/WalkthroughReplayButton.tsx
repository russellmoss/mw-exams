"use client";

// Replay entry points for the two guided walkthroughs. Both run once automatically during first-run
// onboarding (see ShellOnboarding); this is how a user gets back to either one afterwards.
//
// They live in the Library header because that is where the material they teach lives — the diagrams
// themselves, and, for the Coach, the reference corpora it reads from.

import { useState } from "react";
import { CoachWalkthrough } from "./CoachWalkthrough";
import { DiagramWalkthrough } from "./DiagramWalkthrough";

export function WalkthroughReplayButtons() {
  const [open, setOpen] = useState<"diagrams" | "coach" | null>(null);

  return (
    <div className="shrink-0 flex flex-wrap items-center gap-2">
      <button
        onClick={() => setOpen("diagrams")}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors cursor-pointer"
      >
        How to use these diagrams
      </button>
      <button
        onClick={() => setOpen("coach")}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors cursor-pointer"
      >
        What the Coach can do
      </button>
      {/* Replay is presentation-only — it must not re-write either *_seen flag. */}
      {open === "diagrams" && <DiagramWalkthrough onDone={() => setOpen(null)} />}
      {open === "coach" && <CoachWalkthrough onDone={() => setOpen(null)} />}
    </div>
  );
}
