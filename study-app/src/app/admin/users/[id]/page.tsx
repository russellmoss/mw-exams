"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { HistoryView, type AttemptDetail, type Stats } from "../../../components/HistoryView";
import ReactMarkdown from "react-markdown";

interface LiveSession {
  attempt_id: number;
  question_id: string;
  current_step: string;
  pre_glass_reasoning: string | null;
  user_answer: string | null;
  started_at: string;
  user_id: number;
  user_name: string;
  paper: number;
  family: string;
  family_label: string;
  question_text: string;
  wines: string | { slot: number; fullText: string }[];
}

const STEP_LABELS: Record<string, string> = {
  question: "Viewing question",
  "pre-glass": "Writing stem analysis",
  "pre-glass-feedback": "Receiving coaching",
  reveal: "Viewing wines / tasting",
  answer: "Writing answer",
  feedback: "Receiving evaluation",
  "reveal-answer": "Reviewing model answer",
};

const STEP_ORDER = ["question", "pre-glass", "pre-glass-feedback", "reveal", "answer", "feedback", "reveal-answer"];

function stepProgress(step: string): number {
  const idx = STEP_ORDER.indexOf(step);
  return idx >= 0 ? Math.round(((idx + 1) / STEP_ORDER.length) * 100) : 10;
}

function winesRevealed(step: string): boolean {
  const revealIdx = STEP_ORDER.indexOf("reveal");
  const currentIdx = STEP_ORDER.indexOf(step);
  return currentIdx >= revealIdx;
}

