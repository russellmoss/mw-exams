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

// What a study/drill screen tells the COACH about the thing on screen right now, so a report can be
// anchored to the right attempt/question. Named for the Feedback tab it was built for; that tab and
// the floating Feedback pill that followed it are both gone, and the Coach dock is the sole consumer.
//
// Everything is optional, but `questionId` is close to mandatory in practice: report_question and
// flag_defect both raise a blocker card without one, so a screen that shows a question and does not
// publish it here is a screen from which that question cannot be reported.
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

// A running study/drill timer the Coach can pause while it is open and resume on close/send.
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

// For study/drill screens: publish the on-screen question/wine to the Coach. Call when a
// question/wine loads and clear on unmount.
export function useFeedbackContext() {
  const { setFeedbackContext, clearFeedbackContext } = useFeedback();
  return { setFeedbackContext, clearFeedbackContext };
}

// For study/drill screens with a live timer: hand the Coach pause/resume + a remaining
// getter so opening the dock pauses the clock (and resumes on close/send).
export function useFeedbackTimer() {
  const { registerTimer } = useFeedback();
  return { registerTimer };
}

// For the Coach dock itself: read the current context + the registered timer controller.
export function useFeedbackPanelState() {
  const { context, timerRef } = useFeedback();
  return { context, timerRef };
}
