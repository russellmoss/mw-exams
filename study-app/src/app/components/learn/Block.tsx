"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import type { Block as BlockType, CalloutVariant } from "@/lib/learning-units";
import { GradeBands, type GradeBandsProps } from "./GradeBands";

// Inline markdown (paragraphs, bold, lists) styled by the app's .markdown-content rules.
function MD({ children }: { children: string }) {
  return (
    <div className="markdown-content text-sm leading-relaxed">
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

const CALLOUT_STYLE: Record<CalloutVariant, string> = {
  key: "border-accent bg-accent/10",
  warning: "border-fail bg-fail/10",
  insight: "border-success bg-success/10",
  note: "border-border bg-card-hover",
};

const VISUALS: Record<string, (props: Record<string, unknown>) => ReactNode> = {
  GradeBands: (props) => <GradeBands props={props as unknown as GradeBandsProps} />,
};

export function Block({ block }: { block: BlockType }) {
  switch (block.type) {
    case "prose":
      return <MD>{block.md}</MD>;

    case "callout": {
      const variant = block.variant ?? "note";
      return (
        <div className={`rounded-xl border-l-4 p-4 ${CALLOUT_STYLE[variant]}`}>
          {block.title && (
            <div className="text-sm font-semibold text-foreground mb-1">{block.title}</div>
          )}
          <MD>{block.md}</MD>
        </div>
      );
    }

    case "keytakeaway":
      return (
        <div className="border-l-2 border-accent pl-4 py-1">
          <div className="text-[0.7rem] font-semibold uppercase tracking-widest text-accent mb-1">
            Key takeaway
          </div>
          <div className="font-display text-lg text-foreground leading-snug">
            <ReactMarkdown>{block.md}</ReactMarkdown>
          </div>
        </div>
      );

    case "table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-card-hover">
                {block.columns.map((c, i) => (
                  <th key={i} className="text-left font-semibold text-foreground py-2.5 px-3">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="border-t border-border/40">
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`py-2 px-3 ${ci === 0 ? "font-medium text-foreground" : "text-muted"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {block.caption && <p className="text-xs text-muted mt-2 italic">{block.caption}</p>}
        </div>
      );

    case "example": {
      const ref = [
        block.year && `${block.year}`,
        block.paper && `Paper ${block.paper}`,
        block.question && `Q${block.question}`,
      ]
        .filter(Boolean)
        .join(" · ");
      return (
        <div className="rounded-xl border border-border bg-background/40 p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[0.65rem] font-semibold uppercase tracking-wide text-accent">
              From the exam
            </span>
            {ref && (
              <span className="text-[0.65rem] text-muted border border-border rounded-full px-2 py-0.5 tabular-nums">
                {ref}
              </span>
            )}
          </div>
          {block.stem && <p className="text-sm text-foreground italic leading-relaxed mb-2">“{block.stem}”</p>}
          {block.wine && (
            <p className="text-xs text-muted font-mono mb-2 break-words">{block.wine}</p>
          )}
          {block.why && <p className="text-sm text-muted leading-relaxed">{block.why}</p>}
        </div>
      );
    }

    case "model-answer":
      return (
        <div className="rounded-xl border border-border bg-background/40 p-4">
          {block.label && (
            <div className="text-sm font-semibold text-foreground mb-2">{block.label}</div>
          )}
          <blockquote className="border-l-2 border-accent/60 pl-3 text-sm text-foreground/90 italic leading-relaxed">
            {block.excerpt}
          </blockquote>
          {block.annotation && (
            <p className="text-xs text-muted leading-relaxed mt-2">{block.annotation}</p>
          )}
        </div>
      );

    case "visual": {
      const render = VISUALS[block.component];
      if (!render) {
        return (
          <div className="rounded-xl border border-dashed border-border p-4 text-xs text-muted">
            [visual: {block.component} — not yet built]
          </div>
        );
      }
      return (
        <figure className="my-2">
          {render(block.props)}
          {block.caption && (
            <figcaption className="text-xs text-muted mt-2 text-center italic">{block.caption}</figcaption>
          )}
        </figure>
      );
    }

    default:
      return null;
  }
}
