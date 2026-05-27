"use client";

import { useReducer, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  studyReducer,
  initialStudyState,
  type Question,
} from "@/lib/study-session";
import { useStreaming } from "@/lib/use-streaming";
import { saveSession } from "@/lib/session-tracker";
import { QuestionDisplay } from "../components/QuestionDisplay";
import { PreGlassReasoning } from "../components/PreGlassReasoning";
import { StreamingFeedback } from "../components/StreamingFeedback";
import { WineReveal } from "../components/WineReveal";
import { AnswerInput } from "../components/AnswerInput";
import { ModelAnswerReveal } from "../components/ModelAnswerReveal";

export default function StudyPage() {
  const router = useRouter();
  const [state, dispatch] = useReducer(studyReducer, initialStudyState);
  const [tastingNotes, setTastingNotes] = useState<string[]>([]);
  const [tastingLoading, setTastingLoading] = useState(false);

  const preGlassStream = useStreaming();
  const answerStream = useStreaming();

  // Load question from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("mw-current-question");
    if (stored) {
      try {
        const question: Question = JSON.parse(stored);
        dispatch({ type: "SELECT_QUESTION", question });
      } catch {
        router.push("/");
      }
    } else {
      router.push("/");
    }
  }, [router]);

  // Handle pre-glass reasoning submission
  const handleReasoningSubmit = useCallback(
    async (reasoning: string) => {
      if (state.step !== "pre-glass") return;
      dispatch({ type: "SUBMIT_REASONING", reasoning });

      const feedback = await preGlassStream.startStream(
        "/api/evaluate-reasoning",
        {
          questionText: state.question.text,
          reasoning,
          paper: state.question.paper,
          decisionMatrixContent: state.question.decisionMatrixContent || "",
        }
      );

      dispatch({ type: "PRE_GLASS_FEEDBACK_DONE", feedback });
    },
    [state, preGlassStream]
  );

  // Handle wine reveal
  const handleRevealWines = useCallback(async () => {
    if (state.step !== "reveal") return;
    setTastingLoading(true);

    try {
      const res = await fetch("/api/generate-tasting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wines: state.question.wines }),
      });

      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setTastingNotes(data.tastingNotes);
      dispatch({ type: "REVEAL_WINES", tastingNotes: data.tastingNotes });
    } catch (err) {
      console.error("Tasting generation error:", err);
      const fallback = state.question.wines.map(
        (w) => `**Wine ${w.slot}**\n\nTasting notes unavailable.`
      );
      setTastingNotes(fallback);
      dispatch({ type: "REVEAL_WINES", tastingNotes: fallback });
    } finally {
      setTastingLoading(false);
    }
  }, [state]);

  // Handle answer submission
  const handleAnswerSubmit = useCallback(
    async (answer: string) => {
      if (state.step !== "answer") return;
      dispatch({ type: "SUBMIT_ANSWER", answer });

      const feedback = await answerStream.startStream(
        "/api/evaluate-answer",
        {
          questionText: state.question.text,
          answer,
          modelAnswer: state.question.modelAnswer || "",
          paper: state.question.paper,
        }
      );

      // Save attempt to session history
      const lower = feedback.toLowerCase();
      const passEstimate: "pass" | "fail" | "borderline" | null =
        lower.includes("unlikely to pass") || lower.includes("not pass") || lower.includes("would fail")
          ? "fail"
          : lower.includes("borderline")
            ? "borderline"
            : lower.includes("pass")
              ? "pass"
              : null;

      saveSession({
        questionId: state.question.id,
        paper: state.question.paper,
        family: state.question.family,
        familyLabel: state.question.familyLabel,
        timestamp: Date.now(),
        passEstimate,
        marksEstimate: null,
      });

      dispatch({ type: "ANSWER_FEEDBACK_DONE", feedback });
    },
    [state, answerStream]
  );

  // Handle next question
  const handleNextQuestion = useCallback(() => {
    preGlassStream.reset();
    answerStream.reset();
    setTastingNotes([]);
    setTastingLoading(false);
    dispatch({ type: "RESET" });
    router.push("/");
  }, [router, preGlassStream, answerStream]);

  const currentQuestion =
    state.step !== "select-paper" ? state.question : null;

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={handleNextQuestion}
            className="text-sm text-muted hover:text-foreground transition-colors cursor-pointer"
          >
            &larr; Back to questions
          </button>
          {currentQuestion && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono px-2 py-1 rounded bg-accent/20 text-accent">
                {currentQuestion.paper === 1
                  ? "P1 Whites"
                  : currentQuestion.paper === 2
                    ? "P2 Reds"
                    : "P3 Special"}
              </span>
              <span className="text-xs font-mono px-2 py-1 rounded bg-card text-muted">
                {currentQuestion.familyLabel}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Progress bar */}
      {currentQuestion && (
        <div className="border-b border-border">
          <div className="max-w-4xl mx-auto px-6">
            <div className="flex">
              {[
                { key: "question", label: "Question" },
                { key: "pre-glass", label: "Stem Analysis" },
                { key: "pre-glass-feedback", label: "Feedback" },
                { key: "reveal", label: "Reveal" },
                { key: "answer", label: "Answer" },
                { key: "feedback", label: "Evaluation" },
                { key: "reveal-answer", label: "Review" },
              ].map((s, i) => {
                const steps = [
                  "question",
                  "pre-glass",
                  "pre-glass-feedback",
                  "reveal",
                  "answer",
                  "feedback",
                  "reveal-answer",
                ];
                const currentIdx = steps.indexOf(state.step);
                const stepIdx = steps.indexOf(s.key);
                const isActive = stepIdx === currentIdx;
                const isDone = stepIdx < currentIdx;

                return (
                  <div
                    key={s.key}
                    className={`flex-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider border-b-2 transition-colors ${
                      isActive
                        ? "border-accent text-accent"
                        : isDone
                          ? "border-accent/40 text-accent/60"
                          : "border-transparent text-muted/40"
                    }`}
                  >
                    {s.label}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Question view */}
          {state.step === "question" && (
            <QuestionDisplay
              question={state.question}
              onStartReasoning={() => dispatch({ type: "START_PRE_GLASS" })}
            />
          )}

          {/* Pre-glass reasoning */}
          {state.step === "pre-glass" && (
            <PreGlassReasoning
              question={state.question}
              onSubmit={handleReasoningSubmit}
            />
          )}

          {/* Pre-glass feedback streaming */}
          {state.step === "pre-glass-feedback" && (
            <div className="space-y-6">
              <StreamingFeedback
                text={preGlassStream.text}
                isStreaming={preGlassStream.isStreaming}
                error={preGlassStream.error}
                title="Coaching Feedback"
              />
            </div>
          )}

          {/* Wine reveal */}
          {state.step === "reveal" && (
            <div className="space-y-6">
              <StreamingFeedback
                text={
                  state.preGlassFeedback
                }
                isStreaming={false}
                error={null}
                title="Your Stem Analysis Feedback"
              />
              <div className="flex justify-center">
                <button
                  onClick={handleRevealWines}
                  disabled={tastingLoading}
                  className="px-10 py-3 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50"
                >
                  {tastingLoading
                    ? "Generating tasting notes..."
                    : "Reveal Wines & Tasting Notes"}
                </button>
              </div>
              {tastingLoading && (
                <WineReveal
                  tastingNotes={[]}
                  wineCount={state.question.wines.length}
                  isLoading={true}
                />
              )}
            </div>
          )}

          {/* Answer writing */}
          {state.step === "answer" && (
            <div className="space-y-6">
              <WineReveal
                tastingNotes={tastingNotes}
                wineCount={state.question.wines.length}
                isLoading={false}
              />
              <AnswerInput
                question={state.question}
                onSubmit={handleAnswerSubmit}
              />
            </div>
          )}

          {/* Answer feedback streaming */}
          {state.step === "feedback" && (
            <div className="space-y-6">
              <StreamingFeedback
                text={answerStream.text}
                isStreaming={answerStream.isStreaming}
                error={answerStream.error}
                title="Examiner Evaluation"
              />
            </div>
          )}

          {/* Model answer reveal */}
          {state.step === "reveal-answer" && (
            <div className="space-y-6">
              <StreamingFeedback
                text={state.answerFeedback}
                isStreaming={false}
                error={null}
                title="Examiner Evaluation"
              />
              <ModelAnswerReveal
                question={state.question}
                onNextQuestion={handleNextQuestion}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
