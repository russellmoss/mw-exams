"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

interface Wine {
  slot: number;
  fullText: string;
  appearance: string | null;
}
interface BankQuestion {
  questionId: string;
  paper: number;
  family: string;
  familyLabel: string;
  questionText: string;
  totalMarks: number;
  wines: Wine[];
  status: "pending" | "approved" | "rejected";
}
interface Batch {
  id: string;
  paper: number;
  status: "running" | "ready" | "cancelled" | "error";
  requested: number;
  generated: number;
  failed: number;
  replaceRejected: boolean;
  estCostUsd: number | null;
  actualCostUsd: number | null;
}

const PAPER_LABEL: Record<number, string> = { 1: "Paper 1", 2: "Paper 2", 3: "Paper 3" };

function LoadingDots({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex items-center gap-3 text-muted">
        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
        <span className="ml-2 text-sm">{label}</span>
      </div>
    </div>
  );
}

function BankReview() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  const [batchId, setBatchId] = useState<string | null>(searchParams.get("batch"));
  const [batch, setBatch] = useState<Batch | null>(null);
  const [questions, setQuestions] = useState<BankQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [noBatch, setNoBatch] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [replaceRejected, setReplaceRejected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) router.push("/");
  }, [authLoading, user, router]);

  // Resolve which batch to show: explicit ?batch, else the newest batch with questions to review.
  useEffect(() => {
    if (batchId) return;
    (async () => {
      try {
        const res = await fetch("/api/admin/bank/notifications");
        const data = await res.json();
        const first = (data.batches || [])[0];
        if (first) setBatchId(first.batchId);
        else setNoBatch(true);
      } catch {
        setNoBatch(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [batchId]);

  const fetchBatch = useCallback(async () => {
    if (!batchId) return;
    try {
      const res = await fetch(`/api/admin/bank/batch/${batchId}`);
      if (!res.ok) {
        setNoBatch(true);
        return;
      }
      const data = await res.json();
      setBatch(data.batch);
      setQuestions(data.questions || []);
      setReplaceRejected(!!data.batch?.replaceRejected);
    } catch {
      /* transient */
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    if (!batchId) return;
    fetchBatch();
  }, [batchId, fetchBatch]);

  // Poll every 3s while the run is still generating.
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (batch?.status === "running") {
      pollRef.current = setInterval(fetchBatch, 3000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [batch?.status, fetchBatch]);

  const markBusy = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const review = async (questionId: string, decision: "keep" | "bin" | "undo") => {
    markBusy(questionId, true);
    // Optimistic update.
    setQuestions((prev) =>
      prev.map((q) =>
        q.questionId === questionId
          ? { ...q, status: decision === "keep" ? "approved" : decision === "bin" ? "rejected" : "pending" }
          : q
      )
    );
    try {
      await fetch("/api/admin/bank/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, decision, batchId }),
      });
      await fetchBatch();
    } catch {
      await fetchBatch();
    } finally {
      markBusy(questionId, false);
    }
  };

  const keepAll = async () => {
    if (!batchId) return;
    setQuestions((prev) => prev.map((q) => (q.status === "pending" ? { ...q, status: "approved" } : q)));
    await fetch("/api/admin/bank/keep-all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId }),
    });
    await fetchBatch();
  };

  const toggleReplace = async () => {
    if (!batchId) return;
    const next = !replaceRejected;
    setReplaceRejected(next);
    await fetch("/api/admin/bank/set-replace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId, replaceRejected: next }),
    });
  };

  const generateAnother = async () => {
    if (!batch) return;
    const res = await fetch("/api/admin/bank/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paper: batch.paper, count: batch.requested, replaceRejected: false }),
    });
    const data = await res.json();
    if (data.batchId) {
      setBatch(null);
      setQuestions([]);
      setLoading(true);
      setBatchId(data.batchId);
      router.replace(`/admin/bank?batch=${data.batchId}`);
    }
  };

  if (authLoading || (loading && !batch && !noBatch)) {
    return <LoadingDots label="Loading…" />;
  }

  if (noBatch || (!batch && !loading)) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Fill the Bank</h1>
        <p className="text-sm text-muted mt-3">Nothing to review right now.</p>
        <Link
          href="/admin"
          className="inline-block mt-6 text-sm px-5 py-2.5 bg-accent hover:bg-accent-hover text-background rounded-lg transition-colors font-medium"
        >
          Back to Admin
        </Link>
      </div>
    );
  }

  if (!batch) return <LoadingDots label="Loading…" />;

  const pending = questions.filter((q) => q.status === "pending");
  const kept = questions.filter((q) => q.status === "approved");
  const binned = questions.filter((q) => q.status === "rejected");
  const done = batch.generated + batch.failed;
  const reviewedAll =
    batch.status !== "running" && pending.length === 0 && questions.length > 0;

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Fill the Bank</h1>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-accent/15 text-accent">
              {PAPER_LABEL[batch.paper]}
            </span>
            {batch.status === "running" ? (
              <span className="text-sm text-muted flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-accent streaming-dot" />
                Generating <span className="tabular-nums">{done} of {batch.requested}</span>…
              </span>
            ) : (
              <span className="text-sm text-muted tabular-nums">
                {questions.length} written · {kept.length + binned.length} reviewed
              </span>
            )}
          </div>
        </div>
        <Link href="/admin" className="shrink-0 text-sm text-muted hover:text-foreground transition-colors">
          ← Admin
        </Link>
      </div>

      {/* Controls */}
      {!reviewedAll && (
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <button
            onClick={keepAll}
            disabled={pending.length === 0}
            className="text-sm px-4 py-2 rounded-lg border border-border text-muted hover:text-foreground hover:border-muted transition-colors cursor-pointer disabled:opacity-40"
          >
            Keep all
          </button>
          <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
            <button
              onClick={toggleReplace}
              role="switch"
              aria-checked={replaceRejected}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                replaceRejected ? "bg-accent" : "bg-muted"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white ring-2 ring-background transition-transform ${
                  replaceRejected ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
            Replace anything I bin
          </label>
          <span className="text-xs text-muted ml-auto tabular-nums">
            {kept.length} kept · {binned.length} binned · {pending.length} to go
          </span>
        </div>
      )}

      {/* All-reviewed summary */}
      {reviewedAll && (
        <div className="rounded-xl border border-success/30 bg-success/5 p-6 text-center mb-6">
          <p className="text-lg font-bold text-foreground">
            All {questions.length} reviewed ·{" "}
            <span className="text-success">{kept.length} kept</span>,{" "}
            <span className="text-muted">{binned.length} binned</span>
          </p>
          <button
            onClick={generateAnother}
            className="inline-block mt-4 text-sm px-5 py-2.5 bg-accent hover:bg-accent-hover text-background rounded-lg transition-colors font-medium cursor-pointer"
          >
            Generate another {batch.requested}
          </button>
        </div>
      )}

      {/* Still generating and nothing reviewable yet */}
      {batch.status === "running" && questions.length === 0 && (
        <LoadingDots label="Writing your first questions…" />
      )}

      {/* Question stack */}
      <div className="flex flex-col gap-3">
        {questions.map((q) =>
          q.status === "pending" ? (
            <PendingCard
              key={q.questionId}
              q={q}
              busy={busy.has(q.questionId)}
              onKeep={() => review(q.questionId, "keep")}
              onBin={() => review(q.questionId, "bin")}
            />
          ) : q.status === "approved" ? (
            <KeptRow key={q.questionId} q={q} onUndo={() => review(q.questionId, "undo")} />
          ) : (
            <BinnedRow key={q.questionId} q={q} onUndo={() => review(q.questionId, "undo")} />
          )
        )}
      </div>
    </div>
  );
}

