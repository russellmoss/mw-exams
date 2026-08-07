"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useDraft } from "@/lib/use-draft";
import { useFeedbackPanelState, type FeedbackPageContext } from "@/lib/feedback-context";
import { formatMMSS } from "@/lib/pace";

// Surfaces where the Feedback tab must not appear: unauthenticated / shared screens.
const HIDDEN_EXACT = new Set(["/login", "/forgot-password", "/reset-password", "/onboarding"]);
function isHidden(pathname: string): boolean {
  if (HIDDEN_EXACT.has(pathname)) return true;
  if (pathname.startsWith("/shop")) return true;
  return false;
}

const CHIPS: { value: string; label: string }[] = [
  { value: "wrong_misleading", label: "Wrong / misleading" },
  { value: "confusing_wording", label: "Confusing wording" },
  { value: "grading_off", label: "Grading felt off" },
  { value: "bug", label: "Bug" },
  { value: "idea", label: "Idea" },
];

// Does the page context carry a real question/wine to anchor to?
function hasQuestionContext(ctx: FeedbackPageContext | null): boolean {
  if (!ctx) return false;
  return Boolean(ctx.questionId || ctx.attemptId || ctx.paper != null || ctx.questionNumber != null);
}

function buildContextLine(ctx: FeedbackPageContext): string {
  const parts: string[] = [];
  if (ctx.paper != null) parts.push(`Paper ${ctx.paper}`);
  if (ctx.questionNumber != null) parts.push(`Question ${ctx.questionNumber}`);
  if (ctx.wineIndex != null) parts.push(`Wine ${ctx.wineIndex}`);
  let line = parts.join(" · ");
  if (ctx.wineLabel) line = line ? `${line} — ${ctx.wineLabel}` : ctx.wineLabel;
  return `About: ${line || "this question"}`;
}

function SpeechBubbleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 011.037-.443 48.282 48.282 0 005.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
      />
    </svg>
  );
}

export function FeedbackTab() {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const { context, timerRef } = useFeedbackPanelState();
  const [open, setOpen] = useState(false);
  const tabRef = useRef<HTMLButtonElement>(null);

  const hidden = isHidden(pathname);

  // Escape closes (handled in the panel), but if the route becomes a hidden surface while open,
  // close so the panel can never strand over /login etc. Adjusting state during render (React's
  // recommended pattern) avoids a cascading effect re-render.
  const [prevHidden, setPrevHidden] = useState(hidden);
  if (hidden !== prevHidden) {
    setPrevHidden(hidden);
    if (hidden && open) setOpen(false);
  }

  if (loading || !user || hidden) return null;

  return (
    <>
      <button
        ref={tabRef}
        type="button"
        aria-label="Feedback"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="fixed z-40 bottom-20 right-6 md:bottom-6 flex items-center justify-center gap-1.5 rounded-full bg-stone-900/80 backdrop-blur border border-stone-700 hover:border-amber-500/60 text-stone-300 hover:text-amber-400 transition-colors cursor-pointer h-11 w-11 md:h-auto md:w-auto md:px-3.5 md:py-2"
      >
        <SpeechBubbleIcon className="w-4 h-4 shrink-0" />
        <span className="hidden md:inline text-[13px] font-medium">Feedback</span>
      </button>

      {open && (
        <FeedbackPanel
          pathname={pathname}
          context={context}
          timerRef={timerRef}
          onClose={() => {
            setOpen(false);
            // Return focus to the tab it opened from.
            requestAnimationFrame(() => tabRef.current?.focus());
          }}
        />
      )}
    </>
  );
}

