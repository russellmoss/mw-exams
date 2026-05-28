"use client";

import { useState, useRef, useEffect } from "react";

interface FeedbackButtonProps {
  attemptId: number | null;
  step: string;
}

export function FeedbackButton({ attemptId, step }: FeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [open]);

  // Reset sent state when step changes
  useEffect(() => {
    setSent(false);
  }, [step]);

  const handleSubmit = async () => {
    if (!feedback.trim() || !attemptId) return;
    setSaving(true);

    try {
      await fetch("/api/save-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          attemptId,
          user_feedback: `[${step}] ${feedback.trim()}`,
        }),
      });
      setSent(true);
      setFeedback("");
      setTimeout(() => {
        setOpen(false);
        setSent(false);
      }, 1500);
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Floating button — bottom-left, subtle */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full bg-card border border-border text-muted hover:text-foreground hover:border-accent/40 transition-colors cursor-pointer shadow-sm text-xs font-medium"
        title="Leave feedback on this question"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
        </svg>
        Feedback
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-md bg-card rounded-xl border border-border shadow-2xl">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Leave Feedback</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-muted hover:text-foreground transition-colors cursor-pointer p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5">
              {sent ? (
                <div className="text-center py-4">
                  <p className="text-sm text-accent font-medium">Thanks! Feedback saved.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted mb-3">
                    Anything about the question, tasting notes, grading, or the app itself. This gets saved to your attempt record.
                  </p>
                  <textarea
                    ref={textareaRef}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="e.g. The tasting notes felt off, grading was too harsh, question was ambiguous..."
                    className="w-full min-h-[100px] bg-background border border-border rounded-lg p-3 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:border-accent/60 resize-y"
                    rows={4}
                  />
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={handleSubmit}
                      disabled={!feedback.trim() || !attemptId || saving}
                      className={`px-5 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                        feedback.trim() && attemptId && !saving
                          ? "bg-accent hover:bg-accent-hover text-background"
                          : "bg-border text-muted cursor-not-allowed"
                      }`}
                    >
                      {saving ? "Saving..." : "Send Feedback"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
