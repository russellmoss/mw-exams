"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { FeedbackButton } from "@/app/components/FeedbackButton";
import { useNow } from "@/lib/use-now";
import { BriefCard } from "@/app/components/BriefCard";
import { ByoWineForm } from "@/app/components/ByoWineForm";

type Flight = {
  position: number;
  flightSize: number;
  state: "pending" | "prep" | "shopping" | "tasted" | "abandoned";
  sessionId?: string;
  questionId?: string | null;
  questionText?: string | null;
  totalMarks?: number;
  marksLow?: number | null;
};

type PaperDetail = {
  id: string;
  paper: number;
  size: "half" | "full";
  mode: "pick-for-me" | "byo";
  pacing: "flight-by-flight" | "exam-conditions";
  city: string;
  totalBudget: number | null;
  budgetCurrency: string | null;
  examStartedAt: string | null;
  examDeadlineAt: string | null;
  prepGuidance?: string | null;
  briefSentTo?: string | null;
  briefSelfOpened?: boolean;
  flights: Flight[];
  report: {
    awarded: number; possible: number; pct: number; passLine: number;
    answered: number; totalFlights: number; zeroed: number;
  } | null;
};

const FLIGHT_CHIP: Record<string, { label: string; cls: string }> = {
  pending: { label: "Generating", cls: "text-muted border-border bg-card" },
  prep: { label: "Awaiting wines", cls: "text-borderline border-borderline/40 bg-borderline/10" },
  shopping: { label: "Ready to taste", cls: "text-success border-success/40 bg-success/10" },
  tasted: { label: "Graded", cls: "text-accent border-accent/40 bg-accent/10" },
  abandoned: { label: "Abandoned", cls: "text-muted border-border bg-card" },
};

