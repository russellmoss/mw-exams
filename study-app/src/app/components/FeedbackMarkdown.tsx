"use client";

import { isValidElement } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { MermaidDiagram } from "./MermaidDiagram";

// Renderer for generated feedback. Feedback markdown can contain a hero image (its alt is prefixed
// with "HERO::" by enrichFeedbackWithImages), up to three inline illustrations, and — in the full
// debrief — Mermaid infographics in ```mermaid fenced blocks. The hero renders as a full-width
// banner; inline images use the default .markdown-content img styling; mermaid blocks render as
// diagrams via MermaidDiagram (which falls back to showing the source if the syntax is invalid).
const components: Components = {
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
        return <MermaidDiagram chart={String(childProps.children ?? "").trim()} />;
      }
    }
    return <pre className="overflow-x-auto">{props.children}</pre>;
  },
};

export function FeedbackMarkdown({ children }: { children: string }) {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
}
