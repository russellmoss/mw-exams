"use client";

// The guided Coach walkthrough — runs once, after the diagram walkthrough and before the spotlight
// UI tour (migration 056, users.coach_walkthrough_seen). Replayable from the Library header.
//
// It teaches the four things about the Coach that are not guessable from looking at it: that its
// technical answers come from a curated corpus rather than the open web, that it reads the
// candidate's own record, that challenging a question is a first-class action, and that the challenge
// is adjudicated against the corpus and can go either way.
//
// EVERY FACTUAL CLAIM HERE IS VERIFIED, and the verification is worth writing down because a
// walkthrough that overstates the system is worse than no walkthrough — it teaches a candidate to
// trust a number that is not there:
//
//   • 162 questions, 15 years, 540 wines, 13 examiner reports
//       → data/exams.json, counted (162 questions across 15 years); the wine and report counts are
//         the same ones the intro presentation asserts (ShellOnboarding INFO_PARAS).
//   • 6,700+ curated technical passages, AWRI / INAO / IVES / university programmes
//       → kb_chunk, 6,719 rows on 2026-08-07; publisher list from web-tools.ts and study-tools.ts.
//   • tier-1 restricted AT THE API, forums and retail cannot be returned
//       → coach/tools/web-tools.ts: every query passes `include_domains` (sources.ts).
//   • 2023 Paper 1 Question 1 paired Semillon from Hunter Valley with Semillon from Maule, Chile
//       → data/exams.json 2023 p1 q1 ("Wines 1-4 are from four different countries and two different
//         grape varieties… 3 & 4 are a pair"), with data/wines.json 2023_p1_w3 (Tyrrell's, Hunter
//         Valley) and 2023_p1_w4 (Semillon Granito, Julio Bouchon, Maule Valley, Chile).
//   • Semillon appears 9 times in the corpus, 8 of them Australian
//       → data/wines.json, counted.
//   • a single-wine question has happened exactly once, on Paper 3, and never on Paper 2
//       → data/exams.json, counted: the only one-wine question in 15 years is 2017 Paper 3 Q2.
//         This is why the real user feedback quoted on step 5 was accepted.
//   • the verdict lands in about a minute; an auto-applied fix usually inside ten
//       → measured 2026-08-07: user_attempts.feedback_reviewed_at − feedback_submitted_at is 0.4–1.1
//         min for auto decisions; the last 15 auto-feedback workflow runs took 3–12 min, median ~8.
//
// If any of those move, this file must be re-checked. The test in tests/coach-walkthrough.test.ts
// pins the numbers so a silent drift fails the build instead of misleading a candidate.

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { CoachChatSim, type Beat } from "./coach/CoachChatSim";

interface Props {
  /** Fired when the user finishes or skips. `completed` is false only for an explicit Skip. */
  onDone: (completed: boolean) => void;
}

const TOTAL = 7;

const fadeUp = (delayMs: number, durationMs = 500): React.CSSProperties => ({
  animation: `introFadeUp ${durationMs}ms ${delayMs}ms both`,
});

const fade = (delayMs: number, durationMs = 500): React.CSSProperties => ({
  animation: `introFade ${durationMs}ms ${delayMs}ms both`,
});

const STEP_EYEBROWS = [
  "Your Coach",
  "Ask it how wine is made",
  "What it is reading from",
  "Ask it how to get better",
  "Challenge a question",
  "When you are right",
  "Why your feedback matters",
];

// ── Scripts ──────────────────────────────────────────────────────────────────────────────────────
//
// Module-level constants, deliberately: CoachChatSim keys playback on script identity, so an inline
// array would restart the conversation on every render.

