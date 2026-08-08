"use client";

// Practical hub (docs/design/2026-08-06-shell-redesign/ §4): the two tasting drills, each with
// enough copy to understand what it is and how long it takes. Stem Sniper is deliberately not
// listed (kept reachable at /stem-sniper); Stem Analysis lives inside Dry Flights as a mode.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { PracticalWalkthrough } from "../components/PracticalWalkthrough";

const MODES = [
  { name: "Full Question", description: "The complete exam simulation — stem, flight, timed answer, marks.", time: "20–30 min" },
  { name: "Stem Analysis Only", description: "Read the stem like evidence before any tasting.", time: "5–10 min" },
  { name: "Dry Notes", description: "Wines revealed up front; perfect the written note.", time: "15–25 min" },
  { name: "Flash Notes", description: "Rapid single-prompt drills with pace tracking.", time: "1–2 min/card" },
];

export default function PracticalHubPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [activeSessions, setActiveSessions] = useState<number | null>(null);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const decidedRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  // First visit to Practical opens the drills walkthrough (migration 061). Page-scoped, so unlike
  // the launcher chain there is nothing to sequence against — ShellOnboarding only mounts on `/`.
  //
  // The commit is deferred INTO the timer callback, not done in the effect body. Under StrictMode
  // React mounts, cleans up and mounts again; latching `decidedRef` up front meant the cancelled
  // first run burnt the latch and the surviving run returned early, so the walkthrough never
  // appeared in development. A timer rather than requestAnimationFrame, because rAF never fires in a
  // background tab or a non-compositing browser — the same two traps ShellOnboarding documents.
  useEffect(() => {
    if (authLoading || !user || decidedRef.current) return;
    if (user.practicalWalkthroughSeen) return;
    const timer = setTimeout(() => {
      decidedRef.current = true;
      setWalkthroughOpen(true);
    }, 0);
    return () => clearTimeout(timer);
  }, [authLoading, user]);

  // Finishing OR skipping marks it seen — it is replayable from the header and the Library, and
  // re-serving an 8-step teach someone has already declined is worse than making them ask for it.
  const closeWalkthrough = useCallback(() => {
    setWalkthroughOpen(false);
    decidedRef.current = true;
    fetch("/api/user/shell-prefs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ practicalWalkthroughSeen: true }),
    }).catch(() => {});
  }, []);

  // Replay is presentation-only: it must not re-write the flag (it is already true by then anyway).
  const [replaying, setReplaying] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetch("/api/live-tasting")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const sessions = (data?.sessions ?? []) as { state: string }[];
        setActiveSessions(sessions.filter((s) => s.state === "prep" || s.state === "shopping").length);
      })
      .catch(() => setActiveSessions(null));
  }, [user]);

  if (authLoading || !user) return null;

  return (
    <div className="flex-1">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Practical</h1>
            <p className="text-sm text-muted mt-1">
              The practical exam: three papers of twelve wines, tasted blind.
            </p>
          </div>
          <button
            onClick={() => setReplaying(true)}
            className="shrink-0 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors cursor-pointer"
          >
            How the two drills work
          </button>
        </div>
      </header>

      {(walkthroughOpen || replaying) && (
        <PracticalWalkthrough
          onDone={() => {
            if (replaying) setReplaying(false);
            else closeWalkthrough();
          }}
        />
      )}

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid md:grid-cols-2 gap-3 items-stretch">
          {/* Dry Flights */}
          <div className="bg-card rounded-xl border border-border p-6 flex flex-col">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-foreground">Dry Flights</h2>
              <span className="text-xs text-muted tabular-nums">2–30 min</span>
            </div>
            <p className="text-sm text-muted mt-2">
              Simulated exam flights — no wine required. Generated or banked questions in the IMW
              style, answered on the clock and graded like the examiners grade.
            </p>
            <div className="mt-4 flex-1">
              {MODES.map((mode) => (
                <div key={mode.name} className="flex items-baseline justify-between gap-3 border-t border-border py-2.5">
                  <div>
                    <p className="text-[0.8125rem] font-semibold text-foreground">{mode.name}</p>
                    <p className="text-[0.6875rem] text-muted mt-0.5">{mode.description}</p>
                  </div>
                  <span className="text-[0.6875rem] text-muted tabular-nums whitespace-nowrap">{mode.time}</span>
                </div>
              ))}
            </div>
            <Link
              href="/practical/dry-flights"
              className="mt-5 rounded-lg bg-accent hover:bg-accent-hover px-5 py-2.5 text-sm font-medium text-background text-center transition-colors"
            >
              Start a dry flight
            </Link>
          </div>

          {/* Live Tastings */}
          <div className="bg-card rounded-xl border border-border p-6 flex flex-col">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-display text-xl font-semibold text-foreground">Live Tastings</h2>
              <span className="text-xs text-muted tabular-nums">2¼ hrs</span>
            </div>
            <p className="text-sm text-muted mt-2">
              A real blind flight from bottles you can actually buy nearby — get a shopping brief,
              have someone bag the wines, taste against the clock, and get graded on the real thing.
            </p>
            <div className="flex-1" />
            <p className="text-xs text-muted mt-4">
              {activeSessions === null
                ? " "
                : activeSessions > 0
                  ? <><span className="text-accent font-medium">{activeSessions} session{activeSessions === 1 ? "" : "s"}</span> in flight — shopping or prep</>
                  : "No event planned yet"}
            </p>
            <Link
              href="/live-tasting"
              className="mt-5 rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-muted hover:text-foreground hover:border-muted text-center transition-colors"
            >
              Plan a tasting
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
