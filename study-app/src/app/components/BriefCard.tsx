"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

/**
 * The BYO shopping brief, rendered as real markdown (headings/bold/lists — not raw ## and **)
 * with a corner copy control that grabs the full source, ready to paste into a text to whoever
 * is doing the buying. Used on the candidate's prep view and the partner share page.
 */
export function BriefCard({ title, markdown }: { title: string; markdown: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <section className="bg-card rounded-xl border border-border p-6 relative">
      <button
        onClick={() => {
          navigator.clipboard?.writeText(markdown).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
        }}
        title="Copy the full brief"
        aria-label="Copy the full brief"
        className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-muted hover:text-foreground hover:border-muted transition-colors cursor-pointer text-xs font-medium"
      >
        {copied ? (
          "Copied"
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
        {!copied && "Copy"}
      </button>
      <h2 className="text-lg font-semibold text-foreground mb-3 font-display pr-20">{title}</h2>
      <div className="markdown-content text-sm leading-relaxed">
        <ReactMarkdown>{markdown}</ReactMarkdown>
      </div>
    </section>
  );
}
