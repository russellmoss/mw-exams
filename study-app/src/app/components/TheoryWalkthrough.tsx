"use client";

// The guided Theory walkthrough — how the essay half of Stage 2 works here.
//
// Runs ONCE, the first time a candidate opens /theory (migration 062, users.theory_walkthrough_seen).
// Replayable from the Theory header and the Library. Page-scoped for the same reason as the
// Practical one: the launcher chain is already four stages deep, and this teach only lands once you
// are looking at the corpus.
//
// EVERY CLAIM HERE IS READ OFF THE LIVE UI OR THE CORPUS DOCS, not remembered. The risk with a teach
// like this is that it keeps confidently describing an older app to the one audience who cannot tell
// it is wrong, so tests/theory-walkthrough.test.ts pins each of these to its source:
//
//   • the five papers and their names        → components/TheoryQuestionPicker.tsx PAPERS
//   • "Papers 1–4: 60 min · Paper 5: 90 min" → the picker footer
//   • Year / Paper / Question / Budget /
//     Status columns, the theme filter and
//     the unattempted-only toggle            → components/TheoryQuestionPicker.tsx
//   • "Give me a question" = a random
//     UNATTEMPTED question                   → theory/page.tsx giveMeAQuestion
//   • the rubric stays hidden until submit   → theory/page.tsx writing panel
//   • the 50-word floor, and "30–60 seconds
//     … locks immediately"                   → theory/page.tsx submit button + confirm dialog
//   • PASS / BORDERLINE / FAIL, marked
//     "indicative", never a numeric mark     → theory/page.tsx verdict chip + page footer
//   • Pass floor vs Differentiator, the
//     verbatim quote, evergreen / year-bound
//     / superseded, and ex-ante              → components/TheoryRubricPanel.tsx
//   • model-answer claim statuses            → components/TheoryModelAnswer.tsx
//   • 243 questions, 2016–2025, and that
//     2015/2026 are deliberately not shown   → CLAUDE.md (coverage + the product decision)

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { narrationId } from "@/lib/tour-narration";
import { TourLearnMoreButton } from "./TourLearnMore";
import { TourNarrationButton } from "./TourNarration";

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
  "The other half of Stage 2",
  "Finding a question",
  "The clock",
  "Writing",
  "The verdict",
  "The rubric",
  "The model answer",
];

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

/** One of the five theory papers. */
function PaperRow({ n, name, delayMs }: { n: string; name: string; delayMs: number }) {
  return (
    <div
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-2.5"
      style={fadeUp(delayMs)}
    >
      <span className="font-mono text-[0.6875rem] text-accent tabular-nums shrink-0">{n}</span>
      <span className="text-[0.875rem] text-foreground">{name}</span>
    </div>
  );
}

