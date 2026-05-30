"use client";

import { FeedbackMarkdown } from "./FeedbackMarkdown";

interface StreamingFeedbackProps {
  text: string;
  isStreaming: boolean;
  error: string | null;
  title: string;
}

export function StreamingFeedback({
  text,
  isStreaming,
  error,
  title,
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

      {text ? (
        <div className="markdown-content text-[15px] leading-relaxed">
          <FeedbackMarkdown streaming={isStreaming}>{text}</FeedbackMarkdown>
        </div>
      ) : isStreaming ? (
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
