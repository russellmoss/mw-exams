"use client";

interface Props {
  onStart: () => void;
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
        Tag every candidate with how strongly the stem points to it:{" "}
        <span className="text-emerald-300 font-medium">STRONG</span> (the stem really points here),{" "}
        <span className="text-accent font-medium">PLAUSIBLE</span> (worth considering), or{" "}
        <span className="text-fail font-medium">CURVEBALL</span> (low odds — taste carefully).
      </>
    ),
  },
  {
    n: "5",
    title: "The payoff: walk up to the glasses already close",
    body: (
      <>
        A sharp stem read narrows thousands of wines down to{" "}
        <span className="text-foreground">~10 or even fewer</span>. Get the real wines{" "}
        <em>somewhere</em> in your set and you arrive at the glasses already knowing what you&apos;re
        probably looking at. Then submit, see how close you got, and move into the tasting.
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
        deduction that happens <em>before</em> the glass.
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

      <div className="mt-6 flex justify-end">
        <button
          onClick={onStart}
          className="px-5 py-2 text-sm font-semibold rounded-lg bg-accent hover:bg-accent-hover text-background transition-colors cursor-pointer"
        >
          Start drilling
        </button>
      </div>
    </div>
  );
}
