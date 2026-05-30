"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Fullscreen lightbox for a rendered diagram (Mermaid SVG markup) OR a photo (imgSrc). Wheel / +/-
// buttons zoom, click-drag pans, Esc or the backdrop closes. Rendered through a portal on
// document.body so it escapes the feedback card's overflow/stacking context.
export function DiagramModal({
  svg,
  imgSrc,
  title,
  onClose,
}: {
  svg?: string;
  imgSrc?: string;
  title?: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragging = useRef(false);
  const moved = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Native, non-passive wheel listener so we can preventDefault and zoom instead of scroll.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setScale((s) => Math.min(8, Math.max(0.4, s * (e.deltaY < 0 ? 1.12 : 0.89))));
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, []);

  const reset = () => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    setIsDragging(true);
    moved.current = false;
    last.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
    last.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => {
    dragging.current = false;
    setIsDragging(false);
  };

  const btn =
    "h-8 min-w-8 px-2 rounded-lg border border-border bg-card text-muted hover:text-foreground hover:border-muted text-sm flex items-center justify-center";

  const stageStyle: React.CSSProperties = {
    transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
    transformOrigin: "center center",
    transition: isDragging ? "none" : "transform 60ms linear",
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex flex-col"
      onClick={onClose}
    >
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-border/60"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm font-semibold text-muted uppercase tracking-wider mr-auto truncate">
          {title || "Diagram"}
        </span>
        <button className={btn} onClick={() => setScale((s) => Math.max(0.4, s * 0.89))} aria-label="Zoom out">
          −
        </button>
        <span className="text-xs text-muted tabular-nums w-12 text-center">
          {Math.round(scale * 100)}%
        </span>
        <button className={btn} onClick={() => setScale((s) => Math.min(8, s * 1.12))} aria-label="Zoom in">
          +
        </button>
        <button className={btn} onClick={reset} aria-label="Reset view">
          Reset
        </button>
        <button className={btn} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      <div
        ref={stageRef}
        className="flex-1 overflow-hidden cursor-grab active:cursor-grabbing touch-none select-none"
        onClick={() => {
          // A click that wasn't a drag, on the empty stage, closes; clicks on the diagram don't.
          if (!moved.current) onClose();
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {svg ? (
          <div
            className="w-full h-full flex items-center justify-center [&_svg]:max-w-none [&_svg]:w-auto"
            style={stageStyle}
            onClick={(e) => e.stopPropagation()}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={stageStyle}
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imgSrc}
              alt={title || "image"}
              draggable={false}
              className="max-w-none w-auto max-h-[85vh]"
            />
          </div>
        )}
      </div>

      <div className="px-4 py-2 text-center text-xs text-muted border-t border-border/60">
        Scroll to zoom · drag to pan · Esc to close
      </div>
    </div>,
    document.body
  );
}
