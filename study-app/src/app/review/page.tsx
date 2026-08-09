"use client";

// /review — Question Review.
//
// A rapid, forward-only pass over the servable bank by the two reviewers who hold
// users.can_review_questions. One question at a time, thumbs up or thumbs down, countdown to zero.
//
// The two reviewers work BLIND: nothing on this page tells you how the other person voted on a
// question you haven't ruled on yet. That is deliberate — two independent expert judgements are
// worth much more than one judgement and one rubber stamp, and the split between them (the
// Disagreements tab, which only ever shows questions BOTH have already voted on) is the highest-
// signal output this surface produces.
//
// A rejection does not get a bespoke pipeline: it becomes a user_attempts row that the existing
// feedback loop adjudicates, so the verdict arrives in the notification bell and can be argued with
// in the same thread UI as any other feedback.
//
// The walk is GROUPED by paper × family — all of P1 F1, then all of P1 F2, through to P3 F7 — and
// stops on an interstitial at each block boundary. Judging whether a question is exam-realistic
// needs a settled frame of reference, and the frame is the paper and the family; being thrown from
// a Paper 1 same-variety flight to a Paper 3 fortified style question on consecutive cards costs a
// re-orientation every single time. The reviewer can narrow the scope or ask for a shuffle instead.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { QuestionReviewCard } from "../components/QuestionReviewCard";
import { ReviewBlockPicker } from "../components/ReviewBlockPicker";
import { ReviewBlockComplete } from "../components/ReviewBlockComplete";
// -shared, never question-review: that module reaches the database, and everything a "use client"
// file imports is bundled for the browser (tests/client-server-boundary.test.ts enforces this).
import {
  REVIEW_REASON_LABELS,
  DEFAULT_REVIEW_FILTER,
  type ReviewCard,
  type ReviewProgress,
  type ReviewerStanding,
  type ReviewFilter,
  type ReviewBlock,
  type Disagreement,
  type RoleOverride,
} from "@/lib/question-review-shared";

