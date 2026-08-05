"use client";

// PaperScopePills — the paper-scope selector at the top of the Bank Health card (BankHealthSection on
// /admin). It re-scopes every slice below to a single IMW paper (or the all-papers aggregate) and
// carries the single muted caption line beneath the pills.
//
// It REUSES the visual + accessible pattern of PaperFilterPills (amber-fill selected pill with
// near-black text and no shadow; transparent 1px-border unselected pills whose border/text lift on
// hover; radiogroup arrow-key navigation) rather than duplicating it — see PaperFilterPills. Scope is
// expressed as 'all' | 'p1' | 'p2' | 'p3' here; PaperFilterPills speaks in paper numbers (1|2|3) or
// null for all, so the two tiny mappers below bridge the two.

import { PaperFilterPills, type PaperValue } from "./PaperFilterPills";

export type Scope = "all" | "p1" | "p2" | "p3";

// User-facing caption names — mirror the pill labels (whites / reds / special).
const CAPTION_LABEL: Record<Exclude<Scope, "all">, string> = {
  p1: "Paper 1 · Whites",
  p2: "Paper 2 · Reds",
  p3: "Paper 3 · Special",
};

export function scopeToPaper(scope: Scope): PaperValue {
  return scope === "all" ? null : (Number(scope.slice(1)) as PaperValue);
}

export function paperToScope(paper: PaperValue): Scope {
  return paper == null ? "all" : (`p${paper}` as Scope);
}

export function PaperScopePills({
  scope,
  onChange,
  total,
}: {
  scope: Scope;
  // Clicking the already-selected pill is a no-op — the caller guards against re-selecting.
  onChange: (scope: Scope) => void;
  // Question count for the caption; null while the first payload is still loading (caption hidden).
  total: number | null;
}) {
  return (
    <div>
      <PaperFilterPills value={scopeToPaper(scope)} onChange={(p) => onChange(paperToScope(p))} />
      {total != null && (
        <p className="text-sm text-muted mt-2">
          {scope === "all"
            ? `Showing all three papers — ${total.toLocaleString()} questions banked.`
            : `Showing ${CAPTION_LABEL[scope]} — ${total.toLocaleString()} questions banked.`}
        </p>
      )}
    </div>
  );
}
