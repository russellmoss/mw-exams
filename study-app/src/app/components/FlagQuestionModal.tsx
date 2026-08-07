"use client";

import { useState } from "react";
import { BinReasonChips } from "./BinReasonChips";
import { MAX_BIN_NOTE_CHARS } from "@/lib/bin-reasons";

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// FlagQuestionModal (Flag Question feature) — the candidate's "this question is unrealistic/broken"
// report, opened from the debrief. Cellar look: a flat bordered card over a dimmed backdrop, Fraunces
// title, a single amber accent. Reuses the EXACT admin BinReasonChips reason set (multi-select, amber
// fill when selected) so a flag speaks the same vocabulary the admin bin flow does — but the copy is
// always candidate-facing ("Flag", never "bin").
//
// Submitting POSTs to /api/question-flags, which withdraws the question from rotation, preserves the
// attempt, and routes the item into the admin review queue. States: default, submitting (spinner,
// disabled, "Flagging…"), error (inline red line). On success the parent closes this and swaps in a
// fresh question.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

// The wine reason ('Wrong wine for this paper', Right Paper Check) that opens the per-wine selector.
const WRONG_WINE_REASON = "wrong_colour_for_paper";

interface FlagWine {
  slot: number;
  fullText: string;
}

interface FlagQuestionModalProps {
  questionId: string;
  attemptId: number | null;
  // The flight's wines (label + name), so the candidate can mark WHICH wine is wrong when they choose
  // 'Wrong wine for this paper'. Optional: absent on call sites that don't carry the flight.
  wines?: FlagWine[];
  onClose: () => void;
  onFlagged: () => void;
}

export function FlagQuestionModal({ questionId, attemptId, wines, onClose, onFlagged }: FlagQuestionModalProps) {
  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [winePosition, setWinePosition] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(false);

  const toggle = (value: string) =>
    setReasons((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));

  const showWinePicker = reasons.includes(WRONG_WINE_REASON) && Array.isArray(wines) && wines.length > 0;
  const canSubmit = reasons.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(false);
    try {
      const res = await fetch("/api/question-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          questionId,
          attemptId,
          reasons,
          note: note.trim() || null,
          // Only meaningful with the 'Wrong wine for this paper' reason + a picked wine.
          winePosition: showWinePicker ? winePosition : null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onFlagged();
    } catch {
      setError(true);
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" onClick={submitting ? undefined : onClose} />
      <div className="relative w-full max-w-md bg-card rounded-xl border border-border shadow-2xl">
        <div className="px-5 pt-5 pb-3">
          <h3 className="font-display text-lg text-foreground">Flag this question</h3>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            Tell us what&rsquo;s wrong and we&rsquo;ll take it out of rotation while we review it.
          </p>
        </div>

        <div className="px-5 pb-2">
          <BinReasonChips selected={reasons} onToggle={toggle} />

          {showWinePicker && (
            <div className="mt-4">
              <label className="block text-xs text-muted mb-1.5">Which wine?</label>
              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Which wine is wrong">
                {wines!.map((w) => {
                  const on = winePosition === w.slot;
                  return (
                    <button
                      key={w.slot}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setWinePosition(on ? null : w.slot)}
                      className={`text-left text-xs px-3 py-2 rounded-lg border transition-colors cursor-pointer ${
                        on
                          ? "border-accent text-accent"
                          : "border-border text-muted hover:border-muted hover:text-foreground"
                      }`}
                    >
                      <span className="font-medium">Wine {w.slot}</span>
                      <span className="text-muted"> — {w.fullText}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label className="block text-xs text-muted mt-4 mb-1.5">Anything else? (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={MAX_BIN_NOTE_CHARS}
            placeholder="Add a detail if it helps…"
            className="w-full min-h-[72px] bg-background border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/60 resize-y"
            rows={3}
          />

          {error && (
            <p className="text-xs text-fail mt-2">Couldn&rsquo;t flag that &mdash; try again.</p>
          )}
        </div>

        <div className="px-5 py-4 flex items-center justify-end gap-2 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg border border-border text-muted hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors inline-flex items-center gap-2 ${
              canSubmit
                ? "bg-accent hover:bg-accent-hover text-background cursor-pointer"
                : "bg-border text-muted cursor-not-allowed"
            }`}
          >
            {submitting && (
              <span className="w-3.5 h-3.5 border-2 border-background/40 border-t-background rounded-full animate-spin" />
            )}
            {submitting ? "Flagging…" : "Flag question"}
          </button>
        </div>
      </div>
    </div>
  );
}
