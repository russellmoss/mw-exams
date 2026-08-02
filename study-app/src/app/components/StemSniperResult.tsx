"use client";

export interface Grade {
  prediction: { variety?: string; style?: string; region?: string; tier?: string | null };
  grade: string;
  points: number;
  matchedSlot: number | null;
  note: string;
}
// Two-axis (grape + country) per-wine grade — the "Two Marks, Not Three" scheme.
export interface WineGrade {
  slot: number;
  grapeGuess: string; // first predicted grape (back-compat)
  countryGuess: string; // first predicted country (back-compat)
  grapeGuesses?: string[]; // Multi-Pick: all predicted grapes for this wine
  countryGuesses?: string[]; // Multi-Pick: all predicted countries
  matchedGrapes?: string[]; // which predicted grapes matched (highlight green)
  matchedCountries?: string[]; // which predicted countries matched
  grapeCorrect: boolean;
  countryCorrect: boolean;
  verdict: "HIT" | "NEAR" | "MISS";
  points: number;
  correctGrape: string;
  correctCountry: string;
  region: string; // information only — never scored
  is_blend?: boolean;
}
export interface ScoreResult {
  twoAxis?: boolean;
  points: number;
  maxPoints: number;
  percent: number;
  roundPoints?: number;
  roundMax?: number;
  grades: (Grade | WineGrade)[];
  calibration: { tier: string | null; correct: boolean; grade: string }[];
  summary: { hits: number; nears: number; misses: number; varietyOnly?: number; plausibleOk?: number };
}
export interface Revealed {
  ground_truth: { slot: number; varieties: string[]; region: string; country?: string; is_blend?: boolean; style?: string }[];
  plausible: { variety: string; region: string; tier?: string }[];
}

interface Props {
  result: ScoreResult;
  revealed: Revealed;
  submitting: boolean;
  onNext: () => void;
}

const GRADE_STYLE: Record<string, string> = {
  HIT: "text-emerald-300 border-emerald-400/40 bg-emerald-400/10",
  NEAR: "text-amber-300 border-amber-400/40 bg-amber-400/10",
  PLAUSIBLE_OK: "text-accent border-accent/40 bg-accent/10",
  VARIETY: "text-muted border-border bg-background",
  MISS: "text-fail border-fail/40 bg-fail/10",
};
const GRADE_LABEL: Record<string, string> = {
  HIT: "HIT",
  NEAR: "NEAR",
  PLAUSIBLE_OK: "PLAUSIBLE",
  VARIETY: "VARIETY",
  MISS: "MISS",
};

// Round score is 1 mark per wine (HIT = 1, NEAR = ½, MISS = 0) — show a clean integer or one decimal.
const fmtRound = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