/** A requirement card, styled like the real TheoryRubricPanel so the teach matches the artefact. */
function RequirementCard({
  kind,
  temporal,
  element,
  quote,
  delayMs,
  dim,
}: {
  kind: string;
  temporal: string;
  element: string;
  quote: string;
  delayMs: number;
  dim?: boolean;
}) {
  return (
    <li
      className={`rounded-lg border p-3 text-left ${dim ? "border-muted/40 opacity-70" : "border-border bg-background/25"}`}
      style={fadeUp(delayMs)}
    >
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{kind}</span>
        <span className="text-[10px] text-accent">{temporal}</span>
      </div>
      <p className="text-sm text-foreground leading-relaxed">{element}</p>
      <blockquote className="border-l-2 border-accent pl-3 mt-2 text-xs text-muted leading-relaxed">
        &ldquo;{quote}&rdquo;
      </blockquote>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function TheoryWalkthrough({ onDone }: Props) {
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

  // Arrow keys page through. TourLearnMoreButton swallows them in the capture phase while its card
  // is open, so reading the transcript never moves the slide underneath.
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
          <span className="text-[0.8125rem] text-muted">How Theory works</span>
        </div>
        <div className="flex items-center gap-4">
          <TourNarrationButton
            id={narrationId("theory", step)}
            nextId={step < TOTAL - 1 ? narrationId("theory", step + 1) : undefined}
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
                No wines. Five papers.<br />A different exam entirely.
              </h1>
              <Rail delayMs={300}>
                &ldquo;Paper&rdquo; here means a subject, not a wine colour — theory Paper 1 is
                viticulture, nothing to do with practical Paper 1&apos;s whites.
              </Rail>

              <div className="grid sm:grid-cols-2 gap-2 max-w-[34rem] mx-auto mt-7 mb-7">
                <PaperRow n="P1" name="Viticulture" delayMs={500} />
                <PaperRow n="P2" name="Vinification" delayMs={620} />
                <PaperRow n="P3" name="Handling of wine" delayMs={740} />
                <PaperRow n="P4" name="The business of wine" delayMs={860} />
                <PaperRow n="P5" name="Contemporary issues" delayMs={980} />
              </div>

              <div className="rounded-xl border border-accent/40 bg-accent/5 p-5 text-left" style={fadeUp(1150)}>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-accent mb-2">
                  The thing to understand first
                </p>
                <p className="text-[0.9375rem] text-foreground leading-relaxed">
                  The IMW publishes <span className="text-accent">no model answers and no
                  per-question marks</span> for theory. What it publishes is the questions — and,
                  afterwards, an examiners&apos; report saying what strong candidates did and where
                  weak ones went wrong. That report is the only real marking guidance in existence,
                  and it is what everything here is anchored to.
                </p>
              </div>

              <Rail delayMs={1350}>
                <span className="text-foreground">243 questions, 2016&ndash;2025</span>, each with a
                rubric extracted from that year&apos;s report. Questions with no report are not shown
                at all — one without examiner guidance can only be graded against somebody&apos;s
                opinion.
              </Rail>
            </div>
          )}

          {step === 1 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Three ways in.<br />One of them is best.
              </h1>

              <div className="grid sm:grid-cols-3 gap-3 mt-7 text-left">
                {[
                  {
                    title: "By paper",
                    body: "When you are working one domain at a time — all of viticulture, or all of the business paper.",
                  },
                  {
                    title: "By theme",
                    body: "Type sustainability, climate, luxury, SO₂ — it searches the question text across all five papers.",
                  },
                  {
                    title: "Give me a question",
                    body: "A random question you have not attempted. This is the right button most days.",
                    accent: true,
                  },
                ].map((card, index) => (
                  <div
                    key={card.title}
                    className={`rounded-lg border p-4 ${card.accent ? "border-accent/40 bg-accent/5" : "border-border bg-card"}`}
                    style={fadeUp(450 + index * 150)}
                  >
                    <p className={`text-sm font-semibold ${card.accent ? "text-accent" : "text-foreground"}`}>
                      {card.title}
                    </p>
                    <p className="text-xs text-muted mt-1.5 leading-relaxed">{card.body}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border bg-card p-5 mt-3 text-left" style={fadeUp(950)}>
                <p className="text-[0.9375rem] text-foreground leading-relaxed">
                  Choosing what to write about is itself a way of avoiding the things you are bad at.
                  <span className="text-muted"> The exam will not let you choose.</span>
                </p>
              </div>

              <Rail delayMs={1150}>
                Every row shows the year, the paper, the question, its time budget and whether
                you&apos;ve attempted it — and there&apos;s an unattempted-only filter for when the
                list starts filling up.
              </Rail>
            </div>
          )}

          {step === 2 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Both numbers come<br />from the real exam.
              </h1>

              <div className="flex flex-wrap gap-10 justify-center my-8">
                <div style={fadeUp(400)}>
                  <p className="font-display text-[3rem] font-bold tabular-nums leading-none text-foreground">
                    60<span className="text-xl font-normal text-muted"> min</span>
                  </p>
                  <p className="text-xs text-muted mt-2 max-w-[11rem]">per question on Papers 1–4</p>
                </div>
                <div style={fadeUp(600)}>
                  <p className="font-display text-[3rem] font-bold tabular-nums leading-none text-accent">
                    90<span className="text-xl font-normal text-muted"> min</span>
                  </p>
                  <p className="text-xs text-muted mt-2 max-w-[11rem]">per question on Paper 5</p>
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card p-5 text-left" style={fadeUp(800)}>
                <p className="text-[0.875rem] text-muted leading-relaxed">
                  Not arbitrary. Papers 1, 2 and 4 give you{" "}
                  <span className="text-foreground">three hours for three answers</span>; Paper 3
                  gives <span className="text-foreground">two hours for two</span>; Paper 5 gives{" "}
                  <span className="text-foreground">three hours for only two</span> — which is why it
                  alone gets ninety minutes.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-5 text-left mt-3" style={fadeUp(950)}>
                <p className="text-[0.875rem] text-muted leading-relaxed">
                  The word band follows from the clock — roughly what a person can actually write in
                  the time. The counter runs <span className="text-success">green</span> inside the
                  band and <span className="text-borderline">amber</span> above it. Going over is a
                  warning, not a penalty: in the real exam, the cost of overwriting one answer is the
                  answer you never started.
                </p>
              </div>

              <Rail delayMs={1100}>
                The clock counts <span className="text-foreground">up past zero</span> rather than
                stopping. How far over you went is the useful information.
              </Rail>
            </div>
          )}

          {step === 3 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Plan before you write.
              </h1>
              <Rail delayMs={300}>
                The examiners say it in almost every report: a clear line of argument beats a list of
                facts, and structure is what separates the top band from the middle.
              </Rail>

              <div className="grid sm:grid-cols-3 gap-3 mt-7 text-left">
                {[
                  {
                    title: "Talk it if you prefer",
                    body: "There is a microphone. Dictation is normalised for wine vocabulary before grading — a mis-transcribed Gewürztraminer costs you nothing.",
                  },
                  {
                    title: "It saves as you go",
                    body: "The draft persists, so a closed laptop does not lose the essay. Submitting needs at least 50 words.",
                  },
                  {
                    title: "Submission is confirmed",
                    body: "Grading takes 30–60 seconds and locks immediately, so a double-click cannot buy you two of the same thing.",
                  },
                ].map((card, index) => (
                  <div key={card.title} className="rounded-lg border border-border bg-card p-4" style={fadeUp(500 + index * 150)}>
                    <p className="text-sm font-semibold text-foreground">{card.title}</p>
                    <p className="text-xs text-muted mt-1.5 leading-relaxed">{card.body}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-accent/40 bg-accent/5 p-5 mt-3 text-left" style={fadeUp(1000)}>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-accent mb-2">
                  Note what is missing while you write
                </p>
                <p className="text-[0.9375rem] text-foreground leading-relaxed">
                  The rubric. It stays hidden until you submit — seeing what you are marked against
                  would turn this into a checklist exercise and teach you nothing about writing under
                  pressure.
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                A verdict, not a mark.
              </h1>

              <div className="flex flex-wrap gap-3 justify-center my-7">
                {[
                  { label: "PASS", cls: "text-success border-success/30 bg-success/10" },
                  { label: "BORDERLINE", cls: "text-borderline border-borderline/30 bg-borderline/10" },
                  { label: "FAIL", cls: "text-fail border-fail/30 bg-fail/10" },
                ].map((chip, index) => (
                  <span
                    key={chip.label}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold ${chip.cls}`}
                    style={fadeUp(400 + index * 130)}
                  >
                    {chip.label} · indicative
                  </span>
                ))}
              </div>

              <div className="rounded-lg border border-border bg-card p-5 text-left" style={fadeUp(850)}>
                <p className="text-[0.9375rem] text-foreground leading-relaxed">
                  Take <span className="text-accent">&ldquo;indicative&rdquo;</span> seriously. It is
                  not a mark out of a hundred and it is not pretending to be. The IMW never publishes
                  per-question marks for theory, so any number here would be invented — and an
                  invented number is worse than none, because you would start optimising for it.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-card p-5 text-left mt-3" style={fadeUp(1000)}>
                <p className="text-[0.875rem] text-muted leading-relaxed">
                  What it <span className="text-foreground">is</span> anchored to is real: the things
                  the examiners themselves said were essential that year. A theory question admits
                  many good answers, so grading on similarity to one model answer would penalise you
                  for choosing Rías Baixas where we chose Marlborough. Grading against the
                  requirements does not.
                </p>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-3" style={fadeUp(100, 600)}>
                Then read the rubric<br />slowly.
              </h1>
              <Rail delayMs={300}>
                It appears the moment you submit. Every requirement carries a verbatim quote from the
                examiners&apos; report — if we could not quote it, it is not in there.
              </Rail>

              <ul className="space-y-2.5 mt-7 mb-3">
                <RequirementCard
                  kind="Pass floor"
                  temporal="Evergreen · applies in full"
                  element="Something the examiners treated as essential — omit it and the answer does not pass."
                  quote="Weaker candidates failed to address this at all."
                  delayMs={500}
                />
                <RequirementCard
                  kind="Differentiator"
                  temporal="Year-bound · current substitute accepted"
                  element="What separated the strong answers from the merely adequate ones."
                  quote="The best answers went further and considered…"
                  delayMs={700}
                />
                <RequirementCard
                  kind="Pass floor"
                  temporal="Superseded · excused"
                  element="The world moved. You are excused this one entirely, with a source for the change."
                  quote="…"
                  delayMs={900}
                  dim
                />
              </ul>

              <div className="rounded-lg border border-accent/40 bg-accent/5 p-5 text-left" style={fadeUp(1100)}>
                <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-accent mb-2">
                  Ex-ante questions
                </p>
                <p className="text-[0.9375rem] text-foreground leading-relaxed">
                  Some are judged on what was knowable in the year they were set, with no credit for
                  hindsight. Answering a 2019 question with what we learned in 2023 is not insight,
                  it is anachronism.
                </p>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="text-center">
              <h1 className="font-display text-[2.25rem] font-bold leading-[1.15] tracking-tight mb-4" style={fadeUp(0, 600)}>
                And then the exemplar.
              </h1>
              <Rail delayMs={250}>
                Once you are graded you get a model answer written against the same rubric, so you can
                compare point by point instead of guessing what you were missing.
              </Rail>

              <div className="grid sm:grid-cols-3 gap-3 mt-7 text-left">
                {[
                  { label: "Verified", body: "Checked against a tier-1 source.", cls: "border-success/30 bg-success/5", tone: "text-success" },
                  { label: "Time-sensitive", body: "True in the year of that exam; check it still is.", cls: "border-accent/30 bg-accent/5", tone: "text-accent" },
                  { label: "Not verified", body: "No tier-1 source found in the verification pass.", cls: "border-border bg-background/30", tone: "text-muted" },
                ].map((chip, index) => (
                  <div key={chip.label} className={`rounded-lg border p-4 ${chip.cls}`} style={fadeUp(500 + index * 150)}>
                    <p className={`text-sm font-semibold ${chip.tone}`}>{chip.label}</p>
                    <p className="text-xs text-muted mt-1.5 leading-relaxed">{chip.body}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-border bg-card p-5 mt-3 text-left" style={fadeUp(950)}>
                <p className="text-[0.9375rem] text-foreground leading-relaxed">
                  Every figure, date and named producer in a model answer is registered as a claim and
                  labelled. Treat an{" "}
                  <span className="text-muted">unverified</span> one as a well-informed
                  candidate&apos;s recollection — not as a fact to carry into an exam and repeat.
                </p>
              </div>

              <div className="mt-8">
                <button
                  onClick={() => onDone(true)}
                  className="rounded-lg bg-accent hover:bg-accent-hover px-8 py-3 text-base font-semibold text-background transition-colors cursor-pointer"
                  style={fadeUp(1150)}
                >
                  Got it — give me a question
                </button>
                <p className="text-xs text-muted mt-5" style={fadeUp(1300)}>
                  Replay this any time from the Theory page or the Library.
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
          <TourLearnMoreButton id={narrationId("theory", step)} />
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
