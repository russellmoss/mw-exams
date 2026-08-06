"use client";

import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// WhyBinnedSection — the "Why wines get binned" learning-loop card on /admin (spec).
//
// A bordered flat Cellar card with a Fraunces title, a list of reason label + count each drawn with a
// thin amber bar sized to its share of the top reason (relative volume), then the most recent reviewer
// notes quoted in muted italic, and a caption. Reads the aggregation the /api/admin/bin/lessons GET
// route now returns (reason_codes counts + 3 recent notes over the last N batches). Renders nothing
// until there is at least one reason, note, or challenge, so a fresh install shows no empty card.
//
// Pushback (migration 041): reasoned bins the adjudication check judged INVALID surface here as
// challenge cards — the reason is being withheld from generation guidance until the admin decides:
// "Restore question" (agree with the challenge → unbin, back to the review queue) or "Uphold bin"
// (override it → the bin stands and the reason feeds forward again).
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
interface ChallengedRow {
  itemId: string;
  paper: number;
  stem: string;
  reasonLabels: string[];
  note: string | null;
  analysis: string | null;
  binnedAt: string;
}

export function WhyBinnedSection() {
  const [reasons, setReasons] = useState<ReasonRow[]>([]);
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [challenged, setChallenged] = useState<ChallengedRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Rebuttal (migration 043): which card has its rebuttal box open, its draft text, and the
  // one-line outcome note shown after a re-adjudication that did NOT withdraw the challenge.
  const [rebutId, setRebutId] = useState<string | null>(null);
  const [rebutText, setRebutText] = useState("");
  const [rebutNotes, setRebutNotes] = useState<Record<string, string>>({});

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
        setChallenged(Array.isArray(data.challenged) ? data.challenged : []);
      } catch {
        /* transient — the card just stays hidden */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Agree with the challenge: unbin — the question returns to the review queue, the ledger row (and
  // with it the challenged reason) is dropped.
  const restore = async (itemId: string) => {
    setBusyId(itemId);
    try {
      const res = await fetch(`/api/admin/bank/item/${encodeURIComponent(itemId)}/bin`, {
        method: "DELETE",
      });
      if (res.ok) setChallenged((cur) => cur.filter((c) => c.itemId !== itemId));
    } catch {
      /* leave the card; the admin can retry */
    } finally {
      setBusyId(null);
    }
  };

  // Answer the challenge with clarifying information: the system re-adjudicates. A verdict of
  // valid/uncertain withdraws the challenge (card disappears — the reason feeds forward again);
  // invalid keeps the card with the fresh analysis so the admin can still restore or uphold.
  const rebut = async (itemId: string) => {
    const text = rebutText.trim();
    if (!text) return;
    setBusyId(itemId);
    try {
      const res = await fetch("/api/admin/bin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action: "rebut", rebuttal: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.changed) {
        if (data.withdrawn) {
          setChallenged((cur) => cur.filter((c) => c.itemId !== itemId));
          setRebutNotes((cur) => ({ ...cur, [itemId]: "" }));
        } else {
          setChallenged((cur) =>
            cur.map((c) => (c.itemId === itemId && data.analysis ? { ...c, analysis: data.analysis } : c))
          );
          setRebutNotes((cur) => ({
            ...cur,
            [itemId]: "Re-reviewed with your rebuttal — the challenge still stands (updated analysis above).",
          }));
        }
        setRebutId(null);
        setRebutText("");
      } else if (res.ok) {
        // Row left 'invalid' some other way (restored/upheld elsewhere) — just drop the card.
        setChallenged((cur) => cur.filter((c) => c.itemId !== itemId));
      }
    } catch {
      /* leave the card; the admin can retry */
    } finally {
      setBusyId(null);
    }
  };

  // Override the challenge: the bin stands and the reason re-enters the prompt feeds.
  const uphold = async (itemId: string) => {
    setBusyId(itemId);
    try {
      const res = await fetch("/api/admin/bin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId, action: "uphold" }),
      });
      if (res.ok) setChallenged((cur) => cur.filter((c) => c.itemId !== itemId));
    } catch {
      /* leave the card; the admin can retry */
    } finally {
      setBusyId(null);
    }
  };

  if (reasons.length === 0 && notes.length === 0 && challenged.length === 0) return null;

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

      {challenged.length > 0 && (
        <div className="mt-5 pt-5 border-t border-border">
          <h3 className="text-sm font-medium text-foreground mb-1">Pushback</h3>
          <p className="text-xs text-muted mb-3">
            These bin reasons were checked against the past papers and didn&apos;t hold up. The bins
            stand, but the reasons are held out of question-generation guidance until you decide.
          </p>
          <ul className="space-y-3">
            {challenged.map((c) => (
              <li key={c.itemId} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-borderline font-medium shrink-0">Reason challenged</span>
                  <span className="text-xs text-muted shrink-0">Paper {c.paper}</span>
                  {c.reasonLabels.length > 0 && (
                    <span className="text-xs text-muted truncate">{c.reasonLabels.join(", ")}</span>
                  )}
                </div>
                {c.stem && (
                  <p className="text-sm text-foreground leading-relaxed line-clamp-2 mb-1.5">{c.stem}</p>
                )}
                {c.note && (
                  <p className="text-sm italic text-muted leading-relaxed mb-1.5">“{c.note}”</p>
                )}
                {c.analysis && (
                  <p className="text-xs text-muted leading-relaxed mb-2.5">{c.analysis}</p>
                )}
                {rebutNotes[c.itemId] && (
                  <p className="text-xs text-borderline leading-relaxed mb-2.5">{rebutNotes[c.itemId]}</p>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => restore(c.itemId)}
                    disabled={busyId === c.itemId}
                    className="text-xs px-2.5 py-1 rounded-md border border-border text-foreground hover:bg-card-hover disabled:opacity-50"
                  >
                    Restore question
                  </button>
                  <button
                    onClick={() => uphold(c.itemId)}
                    disabled={busyId === c.itemId}
                    className="text-xs px-2.5 py-1 rounded-md border border-border text-muted hover:bg-card-hover disabled:opacity-50"
                  >
                    Uphold bin
                  </button>
                  <button
                    onClick={() => {
                      setRebutId(rebutId === c.itemId ? null : c.itemId);
                      setRebutText("");
                    }}
                    disabled={busyId === c.itemId}
                    className="text-xs px-2.5 py-1 rounded-md border border-border text-muted hover:bg-card-hover disabled:opacity-50"
                  >
                    Rebut
                  </button>
                </div>
                {rebutId === c.itemId && (
                  <div className="mt-2.5">
                    <textarea
                      value={rebutText}
                      onChange={(e) => setRebutText(e.target.value)}
                      maxLength={1000}
                      rows={3}
                      placeholder="Add the clarifying information the review missed — it will re-adjudicate with this in hand."
                      className="w-full text-sm bg-background border border-border rounded-md p-2 text-foreground placeholder:text-muted focus:outline-none focus:border-accent"
                    />
                    <div className="flex items-center gap-2 mt-1.5">
                      <button
                        onClick={() => rebut(c.itemId)}
                        disabled={busyId === c.itemId || !rebutText.trim()}
                        className="text-xs px-2.5 py-1 rounded-md border border-border text-accent hover:bg-card-hover disabled:opacity-50"
                      >
                        {busyId === c.itemId ? "Re-reviewing…" : "Send rebuttal"}
                      </button>
                      <span className="text-xs text-muted">
                        If it answers the challenge, the reason is reinstated automatically.
                      </span>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
