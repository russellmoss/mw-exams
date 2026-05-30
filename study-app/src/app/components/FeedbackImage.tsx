"use client";

import { useState } from "react";
import { DiagramModal } from "./DiagramModal";

// A feedback illustration (hero banner or inline photo). Click to open it fullscreen in the shared
// zoom/pan lightbox so cropped/small images can be inspected at full size.
export function FeedbackImage({
  src,
  alt,
  isHero,
}: {
  src: string;
  alt: string;
  isHero: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className={isHero ? "hero-image" : undefined}
        style={{ cursor: "zoom-in" }}
        loading="lazy"
        onClick={() => setOpen(true)}
        title="Click to view full size"
      />
      {open && <DiagramModal imgSrc={src} title={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
