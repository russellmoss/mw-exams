"use client";

import { useEffect, useState, useRef, useCallback } from "react";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function useStudyTimer() {
  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const elapsedRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
  }, []);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
  }, []);

  useEffect(() => {
    if (stopped || paused) {
      clearTimer();
    } else {
      startInterval();
    }
    return clearTimer;
  }, [paused, stopped, clearTimer, startInterval]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);
  const stop = useCallback(() => setStopped(true), []);
  const getElapsed = useCallback(() => elapsedRef.current, []);
  const reset = useCallback(() => {
    clearTimer();
    elapsedRef.current = 0;
    setElapsed(0);
    setPaused(false);
    setStopped(false);
  }, [clearTimer]);

  return { elapsed, paused, stopped, pause, resume, stop, reset, getElapsed };
}

function getLiveColor(elapsed: number, wineCount: number, paused: boolean): string {
  if (paused) return "text-muted";
  const perWineMins = (elapsed / 60) / (wineCount || 4);
  if (perWineMins <= 8) return "text-success";
  if (perWineMins <= 12) return "text-borderline";
  return "text-fail";
}

export function StudyTimerDisplay({
  elapsed,
  paused,
  stopped,
  wineCount = 4,
}: {
  elapsed: number;
  paused: boolean;
  stopped: boolean;
  wineCount?: number;
}) {
  const color = getLiveColor(elapsed, wineCount, paused);

  return (
    <div className={`flex items-center gap-1.5 font-mono text-sm ${color} transition-colors`}>
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>{formatTime(elapsed)}</span>
      {paused && !stopped && <span className="text-xs text-muted/60">(paused)</span>}
    </div>
  );
}

export function FloatingTimer({
  elapsed,
  paused,
  stopped,
  wineCount = 4,
}: {
  elapsed: number;
  paused: boolean;
  stopped: boolean;
  wineCount?: number;
}) {
  const color = getLiveColor(elapsed, wineCount, paused);
  const bgColor = paused ? "bg-card border-border"
    : (elapsed / 60) / (wineCount || 4) <= 8 ? "bg-success/10 border-success/30"
    : (elapsed / 60) / (wineCount || 4) <= 12 ? "bg-borderline/10 border-borderline/30"
    : "bg-fail/10 border-fail/30";

  return (
    <div className={`fixed bottom-6 right-6 z-40 px-4 py-2.5 rounded-full border shadow-lg backdrop-blur-sm ${bgColor} transition-colors`}>
      <div className={`flex items-center gap-2 font-mono text-sm font-semibold ${color}`}>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>{formatTime(elapsed)}</span>
        {paused && !stopped && <span className="text-xs font-normal opacity-60">(paused)</span>}
      </div>
    </div>
  );
}

function assessTiming(seconds: number, wineCount: number): { assessment: string; color: string; perWine: string } {
  const n = wineCount || 4;
  const mins = seconds / 60;
  const perWineMins = mins / n;
  const perWine = `${perWineMins.toFixed(1)} min/wine`;
  // 6-8 min per wine is ideal
  if (perWineMins < 4) return { assessment: "Very fast", color: "bg-accent/15 text-accent border-accent/30", perWine };
  if (perWineMins < 6) return { assessment: "Fast", color: "bg-accent/15 text-accent border-accent/30", perWine };
  if (perWineMins <= 8) return { assessment: "Ideal pace", color: "bg-success/15 text-success border-success/30", perWine };
  if (perWineMins <= 12) return { assessment: "A bit long", color: "bg-borderline/15 text-borderline border-borderline/30", perWine };
  return { assessment: "Too long", color: "bg-fail/15 text-fail border-fail/30", perWine };
}

export function TimingBadge({ seconds, wineCount = 4 }: { seconds: number; wineCount?: number }) {
  const label = formatTime(seconds);
  const { assessment, color, perWine } = assessTiming(seconds, wineCount);

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${color}`} title={perWine}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {label} — {assessment}
    </span>
  );
}

export function TimingFeedback({ seconds, wineCount = 4 }: { seconds: number; wineCount?: number }) {
  const n = wineCount || 4;
  const mins = seconds / 60;
  const perWineMins = mins / n;
  const label = formatTime(seconds);
  const perWineLabel = perWineMins.toFixed(1);
  const idealRange = `${n * 6}–${n * 8}`;

  let message: string;
  let color: string;

  if (perWineMins < 4) {
    message = `You completed ${n} wines in ${label} (${perWineLabel} min/wine). That's extremely fast — the MW exam expects 6–8 minutes per wine (${idealRange} min for this question). Make sure you're not rushing through sub-questions. Use the full time to demonstrate depth of reasoning.`;
    color = "border-accent/30 bg-accent/10";
  } else if (perWineMins < 6) {
    message = `You completed ${n} wines in ${label} (${perWineLabel} min/wine). That's fast — you're under the ${idealRange} min target for this question. Consider whether you could add more depth to your winemaking deductions or quality assessments.`;
    color = "border-accent/30 bg-accent/10";
  } else if (perWineMins <= 8) {
    message = `You completed ${n} wines in ${label} (${perWineLabel} min/wine). Ideal pace — this is right in the 6–8 min/wine sweet spot. You had enough time to be thorough without overrunning.`;
    color = "border-success/30 bg-success/10";
  } else if (perWineMins <= 12) {
    message = `You completed ${n} wines in ${label} (${perWineLabel} min/wine). You're over the ideal 8 min/wine pace. In the real exam with 12 wines total, this would eat into time for other questions. Aim for the ${idealRange} min range.`;
    color = "border-borderline/30 bg-borderline/10";
  } else {
    message = `You completed ${n} wines in ${label} (${perWineLabel} min/wine). That's well over the 8 min/wine ceiling — in the real MW exam, you'd be running out of time. Practice being more decisive in your identifications and briefer in your winemaking comments. Target: ${idealRange} min.`;
    color = "border-fail/30 bg-fail/10";
  }

  return (
    <div className={`rounded-lg border p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-1">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm font-semibold text-foreground">Time: {label}</span>
      </div>
      <p className="text-sm text-muted">{message}</p>
    </div>
  );
}
