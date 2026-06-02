// GradeBands — the Chapter 1 anchor infographic. Built to outputs/learning_units/_work/ch01/visual_specs.md.
// Shows the grade-band ladder + the 65% pass line + the ~50% per-paper floor as two distinct gates, and
// encodes confidence: CONFIRMED bands (C+, Fail) render solid; PLAUSIBLE bands (A, B) render dashed with a
// muted "plausible" tag, so a weakly-sourced cut-point is physically impossible to read as fact.

type Confidence = "confirmed" | "plausible";
type Verdict = "pass" | "borderline" | "fail";

interface GradeBand {
  label: string;
  range: string;
  verdict: Verdict;
  confidence: Confidence;
}
interface ReferenceLine {
  value: number;
  label: string;
  confidence: Confidence;
  hedge?: string;
}
export interface GradeBandsProps {
  bands: GradeBand[];
  average: ReferenceLine;
  floor: ReferenceLine;
  scale?: string;
  narrative?: string;
  confidenceLegend?: { confirmed: string; plausible: string };
}

const VERDICT_BAR: Record<Verdict, string> = {
  pass: "bg-success",
  borderline: "bg-borderline",
  fail: "bg-fail",
};
const VERDICT_TEXT: Record<Verdict, string> = {
  pass: "text-success",
  borderline: "text-borderline",
  fail: "text-fail",
};

function BandRow({ band }: { band: GradeBand }) {
  const plausible = band.confidence === "plausible";
  return (
    <div
      className={`flex items-stretch rounded-lg overflow-hidden border ${
        plausible ? "border-dashed border-border" : "border-border"
      }`}
      title={
        plausible
          ? "Sourced only to the unreadable 2021 Chief appendix — not report-verified."
          : undefined
      }
    >
      <div className={`w-1 shrink-0 ${VERDICT_BAR[band.verdict]}`} aria-hidden />
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 flex-1 bg-background/40">
        <div className="flex items-center gap-2.5">
          <span className={`text-sm font-semibold ${VERDICT_TEXT[band.verdict]}`}>{band.label}</span>
          <span
            className={`text-xs ${plausible ? "text-muted" : "text-foreground"} tabular-nums ${
              plausible ? "opacity-85" : ""
            }`}
          >
            {band.range}
          </span>
        </div>
        {plausible && (
          <span className="text-[0.65rem] uppercase tracking-wide text-muted border border-dashed border-border rounded-full px-2 py-0.5">
            plausible
          </span>
        )}
      </div>
    </div>
  );
}

function RefLine({ line, color }: { line: ReferenceLine; color: string }) {
  return (
    <div className="flex items-center gap-3 py-1.5" title={line.label}>
      <div className="h-0.5 flex-1 rounded" style={{ backgroundColor: color }} aria-hidden />
      <span className="text-xs font-medium tabular-nums whitespace-nowrap" style={{ color }}>
        {line.hedge ?? ""}
        {line.value} · {line.label.split("—")[0].trim()}
      </span>
      <div className="h-0.5 flex-1 rounded" style={{ backgroundColor: color }} aria-hidden />
    </div>
  );
}

// A small, explicitly-illustrative three-paper schematic for the two-gate narrative.
function MiniBars({ breached }: { breached: boolean }) {
  // P1/P2/P3 schematic heights (% of frame). breached = one paper dips under the floor.
  const papers = breached ? [78, 72, 38] : [78, 72, 52];
  return (
    <div className="relative h-16 flex items-end gap-1.5 mt-2" aria-hidden>
      {/* 65 average line */}
      <div className="absolute left-0 right-0" style={{ bottom: "65%", borderTop: "1px dashed var(--accent)" }} />
      {/* ~50 floor line (only meaningful in the floor-gate panel) */}
      {breached && (
        <div className="absolute left-0 right-0" style={{ bottom: "50%", borderTop: "1px solid var(--fail)" }} />
      )}
      {papers.map((h, i) => (
        <div
          key={i}
          className={`flex-1 rounded-t ${breached && i === 2 ? "bg-fail/60" : "bg-muted/50"}`}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

export function GradeBands({ props }: { props: GradeBandsProps }) {
  const { bands, average, floor, scale, narrative, confidenceLegend } = props;
  // The 65 line sits at the bottom edge of the pass region (between the pass bands and C+).
  const firstNonPass = bands.findIndex((b) => b.verdict !== "pass");
  const splitAt = firstNonPass === -1 ? bands.length : firstNonPass;

  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex flex-col gap-2">
        {bands.slice(0, splitAt).map((b) => (
          <BandRow key={b.label} band={b} />
        ))}
        <RefLine line={average} color="var(--accent)" />
        {bands.slice(splitAt).map((b) => (
          <BandRow key={b.label} band={b} />
        ))}
        <RefLine line={floor} color="var(--fail)" />
      </div>

      {scale && (
        <p className="text-xs text-muted mt-3 italic">{scale}</p>
      )}

      {/* Two-gate narrative */}
      {narrative && (
        <div className="grid sm:grid-cols-2 gap-3 mt-5">
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <div className="text-xs font-semibold text-foreground mb-0.5">The average gate</div>
            <p className="text-xs text-muted leading-relaxed">
              One weak paper drags the three-paper <strong className="text-foreground">average</strong> under 65.
            </p>
            <MiniBars breached={false} />
            <div className="text-[0.6rem] uppercase tracking-wide text-muted mt-1">illustrative</div>
          </div>
          <div className="rounded-lg border border-border bg-background/40 p-3">
            <div className="text-xs font-semibold text-foreground mb-0.5">The floor gate</div>
            <p className="text-xs text-muted leading-relaxed">
              A single paper under ~50 <strong className="text-fail">fails the practical</strong> regardless of the average.
            </p>
            <MiniBars breached={true} />
            <div className="text-[0.6rem] uppercase tracking-wide text-muted mt-1">illustrative</div>
          </div>
        </div>
      )}

      {/* Legend */}
      {confidenceLegend && (
        <div className="mt-5 pt-4 border-t border-border/60 space-y-2">
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-0 border-t border-border mt-2 shrink-0" />
            <p className="text-xs text-muted leading-relaxed">{confidenceLegend.confirmed}</p>
          </div>
          <div className="flex items-start gap-2.5">
            <div className="w-6 h-0 border-t border-dashed border-border mt-2 shrink-0" />
            <p className="text-xs text-muted leading-relaxed">{confidenceLegend.plausible}</p>
          </div>
        </div>
      )}
    </div>
  );
}
