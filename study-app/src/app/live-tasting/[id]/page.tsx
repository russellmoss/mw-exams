"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useStreaming } from "@/lib/use-streaming";
import { StreamingFeedback } from "@/app/components/StreamingFeedback";
import { useDraft } from "@/lib/use-draft";
import { BLIND_INTEGRITY_LABEL, type Stockist } from "@/lib/live-tasting";

type SlotSummary = { slot: number; stockistCount: number; thin: boolean };
type SlotAvail = {
  slot: number; label: string; region: string; country: string;
  stockists: Stockist[]; thin: boolean;
};
type SessionDetail = {
  id: string;
  state: "shopping" | "tasted" | "abandoned";
  blindIntegrity: "partner" | "self" | "unopened";
  paper: number;
  flightSize: number;
  city: string;
  country: string;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  shareActive: boolean;
  question: { questionText: string; totalMarks: number };
  slotSummaries: SlotSummary[];
  reveal?: {
    wines: { slot: number; fullText: string }[];
    modelAnswer: string | null;
    availability: { archetypeLabel?: string; slots?: SlotAvail[] } | null;
    feedback: string | null;
    passEstimate: string | null;
    marksEstimate: string | null;
    userAnswer: string | null;
    preGlassReasoning: string | null;
  };
};

const KIND_LABEL: Record<string, string> = {
  local: "Local shop",
  state_store: "State store",
  mail: "Ships to you",
};
const CONFIDENCE_LABEL: Record<string, string> = {
  listed: "listed",
  likely: "likely stocks it",
  unverified: "unverified",
};

