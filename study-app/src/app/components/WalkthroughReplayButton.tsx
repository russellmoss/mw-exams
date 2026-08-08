"use client";

// Replay entry points for the guided walkthroughs. Each runs once automatically — the diagram and
// Coach ones during first-run onboarding (see ShellOnboarding), the drills one the first time
// /practical is opened — and this is how a user gets back to any of them afterwards.
//
// They live in the Library header because that is where the material they teach lives: the diagrams
// themselves, the reference corpora the Coach reads from, and — for the drills — because the Library
// is where someone goes when they want to understand the app rather than use it. The drills
// walkthroughs for Practical and Theory also have their own buttons in those page headers, next to
// the things they explain.

import { useState } from "react";
import { CoachWalkthrough } from "./CoachWalkthrough";
import { DiagramWalkthrough } from "./DiagramWalkthrough";
import { PracticalWalkthrough } from "./PracticalWalkthrough";
import { TheoryWalkthrough } from "./TheoryWalkthrough";

export function WalkthroughReplayButtons() {
  const [open, setOpen] = useState<"diagrams" | "coach" | "practical" | "theory" | null>(null);

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
      <button
        onClick={() => setOpen("practical")}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors cursor-pointer"
      >
        How the two drills work
      </button>
      <button
        onClick={() => setOpen("theory")}
        className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors cursor-pointer"
      >
        How Theory works
      </button>
      {/* Replay is presentation-only — it must not re-write any *_seen flag. */}
      {open === "diagrams" && <DiagramWalkthrough onDone={() => setOpen(null)} />}
      {open === "coach" && <CoachWalkthrough onDone={() => setOpen(null)} />}
      {open === "practical" && <PracticalWalkthrough onDone={() => setOpen(null)} />}
      {open === "theory" && <TheoryWalkthrough onDone={() => setOpen(null)} />}
    </div>
  );
}
