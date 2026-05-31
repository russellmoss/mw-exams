"use client";

import { useState } from "react";
import type { Tier, Prediction } from "./StemSniperCard";

export interface TastingNote {
  slot: number;
  note: string;
}
interface Row {
  primary: string;
  region: string;
  tier: Tier;
}
interface Props {
  questionText: string;
  isP3: boolean;
  notes: TastingNote[];
  initial: Prediction[]; // Stage-1 (Layer-A) predictions, to pre-fill
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

// Strip the "**Wine N**" markers / markdown bold so the note reads as a clean sensory exhibit.
const cleanNote = (n: string) => n.replace(/\*\*/g, "").replace(/^\s*Wine\s+\d+\s*/i, "").trim();

function seedRows(initial: Prediction[], isP3: boolean): Row[] {
  const rows = initial.map((p) => ({
    primary: (isP3 ? p.style : p.variety) || "",
    region: p.region || "",
    tier: p.tier,
  }));
  return rows.length ? rows : [{ primary: "", region: "", tier: "PLAUSIBLE" as Tier }];
}

export function StemSniperTastingCard({ questionText, isP3, notes, initial, varieties, regions, styles, submitting, onSubmit }: Props) {
  const [rows, setRows] = useState<Row[]>(() => seedRows(initial, isP3));

  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  const addRow = () => setRows((r) => [...r, { primary: "", region: "", tier: "PLAUSIBLE" }]);
  const removeRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  const filled = rows.filter((r) => r.primary.trim());
  const canSubmit = filled.length > 0 && !submitting;
  const submit = () => {
    if (!canSubmit) return;
    onSubmit(
      filled.map((r) =>
        isP3
          ? { style: r.primary.trim(), region: r.region.trim(), tier: r.tier }
          : { variety: r.primary.trim(), region: r.region.trim(), tier: r.tier }
      )
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
      <datalist id="rt-varieties">{varieties.map((v) => <option key={v} value={v} />)}</datalist>
      <datalist id="rt-regions">{regions.map((r) => <option key={r} value={r} />)}</datalist>
      <datalist id="rt-styles">{styles.map((s) => <option key={s} value={s} />)}</datalist>

      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <span className="px-2 py-0.5 rounded-full bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 font-medium">
          Stage 2 · In the glass
        </span>
        <span className="px-2 py-0.5 rounded-full bg-background border border-border text-muted">Layer B — sensory evidence</span>
      </div>

      <p className="text-sm text-muted leading-relaxed mb-4 whitespace-pre-wrap">{questionText}</p>

      {/* The Layer-B exhibit: sanitized tasting notes, giveaways stripped. */}
      <div className="mb-4 rounded-lg border border-border bg-background/60 p-3">
        <div className="text-[11px] font-semibold text-foreground mb-2">What you taste (notes, origin hidden)</div>
        <ul className="space-y-2">
          {notes.map((n, i) => (
            <li key={n.slot} className="text-xs text-muted leading-relaxed">
              <span className="text-foreground/70 font-semibold mr-1.5">{String.fromCharCode(65 + i)}.</span>
              <span className="whitespace-pre-wrap">{cleanNote(n.note)}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted mb-2">
        Now revise your shortlist with the evidence in the glass. Your Stage-1 guesses are pre-filled —
        keep, change, or re-rank confidence. <span className="text-foreground/70">Your Stage-2 confidence is what gets calibrated.</span>
        <span className="ml-1 opacity-70">Enter = add row · Ctrl/⌘+Enter = score</span>
      </p>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted w-7 shrink-0">{i + 1}.</span>
            <input
              list={isP3 ? "rt-styles" : "rt-varieties"}
              value={row.primary}
              onChange={(e) => update(i, { primary: e.target.value })}
              onKeyDown={(e) => onKeyDown(e, i)}
              placeholder={isP3 ? "Style / method" : "Variety"}
              className="flex-1 min-w-[120px] bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
            />
            <input
              list="rt-regions"
              value={row.region}
              onChange={(e) => update(i, { region: e.target.value })}
              onKeyDown={(e) => onKeyDown(e, i)}
              placeholder="Region / country"
              className="flex-1 min-w-[120px] bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
            />
            <div className="flex gap-1">
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
            <button type="button" onClick={() => removeRow(i)} className="text-muted hover:text-fail transition-colors cursor-pointer px-1" title="Remove">
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-4">
        <button onClick={addRow} className="text-xs text-muted hover:text-foreground transition-colors cursor-pointer">
          + Add bucket
        </button>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
            canSubmit ? "bg-accent hover:bg-accent-hover text-background" : "bg-border text-muted cursor-not-allowed"
          }`}
        >
          {submitting ? "Scoring…" : "Score both stages"}
        </button>
      </div>
    </div>
  );
}
