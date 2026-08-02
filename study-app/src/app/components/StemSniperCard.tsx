"use client";

import { useEffect, useState } from "react";

export type Tier = "STRONG" | "PLAUSIBLE" | "CURVEBALL";
export interface Prediction {
  variety?: string; // P1/P2
  style?: string; // P3 (style/method)
  region: string; // carries the Country guess (legacy field name; Reverse Tasting still reads it)
  country?: string; // the Country axis guess
  tier: Tier;
}
interface Row {
  primary: string; // grape (P1/P2) or style/method (P3)
  region: string; // country guess
  tier: Tier;
}
export interface Drill {
  questionId: string;
  paper: number;
  family: string;
  familyLabel: string;
  questionText: string;
  totalMarks: number;
  wineCount: number;
  visuals?: { slot: number; appearance: string }[]; // P3 only: per-wine look of the glass
}

interface Props {
  drill: Drill;
  varieties: string[];
  regions: string[];
  styles: string[];
  submitting: boolean;
  onSubmit: (predictions: Prediction[]) => void;
}

const TIERS: Tier[] = ["STRONG", "PLAUSIBLE", "CURVEBALL"];
const TIER_STYLE: Record<Tier, string> = {
  STRONG: "bg-emerald-400/15 text-emerald-300 border-emerald-400/40",
  PLAUSIBLE: "bg-accent/15 text-accent border-accent/40",
  CURVEBALL: "bg-fail/15 text-fail border-fail/40",
};
const paperLabel = (p: number) => (p === 1 ? "Whites" : p === 2 ? "Reds" : "Special");

function blankRows(n: number): Row[] {
  return Array.from({ length: Math.max(1, n) }, () => ({ primary: "", region: "", tier: "PLAUSIBLE" as Tier }));
}

export function StemSniperCard({ drill, varieties, regions, styles, submitting, onSubmit }: Props) {
  const isP3 = drill.paper === 3; // P3 predicts style/method, not variety
  const [rows, setRows] = useState<Row[]>(() => blankRows(drill.wineCount));

  useEffect(() => {
    setRows(blankRows(drill.wineCount));
  }, [drill.questionId, drill.wineCount]);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => setRows((r) => [...r, { primary: "", region: "", tier: "PLAUSIBLE" }]);
  const removeRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  const filled = rows.filter((r) => r.primary.trim());
  const canSubmit = filled.length > 0 && !submitting;
  const submit = () => {
    if (!canSubmit) return;
    onSubmit(
      filled.map((r) => {
        const country = r.region.trim();
        return isP3
          ? { style: r.primary.trim(), region: country, country, tier: r.tier }
          : { variety: r.primary.trim(), region: country, country, tier: r.tier };
      })
    );
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (i === rows.length - 1) addRow();
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      {/* shared autocomplete sources */}
      <datalist id="ss-varieties">
        {varieties.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="ss-regions">
        {regions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <datalist id="ss-styles">
        {styles.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-medium">
          Paper {drill.paper} — {paperLabel(drill.paper)}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-background border border-border text-muted">
          {drill.family} · {drill.familyLabel}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-background border border-border text-muted">
          {drill.wineCount} {drill.wineCount === 1 ? "wine" : "wines"}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-background border border-border text-muted">{drill.totalMarks} marks</span>
      </div>

      <p className="text-sm text-foreground leading-relaxed mb-4 whitespace-pre-wrap">{drill.questionText}</p>

      {drill.visuals && drill.visuals.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-background/60 p-3">
          <div className="text-[11px] font-semibold text-foreground mb-1.5">What you can see (the glasses)</div>
          <ul className="space-y-1">
            {drill.visuals.map((v, i) => (
              <li key={v.slot} className="text-xs text-muted">
                <span className="text-foreground/60 mr-1.5">{String.fromCharCode(65 + i)}.</span>
                {v.appearance}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-muted mb-2">
        For each wine in the flight, name the {isP3 ? "style/method" : "grape"} and the country{" "}
        {isP3 ? "(use the look of the glasses above)" : "(before tasting)"}. Tag your confidence.{" "}
        <span className="text-foreground/70">Order doesn&apos;t matter</span> — each guess is matched to the closest wine
        in the flight.
        <span className="ml-1 opacity-70">Enter = add wine · Ctrl/⌘+Enter = submit</span>
      </p>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="rounded-lg border border-border bg-background/40 p-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted" title="guess (order doesn't matter)">Wine {i + 1}</span>
              <button
                type="button"
                onClick={() => removeRow(i)}
                className="text-muted hover:text-fail transition-colors cursor-pointer px-1 text-xs"
                title="Remove"
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-muted">{isP3 ? "Style / method" : "Grape"}</span>
                <input
                  list={isP3 ? "ss-styles" : "ss-varieties"}
                  value={row.primary}
                  onChange={(e) => update(i, { primary: e.target.value })}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  placeholder={isP3 ? "e.g. Vintage Port" : "e.g. Chardonnay"}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-muted">Country</span>
                <input
                  list="ss-regions"
                  value={row.region}
                  onChange={(e) => update(i, { region: e.target.value })}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  placeholder="e.g. France"
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
                />
              </label>
            </div>
            <div className="flex items-center gap-1 mt-2">
              <span className="text-[10px] text-muted mr-1">Confidence</span>
              {TIERS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => update(i, { tier: t })}
                  title={t}
                  className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors cursor-pointer ${
                    row.tier === t ? TIER_STYLE[t] : "bg-background border-border text-muted hover:text-foreground"
                  }`}
                >
                  {t[0]}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="text-[13px] text-muted mt-2">Region isn&apos;t marked — country is enough.</p>

      <div className="flex items-center justify-between mt-4">
        <button onClick={addRow} className="text-xs text-muted hover:text-foreground transition-colors cursor-pointer">
          + Add wine
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
            canSubmit ? "bg-accent hover:bg-accent-hover text-background" : "bg-border text-muted cursor-not-allowed"
          }`}
        >
          {submitting ? "Scoring…" : "Submit"}
        </button>
      </div>
    </div>
  );
}
