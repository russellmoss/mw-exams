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
          {liveSession && (
            <div className="mb-6 bg-success/5 rounded-2xl border-2 border-success/30 p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-success/40">
                <div className="h-full bg-success animate-pulse" style={{ width: "100%" }} />
              </div>
              <div className="flex items-center gap-3 mb-4">
                <span className="w-3 h-3 rounded-full bg-success animate-pulse" />
                <h3 className="text-sm font-semibold text-success uppercase tracking-wider">
                  Live Now
                </h3>
                <span className="text-xs text-muted">
                  Updated every 5s
                </span>
              </div>

              <div className="space-y-4">
                {/* Current step */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted shrink-0 w-20">Step</span>
                  <span className="text-sm font-semibold text-success">
                    {STEP_LABELS[liveSession.current_step] || liveSession.current_step}
                  </span>
                </div>

                {/* Question info */}
                <div className="flex items-start gap-3">
                  <span className="text-xs text-muted shrink-0 w-20 pt-0.5">Question</span>
                  <div>
                    <span className="text-xs font-mono text-muted">
                      P{liveSession.paper} / {liveSession.family_label}
                    </span>
                    <p className="text-sm text-foreground/80 mt-1 line-clamp-2">
                      {liveSession.question_text.slice(0, 200)}
                    </p>
                  </div>
                </div>

                {/* Pre-glass reasoning if submitted */}
                {liveSession.pre_glass_reasoning && (
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-muted shrink-0 w-20 pt-0.5">Stem Analysis</span>
                    <div className="bg-background/50 rounded-lg p-3 flex-1 border border-success/20">
                      <div className="markdown-content text-sm text-foreground/80">
                        <ReactMarkdown>{liveSession.pre_glass_reasoning}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {/* Answer if submitted */}
                {liveSession.user_answer && (
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-muted shrink-0 w-20 pt-0.5">Answer</span>
                    <div className="bg-background/50 rounded-lg p-3 flex-1 border border-success/20">
                      <div className="markdown-content text-sm text-foreground/80">
                        <ReactMarkdown>{liveSession.user_answer}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {/* Time elapsed */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted shrink-0 w-20">Started</span>
                  <span className="text-xs text-muted">
                    {new Date(liveSession.started_at).toLocaleTimeString()}
                    {" — "}
                    {Math.round((Date.now() - new Date(liveSession.started_at).getTime()) / 60000)} min ago
                  </span>
                </div>
              </div>
            </div>
          )}

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