const TECHNICAL_SCRIPT: Beat[] = [
  { kind: "ask", text: "Why does Hunter Valley Semillon age so well at 10% alcohol?" },
  { kind: "status", label: "Searching the technical corpus…", ms: 2100 },
  {
    kind: "say",
    text:
      "Because almost everything that normally carries a white wine through twenty years is absent here, and acid is doing the work alone.\n\nPicked early, at low sugar and very high acidity. No oak, no malolactic, no lees texture — so there is no oxidative handling to spend. Under screwcap the wine sees almost no oxygen, and the development is reductive rather than oxidative: that is where the toast and lanolin come from, and none of it is barrel.\n\nSo the ageing curve is unusual — austere and neutral young, then a long slow build. A candidate who tastes 10% alcohol and calls it simple has misread the style.",
    checked: ["search_winemaking_science"],
  },
  { kind: "beat", ms: 600 },
  { kind: "ask", text: "Where is that coming from? I need to be able to defend it." },
  {
    kind: "say",
    text:
      "The corpus, not the open web — AWRI on reductive handling and screwcap oxygen ingress, plus the appellation material. Every passage comes back with its publisher, section and URL, and I cite them rather than paraphrasing.\n\nIf I ever cannot find something, I will tell you that instead of filling the gap from memory. An unattributed assertion earns nothing in an exam, and a wrong one costs marks.",
  },
];

const IMPROVE_SCRIPT: Beat[] = [
  { kind: "ask", text: "Where am I actually losing marks? Be blunt." },
  { kind: "status", label: "Looking at your record…", ms: 1800 },
  { kind: "status", label: "Reading back what you wrote…", ms: 1800 },
  {
    kind: "say",
    text:
      "Blunt: you are not losing marks on your palate. You are losing them on the page.\n\nAcross your last six Paper 2 flights, your structural readings were right almost every time — and in four of them the deduction that would have earned the origin mark is visible in your notes but never made it into the answer.\n\nThat is the most recoverable kind of loss there is. You already did the thinking; you ran out of clock before you wrote it down.",
    checked: ["query_my_performance", "get_attempt_debrief"],
  },
  { kind: "beat", ms: 500 },
  { kind: "ask", text: "So what do I change?" },
  {
    kind: "say",
    text:
      "One thing, not a list: write the conclusion first, then justify it.\n\nYou are building the argument on the page and arriving at the call in the last thirty seconds, which means when the clock beats you, the marks-bearing sentence is the one missing. Lead with the call, then spend the remaining time defending it.\n\nThe examiners are explicit that the argument matters as much as the conclusion — but only the argument you actually wrote down.",
    checked: ["query_examiner_thinking"],
  },
];

const CHALLENGE_WRONG_SCRIPT: Beat[] = [
  {
    kind: "ask",
    text:
      "This is nonsense — the IMW would never set Semillon as a same-variety, different-country question.",
  },
  { kind: "status", label: "Looking at the question…", ms: 1400 },
  { kind: "status", label: "Searching the past papers…", ms: 2200 },
  {
    kind: "say",
    text:
      "They have, and recently. 2023 Paper 1 Question 1: “Wines 1-4 are from four different countries and two different grape varieties… 3 & 4 are a pair.” That pair was Tyrrell's Semillon from the Hunter Valley and Semillon Granito from Maule Valley, Chile.\n\nYour instinct is not unreasonable, though, and it is worth knowing why: Semillon appears nine times in fifteen years and eight of those are Australian. So the variety really is close to an Australian monopoly in this exam — Chile in 2023 is the exception, and it is exactly the kind of curveball they like.\n\nI am not going to file this one, because the precedent is there. But it is a good thing to have checked.",
    checked: ["get_screen_context", "query_corpus"],
  },
];