function LiveSessionPanel({ session }: { session: LiveSession }) {
  const [expanded, setExpanded] = useState(false);
  const wines = typeof session.wines === "string" ? JSON.parse(session.wines) : session.wines;
  const elapsed = Math.round((Date.now() - new Date(session.started_at).getTime()) / 60000);
  const showWines = winesRevealed(session.current_step);
  const progress = stepProgress(session.current_step);

  return (
    <div className="mb-6 bg-success/5 rounded-2xl border-2 border-success/30 relative overflow-hidden">
      {/* Progress bar */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-success/20">
        <div className="h-full bg-success transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>

      {/* Clickable header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-6 text-left cursor-pointer hover:bg-success/10 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-success animate-pulse" />
            <h3 className="text-sm font-semibold text-success uppercase tracking-wider">Live Now</h3>
            <span className="text-xs text-muted">Updated every 5s</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-success/15 text-success">
              {STEP_LABELS[session.current_step] || session.current_step}
            </span>
            <span className="text-xs text-muted">{elapsed} min</span>
            <svg className={`w-4 h-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs font-mono text-muted">P{session.paper} / {session.family_label}</span>
          <p className="text-sm text-foreground/80 truncate">{session.question_text.slice(0, 120)}</p>
        </div>
      </button>

      {/* Expanded view */}
      {expanded && (
        <div className="px-6 pb-6 space-y-5 border-t border-success/20">
          {/* Step progress */}
          <div className="pt-4 flex items-center gap-2">
            {STEP_ORDER.map((s) => {
              const isCurrent = s === session.current_step;
              const isPast = STEP_ORDER.indexOf(s) < STEP_ORDER.indexOf(session.current_step);
              return (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${isCurrent ? "bg-success animate-pulse" : isPast ? "bg-success/60" : "bg-muted/20"}`} />
                  <span className={`text-[10px] ${isCurrent ? "text-success font-semibold" : isPast ? "text-muted" : "text-muted/40"}`}>
                    {(STEP_LABELS[s] || s).split(" ").slice(0, 2).join(" ")}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Full question text */}
          <div>
            <h4 className="text-xs text-muted uppercase tracking-wider mb-2">Full Question</h4>
            <div className="bg-background/50 rounded-lg p-4 border border-success/20">
              <div className="markdown-content text-sm"><ReactMarkdown>{session.question_text}</ReactMarkdown></div>
            </div>
          </div>

          {/* Wines — always visible to admin */}
          {wines && wines.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h4 className="text-xs text-muted uppercase tracking-wider">Wines ({wines.length})</h4>
                {!showWines && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-borderline/15 text-borderline border border-borderline/30">
                    Not yet revealed to candidate
                  </span>
                )}
              </div>
              <div className={`bg-background/50 rounded-lg p-4 border space-y-1.5 ${showWines ? "border-success/20" : "border-borderline/20"}`}>
                {wines.map((w: { slot: number; fullText: string }) => (
                  <p key={w.slot} className="text-sm text-foreground/80">
                    <span className="text-success font-mono font-semibold">Wine {w.slot}:</span> {w.fullText}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Pre-glass reasoning */}
          {session.pre_glass_reasoning && (
            <div>
              <h4 className="text-xs text-muted uppercase tracking-wider mb-2">Stem Analysis</h4>
              <div className="bg-background/50 rounded-lg p-4 border border-success/20">
                <div className="markdown-content text-sm text-foreground/80">
                  <ReactMarkdown>{session.pre_glass_reasoning}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* Answer */}
          {session.user_answer && (
            <div>
              <h4 className="text-xs text-muted uppercase tracking-wider mb-2">Answer</h4>
              <div className="bg-background/50 rounded-lg p-4 border border-success/20">
                <div className="markdown-content text-sm text-foreground/80">
                  <ReactMarkdown>{session.user_answer}</ReactMarkdown>
                </div>
              </div>
            </div>
          )}

          {/* Timing */}
          <div className="flex items-center gap-3 pt-2 border-t border-success/10">
            <span className="text-xs text-muted">Started {new Date(session.started_at).toLocaleTimeString()}</span>
            <span className="text-xs text-muted">•</span>
            <span className="text-xs text-muted">{elapsed} min elapsed</span>
            {wines && wines.length > 0 && (
              <>
                <span className="text-xs text-muted">•</span>
                <span className={`text-xs font-semibold ${elapsed / wines.length > 12 ? "text-fail" : elapsed / wines.length > 8 ? "text-borderline" : "text-success"}`}>
                  {(elapsed / wines.length).toFixed(1)} min/wine
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminUserHistoryPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  const { user, loading: authLoading } = useAuth();
  const [attempts, setAttempts] = useState<AttemptDetail[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [liveSession, setLiveSession] = useState<LiveSession | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) router.push("/");
  }, [authLoading, user, router]);

  const fetchLive = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/live-sessions");
      if (!res.ok) return;
      const data = await res.json();
      const userSession = (data.sessions || []).find(
        (s: LiveSession) => String(s.user_id) === userId
      );
      setLiveSession(userSession || null);
    } catch {}
  }, [userId]);

  useEffect(() => {
    if (!user?.isAdmin || !userId) return;
    fetch(`/api/history?userId=${userId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setAttempts(data.attempts || []);
        setStats(data.stats || null);
        setUserName(data.userName || `User ${userId}`);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load user history:", err);
        setError("Failed to load user history");
        setLoading(false);
      });

    // Poll live session
    fetchLive();
    const interval = setInterval(fetchLive, 5000);
    return () => clearInterval(interval);
  }, [user, userId, fetchLive]);

  if (authLoading || loading) {
    return (
      <div className="flex flex-col flex-1">
        <main className="flex-1">
          <div className="max-w-4xl mx-auto px-6 py-20">
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-3 text-muted">
                <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
                <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
                <span className="ml-2 text-sm">Loading user history...</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="mb-8">
            <button
              onClick={() => router.push("/admin")}
              className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer mb-4 inline-block"
            >
              &larr; Back to Admin
            </button>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              {userName}&apos;s History
            </h1>
            <p className="text-sm text-muted mt-1">
              Viewing study history as admin (read-only)
            </p>
          </div>

          {error && (
            <div className="bg-fail/10 border border-fail/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-fail">{error}</p>
            </div>
          )}

          {/* Live session indicator */}
          {liveSession && <LiveSessionPanel session={liveSession} />}

          <HistoryView
            attempts={attempts}
            stats={stats}
            isAdmin
          />
        </div>
      </main>
    </div>
  );
}
