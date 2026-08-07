"use client";

// First-run intro presentation + spotlight UI tour (docs/design/2026-08-06-shell-redesign/ §0, §3).
//
// The intro is a 6-scene, click-through-only, full-screen presentation shown at every session
// start until the user checks "Don't show this again" (users.intro_seen, migration 050). All copy
// is verbatim from the design prototype.
//
// Exit is only via scene 6's "Start studying", which hands off to the rest of the first-run chain:
//
//   intro (every session until dismissed)
//     → diagram walkthrough (ONCE — users.walkthrough_seen, migration 051)
//       → Coach walkthrough (ONCE — users.coach_walkthrough_seen, migration 056)
//         → spotlight tour over the live launcher DOM (ONCE — users.tour_seen)
//
// Each stage is skippable and each is gated on its own flag, so a returning user who dismissed the
// intro but never finished the walkthrough still gets the walkthrough, and only the walkthrough.
//
// The order is deliberate. The diagram walkthrough teaches how a question is REASONED about; the
// Coach walkthrough then teaches how to argue with one, which only makes sense once you know what a
// well-formed question looks like. Both precede the spotlight tour, because the tour is about where
// things are and these two are about what the app actually does.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { narrationId } from "@/lib/tour-narration";
import { CoachWalkthrough } from "./CoachWalkthrough";
import { DiagramWalkthrough } from "./DiagramWalkthrough";
import { TourNarrationButton } from "./TourNarration";

const SESSION_FLAG = "mw-intro-shown-this-session";

interface TourStep {
  key: string;
  label: string;
  title: string;
  text: string;
}

const TOUR_STEPS: TourStep[] = [
  { key: "nav", label: "1 of 6", title: "Two pillars, like the exam", text: "Theory and Practical mirror the two halves of Stage 2. Hover Practical’s chevron for direct links to each drill; Library and History sit alongside." },
  { key: "continue", label: "2 of 6", title: "One click back to work", text: "The Continue card repeats your last drill configuration — or resumes an unfinished essay exactly where you left it. Your fastest path in, every day." },
  { key: "nudge", label: "3 of 6", title: "Your coach’s nudge", text: "The app watches your verdicts and points at the gap most worth drilling, with the exam countdown attached. One line, one action — never a dashboard." },
  { key: "pillars", label: "4 of 6", title: "Jump into either half", text: "Theory holds 243 real past essay questions graded against the examiners’ reports. Practical gathers the tasting drills: Dry Flights and Live Tastings." },
  { key: "recent", label: "5 of 6", title: "Your recent verdicts", text: "Momentum at a glance. Every card in History opens the full record — question, your answer, the debrief, and any feedback you filed." },
  { key: "bell", label: "6 of 6", title: "Feedback comes back to you", text: "Report a bad question anywhere with the Feedback button, and the system’s analysis — accepted or rejected, with reasons — lands here." },
];

const INFO_TITLES = [
  "Why patterns matter",
  "What is stem analysis?",
  "What’s actually in the corpus",
  "How we measure honestly",
  "How theory grading works",
];

