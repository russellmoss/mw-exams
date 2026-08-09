"use client";

import { useCallback, useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// RoleRulingsSection — the "Banker / curveball rulings" card on /admin (migration 069).
//
// The loop, end to end, in the order the buttons appear:
//
//   1. A reviewer flips a wine's role chip on /review. The claim lands here as PENDING.
//   2. ADJUDICATE rules on the pending claims against the ten-year corpus and the current
//      calibration. It is expected to OVERRULE some of them — the upheld:overruled ratio is shown
//      because a run that upholds everything has adjudicated nothing.
//   3. CODIFY opens one PR carrying every upheld ruling into data/banker_signals.json. One PR, not
//      one per ruling: two rulings from the same pass can contradict each other and that is only
//      visible when they are read together.
//   4. SWEEP re-checks the servable bank under the new calibration and queues the questions it now
//      rejects, naming the slot to blame.
//   5. REPAIR swaps the wine and rebuilds the question, then puts it back in front of both reviewers.
//      This is the only step that costs real money, so it is capped and never fires by itself.
//
// Cellar styling: bordered flat card, Fraunces display title, amber reserved for the primary action.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

interface Ruling {
  id: number;
  questionId: string;
  slot: number;
  reviewerName: string | null;
  wineLabel: string | null;
  variety: string | null;
  region: string | null;
  country: string | null;
  keyedRole: string;
  claimedRole: string;
  verdict: string;
  rationale: string | null;
  proposedEdit: string | null;
  targetSignal: string | null;
  targetSignalDescription?: string | null;
  prUrl: string | null;
  codifiedAt: string | null;
  createdAt: string;
}

interface Repair {
  id: number;
  question_id: string;
  slot: number;
  wine_before: string | null;
  wine_after: string | null;
  status: string;
  error_message: string | null;
  paper: number | null;
  family: string | null;
}

interface Payload {
  pending: Ruling[];
  decided: Ruling[];
  codifiable: Ruling[];
  conflicts: { signal: string; rulingIds: number[] }[];
  repairs: Repair[];
  counts: Record<string, number>;
  maxRepairBatch: number;
}

const VERDICT_TONE: Record<string, string> = {
  upheld: "text-success",
  overruled: "text-muted",
  inconclusive: "text-borderline",
  pending: "text-accent",
};

const REPAIR_LABELS: Record<string, string> = {
  queued: "Queued",
  applied: "Repaired — back with the reviewers",
  failed: "Repair failed",
  skipped: "Skipped",
};

function wineLine(r: Ruling): string {
  const resolved = [r.variety, r.region, r.country].filter(Boolean).join(" · ");
  return r.wineLabel ? `${r.wineLabel}${resolved ? ` — ${resolved}` : ""}` : resolved || "(wine unavailable)";
}

export function RoleRulingsSection() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRepairs, setSelectedRepairs] = useState<number[]>([]);

  // Promise-callback style rather than async/await, matching /review's loadQueue and for the same
  // reason: every setState then lands in a `.then`, which keeps it out of the synchronous effect tick
  // that React — and the react-hooks/set-state-in-effect lint rule — objects to. An `await` here reads
  // identically and fails CI.
  const load = useCallback(
    () =>
      fetch("/api/admin/role-rulings", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((json) => {
          if (json) setData(json);
        })
        .catch(() => {
          /* transient — the card just stays as it was */
        }),
    []
  );

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(action);
    setError(null);
    setNote(null);
    try {
      const res = await fetch("/api/admin/role-rulings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      if (action === "adjudicate") {
        const upheld = (json.adjudicated ?? []).filter((a: { verdict: string }) => a.verdict === "upheld").length;
        setNote(
          `Ruled on ${json.adjudicated?.length ?? 0} of ${json.considered} claim(s): ${upheld} upheld, ` +
            `${(json.adjudicated?.length ?? 0) - upheld} not. ${json.note ?? ""}`
        );
      } else if (action === "codify") {
        setNote(
          json.dispatched
            ? `PR dispatched on ${json.workBranch} carrying ${json.rulingIds.length} ruling(s). It is PR-gated — review and merge it, then sweep.`
            : `Nothing to codify (${json.reason}).`
        );
      } else if (action === "sweep") {
        setNote(
          `Scanned ${json.scanned} servable questions. ${json.blocking} broken (queued), ` +
            `${json.advisory} advisory — a curveball-heavy flight the real exam sets about one time ` +
            `in twenty, so those are left for you to judge rather than queued. ` +
            `${json.queued} queued${json.alreadyQueued ? `, ${json.alreadyQueued} already there` : ""}.`
        );
      } else if (action === "repair") {
        const applied = (json.outcomes ?? []).filter((o: { status: string }) => o.status === "applied").length;
        const failed = (json.outcomes ?? []).filter((o: { status: string }) => o.status === "failed").length;
        setNote(
          `${applied} repaired and sent back for review, ${failed} failed the validator (unchanged).` +
            (json.capped ? ` Batch capped at ${data?.maxRepairBatch}.` : "")
        );
        setSelectedRepairs([]);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  };

  // Hidden entirely until there is something to act on — the loop is dormant most of the time and an
  // empty card on a busy admin page is just noise.
  if (!data) return null;
  const anything =
    data.pending.length > 0 || data.decided.length > 0 || data.repairs.length > 0;
  if (!anything) return null;

  const queued = data.repairs.filter((r) => r.status === "queued");

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg text-foreground">Banker / curveball rulings</h2>
        <p className="text-xs text-muted">
          {/* The ratio, stated up front. It is the only evidence this loop adjudicates rather than
              rubber-stamps one expert's recall of the corpus. */}
          {data.counts.upheld ?? 0} upheld · {data.counts.overruled ?? 0} overruled ·{" "}
          {data.counts.inconclusive ?? 0} inconclusive · {data.counts.pending ?? 0} pending
        </p>
      </div>

      {note && <p className="mt-3 rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-foreground">{note}</p>}
      {error && <p className="mt-3 rounded-lg border border-fail/40 bg-fail/5 px-3 py-2 text-xs text-fail">{error}</p>}

      {/* ── 1. Pending claims ───────────────────────────────────────────────────────────────────── */}
      {data.pending.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-foreground">
              {data.pending.length} claim{data.pending.length === 1 ? "" : "s"} awaiting adjudication
            </h3>
            <button
              type="button"
              onClick={() => act("adjudicate", { limit: 10 })}
              disabled={busy !== null}
              className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-40 cursor-pointer"
            >
              {busy === "adjudicate" ? "Ruling…" : "Adjudicate (up to 10)"}
            </button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {data.pending.slice(0, 10).map((r) => (
              <li key={r.id} className="text-xs leading-relaxed text-muted">
                <span className="text-foreground">{wineLine(r)}</span> — system says{" "}
                <span className="font-medium">{r.keyedRole}</span>, {r.reviewerName ?? "reviewer"} says{" "}
                <span className="font-medium text-accent">{r.claimedRole}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 2. Upheld and awaiting codification ─────────────────────────────────────────────────── */}
      {data.codifiable.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium text-foreground">
              {data.codifiable.length} upheld ruling{data.codifiable.length === 1 ? "" : "s"} not yet in the calibration
            </h3>
            <button
              type="button"
              onClick={() => act("codify")}
              disabled={busy !== null}
              className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-40 cursor-pointer"
            >
              {busy === "codify" ? "Dispatching…" : "Open the PR"}
            </button>
          </div>
          {data.conflicts.length > 0 && (
            <p className="mt-2 rounded-lg border border-fail/40 bg-fail/5 px-3 py-2 text-xs text-fail">
              {data.conflicts.map((c) => (
                <span key={c.signal} className="block">
                  Rulings {c.rulingIds.join(", ")} pull signal <code>{c.signal}</code> in different
                  directions. Read them together before merging — the net edit is not something either
                  ruling asked for.
                </span>
              ))}
            </p>
          )}
          <ul className="mt-2 space-y-2">
            {data.codifiable.map((r) => (
              <li key={r.id} className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-foreground">{wineLine(r)}</p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {r.proposedEdit}
                  {r.targetSignal ? ` → ${r.targetSignal}` : ""}
                  {r.targetSignalDescription ? ` (${r.targetSignalDescription})` : ""}
                </p>
                {r.rationale && <p className="mt-1 text-[11px] leading-relaxed text-muted">{r.rationale}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 3. Sweep ────────────────────────────────────────────────────────────────────────────── */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <div>
          <h3 className="text-sm font-medium text-foreground">Sweep the bank</h3>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            Re-checks every servable question against the calibration as it stands right now. Run this
            after a codification PR has <em>merged and deployed</em> — before that, the new rule does
            not exist yet and the sweep will find nothing.
          </p>
        </div>
        <button
          type="button"
          onClick={() => act("sweep", { enqueue: true })}
          disabled={busy !== null}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-card-hover disabled:opacity-40 cursor-pointer"
        >
          {busy === "sweep" ? "Sweeping…" : "Sweep & queue repairs"}
        </button>
      </div>

      {/* ── 4. The repair queue ─────────────────────────────────────────────────────────────────── */}
      {data.repairs.length > 0 && (
        <div className="mt-5 border-t border-border pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-foreground">
                Repair queue — {queued.length} waiting
              </h3>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                Each repair is one full generation. Nothing is replaced unless the rebuilt question
                passes the validator with zero hard violations — a failed repair leaves the original
                exactly as it was.
              </p>
            </div>
            <button
              type="button"
              onClick={() => act("repair", { repairIds: selectedRepairs })}
              disabled={busy !== null || selectedRepairs.length === 0}
              className="rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-40 cursor-pointer"
            >
              {busy === "repair"
                ? "Repairing…"
                : `Repair ${selectedRepairs.length || ""} selected`.trim()}
            </button>
          </div>
          <ul className="mt-2 space-y-1.5">
            {data.repairs.slice(0, 25).map((r) => (
              <li key={r.id} className="flex items-start gap-2 rounded-lg border border-border px-3 py-2">
                {r.status === "queued" && (
                  <input
                    type="checkbox"
                    checked={selectedRepairs.includes(r.id)}
                    onChange={() =>
                      setSelectedRepairs((prev) =>
                        prev.includes(r.id)
                          ? prev.filter((x) => x !== r.id)
                          : prev.length >= (data.maxRepairBatch ?? 10)
                            ? prev
                            : [...prev, r.id]
                      )
                    }
                    className="mt-0.5 cursor-pointer"
                    aria-label={`Select repair for ${r.question_id}`}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground">
                    Wine {r.slot} · <span className="font-mono text-[11px] text-muted">{r.question_id}</span>
                  </p>
                  {r.wine_before && (
                    <p className="mt-0.5 truncate text-[11px] text-muted">
                      {r.wine_before}
                      {r.wine_after ? ` → ${r.wine_after}` : ""}
                    </p>
                  )}
                  <p className="mt-0.5 text-[11px] text-muted">
                    {REPAIR_LABELS[r.status] ?? r.status}
                    {r.error_message ? ` — ${r.error_message}` : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── 5. Decided ──────────────────────────────────────────────────────────────────────────── */}
      {data.decided.length > 0 && (
        <details className="mt-5 border-t border-border pt-4">
          <summary className="cursor-pointer text-sm font-medium text-foreground">
            Decided rulings ({data.decided.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {data.decided.map((r) => (
              <li key={r.id} className="rounded-lg border border-border px-3 py-2">
                <p className="text-xs text-foreground">
                  <span className={`font-semibold ${VERDICT_TONE[r.verdict] ?? ""}`}>{r.verdict}</span>{" "}
                  — {wineLine(r)}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {r.reviewerName ?? "Reviewer"} said {r.claimedRole}; system said {r.keyedRole}.
                </p>
                {r.rationale && <p className="mt-1 text-[11px] leading-relaxed text-muted">{r.rationale}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
