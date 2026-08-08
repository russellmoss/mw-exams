"use client";

// The guided Practical-drills walkthrough — how to use Dry Flights and Live Tastings.
//
// Runs ONCE, the first time a candidate opens /practical (migration 061,
// users.practical_walkthrough_seen). Replayable from the Practical header and the Library.
//
// PAGE-SCOPED, NOT PART OF THE LAUNCHER CHAIN. The intro, the diagram walkthrough, the Coach
// walkthrough and the spotlight tour all fire from ShellOnboarding on `/`. This one does not, for
// two reasons: that chain is already four stages deep and a fifth would be the point at which people
// start clicking Skip on all of it; and this teach is only useful once you are actually looking at
// the two drills. A candidate who never opens Practical is never shown it.
//
// EVERY MECHANIC NAMED HERE IS READ OFF THE LIVE UI, not remembered. If any of these move, this file
// and the matching narration in src/lib/tour-narration.ts must both be re-checked — a walkthrough
// that teaches a control that no longer exists is worse than no walkthrough:
//
//   • Dry Flights 2–30 min, Live Tastings 2¼ hrs   → practical/page.tsx
//   • the four modes, their copy and their times   → practical/page.tsx MODES + the mode cards in
//                                                    practical/dry-flights/page.tsx
//   • the wizard order paper → family → mode →
//     source → stem detail → run                   → dry-flights/page.tsx `LandingStep`
//   • "Banked questions are instant; a fresh one
//     takes about 30-60 seconds."                  → dry-flights/page.tsx, the generating step
//   • Guided / IMW Only, and that sub-questions
//     and marks are identical across both          → lib/prompts/stemDetail.ts
//   • the Paper 3 Focus control, shown only on P3  → dry-flights/page.tsx (`selectedPaper === 3`)
//   • single question vs full paper; pick-my-wines
//     vs BYO; partner vs self brief routing;
//     68 min / 2h15 exam conditions                → live-tasting/page.tsx, live-tasting/[id]/page.tsx
//   • 13 examiner reports distilled into marking
//     principles                                   → the same figure the intro asserts

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { narrationId } from "@/lib/tour-narration";
import { TourLearnMoreButton } from "./TourLearnMore";
import { TourNarrationButton } from "./TourNarration";

interface Props {
  /** Fired when the user finishes or skips. `completed` is false only for an explicit Skip. */
  onDone: (completed: boolean) => void;
}

const TOTAL = 9;

const fadeUp = (delayMs: number, durationMs = 500): React.CSSProperties => ({
  animation: `introFadeUp ${durationMs}ms ${delayMs}ms both`,
});

const fade = (delayMs: number, durationMs = 500): React.CSSProperties => ({
  animation: `introFade ${durationMs}ms ${delayMs}ms both`,
});

/** Draw-in for an SVG connector: the line reveals along its own length. */
const drawIn = (length: number, delayMs: number): React.CSSProperties => ({
  strokeDasharray: length,
  strokeDashoffset: length,
  animation: `treeDraw 450ms ${delayMs}ms ease-out forwards`,
});

const STEP_EYEBROWS = [
  "Two drills",
  "Dry Flights — choose your ground",
  "Dry Flights — the four modes",
  "Dry Flights — the setup that matters",
  "Dry Flights — the run",
  "Live Tastings — the idea",
  "Live Tastings — staying blind",
  "Live Tastings — the shape",
  "Live Tastings — the day",
];

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A chain of steps, each revealing after the last.
 *
 * TWO RENDERINGS, and the reason is legibility rather than taste. The SVG scales to its container,
 * so a five- or six-step chain inside a 280px phone column shrinks the 10.5px sub-labels to about
 * 4px — present in the DOM, unreadable to a human. Below `sm` it therefore renders as a stacked
 * list at real type sizes instead. Same steps, same order, same reveal cadence.
 */
