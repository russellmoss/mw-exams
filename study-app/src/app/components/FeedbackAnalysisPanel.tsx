"use client";

import { useState, useEffect, useRef } from "react";
import { useStreaming } from "@/lib/use-streaming";
import ReactMarkdown from "react-markdown";

interface ThreadMessage {
  role: "system" | "user";
  content: string;
  timestamp: string;
}

interface AnalysisDetail {
  id: number;
  recommendation: "accept" | "reject" | "pending" | null;
  thread: ThreadMessage[];
  status: string;
  user_feedback: string;
  question_text: string;
  paper: number;
  family_label: string;
}

export function FeedbackAnalysisPanel({
  analysisId,
  onClose,
}: {
  analysisId: number;
  onClose: () => void;
}) {
  const [analysis, setAnalysis] = useState<AnalysisDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const threadEndRef = useRef<HTMLDivElement>(null);
  const stream = useStreaming();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/feedback-analysis/${analysisId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.thread && typeof data.thread === "string") {
          data.thread = JSON.parse(data.thread);
        }
        setAnalysis(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [analysisId]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [analysis?.thread.length, stream.text]);

  const handleReply = async () => {
    if (!reply.trim() || !analysis) return;
    const replyText = reply.trim();
    setReply("");

    const updatedThread: ThreadMessage[] = [
      ...analysis.thread,
      { role: "user", content: replyText, timestamp: new Date().toISOString() },
    ];
    setAnalysis({ ...analysis, thread: updatedThread, status: "analyzing" });

    const result = await stream.startStream(
      `/api/feedback-analysis/${analysisId}/reply`,
      { content: replyText }
    );

    if (result) {
      const newThread: ThreadMessage[] = [
        ...updatedThread,
        { role: "system", content: result, timestamp: new Date().toISOString() },
      ];
      const rec = /recommendation:\s*\*?\*?accept/i.test(result)
        ? "accept"
        : /recommendation:\s*\*?\*?reject/i.test(result)
          ? "reject"
          : "pending";
      setAnalysis({ ...analysis, thread: newThread, recommendation: rec as AnalysisDetail["recommendation"], status: "complete" });
    }
  };

  // Analyses carry an engineering-only tail after a [[INTERNAL]] marker (EK refs, file paths,
  // proposed code change, the Kind routing line). The candidate sees only the part before it.
  const candidateFacing = (text: string) => (text.split("[[INTERNAL]]")[0] || text).trim();

  const recBadge = (rec: string | null) => {
    if (rec === "accept") return <span className="text-xs px-2 py-1 rounded-full bg-success/15 text-success font-semibold">ACCEPT</span>;
    if (rec === "reject") return <span className="text-xs px-2 py-1 rounded-full bg-fail/15 text-fail font-semibold">REJECT</span>;
    return <span className="text-xs px-2 py-1 rounded-full bg-borderline/15 text-borderline font-semibold">PENDING</span>;
  };

  const paperLabel = analysis
    ? analysis.paper === 1 ? "Paper 1 — Whites" : analysis.paper === 2 ? "Paper 2 — Reds" : "Paper 3 — Special"
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-card rounded-2xl border border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Feedback Analysis</h2>
            {analysis && (
              <p className="text-xs text-muted mt-0.5">{paperLabel} / {analysis.family_label}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {analysis && recBadge(analysis.recommendation)}
            <button onClick={onClose} className="text-muted hover:text-foreground transition-colors cursor-pointer p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-muted text-sm">Loading analysis...</div>
          ) : !analysis ? (
            <div className="text-center py-8 text-fail text-sm">Failed to load analysis.</div>
          ) : (
            <>
              {/* Original feedback */}
              <div className="bg-background rounded-lg p-4 border border-border/50">
                <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Your Feedback</p>
                <p className="text-sm text-foreground leading-relaxed">
                  {analysis.user_feedback.replace(/^\[.*?\]\s*/, "")}
                </p>
              </div>

              {/* Thread */}
              {analysis.thread.map((msg, i) => (
                <div key={i} className={`rounded-lg p-4 border ${msg.role === "system" ? "bg-card-hover border-border/50" : "bg-accent/5 border-accent/20"}`}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-semibold ${msg.role === "system" ? "text-accent" : "text-foreground"}`}>
                      {msg.role === "system" ? "Analysis" : "Your follow-up"}
                    </span>
                    <span className="text-[10px] text-muted">
                      {new Date(msg.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="markdown-content text-sm">
                    <ReactMarkdown>{msg.role === "system" ? candidateFacing(msg.content) : msg.content}</ReactMarkdown>
                  </div>
                </div>
              ))}

              {/* Streaming response */}
              {stream.isStreaming && (
                <div className="rounded-lg p-4 border bg-card-hover border-border/50">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-accent">Analysis</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                  </div>
                  <div className="markdown-content text-sm">
                    <ReactMarkdown>{candidateFacing(stream.text)}</ReactMarkdown>
                  </div>
                </div>
              )}

              <div ref={threadEndRef} />
            </>
          )}
        </div>

        {/* Reply input */}
        {analysis && analysis.status !== "analyzing" && !stream.isStreaming && (
          <div className="px-6 py-4 border-t border-border shrink-0">
            <div className="flex gap-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleReply()}
                placeholder="Add context or follow up..."
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/60"
              />
              <button
                onClick={handleReply}
                disabled={!reply.trim()}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                  reply.trim()
                    ? "bg-accent hover:bg-accent-hover text-background"
                    : "bg-border text-muted cursor-not-allowed"
                }`}
              >
                Send
              </button>
            </div>
            <p className="text-[10px] text-muted mt-1.5">
              Your follow-up will trigger a re-analysis with additional context.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
