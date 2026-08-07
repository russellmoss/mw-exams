"use client";

// The "Learn more" card, on every slide of every tour surface.
//
// IT SHOWS THE NARRATION TRANSCRIPT. There is one body of depth per slide and it is the spoken
// script (src/lib/tour-narration.ts) — the card quotes it rather than restating it in a second,
// hand-written form. Two consequences worth stating, because both are the point:
//
//   • The read and the spoken can never disagree. A second copy would drift the first time someone
//     edited one and not the other, and the drift would be invisible: nobody proof-reads a card
//     against an MP3.
//   • Muting costs nothing. Before this, the depth behind a slide was audio-only for the fifteen
//     walkthrough slides, so anyone who muted, could not play audio, or simply reads faster than a
//     narrator got the headline and nothing else.
//
// The prose therefore reads as speech, and the card says so — it is presented as a transcript, with
// the speaker glyph, so the register is legible as a quotation rather than as loose writing.
//
// The narration is NOT paused while the card is open. It is the same text, so the voice reads along
// with the eye instead of competing with it, and the mute control stays one click away in the
// header for anyone who would rather it didn't.

import { useCallback, useEffect, useState } from "react";
import { narrationParagraphs, narrationTitle } from "@/lib/tour-narration";

export function TourLearnMoreButton({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const paragraphs = narrationParagraphs(id);

  // Escape closes. The arrow keys are swallowed while the card is open, because both walkthroughs
  // page slides on ArrowLeft/ArrowRight from a window listener — without this, reading the card and
  // reaching for the arrow keys silently changes the slide underneath it. A CAPTURE-phase listener
  // on window runs before those bubble-phase ones, so stopPropagation here is what actually blocks
  // them; a listener added in the bubble phase would fire too late.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") event.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!paragraphs.length) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-border px-5 py-2 text-sm font-medium text-muted hover:text-foreground hover:bg-card transition-colors cursor-pointer"
      >
        Learn more
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
          <button
            aria-label="Close"
            onClick={close}
            className="fixed inset-0 bg-background/70 backdrop-blur-sm cursor-default"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={narrationTitle(id)}
            className="relative w-full max-w-[34rem] max-h-[80vh] overflow-y-auto bg-card rounded-xl border border-border p-7 shadow-[0_25px_50px_rgba(0,0,0,0.5)] text-left"
          >
            <div className="flex items-start justify-between gap-4 mb-1.5">
              <h2 className="font-display text-[1.375rem] font-semibold leading-snug tracking-tight">
                {narrationTitle(id)}
              </h2>
              <button
                onClick={close}
                aria-label="Close"
                className="p-1 text-muted hover:text-foreground shrink-0 cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Names the card for what it is. Without this the spoken register ("Welcome.", "What you
                are watching is…") reads as an authoring slip rather than as a quotation. */}
            <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] text-muted mb-4">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M11 5 6 9H3v6h3l5 4z" />
                <path d="M15.5 8.8a4.5 4.5 0 010 6.4" />
              </svg>
              What the narration says
            </p>

            <div className="space-y-3">
              {paragraphs.map((paragraph, index) => (
                <p key={index} className="text-sm text-muted leading-[1.7]">
                  {paragraph}
                </p>
              ))}
            </div>

            <button
              onClick={close}
              className="mt-5 rounded-lg border border-border px-5 py-2 text-sm font-semibold text-accent hover:bg-card-hover transition-colors cursor-pointer"
            >
              Back to the tour
            </button>
          </div>
        </div>
      )}
    </>
  );
}
