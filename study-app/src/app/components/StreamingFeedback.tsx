"use client";

import { FeedbackMarkdown } from "./FeedbackMarkdown";
import { ThinkingTrace } from "./ThinkingTrace";

interface StreamingFeedbackProps {
  text: string;
  isStreaming: boolean;
  error: string | null;
  title: string;
  /**
   * The grader's summarized reasoning, streamed ahead of the answer text. Shown un-gated: by the
   * time any of these panels render, the candidate has submitted and the wines are revealed, so
   * there is nothing left to give away. Omit on surfaces that don't stream reasoning.
   */
  thinking?: string;
}

export function StreamingFeedback({
  text,
  isStreaming,
  error,
  title,
  thinking,
}: StreamingFeedbackProps) {
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
          {title}
        </h3>
        {isStreaming && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-accent streaming-dot" />
            <span className="text-xs text-accent">
              Thinking… images and diagrams appear once the full answer finishes — please wait
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-fail/10 border border-fail/30 rounded-lg p-3 mb-4">
          <p className="text-sm text-fail">{error}</p>
        </div>
      )}

      {/* Reasoning arrives before the first answer token, so this fills what used to be a silent
          gap — and stays available (collapsed) once the answer has landed. */}
      {thinking ? (
        <div className="mb-4">
          <ThinkingTrace
            status={null}
            statuses={[]}
            thinking={thinking}
            active={isStreaming && !text}
            idleLabel="Reasoning"
          />
        </div>
      ) : null}

      {text ? (
        <div className="markdown-content text-[15px] leading-relaxed">
          <FeedbackMarkdown streaming={isStreaming}>{text}</FeedbackMarkdown>
        </div>
      ) : isStreaming && !thinking ? (
        <div className="flex items-center gap-2 text-muted">
          <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
          <div
            className="w-2 h-2 rounded-full bg-accent/50 streaming-dot"
            style={{ animationDelay: "0.3s" }}
          />
          <div
            className="w-2 h-2 rounded-full bg-accent/50 streaming-dot"
            style={{ animationDelay: "0.6s" }}
          />
        </div>
      ) : null}
    </div>
  );
}