function Flow({
  steps,
  delayMs = 300,
}: {
  steps: { label: string; sub?: string }[];
  delayMs?: number;
}) {
  const w = 132;
  const gap = 18;
  const total = steps.length * w + (steps.length - 1) * gap;
  return (
    <>
      {/* Phones: a stacked list, because the diagram below is illegible at this width. */}
      <ol className="sm:hidden space-y-1.5 text-left">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className="flex items-baseline gap-3 rounded-lg border border-border bg-card px-3 py-2"
            style={fade(delayMs + index * 260)}
          >
            <span className="font-mono text-[0.625rem] text-accent tabular-nums shrink-0">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block text-[0.8125rem] text-foreground leading-snug">{step.label}</span>
              {step.sub && (
                <span className="block text-[0.6875rem] text-muted leading-snug">{step.sub}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
      <svg
        className="hidden sm:block w-full h-auto"
        viewBox={`0 0 ${total} 74`}
        role="img"
        aria-label={steps.map((s) => s.label).join(", then ")}
      >
      {steps.map((step, index) => {
        const x = index * (w + gap);
        const at = delayMs + index * 260;
        return (
          <g key={step.label}>
            <g style={fade(at)}>
              <rect x={x} y={12} width={w} height={50} rx={8} fill="var(--card)" stroke="var(--border)" />
              <text
                x={x + w / 2}
                y={step.sub ? 33 : 41}
                textAnchor="middle"
                fill="var(--foreground)"
                fontSize={12.5}
                fontWeight={500}
              >
                {step.label}
              </text>
              {step.sub && (
                <text x={x + w / 2} y={48} textAnchor="middle" fill="var(--muted)" fontSize={10.5}>
                  {step.sub}
                </text>
              )}
            </g>
            {index < steps.length - 1 && (
              <path
                d={`M${x + w},37 H${x + w + gap}`}
                stroke="var(--accent)"
                strokeWidth={1.5}
                fill="none"
                style={drawIn(gap, at + 170)}
              />
            )}
          </g>
          );
        })}
      </svg>
    </>
  );
}

function Rail({ children, delayMs }: { children: React.ReactNode; delayMs: number }) {
  return (
    <p
      className="text-[0.9375rem] text-muted leading-relaxed max-w-[42rem] mx-auto"
      style={fadeUp(delayMs, 500)}
    >
      {children}
    </p>
  );
}

/** One of the four Dry Flights modes. `trains` is the editorial line — what it is actually FOR. */
function ModeCard({
  name,
  time,
  body,
  trains,
  delayMs,
}: {
  name: string;
  time: string;
  body: string;
  trains: string;
  delayMs: number;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 text-left" style={fadeUp(delayMs)}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-foreground">{name}</p>
        <span className="text-[0.6875rem] text-muted tabular-nums whitespace-nowrap">{time}</span>
      </div>
      <p className="text-xs text-muted mt-1.5 leading-relaxed">{body}</p>
      <p className="text-xs text-accent mt-2 leading-relaxed">{trains}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function PracticalWalkthrough({ onDone }: Props) {
  const [step, setStep] = useState(0);

  const next = useCallback(() => {
    setStep((current) => {
      if (current >= TOTAL - 1) {
        onDone(true);
        return current;
      }
      return current + 1;
    });
  }, [onDone]);

  // Arrow keys page through, matching the other two walkthroughs. TourLearnMoreButton swallows them
  // in the capture phase while its card is open, so reading never moves the slide underneath.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") next();
      if (event.key === "ArrowLeft") setStep((current) => Math.max(0, current - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next]);

  return (
    <div className="fixed inset-0 z-[58] bg-background flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 shrink-0">
        <div className="flex items-center gap-3">
          <Image src="/logo.png" alt="BWC" width={28} height={28} className="opacity-80" />
          <span className="text-[0.8125rem] text-muted">How the two drills work</span>
        </div>
        <div className="flex items-center gap-4">
          <TourNarrationButton
            id={narrationId("practical", step)}
            nextId={step < TOTAL - 1 ? narrationId("practical", step + 1) : undefined}
          />
          <span className="text-[0.6875rem] text-muted tabular-nums">
            {step + 1} / {TOTAL}
          </span>
          <button
            onClick={() => onDone(false)}
            className="text-xs font-medium text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            Skip
          </button>
        </div>
      </div>

      {/* key={step} remounts the content so the entrance animations re-run per step. */}
      <div key={step} className="flex-1 overflow-y-auto px-6 flex">
        <div className="w-full max-w-[52rem] mx-auto my-auto py-4">
          <p
            className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-4 text-center"
            style={fade(0, 500)}
          >
            {STEP_EYEBROWS[step]}
          </p>

          {step === 0 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Two drills, two different<br />problems.
              </h1>
              <Rail delayMs={300}>
                They are not beginner and advanced. They train different things, and you need both.
              </Rail>

              <div className="grid sm:grid-cols-2 gap-3 mt-7 text-left">
                <div className="rounded-xl border border-accent/40 bg-accent/5 p-5" style={fadeUp(550)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-display text-lg font-semibold text-foreground">Dry Flights</p>
                    <span className="text-xs text-muted tabular-nums">2–30 min</span>
                  </div>
                  <p className="text-[0.8125rem] text-muted mt-2 leading-relaxed">
                    No wine required. A question in the IMW style, answered on the clock and graded
                    the way the examiners grade.
                  </p>
                  <p className="text-[0.8125rem] text-accent mt-3 leading-relaxed">
                    Trains the reasoning and the writing — where most marks are actually lost.
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-5" style={fadeUp(750)}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-display text-lg font-semibold text-foreground">Live Tastings</p>
                    <span className="text-xs text-muted tabular-nums">2¼ hrs</span>
                  </div>
                  <p className="text-[0.8125rem] text-muted mt-2 leading-relaxed">
                    Real bottles, bought near you, poured blind by someone else, then graded on the
                    real thing.
                  </p>
                  <p className="text-[0.8125rem] text-accent mt-3 leading-relaxed">
                    Trains the palate and the nerve — what you cannot fake on the day.
                  </p>
                </div>
              </div>

              <Rail delayMs={1000}>
                <span className="text-foreground">You will do many more of the first.</span> A dry
                flight fits into a Tuesday morning; a live tasting has to be arranged.
              </Rail>
            </div>
          )}

          {step === 1 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Four short questions,<br />then you are tasting.
              </h1>
              <Rail delayMs={300}>
                None of them is a commitment — Back works at every step, and nothing is spent until
                the question is fetched.
              </Rail>

              <div className="rounded-xl border border-border bg-card p-5 mt-7 mb-7" style={fadeUp(500, 500)}>
                <Flow
                  steps={[
                    { label: "Paper", sub: "whites · reds · special" },
                    { label: "Family", sub: "or Any" },
                    { label: "Mode", sub: "four of them" },
                    { label: "Source", sub: "new or banked" },
                    { label: "Stem detail", sub: "how much it tells you" },
                  ]}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-left">
                <div className="rounded-lg border border-border bg-card p-4" style={fadeUp(1600)}>
                  <p className="text-sm font-semibold text-foreground">Any family</p>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">
                    Gives you the exam&apos;s own unpredictability. The right default.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4" style={fadeUp(1750)}>
                  <p className="text-sm font-semibold text-foreground">One family</p>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">
                    For when you know exactly which structure keeps beating you.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-accent/40 bg-accent/5 p-4 mt-3 text-left" style={fadeUp(1900)}>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-accent mb-1.5">
                  Paper 3 only
                </p>
                <p className="text-[0.8125rem] text-foreground leading-relaxed">
                  A <span className="text-accent">Focus</span> control appears, so you can lean the
                  sampling toward sparkling, fortified or sweet — whichever you have been avoiding.
                  Papers 1 and 2 don&apos;t need it.
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                The modes are not<br />difficulty levels.
              </h1>
              <Rail delayMs={300}>
                Each one removes part of the task so you can drill the rest of it in isolation.
              </Rail>

              <div className="grid sm:grid-cols-2 gap-3 mt-7">
                <ModeCard
                  name="Full Question"
                  time="20–30 min"
                  body="Stem, flight, timed answer, full feedback with marks. The complete exam simulation."
                  trains="The one that tells you where you actually stand."
                  delayMs={500}
                />
                <ModeCard
                  name="Stem Analysis Only"
                  time="5–10 min"
                  body="Read the stem as evidence, get coached on your reasoning, then see the wines."
                  trains="The fastest useful thing here. Ten spare minutes? Do one."
                  delayMs={650}
                />
                <ModeCard
                  name="Dry Notes"
                  time="15–25 min"
                  body="Wines revealed up front. Graded on style, quality, maturity and commercial position alone."
                  trains="For when your problem is the writing, not the guessing."
                  delayMs={800}
                />
                <ModeCard
                  name="Flash Notes"
                  time="1–2 min/card"
                  body="Rapid single-prompt drills, wines shown up front, quick verdict and pace tracking."
                  trains="Volume and speed."
                  delayMs={950}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Two setup choices<br />people click past.
              </h1>
              <Rail delayMs={300}>
                Both change what the drill is worth. Neither takes more than a second to get right.
              </Rail>

              <div className="grid sm:grid-cols-2 gap-3 mt-7 text-left">
                <div className="rounded-lg border border-border bg-card p-5" style={fadeUp(500)}>
                  <p className="text-sm font-semibold text-foreground mb-2">New or banked?</p>
                  <p className="text-xs text-muted leading-relaxed">
                    <span className="text-foreground">Banked</span> — already written and validated,
                    and one you personally have never seen. Instant.
                  </p>
                  <p className="text-xs text-muted leading-relaxed mt-2">
                    <span className="text-foreground">New</span> — written for you on the spot.
                    Thirty to sixty seconds.
                  </p>
                  <p className="text-xs text-accent leading-relaxed mt-2.5">
                    Same standard either way. Nothing marks a banked question as banked.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-5" style={fadeUp(700)}>
                  <p className="text-sm font-semibold text-foreground mb-2">
                    How much should the stem tell you?
                  </p>
                  <p className="text-xs text-muted leading-relaxed">
                    <span className="text-foreground">Guided</span> — adds framing hints.
                  </p>
                  <p className="text-xs text-muted leading-relaxed mt-2">
                    <span className="text-foreground">IMW Only</span> — the stem exactly as the exam
                    prints it.
                  </p>
                  <p className="text-xs text-accent leading-relaxed mt-2.5">
                    Sub-questions and marks are identical. Only the framing prose changes.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-accent/40 bg-accent/5 p-5 mt-3 text-left" style={fadeUp(900)}>
                <p className="text-[0.9375rem] text-foreground leading-relaxed">
                  Start on <span className="text-accent">Guided</span> while the structures are
                  unfamiliar. Move to <span className="text-accent">IMW Only</span> well before the
                  exam — it is the only version you get on the day.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Then treat it like<br />the exam.
              </h1>
              <Rail delayMs={300}>
                Write the answer you would actually write — not the one you would write with a
                reference open.
              </Rail>

              <div className="grid sm:grid-cols-3 gap-3 mt-7 text-left">
                {[
                  {
                    title: "Marked like the examiners",
                    body:
                      "Against principles distilled from 13 examiners' reports: reasoning over identification, quality in the context of origin, no shoehorning.",
                  },
                  {
                    title: "The debrief is the point",
                    body:
                      "Not a score — where the marks went and why. Every attempt keeps the question, your answer and the debrief together in History.",
                  },
                  {
                    title: "The Coach pauses the clock",
                    body:
                      "Opening it mid-question stops the timer and restarts it when you close. Asking never costs you exam minutes.",
                  },
                ].map((card, index) => (
                  <div key={card.title} className="rounded-lg border border-border bg-card p-4" style={fadeUp(500 + index * 150)}>
                    <p className="text-sm font-semibold text-foreground">{card.title}</p>
                    <p className="text-xs text-muted mt-1.5 leading-relaxed">{card.body}</p>
                  </div>
                ))}
              </div>

              <Rail delayMs={1050}>
                Going back through History is how you find out whether it is one bad day or the same
                mistake every time. Usually it is the same mistake.
              </Rail>
            </div>
          )}

          {step === 5 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                You can reason perfectly<br />and still be undone by a glass.
              </h1>
              <Rail delayMs={300}>
                That is the gap Live Tastings close, and dry practice cannot touch it.
              </Rail>

              <div className="grid sm:grid-cols-3 gap-3 mt-7 text-left">
                {[
                  {
                    title: "Bottles you can actually buy",
                    body:
                      "The flight is built from wines checked against shops near you and against your budget — not a theoretical flight you would have to import.",
                  },
                  {
                    title: "For you, or your whole group",
                    body:
                      "One person sets it up and everyone tastes it blind — the cheapest way to turn a tasting group into exam practice rather than a nice evening.",
                  },
                  {
                    title: "About 2¼ hours, end to end",
                    body:
                      "Brief, buy, bag, taste, write, reveal. The closest thing to the exam you can arrange for yourself.",
                  },
                ].map((card, index) => (
                  <div key={card.title} className="rounded-lg border border-border bg-card p-4" style={fadeUp(500 + index * 150)}>
                    <p className="text-sm font-semibold text-foreground">{card.title}</p>
                    <p className="text-xs text-muted mt-1.5 leading-relaxed">{card.body}</p>
                  </div>
                ))}
              </div>

              <Rail delayMs={1050}>
                And then the hard part, which the next slide is entirely about:{" "}
                <span className="text-foreground">actually staying blind when you are the one
                organising it.</span>
              </Rail>
            </div>
          )}

          {step === 6 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                You never have to see<br />what you are about to taste.
              </h1>
              <Rail delayMs={300}>
                This is the part that makes the whole thing work. Practising alone normally means
                buying your own wines, which means knowing what they are — and a tasting you set up
                yourself is not a blind tasting.
              </Rail>

              <div className="rounded-xl border border-accent/40 bg-accent/5 p-5 mt-7 mb-3" style={fadeUp(500, 500)}>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-accent mb-3">
                  The brief goes to your buyer, not to you
                </p>
                <Flow
                  steps={[
                    { label: "App writes it", sub: "you never open it" },
                    { label: "Emailed out", sub: "partner or group" },
                    { label: "They buy", sub: "and bag it" },
                    { label: "They enter it", sub: "into the app" },
                    { label: "You're told", sub: "“question ready”" },
                  ]}
                  delayMs={650}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-left">
                <div className="rounded-lg border border-border bg-card p-5" style={fadeUp(2000)}>
                  <p className="text-sm font-semibold text-foreground mb-2">
                    If you chose <span className="text-accent">&ldquo;I&rsquo;ll choose wines&rdquo;</span>
                  </p>
                  <p className="text-xs text-muted leading-relaxed">
                    Put in an email address and the shopping brief goes straight to them, with a
                    private entry link of their own. You are never shown it. They buy whatever fits,
                    then type in exactly what they bought — and the question is built around{" "}
                    <span className="text-foreground">their</span> bottles.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-5" style={fadeUp(2150)}>
                  <p className="text-sm font-semibold text-foreground mb-2">
                    If you chose <span className="text-accent">&ldquo;Pick my wines&rdquo;</span>
                  </p>
                  <p className="text-xs text-muted leading-relaxed">
                    Same idea, one step later. Share the shopping list with your buyer by link — it
                    shows them the wines and the stockists, and{" "}
                    <span className="text-foreground">never the question or the answers</span>. Open
                    it yourself and the app says so.
                  </p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-5 mt-3 text-left" style={fadeUp(2300)}>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted mb-2">
                  And it keeps score honestly
                </p>
                <p className="text-[0.875rem] text-muted leading-relaxed">
                  Every session is stamped with how blind it actually was —{" "}
                  <span className="text-success">a partner handled the wines</span>,{" "}
                  <span className="text-borderline">you saw them before tasting</span>, or the list
                  was never opened. So you always know which of your own results to trust.
                </p>
              </div>

              <Rail delayMs={2450}>
                <span className="text-foreground">One person can set the whole thing up for a
                group</span>, and nobody who tastes has to be the person who bought. That is the
                difference between real blind practice and an expensive rehearsal.
              </Rail>
            </div>
          )}

          {step === 7 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Two more choices —<br />scale, not integrity.
              </h1>

              <div className="space-y-3 mt-7 text-left">
                {[
                  {
                    q: "One question, or a full paper?",
                    a: "A full paper is corpus-realistic — the question mix, flight sizes and wine spread mirror real exams, and you don’t pick the families. Just like the real thing.",
                    delay: 400,
                  },
                  {
                    q: "How will you sit it?",
                    a: "Flight by flight at your own pace, or exam conditions on the real clock — 68 minutes for a half paper, 2h15 for a full one, where anything unanswered at the deadline scores zero.",
                    delay: 600,
                  },
                ].map((row) => (
                  <div key={row.q} className="rounded-lg border border-border bg-card p-5" style={fadeUp(row.delay)}>
                    <p className="text-sm font-semibold text-foreground mb-1.5">{row.q}</p>
                    <p className="text-[0.8125rem] text-muted leading-relaxed">{row.a}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-accent/40 bg-accent/5 p-5 mt-3 text-left" style={fadeUp(800)}>
                <p className="text-[0.9375rem] text-foreground leading-relaxed">
                  Do a couple <span className="text-accent">flight by flight</span> first. Save{" "}
                  <span className="text-accent">exam conditions</span> for when you want the truth.
                </p>
              </div>

              <Rail delayMs={950}>
                Neither of these touches the blind routing. A{" "}
                <span className="text-foreground">full paper can go to a partner</span> exactly the
                same way a single question can.
              </Rail>
            </div>
          )}

          {step === 8 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                On the day.
              </h1>

              <div className="rounded-xl border border-border bg-card p-5 mt-6 mb-6" style={fadeUp(350, 500)}>
                <Flow
                  steps={[
                    { label: "Brief", sub: "you or a partner" },
                    { label: "Buy", sub: "local stockists" },
                    { label: "Bag", sub: "numbered 1–n" },
                    { label: "Taste", sub: "poured in order" },
                    { label: "Write", sub: "stem, then answer" },
                    { label: "Reveal", sub: "only after you submit" },
                  ]}
                  delayMs={200}
                />
              </div>

              <div className="grid sm:grid-cols-2 gap-3 text-left mb-6">
                <div className="rounded-lg border border-border bg-card p-4" style={fadeUp(1800)}>
                  <p className="text-sm font-semibold text-foreground">Let someone else bag them</p>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">
                    Even if you shopped yourself — buy across a few days and hand the bagging over.
                    It is the difference between a real result and an expensive rehearsal.
                  </p>
                </div>
                <div className="rounded-lg border border-border bg-card p-4" style={fadeUp(1950)}>
                  <p className="text-sm font-semibold text-foreground">It autosaves as you write</p>
                  <p className="text-xs text-muted mt-1.5 leading-relaxed">
                    Stem analysis first, then the full answer, in the same two passes as the exam. A
                    closed laptop does not cost you the session.
                  </p>
                </div>
              </div>

              <Rail delayMs={2100}>
                <span className="text-foreground">The reveal is the point.</span> Reading a wine
                wrong and then seeing exactly what it was, with your own note beside it, teaches more
                in one flight than a week of reading.
              </Rail>

              <div className="mt-8">
                <button
                  onClick={() => onDone(true)}
                  className="rounded-lg bg-accent hover:bg-accent-hover px-8 py-3 text-base font-semibold text-background transition-colors cursor-pointer"
                  style={fadeUp(2300)}
                >
                  Got it — let me pick a drill
                </button>
                <p className="text-xs text-muted mt-5" style={fadeUp(2450)}>
                  Replay this any time from the Practical page or the Library.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 px-6 py-5 shrink-0">
        <div className="flex items-center gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep((current) => current - 1)}
              className="rounded-lg border border-border px-5 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors cursor-pointer"
            >
              &larr; Back
            </button>
          )}
          <TourLearnMoreButton id={narrationId("practical", step)} />
          {step < TOTAL - 1 && (
            <button
              onClick={next}
              className="rounded-lg bg-accent hover:bg-accent-hover px-7 py-2 text-sm font-semibold text-background transition-colors cursor-pointer"
            >
              Next &rarr;
            </button>
          )}
        </div>
        <div className="flex items-center justify-center gap-2.5">
          {Array.from({ length: TOTAL }, (_, index) => (
            <span
              key={index}
              className={`rounded-full transition-all ${
                index === step ? "w-6 h-2 bg-accent" : "w-2 h-2 bg-border"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
