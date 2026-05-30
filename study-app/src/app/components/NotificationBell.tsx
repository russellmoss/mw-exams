"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { FeedbackAnalysisPanel } from "./FeedbackAnalysisPanel";

interface AnalysisSummary {
  id: number;
  attempt_id: number;
  recommendation: "accept" | "reject" | "partial" | "pending" | null;
  status: "analyzing" | "complete" | "error";
  is_read: boolean;
  created_at: string;
  updated_at: string;
  question_text: string;
  paper: number;
  family_label: string;
  user_feedback: string;
  has_narration: boolean;
}

export function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevUnreadRef = useRef(0);
  const soundEnabledRef = useRef(true);
  // Narration ids we've already spoken, so a re-poll never replays the same clip.
  const spokenRef = useRef<Set<number>>(new Set());
  const firstLoadRef = useRef(true);

  useEffect(() => {
    fetch("/api/user/sound-preference")
      .then((r) => r.json())
      .then((d) => { soundEnabledRef.current = d.soundEnabled !== false; })
      .catch(() => {});
  }, []);

  // Speak the verdict for one analysis (spoken-only — no chime). Fire-and-forget.
  const speakNarration = useCallback((id: number) => {
    if (spokenRef.current.has(id)) return;
    spokenRef.current.add(id);
    const audio = new Audio(`/api/feedback-notifications/${id}/audio`);
    audio.volume = 0.9;
    audio.play().catch(() => {});
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/feedback-notifications");
      if (!res.ok) return;
      const data = await res.json();
      const newCount = data.unreadCount || 0;
      const list: AnalysisSummary[] = data.analyses || [];

      // On a count increase, speak the newest unread, complete verdict that has
      // narration ready. Skip the very first load so we don't read out a backlog
      // of old unread items when the page mounts.
      if (!firstLoadRef.current && newCount > prevUnreadRef.current && soundEnabledRef.current) {
        const fresh = list.find(
          (a) => a.status === "complete" && !a.is_read && a.has_narration && !spokenRef.current.has(a.id)
        );
        if (fresh) speakNarration(fresh.id);
      }
      // Seed the spoken set on first load so existing unread items aren't queued.
      if (firstLoadRef.current) {
        for (const a of list) if (!a.is_read) spokenRef.current.add(a.id);
        firstLoadRef.current = false;
      }

      prevUnreadRef.current = newCount;
      setUnreadCount(newCount);
      setAnalyses(list);
    } catch {}
  }, [speakNarration]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 30000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") fetchNotifications();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const handleSelect = (id: number) => {
    setSelectedId(id);
    setDropdownOpen(false);
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const paperLabel = (p: number) =>
    p === 1 ? "P1" : p === 2 ? "P2" : "P3";

  const recBadge = (rec: string | null, status: string) => {
    if (status === "analyzing") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-borderline/20 text-borderline">Analyzing...</span>;
    if (status === "error") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-fail/20 text-fail">Error</span>;
    if (rec === "accept") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/20 text-success">Accept</span>;
    if (rec === "reject") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-fail/20 text-fail">Reject</span>;
    if (rec === "partial") return <span className="text-[10px] px-1.5 py-0.5 rounded bg-borderline/20 text-borderline">Partial</span>;
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted/20 text-muted">Pending</span>;
  };

  const timeAgo = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="relative p-1.5 text-muted hover:text-foreground transition-colors cursor-pointer"
          title="Feedback notifications"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-accent text-[10px] font-bold text-background flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {dropdownOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-card rounded-xl border border-border shadow-2xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Feedback Analysis</h3>
              {unreadCount > 0 && (
                <p className="text-xs text-muted mt-0.5">{unreadCount} new</p>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {analyses.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted">
                  No feedback analyses yet. Submit feedback on a question to get started.
                </div>
              ) : (
                analyses.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleSelect(a.id)}
                    className={`w-full text-left px-4 py-3 border-b border-border/30 hover:bg-card-hover transition-colors cursor-pointer ${!a.is_read ? "bg-accent/5" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono text-muted">{paperLabel(a.paper)} / {a.family_label}</span>
                      {recBadge(a.recommendation, a.status)}
                    </div>
                    <p className="text-xs text-foreground/80 line-clamp-2 leading-relaxed">
                      {a.user_feedback.replace(/^\[.*?\]\s*/, "").slice(0, 120)}
                    </p>
                    <p className="text-[10px] text-muted mt-1">{timeAgo(a.updated_at)}</p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {selectedId && (
        <FeedbackAnalysisPanel
          analysisId={selectedId}
          onClose={() => {
            setSelectedId(null);
            fetchNotifications();
          }}
        />
      )}
    </>
  );
}
