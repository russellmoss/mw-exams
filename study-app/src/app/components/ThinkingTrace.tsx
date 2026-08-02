"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The live "show your working" panel, per DESIGN.md (bordered flat card, amber accent, 1.5s
 * streaming-dot pulse).
 *
 * Two visibility modes, because the same reasoning is safe in one place and a spoiler in another:
 *
 *   • `spoiler` (Stem Sniper, before the reveal) — the collapsed row shows ONLY our own phase
 *     labels, which never name a wine. The model's reasoning does name them, so it stays behind an
 *     explicitly-labelled "reveals the wines" toggle. That's the candidate's call to make.
 *   • default (grading, debriefs — the answer is already on screen) — the collapsed row shows a
 *     one-line tail of the actual reasoning, which is what makes it feel alive.
 */
export function ThinkingTrace({
  status,
  statuses,
  thinking,
  active,
  error,
  spoiler = false,
  idleLabel = "Working…",
}: {
  status: string | null;
  statuses: string[];
  thinking: string;
  active: boolean;
  error?: string | null;
  spoiler?: boolean;
  idleLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Pin the expanded trace to the newest reasoning while it's still arriving.
  useEffect(() => {
    if (open && active && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [thinking, statuses, open, active]);

  const hasThinking = thinking.trim().length > 0;
  // Last non-empty line of reasoning — the "short truncated version" in non-spoiler contexts.
  const tail = hasThinking
    ? thinking.trim().split("\n").filter(Boolean).slice(-1)[0] ?? ""
    : "";
  const headline = spoiler || !tail ? status ?? idleLabel : tail;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="flex gap-1 shrink-0 pt-1.5" aria-hidden>
          {[0, 0.3, 0.6].map((d) => (
            <div
              key={d}
              className={`w-2 h-2 rounded-full ${active ? "bg-accent/50 streaming-dot" : "bg-border"}`}
              style={{ animationDelay: `${d}s` }}
            />
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm text-muted truncate" title={headline}>
            {error ? <span className="text-fail">{error}</span> : headline}
          </div>
          {spoiler && hasThinking && (
            <div className="text-[11px] text-muted/60 mt-0.5 tabular-nums">
              reasoning · {thinking.length.toLocaleString()} characters
            </div>
          )}
        </div>

        {(hasThinking || statuses.length > 0) && (
          <button
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="shrink-0 text-[11px] text-muted hover:text-foreground border border-border hover:border-muted rounded-lg px-2.5 py-1 transition-colors cursor-pointer"
          >
            {open ? "Hide reasoning" : spoiler ? "Show reasoning (reveals the wines)" : "Show reasoning"}
          </button>
        )}
      </div>

      {open && (
        <div ref={bodyRef} className="border-t border-border max-h-72 overflow-y-auto px-4 py-3 space-y-3">
          {statuses.length > 0 && (
            <ol className="space-y-1">
              {statuses.map((s, i) => (
                <li key={`${i}-${s}`} className="text-[11px] text-muted flex gap-2">
                  <span className="text-muted/50 tabular-nums shrink-0">{String(i + 1).padStart(2, "0")}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          )}
          {hasThinking ? (
            <div className="border-t border-border/60 pt-3">
              <div className="text-[11px] font-medium text-muted/70 mb-1.5 uppercase tracking-wide">
                Model reasoning
              </div>
              <p className="text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed">{thinking}</p>
            </div>
          ) : (
            <p className="text-[11px] text-muted/60 border-t border-border/60 pt-3">
              No reasoning summary for this step — the model answered without extended thinking.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