// One predicted grape/country under "Your call". Matched = green border/text + check; unmatched =
// muted, struck-through, dimmed border (Multi-Pick Predictions — any-match highlighting).
function CallTag({ label, matched }: { label: string; matched: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${
        matched ? "text-emerald-300 border-emerald-400/50" : "text-muted/70 border-border/60 line-through"
      }`}
    >
      {matched ? <span aria-hidden>✓</span> : null}
      {label}
    </span>
  );
}

function TwoAxisResultBody({ result, onNext, submitting }: { result: ScoreResult; onNext: () => void; submitting: boolean }) {
  const grades = result.grades as WineGrade[];
  const { hits, nears, misses } = result.summary;
  const roundPoints = result.roundPoints ?? hits + nears * 0.5;
  const roundMax = result.roundMax ?? grades.length;

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      {/* Round summary strip */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="text-sm text-foreground">
          <span className="font-semibold">Round score {fmtRound(roundPoints)} / {roundMax}</span>
          <span className="text-muted">
            {" "}· {hits} {hits === 1 ? "Hit" : "Hits"} · {nears} Near · {misses} Miss
          </span>
        </div>
        <button
          onClick={onNext}
          disabled={submitting}
          className="shrink-0 px-5 py-2 text-sm font-semibold rounded-lg bg-accent hover:bg-accent-hover text-background transition-colors cursor-pointer disabled:opacity-50"
        >
          Next drill →
        </button>
      </div>

      <div className="space-y-2.5">
        {grades.map((g, i) => {
          const vColor = g.verdict === "HIT" ? "text-emerald-300" : g.verdict === "NEAR" ? "text-amber-300" : "text-fail";
          const vLabel = g.verdict === "HIT" ? "Hit" : g.verdict === "NEAR" ? "Near" : "Miss";
          const identity = [g.correctGrape, [g.region, g.correctCountry].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" — ");
          // Fall back to the single-value fields for legacy attempts (they render as one-item lists).
          const grapeGuesses = g.grapeGuesses ?? (g.grapeGuess ? [g.grapeGuess] : []);
          const countryGuesses = g.countryGuesses ?? (g.countryGuess ? [g.countryGuess] : []);
          const matchedG = new Set((g.matchedGrapes ?? (g.grapeCorrect ? grapeGuesses : [])).map((x) => x.toLowerCase()));
          const matchedC = new Set((g.matchedCountries ?? (g.countryCorrect ? countryGuesses : [])).map((x) => x.toLowerCase()));
          const hasCall = grapeGuesses.length > 0 || countryGuesses.length > 0;
          return (
            <div key={i} className="rounded-lg border border-border bg-background/40 p-4">
              <div className="mb-2 text-sm font-medium">
                <span className="text-foreground">Wine {g.slot ?? i + 1}</span>
                <span className={vColor}> · {vLabel}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted mb-1">Your call</div>
              <div className="flex flex-wrap gap-1.5">
                {hasCall ? (
                  <>
                    {grapeGuesses.map((x) => (
                      <CallTag key={`g-${x}`} label={x} matched={matchedG.has(x.toLowerCase())} />
                    ))}
                    {countryGuesses.map((x) => (
                      <CallTag key={`c-${x}`} label={x} matched={matchedC.has(x.toLowerCase())} />
                    ))}
                  </>
                ) : (
                  <span className="text-xs text-muted italic">no call</span>
                )}
              </div>
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">Actual</div>
                <div className="text-sm text-foreground">
                  {identity}
                  {g.region ? (
                    <span className="ml-2 align-middle text-[10px] text-muted border border-border rounded px-1.5 py-0.5">
                      region not marked
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StemSniperResult({ result, revealed, submitting, onNext }: Props) {
  if (result.twoAxis) return <TwoAxisResultBody result={result} onNext={onNext} submitting={submitting} />;
  const scoreColor = result.percent >= 80 ? "text-emerald-300" : result.percent >= 50 ? "text-amber-300" : "text-fail";

  // calibration grouped by tier
  const byTier: Record<string, { correct: number; total: number }> = {};
  for (const c of result.calibration) {
    const t = c.tier || "—";
    byTier[t] = byTier[t] || { correct: 0, total: 0 };
    byTier[t].total++;
    if (c.correct) byTier[t].correct++;
  }
  const calibLine = Object.entries(byTier)
    .map(([t, v]) => `${t} ${v.correct}/${v.total}`)
    .join(" · ");

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className={`text-4xl font-bold ${scoreColor}`}>{result.percent}%</div>
          <div className="text-xs text-muted mt-1">
            {result.summary.hits} HIT · {result.summary.nears} NEAR · {result.summary.plausibleOk ?? 0} plausible ·{" "}
            {result.summary.varietyOnly ?? 0} variety · {result.summary.misses} miss
          </div>
        </div>
        <button
          onClick={onNext}
          disabled={submitting}
          className="px-5 py-2 text-sm font-semibold rounded-lg bg-accent hover:bg-accent-hover text-background transition-colors cursor-pointer disabled:opacity-50"
        >
          Next drill →
        </button>
      </div>

      {calibLine && (
        <div className="text-xs text-muted mb-4">
          <span className="text-foreground font-medium">Calibration:</span> {calibLine} correct
        </div>
      )}

      {/* graded predictions */}
      <div className="space-y-1.5 mb-5">
        {(result.grades as Grade[]).map((g, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border w-[78px] text-center shrink-0 ${
                GRADE_STYLE[g.grade] || GRADE_STYLE.MISS
              }`}
            >
              {GRADE_LABEL[g.grade] || g.grade}
            </span>
            <span className="text-foreground">
              {g.prediction.style || g.prediction.variety}
              {g.prediction.region ? <span className="text-muted"> — {g.prediction.region}</span> : null}
            </span>
            <span className="text-xs text-muted ml-auto shrink-0">{g.note}</span>
          </div>
        ))}
      </div>

      {/* reveal */}
      <div className="border-t border-border pt-4">
        <div className="text-xs font-semibold text-foreground mb-2">In the glass</div>
        <div className="space-y-1 mb-3">
          {revealed.ground_truth.map((b) => (
            <div key={b.slot} className="text-sm">
              <span className="text-muted text-xs mr-1">W{b.slot}</span>
              <span className="text-foreground">{b.style || b.varieties.join(" / ")}</span>
              <span className="text-muted"> — {b.region}{b.country ? `, ${b.country}` : ""}</span>
              {b.style ? <span className="text-muted text-[10px] ml-1">({b.varieties.join("/")})</span> : null}
              {!b.style && b.is_blend ? <span className="text-muted text-[10px] ml-1">[blend]</span> : null}
            </div>
          ))}
        </div>
        {revealed.plausible.length > 0 && (
          <div className="text-xs text-muted">
            <span className="text-foreground/70 font-medium">Plausible confusables:</span>{" "}
            {revealed.plausible
              .slice(0, 8)
              .map((p) => `${p.variety}/${p.region}`)
              .join("; ")}
            {revealed.plausible.length > 8 ? " …" : ""}
          </div>
        )}
      </div>
    </div>
  );
}