function Countdown({ deadline }: { deadline: string }) {
  const now = useNow(1000);
  const left = Math.max(0, new Date(deadline).getTime() - now);
  const m = Math.floor(left / 60000);
  const s = Math.floor((left % 60000) / 1000);
  return (
    <span className={`tabular-nums font-semibold ${left < 15 * 60000 ? "text-fail" : "text-accent"}`}>
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

export default function LiveTastingPaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [paper, setPaper] = useState<PaperDetail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [genProgress, setGenProgress] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [partnerEmail, setPartnerEmail] = useState("");
  const [sendBusy, setSendBusy] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const generating = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, user, router]);

  const load = useCallback(() => {
    return fetch(`/api/live-tasting/paper/${id}`)
      .then(async (res) => {
        if (res.status === 404) { setNotFound(true); return; }
        if (res.ok) setPaper(await res.json());
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  // Client-driven generation chaining (pick-for-me): one flight per request until done. A page
  // reload resumes exactly where it left off — the server generates whatever is missing next.
  const chainGeneration = useCallback(async () => {
    if (generating.current) return;
    generating.current = true;
    setGenError(null);
    try {
      for (;;) {
        const res = await fetch(`/api/live-tasting/paper/${id}/next`, { method: "POST" });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Generation failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let result: { done?: boolean } | null = null;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!line || line === "data: [DONE]") continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.type === "status" && evt.label) setGenProgress(evt.label);
              if (evt.type === "error") throw new Error(evt.message);
              if (evt.type === "result") result = evt.data;
            } catch (e) {
              if (e instanceof Error && e.message && !e.message.includes("JSON")) throw e;
            }
          }
        }
        await load();
        if (result?.done) break;
      }
      setGenProgress(null);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed — retry below.");
      setGenProgress(null);
    } finally {
      generating.current = false;
    }
  }, [id, load]);

  useEffect(() => {
    if (!paper) return;
    const missing = paper.flights.some((f) => f.state === "pending");
    if (paper.mode === "pick-for-me" && missing && !generating.current && !genError) {
      chainGeneration();
    }
  }, [paper, chainGeneration, genError]);

  if (notFound) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 text-center">
        <p className="text-sm text-muted">Paper not found.</p>
        <Link href="/live-tasting" className="text-sm text-accent hover:text-accent-hover mt-2 inline-block">
          Back to Live Tasting
        </Link>
      </div>
    );
  }

  if (authLoading || !user || !paper) {
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

  const allGenerated = paper.flights.every((f) => f.state !== "pending");
  const examRunning = Boolean(paper.examStartedAt && paper.examDeadlineAt);
  const deadlinePassed = Boolean(paper.examDeadlineAt && new Date(paper.examDeadlineAt).getTime() < Date.now());
  const wineWord = paper.size === "full" ? "12 bottles" : "6 bottles";
  const firstQuestionId = paper.flights.find((f) => f.questionId)?.questionId ?? null;

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {paper.size === "full" ? "Full" : "Half"} Paper {paper.paper}
            </h1>
            <p className="text-sm text-muted mt-1">
              {wineWord} · {paper.flights.length} questions · {paper.city}
              {paper.pacing === "exam-conditions" ? " · exam conditions" : " · flight by flight"}
              {paper.totalBudget ? ` · ${paper.totalBudget} ${paper.budgetCurrency ?? ""} total` : ""}
            </p>
          </div>
          {examRunning && !deadlinePassed && paper.examDeadlineAt && (
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted">Time remaining</p>
              <Countdown deadline={paper.examDeadlineAt} />
            </div>
          )}
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          {genProgress && (
            <div className="flex items-center gap-3 text-muted bg-card rounded-xl border border-border p-4">
              <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
              <span className="text-sm">{genProgress}</span>
            </div>
          )}
          {genError && (
            <div className="bg-fail/10 border border-fail/30 rounded-lg p-4 flex items-center justify-between gap-4">
              <p className="text-sm text-fail">{genError}</p>
              <button
                onClick={() => { setGenError(null); chainGeneration(); }}
                className="shrink-0 px-4 py-2 bg-accent hover:bg-accent-hover text-background rounded-lg text-sm font-semibold transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {/* Exam conditions: the clock gate */}
          {paper.pacing === "exam-conditions" && allGenerated && !examRunning && (
            <section className="bg-card rounded-xl border border-accent/40 p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2 font-display">Sit the paper</h2>
              <p className="text-sm text-muted mb-4">
                All {paper.flights.length} questions are ready. When the bottles are poured and
                you start the clock, you have {paper.size === "full" ? "2 hours 15 minutes" : "68 minutes"} —
                questions unanswered at the deadline score <strong className="text-fail">zero</strong>,
                exactly like the real exam.
              </p>
              <button
                onClick={async () => {
                  const res = await fetch(`/api/live-tasting/paper/${id}/start-exam`, { method: "POST" });
                  if (res.ok) load();
                }}
                className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer"
              >
                Start the exam clock
              </button>
            </section>
          )}

          {/* The report card */}
          {paper.report && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-3 font-display">Paper result</h2>
              <p className="text-3xl font-bold tabular-nums mb-1">
                <span className={paper.report.pct >= paper.report.passLine ? "text-success" : "text-fail"}>
                  {paper.report.pct}%
                </span>
                <span className="text-sm text-muted font-normal ml-3">
                  {paper.report.awarded} / {paper.report.possible} marks (lower-bound estimates)
                </span>
              </p>
              <p className="text-sm text-muted">
                {paper.report.pct >= paper.report.passLine
                  ? `Above the ${paper.report.passLine}% line for this paper.`
                  : `Below the ${paper.report.passLine}% line for this paper.`}
                {" "}{paper.report.answered} of {paper.report.totalFlights} questions answered
                {paper.report.zeroed > 0 ? ` — ${paper.report.zeroed} unanswered scored zero (exam rule)` : ""}.
              </p>
            </section>
          )}

          {/* BYO paper brief routing: chooser first — the candidate only sees the brief if
              they choose to be their own buyer. Partner path emails brief + entry page. */}
          {paper.mode === "byo" && !paper.briefSelfOpened && !paper.briefSentTo && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2 font-display">
                Who should get the shopping brief?
              </h2>
              <p className="text-sm text-muted mb-5">
                The brief covers all {paper.flights.length} flights ({wineWord}). Send it to a
                partner and you stay fully blind — they buy flight by flight, enter the bottles,
                and you get one email when the whole paper is ready.
              </p>
              {sendMsg && (
                <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-4">
                  <p className="text-sm text-fail">{sendMsg}</p>
                </div>
              )}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1 bg-background rounded-lg border border-border p-4">
                  <p className="text-sm font-medium text-foreground mb-1">A partner (stay blind)</p>
                  <p className="text-xs text-muted mb-3">They get the brief + per-flight entry page by email.</p>
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
                          const res = await fetch(`/api/live-tasting/paper/${id}/send-brief`, {
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
                  <p className="text-xs text-muted mb-3">You&apos;ll see all the target styles — results will note it.</p>
                  <button
                    onClick={async () => {
                      await fetch(`/api/live-tasting/paper/${id}/open-brief`, { method: "POST" });
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

          {paper.mode === "byo" && !paper.briefSelfOpened && paper.briefSentTo && (
            <section className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-2 font-display">
                Brief sent — you&apos;re blind until the wines are in
              </h2>
              <p className="text-sm text-muted mb-4">
                The full-paper brief went to <strong className="text-foreground">{paper.briefSentTo}</strong>.
                Flights below flip to <span className="text-success">Ready to taste</span> as they
                enter each one; you&apos;ll get an email when the whole paper is ready.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={async () => {
                    setSendBusy(true);
                    try {
                      await fetch(`/api/live-tasting/paper/${id}/send-brief`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email: paper.briefSentTo }),
                      });
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
                    if (window.confirm("This shows you the full brief — your blind is then compromised. Continue?")) {
                      await fetch(`/api/live-tasting/paper/${id}/open-brief`, { method: "POST" });
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

          {paper.mode === "byo" && paper.briefSelfOpened && paper.prepGuidance && (
            <BriefCard title="Shopping brief — all flights" markdown={paper.prepGuidance} />
          )}

          {/* Flights */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-foreground font-display">Questions</h2>
            {paper.flights.map((f) => (
              <div key={f.position} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center justify-between gap-4 mb-2">
                  <p className="text-sm font-medium text-foreground">
                    Question {f.position} <span className="text-muted font-normal">· {f.flightSize} wines · {f.totalMarks ?? f.flightSize * 25} marks</span>
                    {f.state === "tasted" && f.marksLow != null && (
                      <span className="text-accent font-semibold ml-2 tabular-nums">{f.marksLow}+ marks</span>
                    )}
                  </p>
                  <span className={`shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${FLIGHT_CHIP[f.state].cls}`}>
                    {FLIGHT_CHIP[f.state].label}
                  </span>
                </div>
                {f.questionText && (
                  <p className="text-sm text-muted whitespace-pre-wrap leading-relaxed line-clamp-3 mb-3">
                    {f.questionText}
                  </p>
                )}
                {!f.sessionId && paper.mode === "byo" && paper.briefSelfOpened && (
                  <div className="mt-2 pt-3 border-t border-border">
                    <p className="text-xs text-muted mb-3">
                      Enter the {f.flightSize} bottles bought for this flight (see the brief above).
                    </p>
                    <ByoWineForm
                      endpoint={`/api/live-tasting/paper/${id}/flight/${f.position}/wines`}
                      defaultCount={f.flightSize}
                      onDone={() => load()}
                    />
                  </div>
                )}
                {f.sessionId && (
                  <Link
                    href={`/live-tasting/${f.sessionId}`}
                    className="inline-block text-sm text-accent hover:text-accent-hover font-medium"
                  >
                    {f.state === "tasted" ? "Review debrief & reveal →"
                      : paper.pacing === "exam-conditions" && !examRunning ? "Preview question →"
                      : "Taste & answer →"}
                  </Link>
                )}
              </div>
            ))}
          </section>

          <p className="text-xs text-muted">
            Each question runs like a normal Live Tasting: stem only, blind, graded per question.
            {paper.mode === "pick-for-me"
              ? " Shopping lists live inside each question (or share each with a partner)."
              : " The shopping brief covers all flights — route it from the questions below."}
          </p>
        </div>
      </main>

      {/* Feedback — bottom-left, like the study surfaces (user-1 request). */}
      <div className="fixed bottom-4 left-4 z-40">
        <FeedbackButton attemptId={null} questionId={firstQuestionId} step={`paper-${paper.id}`} />
      </div>
    </div>
  );
}