const INFO_PARAS: string[][] = [
  [
    "Across any single exam year, wine selection looks arbitrary. Across fifteen years, it isn’t: Paper 1 has included Chardonnay every single year, Riesling appears in 10 of 11, and Paper 3’s first question has opened with sparkling wine every year since 2021.",
    "Curveballs follow a “1 in 4” rule — in a multi-wine question, typically exactly one wine is significantly harder. The rest are anchors. Knowing that changes how you allocate confidence across a flight.",
    "None of this tells you what’s in the glass. It tells you what the examiners have historically reached for — which is exactly the prior you want before you taste.",
  ],
  [
    "Stem analysis means reading the question text — the “stem” — as evidence, before you smell or taste anything. The paper number constrains color and style. Phrases like “same single grape variety” eliminate most of the wine world. Mark allocations signal what the examiner expects you to write about.",
    "Every historical question falls into one of a small number of structural families, and each family has its own decision tree, built from every stem construction in sixteen years of papers.",
    "You’ll see exactly how that works in a moment — the walkthrough after this intro takes one real past question all the way from its stem to the wines that were actually in the glasses. You practice the skill yourself in the Stem Analysis mode of Dry Flights.",
  ],
  [
    "The complete text of every MW practical exam from 2011 to 2026 — 15 years, 45 papers, 540 wines. Not a sample: the entire modern corpus.",
    "Every one of the 540 wines was individually researched from authoritative sources — producer tech sheets, Decanter, Tim Atkin MW, JancisRobinson.com, regional wine board data. Each entry documents the tasting profile, technical specs, vintage character, and why the examiners likely chose it.",
    "On top of that: 13 official examiner reports (2017–2025), systematically distilled into the marking principles the grading engine applies to your answers — reasoning over identification, quality in context, no shoehorning.",
  ],
  [
    "The decision trees are never graded on questions they were built from — that would measure memory, not prediction. They’re scored blind, against papers they’ve never seen.",
    "On the 2026 paper — predicted before the exam was sat — the true variety was in the candidate set for 89% of wines, and in the top three calls for 64%. On the 2000–2010 stress test (396 wines the trees never saw), those figures are 80% and 58%.",
    "Just as important is what we don’t claim: top-1 accuracy is about one in three, so the system never pretends to name the wine. It bounds the universe; you narrow from there in the glass.",
  ],
  [
    "The theory library holds 243 real past essay questions from 2016–2025, across all five theory papers — viticulture, vinification, handling of wine, the business of wine, and contemporary issues.",
    "Each question’s grading rubric is derived from the actual examiners’ report for that year: the core requirements they said were essential, the differentiators that separated strong answers, the traps that cost marks. Your essay is scored against that — not a generic AI opinion.",
    "Every question also carries a model answer built from the rubric, so after grading you can compare your essay against what a full-marks answer actually looks like, point by point.",
  ],
];