/** Refill the local buffer when it gets this short, so a vote never waits on the network. */
const PREFETCH_AT = 4;
const PAGE_SIZE = 12;

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="flex items-center gap-3 text-muted">
        <div className="h-2 w-2 rounded-full bg-accent/50 streaming-dot" />
        <div className="h-2 w-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
        <div className="h-2 w-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
        <span className="ml-2 text-sm">{label}</span>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [queue, setQueue] = useState<ReviewCard[]>([]);
  const [progress, setProgress] = useState<ReviewProgress | null>(null);
  const [standings, setStandings] = useState<ReviewerStanding[]>([]);
  const [filter, setFilter] = useState<ReviewFilter>(DEFAULT_REVIEW_FILTER);
  const [blocks, setBlocks] = useState<ReviewBlock[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  /** Set when a vote empties its block; cleared when the reviewer chooses to carry on. */
  const [blockDone, setBlockDone] = useState<ReviewBlock | null>(null);
  const [spendToday, setSpendToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  // The reject form lives here so the window-level ⌘/Ctrl+Enter shortcut can read it directly.
  const [rejectTags, setRejectTags] = useState<string[]>([]);
  const [rejectNote, setRejectNote] = useState("");
  // Per-wine banker/curveball corrections for the CURRENT card. Held here, not in the card, because
  // they ride along with every verdict — including an approve, which is fired by a window-level
  // keypress that never reaches the card's own state.
  const [roleOverrides, setRoleOverrides] = useState<RoleOverride[]>([]);
  const [tab, setTab] = useState<"queue" | "disagreements">("queue");
  const [disagreements, setDisagreements] = useState<Disagreement[] | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  // Guards against two overlapping refills appending the same cards twice.
  const fetching = useRef(false);

  const current = queue[0] ?? null;

  useEffect(() => {
    if (authLoading) return;
    if (!user) router.push("/login");
    // The link is hidden for everyone else, but a bookmarked URL isn't. The API refuses regardless;
    // this just avoids rendering an empty shell to someone who will never be allowed to use it.
    else if (!user.canReviewQuestions) router.push("/");
  }, [authLoading, user, router]);

  // Promise-callback style rather than async/await: every setState then lands in a `.then`, which
  // keeps it out of the synchronous effect tick React (and the lint rule) objects to.
  const loadQueue = useCallback((append = false) => {
    if (fetching.current) return;
    fetching.current = true;
    fetch(`/api/question-review/queue?limit=${PAGE_SIZE}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const incoming: ReviewCard[] = data.cards ?? [];
        setQueue((prev) => {
          if (!append) return incoming;
          // The server returns the next unvoted questions, which overlaps whatever is already
          // buffered locally. Merge by id and keep the existing order so the card on screen never
          // jumps out from under the reviewer mid-read.
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...incoming.filter((c) => !seen.has(c.id))];
        });
        setProgress(data.progress ?? null);
        setStandings(data.standings ?? []);
        setBlocks(data.blocks ?? []);
        if (data.filter) setFilter(data.filter);
        if (typeof data.spendToday === "number") setSpendToday(data.spendToday);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to load review queue:", err);
        setError("Couldn't load the review queue.");
      })
      .finally(() => {
        fetching.current = false;
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (user?.canReviewQuestions) loadQueue();
  }, [user?.canReviewQuestions, loadQueue]);

  // Keep the buffer topped up so casting a vote never waits on the network.
  useEffect(() => {
    if (!loading && queue.length > 0 && queue.length <= PREFETCH_AT) loadQueue(true);
  }, [queue.length, loading, loadQueue]);

  // A reason typed against one question must never carry over onto the next. Reset during render off
  // a previous-value marker, the same way NavBar closes its flyout on navigation — an effect would
  // show the next card with the last card's reason still in the box for a frame.
  const currentId = current?.id ?? null;
  const [lastCardId, setLastCardId] = useState(currentId);
  if (currentId !== lastCardId) {
    setLastCardId(currentId);
    setRejecting(false);
    setRejectTags([]);
    setRejectNote("");
    setRoleOverrides([]);
  }

  const vote = useCallback(
    async (verdict: "up" | "down" | "skip", tags: string[] = [], note = "") => {
      if (!current || busy) return;
      setBusy(true);
      const questionId = current.id;
      // Captured before the queue advances: this is the block the vote belongs to, and the one that
      // may have just run out.
      const votedBlock = { paper: current.paper, family: current.family };
      try {
        const res = await fetch("/api/question-review/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            questionId,
            verdict,
            tags,
            note,
            // The buffer rides along so the server can say which of these have stopped being servable
            // since they were fetched. The corpus is being fixed WHILE the reviewer works — by these
            // very votes — so a card retired ten seconds ago would otherwise still be dealt to them.
            buffered: queue.map((c) => c.id),
            roleOverrides,
            // Sent so a dispute can name the bottle in the feedback text and in the ruling row. The
            // server never trusts these for anything that decides an outcome — it re-reads the wines
            // from the question and joins on the slot.
            wines: current.wines.map((w) => ({
              slot: w.slot,
              label: w.text,
              variety: w.variety,
              region: w.region,
              country: w.country,
            })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);

        // Advance optimistically — the server has the vote, so the reviewer should not wait — and
        // drop anything the corpus retired underneath us in the same pass.
        const drop = new Set<string>([questionId, ...((data.drop as string[]) ?? [])]);
        setQueue((prev) => prev.filter((c) => !drop.has(c.id)));
        const retired = ((data.drop as string[]) ?? []).length;
        setRejecting(false);
        if (data.progress) setProgress(data.progress);
        if (typeof data.spendToday === "number") setSpendToday(data.spendToday);

        const nextBlocks: ReviewBlock[] = data.blocks ?? [];
        if (nextBlocks.length > 0) setBlocks(nextBlocks);
        // Did that vote finish the block? Only meaningful in the grouped walk — in shuffled mode the
        // blocks aren't a sequence, so stopping at one of their boundaries would be arbitrary.
        if (filter.order === "grouped") {
          const finished = nextBlocks.find(
            (b) => b.paper === votedBlock.paper && b.family === votedBlock.family && b.remaining === 0
          );
          if (finished) setBlockDone(finished);
        }
        // Naming the retirements matters: without it, cards silently vanishing from the buffer reads
        // as a bug. It is the opposite — it is the queue getting better underneath them.
        const retiredNote =
          retired > 0
            ? ` ${retired} more question${retired === 1 ? "" : "s"} left the queue — retired by a fix since you started.`
            : "";
        const roleNote =
          roleOverrides.length > 0
            ? ` ${roleOverrides.length} role ${roleOverrides.length === 1 ? "ruling" : "rulings"} filed.`
            : "";
        setFlash(
          (verdict === "down"
            ? "Rejected — analysing now. The verdict will arrive in your notifications, where you can argue with it."
            : verdict === "up"
              ? "Approved — recorded as a generation exemplar."
              : "Skipped.") +
            roleNote +
            retiredNote
        );
        setRoleOverrides([]);
        setError(null);
      } catch (err) {
        console.error("Vote failed:", err);
        setError(err instanceof Error ? err.message : "Couldn't record that vote.");
      } finally {
        setBusy(false);
      }
    },
    // `queue` is read to send the buffer for reconciliation, and `roleOverrides` to send the
    // disputes — without either, the request would carry whatever they were when this callback was
    // last built.
    [current, busy, filter.order, queue, roleOverrides]
  );

  /**
   * Flip one wine's role, or take the dispute back.
   *
   * `keyed` is the role AS SHOWN when the reviewer clicked, and it is stored on the override rather
   * than re-derived at submit time. The claim being recorded is "the system called this X and I say
   * Y" — re-deriving X later, after a ruling has changed the calibration, would rewrite what the
   * reviewer actually disagreed with.
   */
  const toggleRole = useCallback((slot: number, keyed: "banker" | "curveball") => {
    setRoleOverrides((prev) =>
      prev.some((o) => o.slot === slot)
        ? prev.filter((o) => o.slot !== slot)
        : [
            ...prev,
            {
              slot,
              keyed,
              reviewer: (keyed === "banker" ? "curveball" : "banker") as RoleOverride["reviewer"],
            },
          ].sort((a, b) => a.slot - b.slot)
    );
  }, []);

  /**
   * Save a new selection and swap in the freshly-scoped queue from the same response.
   *
   * Persisted server-side rather than in component state alone: a 511-question pass is not a
   * one-sitting job, and resuming on another device should continue the same walk.
   */
  const applyFilter = useCallback((next: ReviewFilter) => {
    setBusy(true);
    fetch("/api/question-review/prefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data.filter) setFilter(data.filter);
        setBlocks(data.blocks ?? []);
        setQueue(data.cards ?? []);
        if (data.progress) setProgress(data.progress);
        // A scope change invalidates any pending block-complete card — it referred to the old walk.
        setBlockDone(null);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to save the selection:", err);
        setError("Couldn't save that selection.");
      })
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  // Keyboard shortcuts. At ~500 questions each, fifteen seconds saved per card is over two hours.
  useEffect(() => {
    if (tab !== "queue") return;

    // The block-complete card owns the keyboard while it is up: Enter carries on to the next block.
    // The voting keys must NOT be live here — the reviewer is looking at a summary, not a question,
    // and a stray "a" would silently approve the first card of the next block sight unseen.
    if (blockDone) {
      const onKey = (e: KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); setBlockDone(null); }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }

    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);

      if (rejecting) {
        // Inside the reason box only the two commit keys are live — every other keystroke is prose.
        if (e.key === "Escape") { e.preventDefault(); setRejecting(false); }
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          if (rejectNote.trim()) vote("down", rejectTags, rejectNote.trim());
        }
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "a") { e.preventDefault(); vote("up"); }
      else if (e.key === "r") { e.preventDefault(); setRejecting(true); }
      else if (e.key === "s") { e.preventDefault(); vote("skip"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, current, rejecting, rejectTags, rejectNote, vote, blockDone]);

  const loadDisagreements = useCallback(() => {
    fetch("/api/question-review/disagreements")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => setDisagreements(data.disagreements ?? []))
      .catch((err) => {
        console.error("Failed to load disagreements:", err);
        setDisagreements([]);
      });
  }, []);

  useEffect(() => {
    if (tab === "disagreements" && disagreements === null) loadDisagreements();
  }, [tab, disagreements, loadDisagreements]);

  const pct = useMemo(() => {
    if (!progress || progress.total === 0) return 0;
    return Math.round((progress.done / progress.total) * 100);
  }, [progress]);

  /** The block the card on screen belongs to — drives the header and the walk's "you are here". */
  const currentBlock = useMemo(() => {
    if (!current) return null;
    return blocks.find((b) => b.paper === current.paper && b.family === current.family) ?? null;
  }, [current, blocks]);

  /** The next block with anything left in it, for the completion card's "next up". */
  const nextBlock = useMemo(() => {
    if (!blockDone) return null;
    const i = blocks.findIndex((b) => b.paper === blockDone.paper && b.family === blockDone.family);
    return blocks.slice(i + 1).find((b) => b.remaining > 0) ?? null;
  }, [blockDone, blocks]);

  if (authLoading || (loading && queue.length === 0 && !error)) {
    return (
      <main className="flex-1">
        <div className="mx-auto max-w-4xl px-6 py-20">
          <Spinner label="Loading the review queue…" />
        </div>
      </main>
    );
  }
  if (!user?.canReviewQuestions) return null;

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* ── Header + countdown ─────────────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h1 className="font-display text-2xl font-bold text-foreground">Question Review</h1>
            {progress && (
              <p className="text-sm text-muted">
                <span className="tabular-nums font-semibold text-foreground">{progress.done}</span>
                {" done · "}
                <span className="tabular-nums font-semibold text-accent">{progress.remaining}</span>
                {" to go"}
                <span className="text-muted/60"> · {progress.total} total</span>
              </p>
            )}
          </div>

          {progress && (
            <>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border/50">
                <div
                  className="h-full rounded-full bg-accent transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="text-success">{progress.up} approved</span>
                <span className="text-fail">{progress.down} rejected</span>
                <span>{progress.skipped} skipped</span>
                {/* Every rejection is one immediate Opus analysis. Cost stays visible while you work. */}
                {spendToday > 0 && (
                  <span
                    className="ml-auto tabular-nums"
                    title="Your total feedback-analysis spend since 00:00 UTC — every rejection here, plus any feedback you left elsewhere in the app today. Measured at roughly $1.58 per rejection. Voice narration is billed separately and not included."
                  >
                    ~${spendToday.toFixed(2)} analysis spend today
                  </span>
                )}
              </div>
            </>
          )}

          {/* Both reviewers' countdowns. Counts only — never who voted which way on what, so seeing
              this can't anchor a verdict you haven't cast. */}
          {standings.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-muted">
              {standings.map((s) => (
                <span key={s.reviewerId}>
                  <span className="text-foreground">{s.name}</span>{" "}
                  <span className="tabular-nums">{s.done}</span> done,{" "}
                  <span className="tabular-nums">{s.remaining}</span> left
                </span>
              ))}
            </div>
          )}
        </div>

        {/* ── Tabs ───────────────────────────────────────────────────────────────────────────── */}
        <div className="mb-5 flex gap-1 border-b border-border">
          {(["queue", "disagreements"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
                tab === t
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-foreground"
              }`}
            >
              {t === "queue" ? "Queue" : "Disagreements"}
              {t === "disagreements" && disagreements && disagreements.length > 0 && (
                <span className="ml-1.5 tabular-nums text-xs">({disagreements.length})</span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-fail/30 bg-fail/10 px-4 py-2.5 text-sm text-fail">
            {error}
          </div>
        )}
        {flash && (
          <div className="mb-4 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-accent">
            {flash}
          </div>
        )}

        {tab === "queue" && (
          <ReviewBlockPicker
            filter={filter}
            blocks={blocks}
            currentBlock={currentBlock}
            open={pickerOpen}
            busy={busy}
            onToggleOpen={() => setPickerOpen((v) => !v)}
            onChange={applyFilter}
          />
        )}

        {/* Where you are in the current block. The whole reason for grouping is that this stays put
            for a stretch, so it is stated plainly above the card rather than left to the chips. */}
        {tab === "queue" && !blockDone && currentBlock && filter.order === "grouped" && (
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg text-foreground">
              Paper {currentBlock.paper} · {currentBlock.familyLabel}
            </h2>
            <p className="text-xs text-muted tabular-nums">
              {currentBlock.done + 1} of {currentBlock.total} in this block ·{" "}
              {currentBlock.remaining} left
            </p>
          </div>
        )}

        {tab === "queue" ? (
          blockDone ? (
            <ReviewBlockComplete
              completed={blockDone}
              tally={{ up: blockDone.up, down: blockDone.down, skipped: blockDone.skipped }}
              next={nextBlock}
              onContinue={() => setBlockDone(null)}
              onPick={() => {
                setBlockDone(null);
                setPickerOpen(true);
              }}
            />
          ) : current ? (
            <QuestionReviewCard
              card={current}
              rejecting={rejecting}
              tags={rejectTags}
              note={rejectNote}
              busy={busy}
              onToggleTag={(value) =>
                setRejectTags((prev) =>
                  prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value]
                )
              }
              onNoteChange={setRejectNote}
              roleOverrides={roleOverrides}
              onToggleRole={toggleRole}
              onOpenReject={() => setRejecting(true)}
              onCancelReject={() => setRejecting(false)}
              onApprove={() => vote("up")}
              onSkip={() => vote("skip")}
              onReject={() => vote("down", rejectTags, rejectNote.trim())}
            />
          ) : (
            // Two different endings, and conflating them would be a lie: finishing a narrowed
            // selection is not finishing the bank, and telling someone they're done when 400
            // questions are still waiting outside their filter is the worse error of the two.
            <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
              {progress && progress.remaining > 0 ? (
                <>
                  <p className="font-display text-xl text-foreground">Selection complete.</p>
                  <p className="mt-2 text-sm text-muted">
                    Nothing left in the papers and families you picked —{" "}
                    <span className="tabular-nums">{progress.remaining}</span> questions are still
                    waiting elsewhere in the bank.
                  </p>
                  <button
                    type="button"
                    onClick={() => applyFilter({ ...DEFAULT_REVIEW_FILTER })}
                    className="mt-4 rounded-lg border border-accent/40 bg-accent/15 px-5 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/25 cursor-pointer"
                  >
                    Review the rest
                  </button>
                </>
              ) : (
                <>
                  <p className="font-display text-xl text-foreground">
                    {progress && progress.done > 0 ? "That's the whole bank." : "Nothing to review."}
                  </p>
                  <p className="mt-2 text-sm text-muted">
                    {progress && progress.done > 0
                      ? `You've ruled on all ${progress.done}. New questions appear here as they're generated.`
                      : "No servable questions are waiting for your verdict."}
                  </p>
                </>
              )}
            </div>
          )
        ) : (
          <DisagreementList items={disagreements} />
        )}
      </div>
    </main>
  );
}

/**
 * Questions the two reviewers ruled on in opposite directions.
 *
 * This only ever contains questions BOTH have already voted on, so reading it can't anchor a vote
 * you haven't cast yet — which is what makes it safe to leave permanently available.
 */
function DisagreementList({ items }: { items: Disagreement[] | null }) {
  if (items === null) return <Spinner label="Loading disagreements…" />;
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card px-6 py-16 text-center">
        <p className="font-display text-xl text-foreground">No disagreements yet.</p>
        <p className="mt-2 text-sm text-muted">
          A question shows up here once both reviewers have voted on it and landed on opposite verdicts.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((d) => (
        <div key={d.questionId} className="rounded-xl border border-border bg-card p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-flex items-center rounded-md border border-accent/40 px-2 py-0.5 text-xs text-accent">
              Paper {d.paper}
            </span>
            <span className="font-mono text-[11px] text-muted">{d.questionId}</span>
          </div>
          <p className="mb-3 line-clamp-3 text-sm leading-relaxed text-foreground">{d.stem}</p>
          <div className="space-y-2 border-t border-border pt-3">
            {d.votes.map((v) => (
              <div key={v.reviewerId} className="text-xs">
                <span className={v.verdict === "up" ? "font-semibold text-success" : "font-semibold text-fail"}>
                  {v.reviewerName} · {v.verdict === "up" ? "approved" : "rejected"}
                </span>
                {v.tags && v.tags.length > 0 && (
                  <span className="ml-2 text-muted">
                    {v.tags.map((t) => REVIEW_REASON_LABELS[t] ?? t).join(", ")}
                  </span>
                )}
                {v.note && <p className="mt-1 leading-relaxed text-muted">{v.note}</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
