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
  grapeGuess: string;
  countryGuess: string;
  grapeCorrect: boolean;
  countryCorrect: boolean;
  // Hedge & Blend. All optional: attempts recorded before that shipped have none of these, and
  // every reader below falls back to the booleans above.
  grapeCredit?: number;
  countryCredit?: number;
  grapeGuesses?: string[];
  countryGuesses?: string[];
  grapeMode?: "any" | "blend";
  leadGrapeIndex?: number;
  matchedGrape?: string | null;
  matchedCountry?: string | null;
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
  HIT: "text-success border-success/40 bg-success/10",
  NEAR: "text-borderline border-borderline/40 bg-borderline/10",
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

// Round score is 1 mark per wine (HIT = 1, NEAR = ½, MISS = 0), and hedged answers land on quarters
// — show a clean integer, or up to two decimals with no trailing zeros.
const fmtRound = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);

// Credit < 1 means the candidate hedged (or got a blend's rank wrong) and kept only part of the mark.
const CREDIT_LABEL: Record<string, string> = { "0.75": "¾", "0.5": "½", "0.25": "¼" };
const creditLabel = (credit: number | undefined): string =>
  credit === undefined || credit === 1 || credit === 0 ? "" : CREDIT_LABEL[String(credit)] ?? `${credit}×`;

/**
 * One graded axis. Renders every answer the candidate tagged — the one that earned the credit in
 * green, the rest dimmed — plus the correct value and, when partial, the fraction kept.
 *
 * Falls back to the single-guess shape for attempts recorded before Hedge & Blend shipped.
 */
function AxisChip({
  label,
  correct,
  guess,
  guesses,
  matched,
  credit,
  lead,
  correct_value,
}: {
  label: string;
  correct: boolean;
  guess: string;
  guesses?: string[];
  matched?: string | null;
  credit?: number;
  lead?: number | null;
  correct_value: string;
}) {
  const tagged = guesses && guesses.length ? guesses : guess ? [guess] : [];
  const fraction = creditLabel(credit);
  const matchedKey = (matched || "").toLowerCase();

  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 px-2 py-0.5 rounded-md text-xs border ${
        correct ? "text-success border-success/40 bg-success/10" : "text-fail border-fail/40 bg-fail/10"
      }`}
    >
      <span className="font-semibold">{label}</span>
      <span aria-hidden>{correct ? "✓" : "✗"}</span>
      {tagged.length > 0 ? (
        tagged.map((t, i) => {
          const hit = correct && (matchedKey ? t.toLowerCase() === matchedKey : i === 0);
          return (
            <span
              key={`${t}-${i}`}
              className={
                hit ? "text-success" : correct ? "text-muted opacity-70" : "line-through text-muted"
              }
            >
              {lead === i && <span className="text-accent text-[9px] uppercase mr-0.5">lead</span>}
              {t}
              {i < tagged.length - 1 && <span className="text-muted">,</span>}
            </span>
          );
        })
      ) : (
        <span className="text-muted italic">blank</span>
      )}
      {/* Partial credit is a borderline outcome, so it uses the verdict token rather than a raw
          amber class — it has to stay legible in the light theme too (DESIGN.md, Color). */}
      {fraction && <span className="text-borderline font-semibold">{fraction}</span>}
      {/* Always show the truth: a synonym or fuzzy match means the tagged chip and the expected
          label can legitimately differ ("Spätburgunder" vs "Pinot Noir"). */}
      <span className="text-foreground">{correct_value}</span>
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
          const badge = g.verdict === "HIT" ? GRADE_STYLE.HIT : g.verdict === "NEAR" ? GRADE_STYLE.NEAR : GRADE_STYLE.MISS;
          const identity = [g.correctGrape, [g.region, g.correctCountry].filter(Boolean).join(", ")]
            .filter(Boolean)
            .join(" — ");
          // Per-wine mark, shown only when the grade carries credit data (i.e. was scored after
          // Hedge & Blend shipped) — a hedged HIT is worth less than a committed one and the
          // headline verdict alone would hide that.
          const hasCredits = g.grapeCredit !== undefined && g.countryCredit !== undefined;
          const mark = hasCredits ? (g.grapeCredit! + g.countryCredit!) / 2 : null;
          return (
            <div key={i} className="rounded-lg border border-border bg-background/40 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Wine {g.slot ?? i + 1}</span>
                <div className="flex items-center gap-2">
                  {mark !== null && (
                    <span className="text-[11px] text-muted tabular-nums">{fmtRound(mark)} / 1</span>
                  )}
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge}`}>{g.verdict}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <AxisChip
                  label="Grape"
                  correct={g.grapeCorrect}
                  guess={g.grapeGuess}
                  guesses={g.grapeGuesses}
                  matched={g.matchedGrape}
                  credit={g.grapeCredit}
                  lead={g.grapeMode === "blend" ? g.leadGrapeIndex ?? 0 : null}
                  correct_value={g.correctGrape}
                />
                <AxisChip
                  label="Country"
                  correct={g.countryCorrect}
                  guess={g.countryGuess}
                  guesses={g.countryGuesses}
                  matched={g.matchedCountry}
                  credit={g.countryCredit}
                  correct_value={g.correctCountry}
                />
              </div>
              <div className="mt-3">
                <div className="text-[10px] uppercase tracking-wide text-muted mb-0.5">The wine</div>
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
  const scoreColor = result.percent >= 80 ? "text-success" : result.percent >= 50 ? "text-borderline" : "text-fail";

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
