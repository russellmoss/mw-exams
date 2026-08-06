"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useStreaming } from "@/lib/use-streaming";
import { StreamingFeedback } from "@/app/components/StreamingFeedback";
import { useDraft } from "@/lib/use-draft";
import { useSpeech } from "@/lib/use-speech";
import { MicButton } from "@/app/components/MicButton";
import { BLIND_INTEGRITY_LABEL, type Stockist } from "@/lib/live-tasting";
import { ByoWineForm } from "@/app/components/ByoWineForm";
import { BriefCard } from "@/app/components/BriefCard";
import { FeedbackButton } from "@/app/components/FeedbackButton";

type SlotSummary = { slot: number; stockistCount: number; thin: boolean };
type SlotAvail = {
  slot: number; label: string; region: string; country: string;
  stockists: Stockist[]; thin: boolean; overBudget?: boolean;
};
type SessionDetail = {
  id: string;
  state: "prep" | "shopping" | "tasted" | "abandoned";
  mode?: "pick-for-me" | "byo";
  prepGuidance?: string | null;
  briefSentTo?: string | null;
  briefSelfOpened?: boolean;
  blindIntegrity: "partner" | "self" | "unopened";
  paper: number;
  flightSize: number;
  city: string;
  country: string;
  budgetAmount: number | null;
  budgetCurrency: string | null;
  shareActive: boolean;
  /** Absent while a BYO session is in tasting prep — no question exists yet. */
  question?: { questionText: string; totalMarks: number };
  slotSummaries?: SlotSummary[];
  reveal?: {
    attemptId: number | null;
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
  const [partnerEmail, setPartnerEmail] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [shopping, setShopping] = useState<{ archetypeLabel: string | null; slots: SlotAvail[]; bagging: string } | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [tasting, setTasting] = useState(false);
  const [replacingSlot, setReplacingSlot] = useState<number | null>(null);
  const [preGlass, setPreGlass, clearPreGlass] = useDraft(`lt-preglass:${id}`);
  const [answer, setAnswer, clearAnswer] = useDraft(`lt-answer:${id}`);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const gradeStream = useStreaming();

  // Dictation, same treatment as the study flow (AnswerInput): detected from mic use, never
  // declared. Both boxes are on screen at once and the browser allows one recognition session,
  // so a single speech hook feeds whichever box's mic was clicked last.
  const [micTarget, setMicTarget] = useState<"preGlass" | "answer" | null>(null);
  const micTargetRef = useRef<"preGlass" | "answer">("answer");
  // Whether the mic contributed text to the ANSWER (the graded, spelling-sensitive text).
  // Persisted alongside the draft so a reload doesn't turn a dictated answer back into a
  // "typed" one; forgotten on submit with the draft itself.
  const VOICE_KEY = `mw-voice:lt:${id}`;
  const [voiceUsed, setVoiceUsedState] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem(VOICE_KEY) === "true"
  );
  const setVoiceUsed = useCallback(
    (next: boolean) => {
      setVoiceUsedState(next);
      if (typeof window === "undefined") return;
      if (next) window.localStorage.setItem(VOICE_KEY, "true");
      else window.localStorage.removeItem(VOICE_KEY);
    },
    [VOICE_KEY]
  );

  const handleTranscript = useCallback(
    (text: string) => {
      const append = (prev: string) => {
        const trimmed = prev.trim();
        return trimmed.length === 0 ? text : trimmed + " " + text;
      };
      if (micTargetRef.current === "answer") {
        setVoiceUsed(true);
        setAnswer(append);
      } else {
        setPreGlass(append);
      }
    },
    [setAnswer, setPreGlass, setVoiceUsed]
  );

  const speech = useSpeech(handleTranscript);

  const toggleMic = useCallback(
    (target: "preGlass" | "answer") => {
      if (speech.isListening && micTarget === target) {
        speech.stop();
        setMicTarget(null);
        return;
      }
      // Either starting fresh or redirecting a live session to the other box.
      micTargetRef.current = target;
      setMicTarget(target);
      if (!speech.isListening) speech.start();
    },
    [speech, micTarget]
  );

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
    speech.stop();
    setMicTarget(null);
    setSubmitError(null);
    setTasting(true);
    try {
      await gradeStream.startStream(`/api/live-tasting/${id}/grade`, {
        userAnswer: answer,
        preGlassReasoning: preGlass || undefined,
        // Dictated answers get their spelling reported but not deducted (marking-principles),
        // and mangled wine terms repaired server-side (dictation-normalizer).
        inputMethod: voiceUsed ? "voice" : "typed",
      });
      clearAnswer();
      clearPreGlass();
      setVoiceUsed(false);
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
              {session.flightSize} wines · {session.city}
              {session.question ? ` · ${session.question.totalMarks} marks` : " · tasting prep"}
              {session.state === "tasted" && ` · ${BLIND_INTEGRITY_LABEL[session.blindIntegrity]}`}
            </p>
          </div>
          {(session.state === "shopping" || session.state === "prep") && (
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
          {/* The question stem — visible in every post-prep state; it never names the wines. */}
          {session.state !== "prep" && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-3 font-display">The question</h2>
              <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {session.question?.questionText}
              </div>
            </section>
          )}

          {/* BYO tasting prep (migration 044): route the brief FIRST — the candidate only sees
              it if they explicitly choose to be their own buyer. */}
          {session.state === "prep" && !session.briefSelfOpened && !session.briefSentTo && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2 font-display">
                Who should get the shopping brief?
              </h2>
              <p className="text-sm text-muted mb-5">
                The brief describes the wines to buy. Send it to a partner and you stay fully
                blind — they buy, enter the bottles, and you get an email when your question is
                live. Or take it yourself if you&apos;re shopping solo.
              </p>
              {sendMsg && (
                <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-4">
                  <p className="text-sm text-fail">{sendMsg}</p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 bg-background rounded-lg border border-border p-4">
                  <p className="text-sm font-medium text-foreground mb-1">A partner (stay blind)</p>
                  <p className="text-xs text-muted mb-3">They get the brief + entry link by email.</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={partnerEmail}
                      onChange={(e) => setPartnerEmail(e.target.value)}
                      placeholder="partner@email.com"
                      className="flex-1 px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm"
                    />
                    <button
                      onClick={async () => {
                        setSendMsg(null);
                        setSendBusy(true);
                        try {
                          const res = await fetch(`/api/live-tasting/${id}/send-brief`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ email: partnerEmail }),
                          });
                          const data = await res.json().catch(() => ({}));
                          if (!res.ok) setSendMsg(data.error || "Could not send the brief.");
                          else await load();
                        } catch {
                          setSendMsg("Network error — try again.");
                        } finally {
                          setSendBusy(false);
                        }
                      }}
                      disabled={sendBusy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerEmail.trim())}
                      className="shrink-0 px-4 py-2 bg-accent hover:bg-accent-hover text-background rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sendBusy ? "Sending…" : "Email it"}
                    </button>
                  </div>
                </div>
                <div className="flex-1 bg-background rounded-lg border border-border p-4">
                  <p className="text-sm font-medium text-foreground mb-1">Me (shopping solo)</p>
                  <p className="text-xs text-muted mb-3">
                    You&apos;ll see the target styles — your results will note it.
                  </p>
                  <button
                    onClick={async () => {
                      await fetch(`/api/live-tasting/${id}/open-brief`, { method: "POST" });
                      await load();
                    }}
                    className="px-4 py-2 border border-border text-muted hover:text-foreground hover:border-muted rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    Show me the brief
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Partner-routed: the candidate waits blind. */}
          {session.state === "prep" && !session.briefSelfOpened && session.briefSentTo && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2 font-display">
                Brief sent — you&apos;re blind until the wines are in
              </h2>
              <p className="text-sm text-muted mb-4">
                The shopping brief went to <strong className="text-foreground">{session.briefSentTo}</strong>.
                When they enter the bottles, this session flips to <span className="text-success">Question
                ready</span> and you&apos;ll get an email. Nothing to do until then.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={async () => {
                    setSendBusy(true);
                    try {
                      await fetch(`/api/live-tasting/${id}/send-brief`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email: session.briefSentTo }),
                      });
                      setSendMsg(null);
                    } finally {
                      setSendBusy(false);
                    }
                  }}
                  disabled={sendBusy}
                  className="px-4 py-2 border border-border text-muted hover:text-foreground hover:border-muted rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
                >
                  {sendBusy ? "Resending…" : "Resend the email"}
                </button>
                <button
                  onClick={async () => {
                    if (window.confirm("This shows you the brief — your blind is then compromised. Continue?")) {
                      await fetch(`/api/live-tasting/${id}/open-brief`, { method: "POST" });
                      await load();
                    }
                  }}
                  className="text-xs text-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  Show it to me anyway
                </button>
              </div>
            </section>
          )}

          {/* Self-routed: brief + entry form. */}
          {session.state === "prep" && session.briefSelfOpened && (
            <>
              <BriefCard title="Your shopping brief" markdown={session.prepGuidance ?? ""} />
              <section className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-2 font-display">Got the wines?</h2>
                <p className="text-sm text-muted mb-4">
                  Enter exactly what you bought — the question is built around your bottles.
                </p>
                <ByoWineForm
                  endpoint={`/api/live-tasting/${id}/wines`}
                  defaultCount={session.flightSize}
                  onDone={() => load()}
                />
              </section>
            </>
          )}

          {session.state === "shopping" && !grading && !gradeStream.text && (
            <>
              {/* Getting the wines (pick-for-me only — BYO wines are already in hand) */}
              {session.mode !== "byo" && (
              <section className="bg-card rounded-xl border border-border p-6">
                <h2 className="text-lg font-semibold text-foreground mb-2 font-display">Get the wines</h2>
                <p className="text-sm text-muted mb-4">
                  {(session.slotSummaries ?? []).length} wines are picked and checked against shops near{" "}
                  {session.city}
                  {(session.slotSummaries ?? []).some((s) => s.thin)
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
              )}
              {session.mode === "byo" && (
                <section className="bg-card rounded-xl border border-border p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-2 font-display">Wines are in</h2>
                  <p className="text-sm text-muted">
                    The bottles are entered and the question is ready. Have them bagged and
                    numbered 1–{session.flightSize} (ideally by someone else), pour in order, and
                    write your answer below when you&apos;re tasting.
                  </p>
                </section>
              )}

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
                            {slot.overBudget && (
                              <span className="block text-xs text-borderline font-normal mt-0.5">
                                Listed prices run over your budget — this was the cheapest confirmed option; Replace tries another wine.
                              </span>
                            )}
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
                    <div className="relative">
                      <textarea
                        id="ltPreGlass"
                        value={preGlass}
                        onChange={(e) => setPreGlass(e.target.value)}
                        rows={5}
                        placeholder="What does the stem tell you before tasting? Universe of candidates, ruling out, what to confirm in the glass…"
                        className={`w-full px-3 py-2.5 pr-14 bg-background border rounded-lg text-foreground placeholder-muted focus:outline-none text-sm leading-relaxed resize-y ${
                          speech.isListening && micTarget === "preGlass"
                            ? "border-fail/60 bg-fail/5"
                            : "border-border focus:border-accent"
                        }`}
                      />
                      <div className="absolute top-2 right-2">
                        <MicButton
                          isListening={speech.isListening && micTarget === "preGlass"}
                          isSupported={speech.isSupported}
                          onClick={() => toggleMic("preGlass")}
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="ltAnswer" className="block text-sm font-medium text-foreground mb-1.5">
                      Your full answer
                    </label>
                    <div className="relative">
                      <textarea
                        id="ltAnswer"
                        value={answer}
                        onChange={(e) => {
                          // Wiping the box and starting over is a fresh answer — stop treating it as dictated.
                          if (e.target.value.trim().length === 0 && voiceUsed) setVoiceUsed(false);
                          setAnswer(e.target.value);
                        }}
                        rows={14}
                        placeholder="Write exactly as you would in the exam — per wine, against the printed sub-questions and marks."
                        className={`w-full px-3 py-2.5 pr-14 bg-background border rounded-lg text-foreground placeholder-muted focus:outline-none text-sm leading-relaxed resize-y ${
                          speech.isListening && micTarget === "answer"
                            ? "border-fail/60 bg-fail/5"
                            : "border-border focus:border-accent"
                        }`}
                      />
                      <div className="absolute top-2 right-2">
                        <MicButton
                          isListening={speech.isListening && micTarget === "answer"}
                          isSupported={speech.isSupported}
                          onClick={() => toggleMic("answer")}
                        />
                      </div>
                    </div>
                    {speech.isListening && (
                      <span className="text-xs text-fail flex items-center gap-1.5 mt-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-fail animate-pulse" />
                        Listening...
                      </span>
                    )}
                    {voiceUsed && (
                      <p className="text-xs text-muted leading-relaxed mt-2">
                        Dictation detected — misspellings will be shown but won&rsquo;t cost marks.
                        <span className="block text-[11px] text-muted/70">
                          The real exam is handwritten, so spelling counts there.
                        </span>
                      </p>
                    )}
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
              {(session.reveal.feedback || gradeStream.text) && (
                <StreamingFeedback
                  text={session.reveal.feedback || gradeStream.text}
                  isStreaming={false}
                  error={null}
                  title="Your debrief"
                />
              )}
              <div className="flex items-center justify-between gap-4">
                <p className="text-xs text-muted">
                  This session is saved in your <Link href="/history" className="text-accent hover:text-accent-hover">History</Link>.
                </p>
                <FeedbackButton attemptId={session.reveal.attemptId} step="live-tasting-reveal" />
              </div>
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
