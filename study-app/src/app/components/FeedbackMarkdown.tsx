"use client";

import ReactMarkdown, { type Components } from "react-markdown";

// Renderer for generated feedback. Feedback markdown can contain a hero image (its alt is prefixed
// with "HERO::" by enrichFeedbackWithImages) plus up to three inline illustrations. The hero renders
// as a full-width banner; inline images use the default .markdown-content img styling.
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
};

export function FeedbackMarkdown({ children }: { children: string }) {
  return <ReactMarkdown components={components}>{children}</ReactMarkdown>;
}