const CHALLENGE_RIGHT_SCRIPT: Beat[] = [
  { kind: "ask", text: "One wine on its own in Paper 2? That's not how the paper is built." },
  { kind: "status", label: "Looking at the question…", ms: 1300 },
  { kind: "status", label: "Searching the past papers…", ms: 2200 },
  {
    kind: "say",
    text:
      "You are right, and it is worse than unusual — it has no precedent at all.\n\nIn fifteen years there is exactly one single-wine question in the entire corpus, and it sits on Paper 3, not Paper 2. Every Paper 2 question ever set has been a flight of two or more. So this is off-distribution, not merely rare.\n\nThat is a real defect. I will put it up for you to pull.",
    checked: ["get_screen_context", "query_corpus"],
  },
  {
    kind: "card",
    preview: "Pull this question from rotation and open a review",
    details: [
      { label: "Question", value: "gq_2026_p2_0e41" },
      { label: "Problem", value: "not_realistic" },
      {
        label: "What I checked",
        value:
          "Single-wine flight on Paper 2. The corpus holds exactly one one-wine question in 15 years and it is on Paper 3; Paper 2 has never had one.",
      },
      {
        label: "What happens",
        value:
          "It stops being served to anyone, the report goes to review, and the fix pipeline picks it up.",
      },
    ],
    confirmAfterMs: 2600,
    result: "Pulled from rotation — nobody gets served it again. Reviewing it now.",
    verdict: {
      tone: "accept",
      label: "Accepted — you were right",
      reason:
        "A lone wine on Paper 2 is unsupported by every paper from 2011 to 2025, and the single precedent that does exist sits on Paper 3 with identification deliberately removed.",
    },
  },
];

// ── Shared bits ──────────────────────────────────────────────────────────────────────────────────