function FeedbackPanel({
  pathname,
  context,
  timerRef,
  onClose,
}: {
  pathname: string;
  context: FeedbackPageContext | null;
  timerRef: React.RefObject<import("@/lib/feedback-context").FeedbackTimerController | null>;
  onClose: () => void;
}) {
  const canAttachQuestion = hasQuestionContext(context);
  const [scopeQuestion, setScopeQuestion] = useState(canAttachQuestion);
  const [category, setCategory] = useState<string | null>(null);
  const [body, setBody, clearBody] = useDraft("feedback-tab");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const [sent, setSent] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Timer pause bookkeeping. Opening pauses; closing/sending resumes. We measure the paused span so
  // it can be excluded from the answer clock and recorded as pausedMs on the attempt.
  const pausedAtRef = useRef<number | null>(null);
  const timerWasRunningRef = useRef(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  // Pause the study/drill clock while the panel is open, and read the live remaining value.
  useEffect(() => {
    const controller = timerRef.current;
    if (controller) {
      const rem = controller.getRemainingSeconds();
      if (rem != null) {
        timerWasRunningRef.current = true;
        pausedAtRef.current = Date.now();
        controller.pause();
        setRemaining(rem);
        const interval = setInterval(() => {
          setRemaining(controller.getRemainingSeconds());
        }, 1000);
        return () => clearInterval(interval);
      }
    }
    return undefined;
    // Run once on mount — the controller identity is stable for the life of the open panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumeTimer = useCallback((): number | null => {
    const controller = timerRef.current;
    if (timerWasRunningRef.current && controller) {
      controller.resume();
      const start = pausedAtRef.current;
      pausedAtRef.current = null;
      return start != null ? Date.now() - start : null;
    }
    return null;
  }, [timerRef]);

  // Close: resume the clock (unless already resumed by a send) and hand focus back to the tab.
  const handleClose = useCallback(() => {
    resumeTimer();
    onClose();
  }, [resumeTimer, onClose]);

  // Esc closes; Tab is trapped inside the panel.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleClose();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
        );
        const list = Array.from(focusable).filter((el) => !el.hasAttribute("disabled"));
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handleClose]);

  // Autofocus the textarea on open.
  useEffect(() => {
    if (!sent) textareaRef.current?.focus();
  }, [sent]);

  // Auto-dismiss the sent state after 4s.
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => onClose(), 4000);
    return () => clearTimeout(t);
  }, [sent, onClose]);

  const canSend = body.trim().length >= 1 && !sending;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    setError(false);
    // Resume the clock at send time and capture how long it was paused.
    const pausedMs = resumeTimer();
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          category: category ?? undefined,
          scope: scopeQuestion && canAttachQuestion ? "question" : "general",
          questionId: context?.questionId ?? undefined,
          attemptId: context?.attemptId ?? undefined,
          paper: context?.paper ?? undefined,
          questionNumber: context?.questionNumber ?? undefined,
          wineIndex: context?.wineIndex ?? undefined,
          wineLabel: context?.wineLabel ?? undefined,
          route: context?.route || pathname,
          pausedMs: pausedMs ?? undefined,
          // Bug-triage context — always sent.
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          viewport:
            typeof window !== "undefined" ? { w: window.innerWidth, h: window.innerHeight } : undefined,
        }),
      });
      if (!res.ok) throw new Error("send failed");
      clearBody();
      setSent(true);
    } catch {
      // Draft is preserved; re-enable Send.
      setError(true);
      // If the send failed we've already resumed — re-pause so the clock isn't secretly running
      // behind the still-open panel.
      const controller = timerRef.current;
      if (timerWasRunningRef.current && controller) {
        pausedAtRef.current = Date.now();
        controller.pause();
      }
    } finally {
      setSending(false);
    }
  };

  const showClockLine = remaining != null;

  return (
    <div className="fixed inset-0 z-40">
      {/* Scrim — click to close. Sits under the panel; the paused timer strip behind it stays
          visible (and renders its paused style) so the pause is never hidden. */}
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} aria-hidden="true" />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Feedback"
        className="absolute inset-y-0 right-0 w-full md:w-[380px] border-l border-stone-800 bg-stone-950 flex flex-col transition-transform duration-200 ease-out"
        style={{ transform: "translateX(0)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800">
          <h2 className="font-display text-[20px] text-stone-100">Feedback</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={handleClose}
            className="text-stone-400 hover:text-stone-200 transition-colors cursor-pointer p-1"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Clock-paused line — only when a timer is actually running. */}
        {showClockLine && !sent && (
          <div className="px-5 pt-3 -mb-1">
            <p className="text-xs text-amber-400/90">Clock paused — {formatMMSS(remaining!)} left.</p>
          </div>
        )}

        {sent ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/40">
              <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <p className="text-stone-100 font-medium">Thanks — logged.</p>
            {remaining != null && <p className="text-xs text-stone-400">Clock resumed.</p>}
            <button
              type="button"
              onClick={onClose}
              className="mt-1 px-4 py-2 rounded-lg border border-stone-700 text-stone-300 hover:text-stone-100 hover:border-stone-500 text-sm font-medium transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
            {/* Context inset card */}
            {canAttachQuestion && context && (
              <div>
                <div className="rounded-lg border border-stone-800 bg-stone-900/40 px-3 py-2">
                  <p className="text-xs text-stone-300">
                    {scopeQuestion ? buildContextLine(context) : "About: the app in general"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setScopeQuestion((v) => !v)}
                  className="mt-1.5 text-xs text-amber-400/90 hover:text-amber-300 transition-colors cursor-pointer"
                >
                  {scopeQuestion ? "Not about this — general feedback" : "Attach this question again"}
                </button>
              </div>
            )}
            {!canAttachQuestion && (
              <div className="rounded-lg border border-stone-800 bg-stone-900/40 px-3 py-2">
                <p className="text-xs text-stone-300">About: the app in general</p>
              </div>
            )}

            {/* Chips — single-select, optional */}
            <div className="flex flex-wrap gap-1.5">
              {CHIPS.map((chip) => {
                const selected = category === chip.value;
                return (
                  <button
                    key={chip.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setCategory((c) => (c === chip.value ? null : chip.value))}
                    className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer ${
                      selected
                        ? "bg-amber-500/15 border-amber-500 text-amber-300"
                        : "border-stone-700 text-stone-400 hover:text-stone-200"
                    }`}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder="What happened, or what would you change?"
              className="w-full bg-stone-900 border border-stone-700 focus:border-amber-500/60 rounded-lg p-3 text-sm text-stone-100 placeholder:text-stone-500 focus:outline-none resize-y"
            />

            {error && (
              <p className="text-xs text-red-400">Couldn&rsquo;t send that — try again.</p>
            )}

            <button
              type="button"
              onClick={handleSend}
              disabled={!canSend}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                canSend
                  ? "bg-amber-500 hover:bg-amber-400 text-stone-950 cursor-pointer"
                  : "bg-stone-800 text-stone-500 cursor-not-allowed"
              }`}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
