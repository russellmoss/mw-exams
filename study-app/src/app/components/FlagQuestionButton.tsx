"use client";

import { useState } from "react";
import { FlagQuestionModal } from "./FlagQuestionModal";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// FlagQuestionButton (Flag Question feature) — the debrief-footer control that lets a candidate flag a
// served question as unrealistic/broken. Rendered after the model answer / final grade in the full,
// stem-only and known-wine debriefs, beside the Feedback button. Muted, border-defined ghost styling:
// stone text, amber on hover. Candidate wording is always "Flag question" — never "bin".
//
// It owns the whole small flow:
//   • closed → the ghost "⚑ Flag question" button;
//   • open   → FlagQuestionModal;
//   • flagged → a calm inline confirmation card WHERE the debrief actions were, then it asks the parent
//               to auto-load a fresh question in the same paper/family/mode (skeleton while loading),
//               with a "Back to paper" escape hatch.
// Once the parent swaps in the fresh question the debrief unmounts, so this whole panel disappears.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

interface FlagQuestionButtonProps {
  questionId: string;
  attemptId: number | null;
  // Load the next question in the same paper/family/mode (parent owns the fetch + reducer dispatch).
  onLoadNext: () => Promise<void> | void;
  // Escape hatch back to the paper/question list.
  onBackToPaper: () => void;
}

export function FlagQuestionButton({ questionId, attemptId, onLoadNext, onBackToPaper }: FlagQuestionButtonProps) {
  const [open, setOpen] = useState(false);
  const [flagged, setFlagged] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);

  const handleFlagged = async () => {
    setOpen(false);
    setFlagged(true);
    setLoadingNext(true);
    try {
      await onLoadNext();
    } finally {
      // If the parent swapped in a fresh question this component has already unmounted; this is just a
      // safety net for the case where loading returned without a navigation.
      setLoadingNext(false);
    }
  };

  // Post-flag: calm confirmation + fresh-question skeleton, replacing the debrief actions.
  if (flagged) {
    return (
      <div className="rounded-xl border border-accent/40 bg-accent/5 p-6 text-center space-y-4">
        <p className="text-sm text-foreground">
          Thanks &mdash; that one&rsquo;s out of rotation while we review it.
        </p>
        {loadingNext ? (
          <div className="space-y-3" aria-live="polite">
            <div className="h-3 w-2/3 mx-auto rounded bg-border animate-pulse" />
            <div className="h-3 w-1/2 mx-auto rounded bg-border animate-pulse" />
            <p className="text-xs text-muted">Loading a fresh question…</p>
          </div>
        ) : (
          <button
            type="button"
            onClick={onBackToPaper}
            className="text-xs text-muted hover:text-foreground underline underline-offset-2 transition-colors cursor-pointer"
          >
            Back to paper
          </button>
        )}
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg border border-border text-muted hover:text-accent hover:border-accent/50 transition-colors cursor-pointer"
        title="Flag this question as unrealistic or broken"
      >
        <span aria-hidden>⚑</span> Flag question
      </button>

      {open && (
        <FlagQuestionModal
          questionId={questionId}
          attemptId={attemptId}
          onClose={() => setOpen(false)}
          onFlagged={handleFlagged}
        />
      )}
    </>
  );
}
