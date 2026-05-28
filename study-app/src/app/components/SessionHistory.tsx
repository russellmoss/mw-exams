"use client";

import { useState } from "react";
import {
  loadSessions,
  clearSessions,
  formatTimestamp,
  type SessionEntry,
} from "@/lib/session-tracker";

export function SessionHistory() {
  const [sessions, setSessions] = useState<SessionEntry[]>(() => loadSessions());
  const [showAll, setShowAll] = useState(false);

  if (sessions.length === 0) return null;

  const displayed = showAll ? sessions : sessions.slice(0, 5);

  const passCount = sessions.filter((s) => s.passEstimate === "pass").length;
  const failCount = sessions.filter((s) => s.passEstimate === "fail").length;
  const borderlineCount = sessions.filter(
    (s) => s.passEstimate === "borderline"
  ).length;

  return (
    <div className="mt-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Session History
        </h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs">
            {passCount > 0 && (
              <span className="text-success">{passCount} pass</span>
            )}
            {borderlineCount > 0 && (
              <span className="text-borderline">
                {borderlineCount} borderline
              </span>
            )}
            {failCount > 0 && (
              <span className="text-fail">{failCount} fail</span>
            )}
          </div>
          <button
            onClick={() => {
              clearSessions();
              setSessions([]);
            }}
            className="text-xs text-muted hover:text-fail transition-colors cursor-pointer"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="bg-card rounded-xl border border-border divide-y divide-border">
        {displayed.map((s, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-4">
            {/* Result indicator */}
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${
                s.passEstimate === "pass"
                  ? "bg-success"
                  : s.passEstimate === "fail"
                    ? "bg-fail"
                    : s.passEstimate === "borderline"
                      ? "bg-borderline"
                      : "bg-muted"
              }`}
            />

            {/* Question info */}
            <div className="flex-1 min-w-0">
              <span className="text-sm text-foreground">
                {s.questionId}
              </span>
              <span className="text-xs text-muted ml-3">
                P{s.paper} / {s.familyLabel}
              </span>
            </div>

            {/* Marks */}
            {s.marksEstimate && (
              <span className="text-xs text-muted font-mono shrink-0">
                {s.marksEstimate}
              </span>
            )}

            {/* Timestamp */}
            <span className="text-xs text-muted shrink-0 w-16 text-right">
              {formatTimestamp(s.timestamp)}
            </span>
          </div>
        ))}
      </div>

      {sessions.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs text-muted hover:text-foreground transition-colors cursor-pointer"
        >
          {showAll
            ? "Show less"
            : `Show all ${sessions.length} sessions`}
        </button>
      )}
    </div>
  );
}
