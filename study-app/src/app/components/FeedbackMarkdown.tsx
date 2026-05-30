"use client";

import { isValidElement, useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { MermaidDiagram } from "./MermaidDiagram";

// Renderer for generated feedback. Feedback markdown can contain a hero image (its alt is prefixed
// with "HERO::" by enrichFeedbackWithImages), up to three inline illustrations, and — in the full
// debrief — Mermaid infographics in ```mermaid fenced blocks. The hero renders as a full-width
// banner; inline images use the default .markdown-content img styling; mermaid blocks render as
// diagrams via MermaidDiagram (which falls back to showing the source if the syntax is invalid).
//
// `streaming`: while the text is still arriving, react-markdown treats an as-yet-unclosed ```mermaid
// fence as a code block running to end-of-text, so MermaidDiagram would repeatedly receive PARTIAL
// (invalid) chart source and get stuck in its error/raw-text fallback. We therefore show a lightweight
// placeholder for mermaid blocks during streaming and only mount the real diagram once the stream
// completes and the chart source is stable — which is why history (always complete text) renders fine.
function buildComponents(streaming: boolean): Components {
  return {
    img(props) {
      const alt = typeof props.alt === "string" ? props.alt : "";
      const src = typeof props.src === "string" ? props.src : "";
      const isHero = alt.startsWith("HERO::");
      const cleanAlt = isHero ? alt.slice("HERO::".length) : alt;
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={cleanAlt}
          className={isHero ? "hero-image" : undefined}
          loading="lazy"
        />
      );
    },
    // react-markdown renders a fenced block as <pre><code class="language-xxx">…</code></pre>.
    // Intercept language-mermaid and render the diagram instead of a code block.
    pre(props) {
      const child = props.children;
      if (isValidElement(child)) {
        const childProps = child.props as { className?: string; children?: unknown };
        if ((childProps.className || "").includes("language-mermaid")) {
          if (streaming) {
            return (
              <div className="bg-card rounded-xl border border-border p-6 animate-pulse">
                <div className="h-40 bg-border/30 rounded" />
                <p className="text-xs text-muted mt-3">Diagram renders when feedback completes…</p>
              </div>
            );
          }
          return <MermaidDiagram chart={String(childProps.children ?? "").trim()} />;
        }
      }
      return <pre className="overflow-x-auto">{props.children}</pre>;
    },
  };
}

export function FeedbackMarkdown({
  children,
  streaming = false,
}: {
  children: string;
  streaming?: boolean;
}) {
  const components = useMemo(() => buildComponents(streaming), [streaming]);
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
}
