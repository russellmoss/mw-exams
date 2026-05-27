"use client";

import ReactMarkdown from "react-markdown";

interface WineRevealProps {
  tastingNotes: string[];
  wineCount: number;
  isLoading: boolean;
}

export function WineReveal({
  tastingNotes,
  wineCount,
  isLoading,
}: WineRevealProps) {
  if (isLoading) {
    return (
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Generating Tasting Notes
        </h3>
        <div className="space-y-4">
          {Array.from({ length: wineCount }).map((_, i) => (
            <div key={i} className="animate-pulse space-y-2">
              <div className="h-4 w-24 bg-border rounded" />
              <div className="h-3 w-full bg-border/60 rounded" />
              <div className="h-3 w-4/5 bg-border/60 rounded" />
              <div className="h-3 w-3/5 bg-border/60 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
        Tasting Notes
      </h3>
      {tastingNotes.map((note, i) => (
        <div
          key={i}
          className="bg-card rounded-xl border border-border p-6 font-[family-name:var(--font-geist-mono)] text-sm leading-relaxed"
        >
          <div className="markdown-content">
            <ReactMarkdown>{note}</ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}
