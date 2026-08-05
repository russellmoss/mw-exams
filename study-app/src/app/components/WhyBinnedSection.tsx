"use client";

import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WhyBinnedSection — the "Why wines get binned" learning-loop card on /admin (spec).
//
// A bordered flat Cellar card with a Fraunces title, a list of reason label + count each drawn with a
// thin amber bar sized to its share of the top reason (relative volume), then the most recent reviewer
// notes quoted in muted italic, and a caption. Reads the aggregation the /api/admin/bin/lessons GET
// route now returns (reason_codes counts + 3 recent notes over the last N batches). Renders nothing
// until there is at least one reason or note, so a fresh install shows no empty card.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

interface ReasonRow {
  code: string;
  label: string;
  count: number;
}
interface NoteRow {
  note: string;
  paper: number;
  binnedAt: string;
}

export function WhyBinnedSection() {
  const [reasons, setReasons] = useState<ReasonRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/bin/lessons", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setReasons(Array.isArray(data.reasons) ? data.reasons : []);
        setNotes(Array.isArray(data.notes) ? data.notes : []);
      } catch {
        /* transient — the card just stays hidden */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (reasons.length === 0 && notes.length === 0) return null;

  const max = reasons.reduce((m, r) => Math.max(m, r.count), 0) || 1;

  return (
    <div className="rounded-xl border border-border bg-card p-6 mb-6">
      <h2 className="font-display text-lg text-foreground mb-4">Why wines get binned</h2>

      {reasons.length > 0 && (
        <ul className="space-y-2">
          {reasons.map((r) => (
            <li key={r.code} className="flex items-center gap-3">
              <span className="text-sm text-foreground flex-1 min-w-0 truncate">{r.label}</span>
              {/* Thin amber bar sized to this reason's share of the most-cited one. */}
              <span className="hidden sm:block h-1 w-32 rounded-full bg-border overflow-hidden shrink-0">
                <span
                  className="block h-full bg-accent"
                  style={{ width: `${Math.max(6, Math.round((r.count / max) * 100))}%` }}
                />
              </span>
              <span className="text-sm text-muted tabular-nums w-8 text-right shrink-0">{r.count}</span>
            </li>
          ))}
        </ul>
      )}

      {notes.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {notes.map((n, i) => (
            <li key={i} className="text-sm italic text-muted leading-relaxed">
              “{n.note}”
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted mt-4">Applied to the last 3 batches</p>
    </div>
  );
}
