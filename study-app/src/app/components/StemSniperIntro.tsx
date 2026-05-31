"use client";

export type SniperMode = "sniper" | "reverse";

interface Props {
  onStart: (mode: SniperMode) => void;
}

const STEPS: { n: string; title: string; body: React.ReactNode }[] = [
  {
    n: "1",
    title: "You're narrowing the field — not naming wine 1",
    body: (
      <>
        This isn&apos;t about knowing that wine 1 is exactly X. It&apos;s about reading the stem and
        listing <span className="text-foreground">every wine the flight could plausibly be</span>.
        Order doesn&apos;t matter — you&apos;re building one shortlist of candidates for the whole set.
      </>
    ),
  },
  {
    n: "2",
    title: "Enter a variety + a region/country for each candidate",
    body: (
      <>
        For each wine it might be, type the <span className="text-foreground">variety</span> (on
        Paper 3, the <span className="text-foreground">style or method</span>) and its{" "}
        <span className="text-foreground">region or country</span>. Add as many as you like — that&apos;s
        what the <span className="text-accent font-medium">+ Add bucket</span> button is for.
      </>
    ),
  },
  {
    n: "3",
    title: "Spelling doesn't have to be perfect",
    body: (
      <>
        Every entry is <span className="text-foreground">fuzzy matched</span>, so a typo like
        &ldquo;savignon blanc&rdquo; still lands on Sauvignon Blanc and &ldquo;Piedmonte&rdquo; on
        Piedmont. Case and accents don&apos;t matter, and common synonyms count (Shiraz = Syrah).
        Autocomplete suggestions appear as you type — but don&apos;t fuss over exact spelling.
      </>
    ),
  },
  {
    n: "4",
    title: "Rank each guess by confidence",
    body: (
      <>
        Tag every candidate with how strongly the evidence points to it:{" "}
        <span className="text-emerald-300 font-medium">STRONG</span> (really points here),{" "}
        <span className="text-accent font-medium">PLAUSIBLE</span> (worth considering), or{" "}
        <span className="text-fail font-medium">CURVEBALL</span> (low odds — taste carefully).
      </>
    ),
  },
];

export function StemSniperIntro({ onStart }: Props) {
  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <h2 className="font-display text-xl font-semibold text-foreground mb-1">How Stem Sniper works</h2>
      <p className="text-sm text-muted mb-5">
        Before you taste a single wine, the question stem tells you a huge amount. Stem Sniper trains the
        deduction that happens <em>before</em> the glass — and, in Reverse Tasting, the way real evidence
        sharpens it.
      </p>

      <ol className="space-y-4">
        {STEPS.map((s) => (
          <li key={s.n} className="flex gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-accent/15 text-accent border border-accent/40 text-xs font-semibold flex items-center justify-center tabular-nums">
              {s.n}
            </span>
            <div>
              <div className="text-sm font-medium text-foreground">{s.title}</div>
              <p className="text-sm text-muted leading-relaxed mt-0.5">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Mode choice — pick before you start. */}
      <div className="mt-7 pt-5 border-t border-border">
        <div className="text-sm font-semibold text-foreground mb-1">Choose your mode</div>
        <p className="text-xs text-muted mb-4">You can switch anytime by reopening &ldquo;How it works&rdquo;.</p>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Sniper */}
          <div className="flex flex-col rounded-lg border border-border bg-background/40 p-4">
            <div className="text-sm font-semibold text-foreground">Sniper</div>
            <p className="text-xs text-muted leading-relaxed mt-1 flex-1">
              Stem only. Read the question, build one Layer-A shortlist, submit, and see how close you got
              against the wines. Fast, high-frequency reps that train your pre-glass instincts.
            </p>
            <button
              onClick={() => onStart("sniper")}
              className="mt-3 px-4 py-2 text-sm font-semibold rounded-lg bg-accent hover:bg-accent-hover text-background transition-colors cursor-pointer"
            >
              Start Sniper
            </button>
          </div>

          {/* Reverse Tasting */}
          <div className="flex flex-col rounded-lg border border-emerald-400/30 bg-emerald-400/5 p-4">
            <div className="text-sm font-semibold text-foreground">
              Reverse Tasting <span className="text-emerald-300 text-[10px] font-medium align-middle ml-1">two-stage</span>
            </div>
            <p className="text-xs text-muted leading-relaxed mt-1 flex-1">
              Guess from the stem first (Layer A). Then the glass is revealed as a blind tasting note —
              colour, nose, palate, no origin given — and you <span className="text-foreground">revise</span>{" "}
              your shortlist (Layer B). We show how the evidence moved you and calibrate your{" "}
              <span className="text-foreground">post-tasting</span> confidence — the skill that actually
              decides the exam.
            </p>
            <button
              onClick={() => onStart("reverse")}
              className="mt-3 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-background transition-colors cursor-pointer"
            >
              Start Reverse Tasting
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
