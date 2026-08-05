"use client";

import ReactMarkdown from "react-markdown";
import { describeSource, type WineProvenance } from "@/lib/wine-provenance";

interface WineRevealProps {
  tastingNotes: string[];
  wineCount: number;
  isLoading: boolean;
  /** Where each note's reference profile came from, in flight order. */
  provenance?: WineProvenance[];
  /**
   * Render the source list. MUST stay false anywhere the candidate has not yet answered — the URLs
   * name the producer and appellation, so showing them beside a blind note hands over the answer.
   */
  showSources?: boolean;
}

const TIER_LABEL: Record<string, string> = {
  tech_sheet: "Tech sheet",
  critic: "Critic notes",
  web: "Web sources",
  inferred: "Inferred",
};

function SourceList({ p }: { p: WineProvenance }) {
  if (!p.sources.length && p.evidence_tier !== "inferred") return null;
  return (
    <details className="mt-4 border-t border-border pt-3">
      <summary className="text-xs text-muted cursor-pointer hover:text-foreground transition-colors">
        {TIER_LABEL[p.evidence_tier ?? "web"] ?? "Sources"}
        {p.sources.length > 0 && ` · ${p.sources.length} source${p.sources.length === 1 ? "" : "s"}`}
        {p.totalFields > 0 && (
          <span className="tabular-nums">
            {" "}· {p.sourcedFields}/{p.totalFields} fields sourced
          </span>
        )}
      </summary>
      {p.sources.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {p.sources.map((s, i) => (
            <li key={s.url} className="flex gap-2 text-xs leading-relaxed">
              <span className="text-muted tabular-nums shrink-0">[{i + 1}]</span>
              <span className="min-w-0">
                <span className="text-muted">{describeSource(s)}</span>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 text-accent hover:text-accent-hover break-all"
                >
                  {s.url}
                </a>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-muted">
          No published source was found for this wine — the note is built from the model&apos;s
          knowledge of the producer, appellation and vintage.
        </p>
      )}
    </details>
  );
}

export function WineReveal({
  tastingNotes,
  wineCount,
  isLoading,
  provenance,
  showSources = false,
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
          {showSources && provenance?.[i] && <SourceList p={provenance[i]} />}
        </div>
      ))}
    </div>
  );
}
