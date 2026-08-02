"use client";

import { useEffect, useState } from "react";

export type Tier = "STRONG" | "PLAUSIBLE" | "CURVEBALL";
export interface Prediction {
  variety?: string; // P1/P2 — back-compat scalar (the lead / first grape); Reverse Tasting reads it
  style?: string; // P3 (style/method) — back-compat scalar
  region: string; // carries the Country guess (legacy field name; Reverse Tasting still reads it)
  country?: string; // the Country axis guess (comma-joined when hedged)
  // Hedge & Blend (Stem Sniper only — see docs/plans/stem-sniper-hedge-and-blend.md).
  grape?: string; // the two-axis field name for the lead / first grape
  grapes?: string[]; // 1..MAX_HEDGE grapes, order preserved
  grapeMode?: "any" | "blend"; // 'any' = OR hedge; 'blend' = lead-ranked declaration
  leadGrapeIndex?: number; // only meaningful when grapeMode === 'blend'
  countries?: string[]; // 1..MAX_HEDGE origins, always OR
  tier: Tier;
}

// Kept in sync with MAX_HEDGE / HEDGE_CREDIT in lib/stem-scoring.ts, which is where the cap is
// actually enforced (the server must not trust this file).
const MAX_HEDGE = 3;
const CREDIT_LABEL = ["", "¾ credit", "½ credit"]; // by chip count - 1; 1 chip shows nothing

interface Row {
  grapes: string[];
  grapePending: string; // uncommitted text — auto-committed on submit
  grapeMode: "any" | "blend";
  leadGrapeIndex: number;
  countries: string[];
  countryPending: string;
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
  /**
   * Enable multi-tag hedging + lead-blend declaration. Stem Sniper only: Reverse Tasting posts to
   * /api/stem-sniper/submit-reverse, which still scores through the legacy `scorePredictions` and
   * would grant hedges for free. Extending it there means teaching that scorer about credits.
   */
  allowHedge?: boolean;
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
  return Array.from({ length: Math.max(1, n) }, () => ({
    grapes: [],
    grapePending: "",
    grapeMode: "any" as const,
    leadGrapeIndex: 0,
    countries: [],
    countryPending: "",
    tier: "PLAUSIBLE" as Tier,
  }));
}

// Commit whatever is in the input alongside the already-committed chips. Called on submit so a
// candidate who never discovers chips — types one grape, hits Submit — behaves exactly as before.
function commit(chips: string[], pending: string): string[] {
  const all = [...chips, pending];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of all) {
    const t = (c || "").trim();
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= MAX_HEDGE) break;
  }
  return out;
}

/**
 * A token/chip input that collapses to a plain text field when only one answer is allowed.
 *
 * `max === 1` (hedging off — Reverse Tasting) renders exactly the input this card has always had:
 * no chips, no comma handling, no committing. Nothing about that surface changes.
 *
 * With hedging on, comma commits a chip ("Chenin, Riesling" is how a hedge already gets written)
 * and Backspace on an empty input removes the last one. Enter and Ctrl/⌘+Enter are passed through
 * untouched so the card's "Enter = add wine, Ctrl+Enter = submit" shortcuts keep working — Stem
 * Sniper is a speed drill and the entry rhythm must not change.
 */
