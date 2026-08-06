"use client";

import { useEffect, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// BinFixProposalsSection — the "Root-cause fixes" card on /admin (migration 042).
//
// The miner clusters recurring bin reasons and proposes one mechanical fix per cluster. Each
// proposal card shows the theme, its evidence weight, and the build brief; the admin either
// dispatches it (PR-gated auto-feedback Action — never auto-merged) or rejects it. Loading this
// section also reconciles in-flight fix PRs, so a merged fix flips to "shipped" here and its
// evidence rows leave the generation-prompt feeds (codify-and-retire).
//
// Cellar styling: bordered flat card, Fraunces display title, amber reserved for the primary action.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

interface Proposal {
  id: number;
  theme: string;
  kind: string;
  paper: number | null;
  evidenceItemIds: string[];
  proposal: string;
  status: string;
  prUrl: string | null;
  applyError: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  proposed: "Awaiting your review",
  dispatched: "Building…",
  pr_opened: "PR awaiting review",
  merged: "Merged — retiring reasons",
  shipped: "Shipped — reasons retired",
  pr_closed: "PR closed unmerged",
  rejected: "Rejected",
  failed: "Build failed",
};

export function BinFixProposalsSection() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<number | "mine" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const fetchProposals = async (): Promise<Proposal[] | null> => {
    try {
      const res = await fetch("/api/admin/bin/fixes", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return Array.isArray(data.proposals) ? data.proposals : [];
    } catch {
      return null; /* transient — the card just stays hidden */
    }
  };

  const load = async () => {
    const rows = await fetchProposals();
    if (rows) setProposals(rows);
    setLoaded(true);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await fetchProposals();
      if (!alive) return;
      if (rows) setProposals(rows);
      setLoaded(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const mine = async () => {
    setBusy("mine");
    setNote(null);
    try {
      const res = await fetch("/api/admin/bin/fixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mine" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const n = Array.isArray(data.created) ? data.created.length : 0;
        setNote(
          data.status === "nothing_to_mine"
            ? "Not enough live bin reasons to mine yet."
            : n === 0
              ? "No new recurring clusters found."
              : `${n} new proposal${n === 1 ? "" : "s"}.`
        );
        await load();
      } else {
        setNote("Mining failed — try again.");
      }
    } catch {
      setNote("Mining failed — try again.");
    } finally {
      setBusy(null);
    }
  };

  const act = async (proposalId: number, action: "dispatch" | "reject") => {
    setBusy(proposalId);
    try {
      const res = await fetch("/api/admin/bin/fixes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, proposalId }),
      });
      if (res.ok) await load();
    } catch {
      /* leave the card; the admin can retry */
    } finally {
      setBusy(null);
    }
  };

  // Hide entirely until there is something to show — but once loaded, an empty state with the Mine
  // button is still useful, so only hide pre-load.
  if (!loaded) return null;

  const open = proposals.filter((p) => !["rejected", "shipped"].includes(p.status));
  const closed = proposals.filter((p) => ["rejected", "shipped"].includes(p.status)).slice(0, 5);

  return (
    <div className="rounded-xl border border-border bg-card p-6 mb-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg text-foreground">Root-cause fixes</h2>
        <button
          onClick={mine}
          disabled={busy === "mine"}
          className="text-xs px-2.5 py-1 rounded-md border border-border text-accent hover:bg-card-hover disabled:opacity-50"
        >
          {busy === "mine" ? "Mining…" : "Mine now"}
        </button>
      </div>
      <p className="text-xs text-muted mb-4">
        Recurring bin reasons, clustered into one mechanical fix each. Dispatching opens a PR for your
        review — when it merges, those reasons retire from generation guidance for good.
      </p>
      {note && <p className="text-xs text-muted mb-3">{note}</p>}

      {open.length === 0 && closed.length === 0 && (
        <p className="text-sm text-muted">No proposals yet — the nightly miner (or Mine now) fills this in.</p>
      )}

      {open.length > 0 && (
        <ul className="space-y-3">
          {open.map((p) => (
            <li key={p.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="text-sm text-foreground font-medium">{p.theme}</span>
                <span className="text-xs text-muted shrink-0">
                  {p.paper ? `Paper ${p.paper}` : "Cross-paper"} · {p.kind} ·{" "}
                  <span className="tabular-nums">{p.evidenceItemIds.length}</span> bins
                </span>
                <span className="text-xs text-borderline shrink-0">{STATUS_LABELS[p.status] || p.status}</span>
              </div>
              <p className="text-xs text-muted leading-relaxed line-clamp-3 mb-2">{p.proposal}</p>
              {p.applyError && <p className="text-xs text-fail mb-2">{p.applyError}</p>}
              <div className="flex items-center gap-2">
                {["proposed", "failed", "pr_closed"].includes(p.status) && (
                  <>
                    <button
                      onClick={() => act(p.id, "dispatch")}
                      disabled={busy === p.id}
                      className="text-xs px-2.5 py-1 rounded-md border border-border text-accent hover:bg-card-hover disabled:opacity-50"
                    >
                      Dispatch fix
                    </button>
                    {p.status === "proposed" && (
                      <button
                        onClick={() => act(p.id, "reject")}
                        disabled={busy === p.id}
                        className="text-xs px-2.5 py-1 rounded-md border border-border text-muted hover:bg-card-hover disabled:opacity-50"
                      >
                        Reject
                      </button>
                    )}
                  </>
                )}
                {p.prUrl && (
                  <a
                    href={p.prUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-accent hover:text-accent-hover underline underline-offset-2"
                  >
                    View PR
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {closed.length > 0 && (
        <ul className="mt-3 space-y-1">
          {closed.map((p) => (
            <li key={p.id} className="text-xs text-muted truncate">
              {p.status === "shipped" ? "✓" : "—"} {p.theme} · {STATUS_LABELS[p.status] || p.status}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