function FamilyBadge({ label }: { label: string }) {
  return (
    <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-card-hover text-muted border border-border">
      {label}
    </span>
  );
}

function PendingCard({
  q,
  busy,
  onKeep,
  onBin,
}: {
  q: BankQuestion;
  busy: boolean;
  onKeep: () => void;
  onBin: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-2 mb-3">
        <FamilyBadge label={q.familyLabel} />
        <span className="text-[11px] font-semibold uppercase px-2 py-0.5 rounded bg-accent/15 text-accent">
          {PAPER_LABEL[q.paper]}
        </span>
      </div>

      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{q.questionText}</p>

      <p className="text-xs text-muted mt-3 tabular-nums">
        {q.wines.length} wine{q.wines.length === 1 ? "" : "s"} · {q.totalMarks} marks (25 per wine)
      </p>

      <ul className="mt-3 space-y-1.5 border-t border-border/60 pt-3">
        {q.wines.map((w) => (
          <li key={w.slot} className="text-sm text-foreground/90 leading-relaxed">
            <span className="text-muted tabular-nums mr-2">{w.slot}.</span>
            {w.fullText}
            {w.appearance && <span className="block text-xs text-muted ml-6 mt-0.5">{w.appearance}</span>}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3 mt-5">
        <button
          onClick={onBin}
          disabled={busy}
          className="text-sm px-4 py-2 rounded-lg border border-fail/40 text-fail hover:bg-fail/10 transition-colors cursor-pointer disabled:opacity-50"
        >
          Bin
        </button>
        <button
          onClick={onKeep}
          disabled={busy}
          className="text-sm px-5 py-2 rounded-lg bg-accent hover:bg-accent-hover text-background font-medium transition-colors cursor-pointer disabled:opacity-50"
        >
          Keep
        </button>
      </div>
    </div>
  );
}

function KeptRow({ q, onUndo }: { q: BankQuestion; onUndo: () => void }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-2.5 flex items-center gap-3">
      <svg className="w-4 h-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-[11px] font-semibold uppercase text-muted shrink-0">{q.familyLabel}</span>
      <span className="text-sm text-foreground/80 truncate flex-1">{q.questionText}</span>
      <button
        onClick={onUndo}
        className="text-xs text-muted hover:text-foreground transition-colors cursor-pointer shrink-0"
      >
        Undo
      </button>
    </div>
  );
}

function BinnedRow({ q, onUndo }: { q: BankQuestion; onUndo: () => void }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-4 py-2.5 flex items-center gap-3 opacity-70">
      <span className="text-[11px] font-semibold uppercase text-muted shrink-0">{q.familyLabel}</span>
      <span className="text-sm text-muted line-through truncate flex-1">{q.questionText}</span>
      <button
        onClick={onUndo}
        className="text-xs text-accent hover:text-accent-hover transition-colors cursor-pointer shrink-0"
      >
        Undo
      </button>
    </div>
  );
}

export default function BankPage() {
  return (
    <Suspense fallback={<LoadingDots label="Loading…" />}>
      <BankReview />
    </Suspense>
  );
}
