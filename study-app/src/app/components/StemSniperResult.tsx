"use client";

export interface Grade {
  prediction: { variety: string; region?: string; tier?: string | null };
  grade: string;
  points: number;
  matchedSlot: number | null;
  note: string;
}
export interface ScoreResult {
  points: number;
  maxPoints: number;
  percent: number;
  grades: Grade[];
  calibration: { tier: string | null; correct: boolean; grade: string }[];
  summary: { hits: number; nears: number; varietyOnly: number; plausibleOk: number; misses: number };
}
export interface Revealed {
  ground_truth: { slot: number; varieties: string[]; region: string; country?: string; is_blend?: boolean }[];
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

export function StemSniperResult({ result, revealed, submitting, onNext }: Props) {
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
            {result.summary.hits} HIT · {result.summary.nears} NEAR · {result.summary.plausibleOk} plausible ·{" "}
            {result.summary.varietyOnly} variety · {result.summary.misses} miss
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
        {result.grades.map((g, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span
              className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border w-[78px] text-center shrink-0 ${
                GRADE_STYLE[g.grade] || GRADE_STYLE.MISS
              }`}
            >
              {GRADE_LABEL[g.grade] || g.grade}
            </span>
            <span className="text-foreground">
              {g.prediction.variety}
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
              <span className="text-foreground">{b.varieties.join(" / ")}</span>
              <span className="text-muted"> — {b.region}{b.country ? `, ${b.country}` : ""}</span>
              {b.is_blend ? <span className="text-muted text-[10px] ml-1">[blend]</span> : null}
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