function ChipField({
  label,
  hint,
  chips,
  pending,
  listId,
  placeholder,
  max,
  lead,
  onCommit,
  onRemove,
  onSetLead,
  onPending,
  onKeyDown,
}: {
  label: string;
  hint?: string;
  chips: string[];
  pending: string;
  listId: string;
  placeholder: string;
  max: number; // 1 = plain field, no chips
  lead: number | null; // index of the lead chip, or null when not in blend mode
  onCommit: (text: string) => void;
  onRemove: (i: number) => void;
  onSetLead?: (i: number) => void;
  onPending: (text: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  const multi = max > 1;
  const full = chips.length >= max;

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (multi && e.key === ",") {
      e.preventDefault();
      onCommit(pending);
      return;
    }
    if (multi && e.key === "Backspace" && !pending && chips.length > 0) {
      e.preventDefault();
      onRemove(chips.length - 1);
      return;
    }
    onKeyDown(e);
  };

  if (!multi) {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-muted">{label}</span>
        <input
          list={listId}
          value={pending}
          onChange={(e) => onPending(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent/60"
        />
      </label>
    );
  }

  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline gap-2">
        <span className="text-[11px] font-medium text-muted">{label}</span>
        {hint && <span className="text-[10px] text-accent">{hint}</span>}
      </span>
      <div className="bg-background border border-border rounded-lg px-2 py-1 focus-within:border-accent/60 transition-colors">
        <div className="flex flex-wrap items-center gap-1">
          {chips.map((chip, i) => {
            const isLead = lead === i;
            const selectable = lead !== null && !!onSetLead;
            return (
              <span
                key={`${chip}-${i}`}
                className={`inline-flex items-center gap-1 rounded-md border pl-1.5 pr-1 py-0.5 text-xs ${
                  isLead ? "border-accent/60 bg-accent/10 text-foreground" : "border-border bg-card text-foreground"
                }`}
              >
                {isLead && (
                  <span className="rounded border border-accent/60 text-accent text-[9px] uppercase tracking-wide px-1 leading-none py-px">
                    Lead
                  </span>
                )}
                {selectable && !isLead ? (
                  <button
                    type="button"
                    onClick={() => onSetLead(i)}
                    title="Make this the lead grape"
                    className="cursor-pointer hover:text-accent transition-colors"
                  >
                    {chip}
                  </button>
                ) : (
                  <span>{chip}</span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  title="Remove"
                  aria-label={`Remove ${chip}`}
                  className="text-muted hover:text-fail transition-colors cursor-pointer px-0.5 leading-none"
                >
                  ✕
                </button>
              </span>
            );
          })}
          <input
            list={listId}
            value={pending}
            disabled={full}
            onChange={(e) => onPending(e.target.value)}
            onKeyDown={handleKey}
            onBlur={() => onCommit(pending)}
            placeholder={full ? "" : chips.length ? "or…" : placeholder}
            className="flex-1 min-w-[7rem] bg-transparent px-1 py-1 text-sm focus:outline-none disabled:cursor-not-allowed"
          />
        </div>
      </div>
    </label>
  );
}

export function StemSniperCard({
  drill,
  varieties,
  regions,
  styles,
  submitting,
  allowHedge = false,
  onSubmit,
}: Props) {
  const isP3 = drill.paper === 3; // P3 predicts style/method, not variety
  const [rows, setRows] = useState<Row[]>(() => blankRows(drill.wineCount));

  useEffect(() => {
    setRows(blankRows(drill.wineCount));
  }, [drill.questionId, drill.wineCount]);

  const update = (i: number, patch: Partial<Row> | ((row: Row) => Partial<Row>)) =>
    setRows((r) =>
      r.map((row, idx) => (idx === i ? { ...row, ...(typeof patch === "function" ? patch(row) : patch) } : row))
    );
  const addRow = () => setRows((r) => [...r, ...blankRows(1)]);
  const removeRow = (i: number) => setRows((r) => (r.length > 1 ? r.filter((_, idx) => idx !== i) : r));

  // Commit the pending text as a chip. Only ever called when hedging is on (ChipField renders a
  // plain input otherwise). Blank, duplicate and over-cap entries just clear the input.
  const commitChip = (i: number, axis: "grapes" | "countries", text: string) =>
    update(i, (row) => {
      const t = text.trim();
      const pendingKey = axis === "grapes" ? "grapePending" : "countryPending";
      const existing = row[axis];
      if (!t || existing.length >= MAX_HEDGE) return { [pendingKey]: "" };
      if (existing.some((c) => c.toLowerCase() === t.toLowerCase())) return { [pendingKey]: "" };
      return { [axis]: [...existing, t], [pendingKey]: "" };
    });

  const removeChip = (i: number, axis: "grapes" | "countries", ci: number) =>
    update(i, (row) => {
      const next = row[axis].filter((_, k) => k !== ci);
      const patch: Partial<Row> = { [axis]: next };
      if (axis === "grapes") {
        patch.leadGrapeIndex = Math.min(row.leadGrapeIndex, Math.max(next.length - 1, 0));
        if (next.length < 2) patch.grapeMode = "any";
      }
      return patch;
    });

  const toPrediction = (row: Row): Prediction | null => {
    const grapes = commit(row.grapes, row.grapePending);
    if (!grapes.length) return null;
    const countries = commit(row.countries, row.countryPending);
    const blend = allowHedge && row.grapeMode === "blend" && grapes.length >= 2;
    const lead = blend ? Math.min(Math.max(row.leadGrapeIndex, 0), grapes.length - 1) : 0;
    const country = countries.join(", ");
    return {
      // Back-compat scalars. `region` carries the country guess for Reverse Tasting's legacy scorer;
      // `variety`/`style` carry the lead grape so History and older readers still render.
      ...(isP3 ? { style: grapes[lead] } : { variety: grapes[lead] }),
      grape: grapes[lead],
      grapes,
      grapeMode: blend ? "blend" : "any",
      leadGrapeIndex: blend ? lead : 0,
      region: country,
      country,
      countries,
      tier: row.tier,
    };
  };

  const predictions = rows.map(toPrediction).filter((p): p is Prediction => p !== null);
  const canSubmit = predictions.length > 0 && !submitting;
  const submit = () => {
    if (!canSubmit) return;
    onSubmit(predictions);
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
        {rows.map((row, i) => {
          const blend = allowHedge && row.grapeMode === "blend" && row.grapes.length >= 2;
          return (
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
                <ChipField
                  label={isP3 ? "Style / method" : "Grape"}
                  // Blend mode is a commitment, not a hedge — it is not discounted, so no cost shown.
                  hint={allowHedge && !blend ? CREDIT_LABEL[row.grapes.length - 1] : ""}
                  chips={row.grapes}
                  pending={row.grapePending}
                  listId={isP3 ? "ss-styles" : "ss-varieties"}
                  placeholder={isP3 ? "e.g. Vintage Port" : "e.g. Chardonnay"}
                  max={allowHedge ? MAX_HEDGE : 1}
                  lead={blend ? Math.min(row.leadGrapeIndex, row.grapes.length - 1) : null}
                  onCommit={(t) => commitChip(i, "grapes", t)}
                  onRemove={(ci) => removeChip(i, "grapes", ci)}
                  onSetLead={(ci) => update(i, { leadGrapeIndex: ci })}
                  onPending={(t) => update(i, { grapePending: t })}
                  onKeyDown={(e) => onKeyDown(e, i)}
                />
                <ChipField
                  label="Country"
                  hint={allowHedge ? CREDIT_LABEL[row.countries.length - 1] : ""}
                  chips={row.countries}
                  pending={row.countryPending}
                  listId="ss-regions"
                  placeholder="e.g. France"
                  max={allowHedge ? MAX_HEDGE : 1}
                  lead={null}
                  onCommit={(t) => commitChip(i, "countries", t)}
                  onRemove={(ci) => removeChip(i, "countries", ci)}
                  onPending={(t) => update(i, { countryPending: t })}
                  onKeyDown={(e) => onKeyDown(e, i)}
                />
              </div>

              {/* Hedge vs commit. Only meaningful once there are two grapes to rank. */}
              {allowHedge && row.grapes.length >= 2 && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-muted mr-0.5">Grapes</span>
                  {(
                    [
                      ["any", "Any of these"],
                      ["blend", "Lead blend"],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => update(i, { grapeMode: value })}
                      className={`px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors cursor-pointer ${
                        row.grapeMode === value
                          ? "bg-accent/15 text-accent border-accent/40"
                          : "bg-background border-border text-muted hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="text-[10px] text-muted ml-1">
                    {blend
                      ? "Lead right = full credit. Right grapes, wrong lead = ¾."
                      : "Hedging costs precision — commit to a lead for full credit."}
                  </span>
                </div>
              )}

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
          );
        })}
      </div>

      <p className="text-[13px] text-muted mt-2">
        Region isn&apos;t marked — country is enough.
        {allowHedge && (
          <>
            {" "}
            Not sure? Type a comma to add a second answer — two costs ¾ of the mark, three costs ½.
          </>
        )}
      </p>

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
