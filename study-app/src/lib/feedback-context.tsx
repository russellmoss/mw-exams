"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// What a study/drill screen tells the Feedback tab about the thing on screen right now, so the
// panel can render `About: Paper 2 · Question 1 · Wine 3 — Chablis…` and anchor the feedback to
// the right attempt/question. Everything is optional — the panel falls back to the pathname.
export interface FeedbackPageContext {
  paper?: number | null;
  questionNumber?: number | null;
  wineIndex?: number | null; // 1-based wine position within the question, for display
  wineLabel?: string | null; // e.g. "Chablis 1er Cru, Burgundy, France"
  attemptId?: number | null;
  questionId?: string | null;
  mode?: string | null;
  route?: string | null;
}

// A running study/drill timer the panel can pause while it is open and resume on close/send.
// getRemainingSeconds returns the live remaining value for the "Clock paused — 6:12 left." line,
// or null when there is no meaningful countdown (the line is then omitted).
export interface FeedbackTimerController {
  pause: () => void;
  resume: () => void;
  getRemainingSeconds: () => number | null;
}

interface FeedbackContextValue {
  context: FeedbackPageContext | null;
  setFeedbackContext: (ctx: FeedbackPageContext | null) => void;
  clearFeedbackContext: () => void;
  registerTimer: (controller: FeedbackTimerController | null) => void;
  timerRef: React.RefObject<FeedbackTimerController | null>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<FeedbackPageContext | null>(null);
  // The active timer lives in a ref so registering/clearing it never re-renders the tree, and the
  // panel reads the latest controller on demand.
  const timerRef = useRef<FeedbackTimerController | null>(null);

  const setFeedbackContext = useCallback((ctx: FeedbackPageContext | null) => setContext(ctx), []);
  const clearFeedbackContext = useCallback(() => setContext(null), []);
  const registerTimer = useCallback((controller: FeedbackTimerController | null) => {
    timerRef.current = controller;
  }, []);

  const value = useMemo(
    () => ({ context, setFeedbackContext, clearFeedbackContext, registerTimer, timerRef }),
    [context, setFeedbackContext, clearFeedbackContext, registerTimer]
  );

  return <FeedbackContext value={value}>{children}</FeedbackContext>;
}

function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within a FeedbackProvider");
  return ctx;
}

// For study/drill screens: publish the on-screen question/wine to the Feedback tab. Call when a
// question/wine loads and clear on unmount.
export function useFeedbackContext() {
  const { setFeedbackContext, clearFeedbackContext } = useFeedback();
  return { setFeedbackContext, clearFeedbackContext };
}

// For study/drill screens with a live timer: hand the Feedback tab pause/resume + a remaining
// getter so opening the panel pauses the clock (and resumes on close/send).
export function useFeedbackTimer() {
  const { registerTimer } = useFeedback();
  return { registerTimer };
}

// For the panel itself: read the current context + the registered timer controller.
export function useFeedbackPanelState() {
  const { context, timerRef } = useFeedback();
  return { context, timerRef };
}