function Stat({
  value,
  label,
  delayMs,
  accent,
}: {
  value: string;
  label: string;
  delayMs: number;
  accent?: boolean;
}) {
  return (
    <div style={fadeUp(delayMs)}>
      <p
        className={`font-display text-[2.5rem] font-bold tabular-nums leading-none ${
          accent ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="text-xs text-muted mt-2 leading-snug">{label}</p>
    </div>
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

// ─────────────────────────────────────────────────────────────────────────────

export function CoachWalkthrough({ onDone }: Props) {
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

  // Arrow keys page through, matching the diagram walkthrough. Deliberately NOT bound to Space or
  // Enter: the conversation panes have their own Pause / Skip / Replay controls, and stealing the
  // keys people reach for while reading a transcript would page the slide out from under them.
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
          <span className="text-[0.8125rem] text-muted">What the Coach can do</span>
        </div>
        <div className="flex items-center gap-4">
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

      {/* key={step} remounts the content so the entrance animations — and the conversation
          playback — restart per step. */}
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
              <h1
                className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3"
                style={fadeUp(100, 600)}
              >
                There is a Coach in the corner<br />of every screen.
              </h1>
              <Rail delayMs={300}>
                It has read every modern MW paper, every examiner report we can get, and a curated
                library of wine science. It is not a general chatbot that happens to know about wine.
              </Rail>

              <div
                className="rounded-xl border border-border bg-card p-6 mt-7 mb-7 inline-flex items-center gap-3"
                style={fadeUp(550, 500)}
              >
                <span className="flex items-center gap-1.5 rounded-full bg-card-hover border border-accent px-3.5 py-2 text-[13px] font-medium text-accent">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8 3.5h8a2 2 0 012 2v6.8a5 5 0 01-2.2 4.15L12 19l-3.8-2.55A5 5 0 016 12.3V5.5a2 2 0 012-2z"
                    />
                    <path strokeLinecap="round" d="M9.5 8.5h5M9.5 11.5h3" />
                  </svg>
                  Coach
                </span>
                <span className="text-[0.8125rem] text-muted">bottom right, always there</span>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 text-left">
                {[
                  {
                    title: "It pauses your clock",
                    body:
                      "Opening it mid-question stops the answer timer and restarts it when you close. Asking never costs you exam minutes.",
                  },
                  {
                    title: "It works mid-flight",
                    body:
                      "With a question open it will walk the decision tree with you — but it will not name the wine. That has to be yours.",
                  },
                  {
                    title: "It can see your screen",
                    body:
                      "It reads the question you are on, so you never have to paste anything in. The answer key stays hidden from it.",
                  },
                ].map((card, index) => (
                  <div
                    key={card.title}
                    className="rounded-lg border border-border bg-card p-4"
                    style={fadeUp(800 + index * 130)}
                  >
                    <p className="text-sm font-semibold text-foreground">{card.title}</p>
                    <p className="text-xs text-muted mt-1.5 leading-relaxed">{card.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="text-center">
              <h1
                className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3"
                style={fadeUp(100, 600)}
              >
                Ask it anything technical.
              </h1>
              <Rail delayMs={300}>
                Viticulture, vinification, appellation law. Watch where the answer comes from — and
                scroll back through it, or replay it, whenever you like.
              </Rail>
              <div className="mt-6" style={fadeUp(500, 500)}>
                <CoachChatSim script={TECHNICAL_SCRIPT} runKey="technical" heightClass="h-[30rem]" />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="text-center">
              <h1
                className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3"
                style={fadeUp(100, 600)}
              >
                Not the web. A library.
              </h1>
              <Rail delayMs={300}>
                Technical questions are answered from a curated corpus of research institutes and
                regulators — and when it does reach the live web, the list of places it is allowed to
                look is enforced at the API, not suggested in a prompt.
              </Rail>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-[44rem] mx-auto my-8">
                <Stat value="6,700+" label="curated technical passages" delayMs={500} accent />
                <Stat value="162" label="real exam questions, 15 years" delayMs={700} />
                <Stat value="540" label="wines individually researched" delayMs={900} />
                <Stat value="13" label="examiner reports distilled" delayMs={1100} />
              </div>

              <div
                className="rounded-xl border border-border bg-card p-5 text-left space-y-3 mb-7"
                style={fadeUp(1300, 500)}
              >
                <p className="text-[0.875rem] text-muted leading-relaxed">
                  <span className="text-foreground font-medium">The technical corpus</span> — AWRI,
                  the INAO cahiers des charges, IVES, the Champagne and Jerez regulators, university
                  extension programmes. Every passage citable by publisher and section.
                </p>
                <p className="text-[0.875rem] text-muted leading-relaxed">
                  <span className="text-foreground font-medium">The live web, when needed</span> —
                  regulators, research institutes, trade press with named editorial standards, market
                  analysts. Blogs, forums, user ratings and retail listings{" "}
                  <span className="text-foreground">cannot be returned at all.</span>
                </p>
              </div>

              <Rail delayMs={1550}>
                That combination is the point: the world&apos;s best wine science on one side, fifteen
                years of real papers and the examiners&apos; own words on the other. It lets the Coach
                reason about a wine the way the most experienced person in the room would — and say
                plainly when it does not know.
              </Rail>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <h1
                className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3"
                style={fadeUp(100, 600)}
              >
                Ask it how to get better.
              </h1>
              <Rail delayMs={300}>
                It can read your own attempts — what you wrote, what it was marked against, where the
                clock beat you — and it is willing to tell you something you would rather not hear.
              </Rail>
              <div className="mt-6" style={fadeUp(500, 500)}>
                <CoachChatSim script={IMPROVE_SCRIPT} runKey="improve" heightClass="h-[30rem]" />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center">
              <h1
                className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3"
                style={fadeUp(100, 600)}
              >
                Think a question is wrong?<br />Say so.
              </h1>
              <Rail delayMs={300}>
                Questions here are generated, and generation is good but not perfect. So arguing with
                a question is a first-class thing to do — and the Coach checks the claim against
                fifteen years of real papers before it agrees with you.
              </Rail>
              <div className="mt-6" style={fadeUp(500, 500)}>
                <CoachChatSim
                  script={CHALLENGE_WRONG_SCRIPT}
                  runKey="challenge-wrong"
                  heightClass="h-[30rem]"
                />
              </div>
              <Rail delayMs={800}>
                <span className="text-foreground">It told you no, and showed the receipt.</span> That
                is the point of checking rather than agreeing — and you have just learned a real
                precedent you can use.
              </Rail>
            </div>
          )}

          {step === 5 && (
            <div className="text-center">
              <h1
                className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3"
                style={fadeUp(100, 600)}
              >
                And when you are right,<br />the system changes.
              </h1>
              <Rail delayMs={300}>
                Same conversation, a real defect this time. Notice what the card is asking you to
                agree to — not &ldquo;send a complaint&rdquo;, but take a question out of circulation.
              </Rail>
              <div className="mt-6" style={fadeUp(500, 500)}>
                <CoachChatSim
                  script={CHALLENGE_RIGHT_SCRIPT}
                  runKey="challenge-right"
                  heightClass="h-[32rem]"
                />
              </div>

              <div className="grid sm:grid-cols-3 gap-3 text-left mt-7">
                {[
                  {
                    n: "1",
                    title: "Pulled immediately",
                    body:
                      "The moment you confirm, that question stops being served — to you and to everyone else. That part is instant and needs no review.",
                  },
                  {
                    n: "2",
                    title: "Checked independently",
                    body:
                      "Your claim is re-examined against the corpus and our accumulated rulings, on its own — it can disagree with the Coach. The verdict comes back to you in about a minute.",
                  },
                  {
                    n: "3",
                    title: "Fixed at the root",
                    body:
                      "If it is accepted, the fix goes to the pipeline that changes the generator itself — usually live inside ten minutes. If auto-apply is off, an admin reviews it and the same root-cause change is made.",
                  },
                ].map((card, index) => (
                  <div
                    key={card.n}
                    className="rounded-lg border border-border bg-card p-4"
                    style={fadeUp(900 + index * 140)}
                  >
                    <p className="text-[0.6875rem] font-semibold text-accent mb-1.5">{card.n}</p>
                    <p className="text-sm font-semibold text-foreground">{card.title}</p>
                    <p className="text-xs text-muted mt-1.5 leading-relaxed">{card.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="text-center">
              <h1
                className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-4"
                style={fadeUp(0, 600)}
              >
                Every note you leave<br />sharpens the next question.
              </h1>
              <Rail delayMs={250}>
                Generation is already reliable — it is validated against the corpus before anything
                reaches you. But it can be wrong, and it has no way of knowing which of its questions
                landed unless you tell it. You are the only source of that signal.
              </Rail>

              <div className="grid sm:grid-cols-2 gap-3 text-left my-8">
                <div className="rounded-lg border border-fail/40 bg-fail/5 p-5" style={fadeUp(550)}>
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-fail mb-2">
                    When you flag a bad one
                  </p>
                  <p className="text-[0.875rem] text-muted leading-relaxed">
                    It leaves rotation at once, and the reason becomes a rule. The generator learns
                    the shape of the mistake — not just that one question — so it stops producing the
                    whole family of them.
                  </p>
                </div>
                <div
                  className="rounded-lg border border-success/40 bg-success/5 p-5"
                  style={fadeUp(700)}
                >
                  <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-success mb-2">
                    When you praise a good one
                  </p>
                  <p className="text-[0.875rem] text-muted leading-relaxed">
                    Do this too — &ldquo;this is a good question&rdquo; is worth filing. Praise is the
                    only positive signal the generator ever gets; without it, it can only learn what
                    to avoid, never what to aim for.
                  </p>
                </div>
              </div>

              <Rail delayMs={900}>
                So the more you tell it, the better it gets at setting questions that are worth your
                eight minutes. It is the one part of this system that only you can improve.
              </Rail>

              <div className="mt-9">
                <button
                  onClick={() => onDone(true)}
                  className="rounded-lg bg-accent hover:bg-accent-hover px-8 py-3 text-base font-semibold text-background transition-colors cursor-pointer"
                  style={fadeUp(1100)}
                >
                  Show me around the app &rarr;
                </button>
                <p className="text-xs text-muted mt-5" style={fadeUp(1300)}>
                  You can replay this any time from the Library.
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