function StockistCard({ s }: { s: Stockist }) {
  return (
    <a
      href={s.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-background rounded-lg border border-border p-3 hover:border-muted transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
          <p className="text-xs text-muted mt-0.5">
            {KIND_LABEL[s.kind] ?? s.kind} · {CONFIDENCE_LABEL[s.confidence] ?? s.confidence}
            {" — call ahead / check the site"}
          </p>
        </div>
        {s.price != null && (
          <span className="shrink-0 text-sm text-foreground tabular-nums">
            {s.price} {s.currency ?? ""}
          </span>
        )}
      </div>
    </a>
  );
}

export default function LiveTastingSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [interstitial, setInterstitial] = useState(false);
  const [shopping, setShopping] = useState<{ archetypeLabel: string | null; slots: SlotAvail[]; bagging: string } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [tasting, setTasting] = useState(false);
  const [replacingSlot, setReplacingSlot] = useState<number | null>(null);
  const [preGlass, setPreGlass, clearPreGlass] = useDraft(`lt-preglass:${id}`);
  const [answer, setAnswer, clearAnswer] = useDraft(`lt-answer:${id}`);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const gradeStream = useStreaming();

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  const load = useCallback(() => {
    return fetch(`/api/live-tasting/${id}`)
      .then(async (res) => {
        if (res.status === 404) { setNotFound(true); return; }
        if (res.ok) setSession(await res.json());
      })
      .catch(() => { /* transient — user can reload */ });
  }, [id]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const revealShoppingList = async () => {
    setInterstitial(false);
    const res = await fetch(`/api/live-tasting/${id}/shopping`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      const slots = (data.availability?.slots ?? []) as SlotAvail[];
      setShopping({
        archetypeLabel: data.archetypeLabel ?? null,
        slots,
        bagging: data.baggingInstructions ?? "",
      });
      load(); // refresh the blind-integrity badge
    }
  };

  const mintShareLink = async () => {
    setShareBusy(true);
    try {
      const res = await fetch(`/api/live-tasting/${id}/share`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setShareUrl(data.url);
        load();
      }
    } finally {
      setShareBusy(false);
    }
  };

  const replaceSlotWine = async (slot: number) => {
    let confirm = false;
    for (;;) {
      setReplacingSlot(slot);
      try {
        const res = await fetch(`/api/live-tasting/${id}/replace-wine`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slot, ...(confirm ? { confirm: true } : {}) }),
        });
        if (res.status === 409) {
          const data = await res.json().catch(() => ({}));
          if (data.needsConfirm && !confirm) {
            const go = window.confirm(
              "Your partner may already be shopping from the shared list. Replacing this wine kills the old link — they'll need a fresh one. Continue?"
            );
            if (!go) return;
            confirm = true;
            continue;
          }
          setSubmitError(data.error || "Could not replace the wine.");
          return;
        }
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          setSubmitError(data.error || "Could not replace the wine.");
          return;
        }
        await res.text(); // drain the SSE progress stream
        setShopping(null); // stale list — force a fresh reveal
        setShareUrl(null);
        await load();
        return;
      } finally {
        setReplacingSlot(null);
      }
    }
  };

  const submitForGrading = async () => {
    if (!answer.trim()) return;
    setSubmitError(null);
    setTasting(true);
    try {
      await gradeStream.startStream(`/api/live-tasting/${id}/grade`, {
        userAnswer: answer,
        preGlassReasoning: preGlass || undefined,
        inputMethod: "typed",
      });
      clearAnswer();
      clearPreGlass();
      await load(); // → tasted state with the full reveal
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Grading failed — your answer is saved, try again.");
    } finally {
      setTasting(false);
    }
  };

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-sm text-muted">Session not found.</p>
        <Link href="/live-tasting" className="text-sm text-accent hover:text-accent-hover mt-2 inline-block">
          Back to Live Tasting
        </Link>
      </div>
    );
  }

  if (authLoading || !user || !session) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex items-center gap-3 text-muted">
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
          <span className="ml-2 text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  const grading = tasting || gradeStream.isStreaming;

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Live Tasting · Paper {session.paper}
            </h1>
            <p className="text-sm text-muted mt-1">
              {session.flightSize} wines · {session.city} · {session.question.totalMarks} marks
              {session.state === "tasted" && ` · ${BLIND_INTEGRITY_LABEL[session.blindIntegrity]}`}
            </p>
          </div>
          {session.state === "shopping" && (
            <button
              onClick={async () => {
                if (window.confirm("Abandon this session? The shopping list link stops working.")) {
                  await fetch(`/api/live-tasting/${id}/abandon`, { method: "POST" });
                  router.push("/live-tasting");
                }
              }}
              className="shrink-0 text-xs text-muted hover:text-fail transition-colors cursor-pointer"
            >
              Abandon
            </button>
          )}
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          {/* The question stem — visible in every state; it never names the wines. */}
          <section className="bg-card rounded-xl border border-border p-6">
            <h2 className="text-lg font-semibold text-foreground mb-3 font-display">The question</h2>
            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {session.question.questionText}
            </div>
          </section>

          {session.state === "shopping" && !grading && !gradeStream.text && (
            <>
              {/* Getting the wines */}
              <section className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-2 font-display">Get the wines</h2>
                <p className="text-sm text-muted mb-4">
                  {session.slotSummaries.length} wines are picked and checked against shops near{" "}
                  {session.city}
                  {session.slotSummaries.some((s) => s.thin)
                    ? " (some only by mail order)"
                    : ""}
                  . The list names the wines — so opening it yourself breaks the blind.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={mintShareLink}
                    disabled={shareBusy}
                    className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50"
                  >
                    {shareBusy ? "Creating link…" : "Share list with a partner"}
                  </button>
                  {!shopping && (
                    <button
                      onClick={() => setInterstitial(true)}
                      className="px-5 py-2.5 border border-border text-muted hover:text-foreground hover:border-muted font-medium rounded-lg transition-colors cursor-pointer"
                    >
                      Open it myself
                    </button>
                  )}
                </div>
                {shareUrl && (
                  <div className="mt-4 bg-background rounded-lg border border-border p-3">
                    <p className="text-xs text-muted mb-1.5">
                      Send this to whoever is buying — it shows the wines and stockists, never the
                      question or answers. It stops working once you&apos;re graded.
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-foreground font-mono truncate flex-1">{shareUrl}</code>
                      <button
                        onClick={() => navigator.clipboard?.writeText(shareUrl)}
                        className="shrink-0 text-xs text-accent hover:text-accent-hover cursor-pointer"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* The revealed shopping list (self-shop path) */}
              {shopping && (
                <section className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-1 font-display">Shopping list</h2>
                  {shopping.archetypeLabel && (
                    <p className="text-xs text-muted mb-4">{shopping.archetypeLabel}</p>
                  )}
                  <div className="space-y-5">
                    {shopping.slots.map((slot) => (
                      <div key={slot.slot}>
                        <p className="text-sm font-medium text-foreground mb-2 flex items-center justify-between gap-3">
                          <span>
                            <span className="text-muted tabular-nums mr-2">#{slot.slot}</span>
                            {slot.label}
                            <span className="text-muted font-normal"> — {slot.region}, {slot.country}</span>
                          </span>
                          <button
                            onClick={() => replaceSlotWine(slot.slot)}
                            disabled={replacingSlot !== null}
                            className="shrink-0 text-xs text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {replacingSlot === slot.slot ? "Replacing…" : "Can't find it? Replace"}
                          </button>
                        </p>
                        <div className="space-y-2">
                          {slot.stockists.map((s, i) => (
                            <StockistCard key={i} s={s} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted mt-5 border-t border-border pt-4">{shopping.bagging}</p>
                </section>
              )}

              {/* Tasting + submission */}
              <section className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-2 font-display">Taste &amp; write</h2>
                <p className="text-sm text-muted mb-4">
                  When the bottles are in front of you (bagged, numbered, poured in slot order):
                  first your stem analysis, then your full exam answer. Your work autosaves here
                  until you submit.
                </p>
                {submitError && (
                  <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-4">
                    <p className="text-sm text-fail">{submitError}</p>
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label htmlFor="ltPreGlass" className="block text-sm font-medium text-foreground mb-1.5">
                      Before the glass — stem analysis
                    </label>
                    <textarea
                      id="ltPreGlass"
                      value={preGlass}
                      onChange={(e) => setPreGlass(e.target.value)}
                      rows={5}
                      placeholder="What does the stem tell you before tasting? Universe of candidates, ruling out, what to confirm in the glass…"
                      className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm leading-relaxed resize-y"
                    />
                  </div>
                  <div>
                    <label htmlFor="ltAnswer" className="block text-sm font-medium text-foreground mb-1.5">
                      Your full answer
                    </label>
                    <textarea
                      id="ltAnswer"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      rows={14}
                      placeholder="Write exactly as you would in the exam — per wine, against the printed sub-questions and marks."
                      className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm leading-relaxed resize-y"
                    />
                  </div>
                  <button
                    onClick={submitForGrading}
                    disabled={!answer.trim() || grading}
                    className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Submit for grading — reveals the wines
                  </button>
                </div>
              </section>
            </>
          )}

          {/* Grading stream */}
          {(grading || (gradeStream.text && session.state !== "tasted")) && (
            <StreamingFeedback
              text={gradeStream.text}
              thinking={gradeStream.thinking}
              isStreaming={gradeStream.isStreaming}
              error={gradeStream.error}
              title="Your debrief"
            />
          )}

          {/* The reveal */}
          {session.state === "tasted" && session.reveal && (
            <>
              <section className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-3 font-display">The wines</h2>
                <ol className="space-y-2">
                  {session.reveal.wines.map((w) => (
                    <li key={w.slot} className="text-sm text-foreground">
                      <span className="text-muted tabular-nums mr-2">#{w.slot}</span>
                      {w.fullText}
                    </li>
                  ))}
                </ol>
                {session.reveal.passEstimate && (
                  <p className="mt-4 pt-4 border-t border-border text-sm">
                    <span
                      className={`font-semibold ${
                        session.reveal.passEstimate === "PASS"
                          ? "text-success"
                          : session.reveal.passEstimate === "BORDERLINE"
                            ? "text-borderline"
                            : "text-fail"
                      }`}
                    >
                      {session.reveal.passEstimate}
                    </span>
                    {session.reveal.marksEstimate && (
                      <span className="text-muted"> · {session.reveal.marksEstimate}</span>
                    )}
                  </p>
                )}
              </section>
              {session.reveal.feedback && !gradeStream.text && (
                <StreamingFeedback
                  text={session.reveal.feedback}
                  isStreaming={false}
                  error={null}
                  title="Your debrief"
                />
              )}
              <p className="text-xs text-muted">
                This session is saved in your <Link href="/history" className="text-accent hover:text-accent-hover">History</Link>.
              </p>
            </>
          )}
        </div>
      </main>

      {/* The blind-break interstitial */}
      {interstitial && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-card rounded-xl border border-border p-6 max-w-md w-full shadow-xl">
            <h3 className="text-lg font-semibold text-foreground mb-2 font-display">
              This reveals the wines
            </h3>
            <p className="text-sm text-muted mb-5">
              You&apos;ll see every producer and label on the list — your tasting won&apos;t be
              truly blind, and your debrief will say so. If you can, share the list with a partner
              instead and have them bag and number the bottles.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setInterstitial(false)}
                className="px-4 py-2 border border-border text-muted hover:text-foreground hover:border-muted rounded-lg text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={revealShoppingList}
                className="px-4 py-2 bg-accent hover:bg-accent-hover text-background rounded-lg text-sm font-semibold transition-colors cursor-pointer"
              >
                Reveal the list
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