function saveShellPref(body: Record<string, unknown>) {
  fetch("/api/user/shell-prefs", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

const fadeUp = (delayMs: number, durationMs = 500): React.CSSProperties => ({
  animation: `introFadeUp ${durationMs}ms ${delayMs}ms both`,
});

function FunnelRow({ label, value, delayMs, final }: { label: string; value: string; delayMs: number; final?: boolean }) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 ${final ? "border-t border-border pt-2.5" : ""}`}
      style={fadeUp(delayMs)}
    >
      <span className={final ? "text-base font-semibold text-foreground" : "text-[0.9375rem] text-muted whitespace-nowrap"}>
        {label}
      </span>
      <span
        className={`font-mono tabular-nums whitespace-nowrap ${final ? "text-2xl text-accent font-medium" : "text-lg text-muted"}`}
      >
        {value}
      </span>
    </div>
  );
}

function StatBlock({ value, label, delayMs, accent, big }: { value: string; label: string; delayMs: number; accent?: boolean; big?: boolean }) {
  return (
    <div style={fadeUp(delayMs)}>
      <p className={`font-display font-bold tabular-nums leading-none ${big ? "text-[4rem]" : "text-[2.5rem]"} ${accent ? "text-accent" : "text-foreground"}`}>
        {value}
      </p>
      <p className={`text-muted mt-2 ${big ? "text-[0.8125rem] max-w-[14rem]" : "text-xs"}`}>{label}</p>
    </div>
  );
}

/** The first-run chain, in order. Exactly one stage is on screen at a time. */
type Stage = "intro" | "walkthrough" | "coach" | "tour" | null;

export function ShellOnboarding() {
  const { user, loading } = useAuth();
  const [stage, setStage] = useState<Stage>(null);
  const [scene, setScene] = useState(0);
  const [dontShow, setDontShow] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourRect, setTourRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const decidedRef = useRef(false);

  const introOpen = stage === "intro";
  const tourOpen = stage === "tour";

  // Decide once, after auth resolves: enter the chain at the earliest stage this user still owes —
  // intro (every session until intro_seen), then walkthrough, then tour. At most one chain per
  // browser session, so a mid-session reload never restarts it.
  useEffect(() => {
    if (loading || !user || decidedRef.current) return;

    let shownThisSession = false;
    try {
      shownThisSession = window.sessionStorage.getItem(SESSION_FLAG) === "1";
    } catch {}
    if (shownThisSession) return;

    const next: Stage = !user.introSeen
      ? "intro"
      : !user.walkthroughSeen
        ? "walkthrough"
        : !user.coachWalkthroughSeen
          ? "coach"
          : !user.tourSeen
            ? "tour"
            : null;
    if (!next) return;

    // NOTHING IS COMMITTED UNTIL THE FRAME ACTUALLY RUNS, and that is the whole point.
    //
    // This used to latch `decidedRef` and write the session flag up front, then schedule the open.
    // Under StrictMode — on by default in dev — React mounts, runs this effect, runs the cleanup,
    // and runs it again. The cleanup cancelled the pending frame, and the second run saw
    // `decidedRef` already true and returned. So the onboarding never appeared in development, for
    // ANY stage, while the session flag had already been burnt — which then suppressed it for the
    // rest of the session too. Production never double-invokes, so it only bit people testing
    // locally, which is exactly the people who most need to see it.
    //
    // Deferring both commits into the callback makes a cancelled run a no-op: it decides nothing and
    // records nothing, and the surviving run does the work once.
    //
    // A TIMER, NOT requestAnimationFrame. rAF only fires while the tab is compositing frames, so an
    // app opened in a background tab would sit with the flag unset and no onboarding until it was
    // brought to the front — and in a headless or non-compositing browser it never fires at all,
    // which is how this was found. Nothing here needs to be aligned to a paint; it just needs to be
    // out of the effect body so the setState is not a cascading render.
    const timer = setTimeout(() => {
      decidedRef.current = true;
      try {
        window.sessionStorage.setItem(SESSION_FLAG, "1");
      } catch {}
      setStage(next);
    }, 0);
    return () => clearTimeout(timer);
  }, [loading, user]);

  // The tour only spotlights elements that exist on this user's launcher (no Continue card on a
  // brand-new account, no nudge without failed flights).
  const activeTourSteps = useMemo(() => {
    if (!tourOpen) return [];
    return TOUR_STEPS.filter((step) => document.querySelector(`[data-tour="${step.key}"]`));
  }, [tourOpen]);

  const measure = useCallback(() => {
    const step = activeTourSteps[tourStep];
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.key}"]`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTourRect({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, [activeTourSteps, tourStep]);

  useEffect(() => {
    if (!tourOpen || activeTourSteps.length === 0) return;
    // Measure on the next frame rather than synchronously in the effect body: the spotlight target
    // is live launcher DOM, so measuring after the browser has laid out is the honest reading (and
    // a synchronous setState here is the cascading render React's lint rule objects to).
    const frame = requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [tourOpen, activeTourSteps, measure]);

  const endTour = useCallback(() => {
    setStage(null);
    saveShellPref({ tourSeen: true });
  }, []);

  const startTour = useCallback(() => {
    setTourStep(0);
    setStage("tour");
  }, []);

  // Skipping still marks a walkthrough seen — both are replayable from the Library, and re-serving a
  // 7-step teach the user has already declined is worse than making them ask for it.
  const endCoachWalkthrough = useCallback(() => {
    saveShellPref({ coachWalkthroughSeen: true });
    if (user && !user.tourSeen) startTour();
    else setStage(null);
  }, [startTour, user]);

  const endWalkthrough = useCallback(() => {
    saveShellPref({ walkthroughSeen: true });
    if (user && !user.coachWalkthroughSeen) setStage("coach");
    else if (user && !user.tourSeen) startTour();
    else setStage(null);
  }, [startTour, user]);

  const startStudying = useCallback(() => {
    if (dontShow) saveShellPref({ introSeen: true });
    if (user && !user.walkthroughSeen) setStage("walkthrough");
    else if (user && !user.coachWalkthroughSeen) setStage("coach");
    else if (user && !user.tourSeen) startTour();
    else setStage(null);
  }, [dontShow, startTour, user]);

  if (loading || !user) return null;

  const step = activeTourSteps[tourStep];
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const cardBelow = !tourRect || tourRect.top + tourRect.height + 220 < viewportHeight;
  const cardTop = tourRect ? (cardBelow ? tourRect.top + tourRect.height + 18 : Math.max(16, tourRect.top - 210)) : 120;
  const cardLeft = tourRect
    ? Math.min(Math.max(16, tourRect.left), (typeof window !== "undefined" ? window.innerWidth : 1200) - 372)
    : 120;

  return (
    <>
      {introOpen && (
        <div className="fixed inset-0 z-[60] bg-background flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5">
            <Image src="/logo.png" alt="BWC" width={28} height={28} className="opacity-80" />
            <div className="flex items-center gap-3">
              {/* Outside the key={scene} content block, so paging a slide swaps the clip without
                  remounting the control and losing its state mid-tour. */}
              <TourNarrationButton
                id={narrationId("intro", scene)}
                nextId={scene < 5 ? narrationId("intro", scene + 1) : undefined}
              />
              <span className="text-[0.6875rem] text-muted tabular-nums">{scene + 1} / 6</span>
            </div>
          </div>

          {/* key={scene} remounts the content so the entrance animations re-run per scene */}
          <div key={scene} className="flex-1 flex items-center justify-center px-6">
            <div className="max-w-[52rem] text-center">
              {scene === 0 && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-5" style={{ animation: "introFade 800ms both" }}>
                    Why this works
                  </p>
                  <h1 className="font-display text-[3.5rem] font-bold leading-[1.1] tracking-tight mb-5" style={fadeUp(200, 700)}>
                    The MW practical exam<br />is not random.
                  </h1>
                  <p className="text-lg text-muted leading-relaxed" style={fadeUp(600, 700)}>
                    It follows patterns — invisible in any single year,<br />unmistakable across a decade.
                  </p>
                </>
              )}
              {scene === 1 && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-5" style={{ animation: "introFade 600ms both" }}>
                    Stem analysis
                  </p>
                  <h1 className="font-display text-[2.75rem] font-bold leading-[1.15] tracking-tight mb-8" style={fadeUp(100, 700)}>
                    We read the stem<br />before the glass.
                  </h1>
                  <div className="flex flex-col gap-2.5 max-w-[30rem] mx-auto text-left">
                    <FunnelRow label="The world of wine" value="10,000+" delayMs={500} />
                    <FunnelRow label="“Paper 1” — still whites only" value="~300" delayMs={900} />
                    <FunnelRow label="“Same single grape variety”" value="~40" delayMs={1300} />
                    <FunnelRow label="Your candidate set, before you smell a thing" value="8" delayMs={1800} final />
                  </div>
                </>
              )}
              {scene === 2 && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-5" style={{ animation: "introFade 600ms both" }}>
                    The corpus
                  </p>
                  <h1 className="font-display text-[2.75rem] font-bold leading-[1.15] tracking-tight mb-9" style={fadeUp(100, 700)}>
                    Built on every modern<br />exam. All of them.
                  </h1>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-[44rem] mx-auto mb-7">
                    <StatBlock value="540" label="wines researched" delayMs={500} />
                    <StatBlock value="162" label="questions analyzed" delayMs={700} />
                    <StatBlock value="13" label="examiner reports" delayMs={900} />
                    <StatBlock value="15" label="years of exams" delayMs={1100} />
                  </div>
                  <p className="text-base text-muted leading-relaxed" style={fadeUp(1500, 600)}>
                    Every wine researched from tier-one sources — producer tech sheets,<br />
                    Decanter, JancisRobinson, regional wine boards.{" "}
                    <span className="text-foreground font-medium">Not Reddit.</span>
                  </p>
                </>
              )}
              {scene === 3 && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-5" style={{ animation: "introFade 600ms both" }}>
                    Tested blind
                  </p>
                  <h1 className="font-display text-[2.75rem] font-bold leading-[1.15] tracking-tight mb-9" style={fadeUp(100, 700)}>
                    Measured against papers<br />it had never seen.
                  </h1>
                  <div className="flex flex-wrap gap-12 justify-center mb-7">
                    <StatBlock value="89%" label="true variety in the candidate set — 2026 paper, predicted blind" delayMs={500} accent big />
                    <StatBlock value="64%" label="top-3 variety accuracy on the same unseen paper" delayMs={800} big />
                  </div>
                  <p className="text-base text-muted leading-relaxed" style={fadeUp(1200, 600)}>
                    The trees don’t tell you what the wine is. They bound the universe —<br />
                    you narrow from there in the glass.{" "}
                    <span className="text-foreground font-medium">Honest numbers, blind-tested.</span>
                  </p>
                </>
              )}
              {scene === 4 && (
                <>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-5" style={{ animation: "introFade 600ms both" }}>
                    Theory
                  </p>
                  <h1 className="font-display text-[2.75rem] font-bold leading-[1.15] tracking-tight mb-6" style={fadeUp(100, 700)}>
                    Graded the way the<br />examiners grade.
                  </h1>
                  <p className="text-lg text-muted leading-[1.7] mb-7" style={fadeUp(500, 600)}>
                    Every theory essay is marked against a rubric derived from the<br />
                    actual examiners’ reports —{" "}
                    <span className="text-foreground font-medium">243 rubrics, 2016–2025</span> —<br />
                    with a model answer to compare against.
                  </p>
                  <p className="text-[0.9375rem] text-muted" style={fadeUp(1000, 600)}>
                    Real past questions. Real marking guidance. No invented standards.
                  </p>
                </>
              )}
              {scene === 5 && (
                <>
                  <h1 className="font-display text-[3.5rem] font-bold leading-[1.1] tracking-tight mb-5" style={fadeUp(0, 700)}>
                    That’s the edge.
                  </h1>
                  <p className="text-lg text-muted mb-9" style={fadeUp(400, 600)}>
                    Patterns, not guesswork. Now go taste.
                  </p>
                  <div style={fadeUp(800, 600)}>
                    <button
                      onClick={startStudying}
                      className="rounded-lg bg-accent hover:bg-accent-hover px-8 py-3 text-base font-semibold text-background transition-colors cursor-pointer"
                    >
                      Start studying
                    </button>
                    <label className="flex items-center justify-center gap-2 mt-5 text-[0.8125rem] text-muted cursor-pointer">
                      <input
                        type="checkbox"
                        checked={dontShow}
                        onChange={(event) => setDontShow(event.target.checked)}
                        className="accent-[var(--accent)]"
                      />
                      Don’t show this again
                    </label>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center gap-5 px-6 pb-7">
            <div className="flex items-center gap-3">
              {scene > 0 && (
                <button
                  onClick={() => setScene((current) => current - 1)}
                  className="rounded-lg border border-border px-5 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                >
                  &larr; Back
                </button>
              )}
              {scene < 5 && (
                <>
                  <button
                    onClick={() => setInfoOpen(true)}
                    className="rounded-lg border border-border px-5 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors cursor-pointer"
                  >
                    Learn more
                  </button>
                  <button
                    onClick={() => setScene((current) => current + 1)}
                    className="rounded-lg bg-accent hover:bg-accent-hover px-7 py-2 text-sm font-semibold text-background transition-colors cursor-pointer"
                  >
                    Next &rarr;
                  </button>
                </>
              )}
            </div>
            <div className="flex items-center justify-center gap-2.5">
              {Array.from({ length: 6 }, (_, index) => (
                <span
                  key={index}
                  className={`rounded-full transition-all ${index === scene ? "w-6 h-2 bg-accent" : "w-2 h-2 bg-border"}`}
                />
              ))}
            </div>
          </div>

          {infoOpen && scene < 5 && (
            <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
              <button
                aria-label="Close"
                onClick={() => setInfoOpen(false)}
                className="fixed inset-0 bg-background/70 backdrop-blur-sm cursor-default"
              />
              <div className="relative w-full max-w-[34rem] max-h-[80vh] overflow-y-auto bg-card rounded-xl border border-border p-7 shadow-[0_25px_50px_rgba(0,0,0,0.5)]">
                <div className="flex items-start justify-between gap-4 mb-3.5">
                  <h2 className="font-display text-[1.375rem] font-semibold leading-snug tracking-tight">
                    {INFO_TITLES[scene]}
                  </h2>
                  <button
                    onClick={() => setInfoOpen(false)}
                    aria-label="Close"
                    className="p-1 text-muted hover:text-foreground shrink-0 cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-3">
                  {INFO_PARAS[scene].map((paragraph, index) => (
                    <p key={index} className="text-sm text-muted leading-[1.7]">{paragraph}</p>
                  ))}
                </div>
                <button
                  onClick={() => setInfoOpen(false)}
                  className="mt-5 rounded-lg border border-border px-5 py-2 text-sm font-semibold text-accent hover:bg-card-hover transition-colors cursor-pointer"
                >
                  Back to the tour
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === "walkthrough" && <DiagramWalkthrough onDone={endWalkthrough} />}

      {stage === "coach" && <CoachWalkthrough onDone={endCoachWalkthrough} />}

      {tourOpen && step && (
        <div className="fixed inset-0 z-[55]">
          <div
            className="pointer-events-none"
            style={
              tourRect
                ? {
                    position: "fixed",
                    top: tourRect.top - 6,
                    left: tourRect.left - 6,
                    width: tourRect.width + 12,
                    height: tourRect.height + 12,
                    borderRadius: 12,
                    border: "1px solid var(--accent)",
                    boxShadow: "0 0 0 9999px color-mix(in srgb, var(--background) 75%, transparent)",
                    transition: "top 250ms, left 250ms, width 250ms, height 250ms",
                  }
                : {
                    position: "fixed",
                    inset: 0,
                    background: "color-mix(in srgb, var(--background) 75%, transparent)",
                  }
            }
          />
          <div
            className="fixed w-[356px] max-w-[calc(100vw-32px)] bg-card rounded-xl border border-border p-5 shadow-[0_25px_50px_rgba(0,0,0,0.5)]"
            style={{ top: cardTop, left: cardLeft, transition: "top 250ms, left 250ms" }}
          >
            <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-accent mb-1">
              {tourStep + 1} of {activeTourSteps.length}
            </p>
            <p className="text-[0.9375rem] font-semibold text-foreground mb-1.5">{step.title}</p>
            <p className="text-[0.8125rem] text-muted leading-relaxed mb-4">{step.text}</p>
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={endTour}
                className="text-xs font-medium text-muted hover:text-foreground transition-colors cursor-pointer whitespace-nowrap"
              >
                Skip tour
              </button>
              <div className="flex gap-2">
                {tourStep > 0 && (
                  <button
                    onClick={() => setTourStep((current) => Math.max(0, current - 1))}
                    className="rounded-lg border border-border px-4 py-1.5 text-[0.8125rem] font-medium text-muted hover:text-foreground transition-colors cursor-pointer whitespace-nowrap"
                  >
                    &larr; Back
                  </button>
                )}
                <button
                  onClick={() => {
                    if (tourStep >= activeTourSteps.length - 1) endTour();
                    else setTourStep((current) => current + 1);
                  }}
                  className="rounded-lg bg-accent hover:bg-accent-hover px-5 py-1.5 text-[0.8125rem] font-semibold text-background transition-colors cursor-pointer whitespace-nowrap"
                >
                  {tourStep >= activeTourSteps.length - 1 ? "Done" : "Next →"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
