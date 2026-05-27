"use client";

import { useReducer, useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  studyReducer,
  initialStudyState,
  type Question,
  type StudyState,
} from "@/lib/study-session";
import { useStreaming } from "@/lib/use-streaming";
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
  const [modelAnswerReady, setModelAnswerReady] = useState(false);
  const [waitingForModel, setWaitingForModel] = useState(false);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [preGlassReasoning, setPreGlassReasoning] = useState("");

  const evalStream = useStreaming();
  const modelAnswerPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load question from sessionStorage on mount
  useEffect(() => {
    const stored = sessionStorage.getItem("mw-current-question");
    if (stored) {
      try {
        const question: Question = JSON.parse(stored);
        dispatch({ type: "SELECT_QUESTION", question });

        // Create attempt in Neon
        fetch("/api/save-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", questionId: question.id }),
        })
          .then((r) => r.json())
          .then((d) => {
            if (d.attempt?.id) setAttemptId(d.attempt.id);
          })
          .catch(() => {});

        // If question doesn't have a model answer, start background generation
        if (!question.modelAnswer || question.modelAnswer.length < 100) {
          fetch("/api/generate-model-answer", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              questionId: question.id,
              questionText: question.text,
              wines: question.wines,
              paper: question.paper,
              family: question.family,
            }),
          })
            .then((r) => r.json())
            .then((d) => {
              if (d.success && d.question?.model_answer) {
                // Update the question in state with the model answer
                const updated = {
                  ...question,
                  modelAnswer: d.question.model_answer,
                  proposedAnnotation: d.question.proposed_annotation,
                  reasoningTrace: d.question.reasoning_trace,
                  studyDiagramAssist: d.question.study_diagram_assist,
                };
                sessionStorage.setItem("mw-current-question", JSON.stringify(updated));
                setModelAnswerReady(true);
              }
            })
            .catch(() => {});
        } else {
          setModelAnswerReady(true);
        }
      } catch {
        router.push("/");
      }
    } else {
      router.push("/");
    }
  }, [router]);

  // Poll for model answer readiness (if generated in background)
  useEffect(() => {
    if (modelAnswerReady) return;
    if (state.step === "select-paper") return;

    const question = state.question;

    modelAnswerPollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/check-model-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: question.id }),
        });
        const data = await res.json();
        if (data.ready) {
          setModelAnswerReady(true);
          if (modelAnswerPollRef.current) {
            clearInterval(modelAnswerPollRef.current);
          }
        }
      } catch {}
    }, 5000);

    return () => {
      if (modelAnswerPollRef.current) clearInterval(modelAnswerPollRef.current);
    };
  }, [modelAnswerReady, state]);

  // Handle pre-glass reasoning submission — just save, don't evaluate yet
  const handleReasoningSubmit = useCallback(
    async (reasoning: string) => {
      if (state.step !== "pre-glass") return;
      setPreGlassReasoning(reasoning);

      // Save to Neon
      if (attemptId) {
        fetch("/api/save-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            attemptId,
            pre_glass_reasoning: reasoning,
          }),
        }).catch(() => {});
      }

      // Skip straight to reveal (no mid-flow feedback)
      dispatch({ type: "SUBMIT_REASONING", reasoning });
      dispatch({
        type: "PRE_GLASS_FEEDBACK_DONE",
        feedback: "(Feedback will be shown at the end)",
      });
    },
    [state, attemptId]
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

      // Save tasting notes to Neon
      if (attemptId) {
        fetch("/api/save-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            attemptId,
            tasting_notes: data.tastingNotes,
          }),
        }).catch(() => {});
      }

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
  }, [state, attemptId]);

  // Handle answer submission — get the full evaluation
  const handleAnswerSubmit = useCallback(
    async (answer: string) => {
      if (state.step !== "answer") return;
      dispatch({ type: "SUBMIT_ANSWER", answer });

      // Save answer to Neon
      if (attemptId) {
        fetch("/api/save-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            attemptId,
            user_answer: answer,
          }),
        }).catch(() => {});
      }

      // Check if model answer is ready
      if (!modelAnswerReady) {
        setWaitingForModel(true);
        // Poll until ready
        const poll = setInterval(async () => {
          try {
            const res = await fetch("/api/check-model-answer", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ questionId: state.question.id }),
            });
            const data = await res.json();
            if (data.ready) {
              clearInterval(poll);
              setWaitingForModel(false);
              setModelAnswerReady(true);
              runFinalEvaluation(answer);
            }
          } catch {}
        }, 3000);
        return;
      }

      runFinalEvaluation(answer);
    },
    [state, attemptId, modelAnswerReady]
  );

  // Run the combined final evaluation
  const runFinalEvaluation = useCallback(
    async (answer: string) => {
      if (state.step !== "feedback" && state.step !== "answer") return;

      // Get latest model answer from sessionStorage (may have been updated by background gen)
      const stored = sessionStorage.getItem("mw-current-question");
      let modelAnswer = "";
      if (stored) {
        try {
          const q = JSON.parse(stored);
          modelAnswer = q.modelAnswer || "";
        } catch {}
      }

      const feedback = await evalStream.startStream("/api/evaluate-full", {
        questionText: state.question.text,
        preGlassReasoning,
        userAnswer: answer,
        modelAnswer,
        paper: state.question.paper,
      });

      // Save feedback to Neon
      if (attemptId) {
        const lower = feedback.toLowerCase();
        const passEstimate =
          lower.includes("unlikely to pass") ||
          lower.includes("not pass") ||
          lower.includes("would fail") ||
          lower.includes("**result: fail**")
            ? "fail"
            : lower.includes("borderline") || lower.includes("**result: borderline**")
              ? "borderline"
              : lower.includes("**result: pass**")
                ? "pass"
                : null;

        fetch("/api/save-attempt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "update",
            attemptId,
            answer_feedback: feedback,
            pass_estimate: passEstimate,
            completed_at: new Date().toISOString(),
          }),
        }).catch(() => {});
      }

      dispatch({ type: "ANSWER_FEEDBACK_DONE", feedback });
    },
    [state, preGlassReasoning, attemptId, evalStream]
  );

  // Handle next question
  const handleNextQuestion = useCallback(() => {
    evalStream.reset();
    setTastingNotes([]);
    setTastingLoading(false);
    setModelAnswerReady(false);
    setWaitingForModel(false);
    setAttemptId(null);
    setPreGlassReasoning("");
    if (modelAnswerPollRef.current) clearInterval(modelAnswerPollRef.current);
    dispatch({ type: "RESET" });
    router.push("/");
  }, [router, evalStream]);

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
                { key: "reveal", label: "Tasting" },
                { key: "answer", label: "Answer" },
                { key: "feedback", label: "Results" },
                { key: "reveal-answer", label: "Review" },
              ].map((s) => {
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
                const isActive =
                  s.key === state.step ||
                  (s.key === "reveal" && state.step === "pre-glass-feedback");
                const isDone = stepIdx < currentIdx && stepIdx !== -1;

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

          {/* Skip pre-glass-feedback, go straight to reveal */}
          {(state.step === "pre-glass-feedback" || state.step === "reveal") && (
            <div className="space-y-6">
              <div className="bg-card rounded-xl border border-accent/30 p-6 text-center">
                <p className="text-sm text-muted mb-2">
                  Your stem analysis has been saved. Full feedback will be
                  provided at the end.
                </p>
                <p className="text-foreground font-semibold">
                  Now let&apos;s taste the wines.
                </p>
              </div>
              <div className="flex justify-center">
                <button
                  onClick={handleRevealWines}
                  disabled={tastingLoading}
                  className="px-10 py-3 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50"
                >
                  {tastingLoading
                    ? "Generating tasting notes..."
                    : "Reveal Tasting Notes"}
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

          {/* Waiting for model answer / Evaluation streaming */}
          {state.step === "feedback" && (
            <div className="space-y-6">
              {waitingForModel ? (
                <div className="bg-card rounded-xl border border-border p-8 text-center">
                  <div className="flex items-center justify-center gap-3 mb-4">
                    <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                    <div
                      className="w-2 h-2 rounded-full bg-accent/50 streaming-dot"
                      style={{ animationDelay: "0.3s" }}
                    />
                    <div
                      className="w-2 h-2 rounded-full bg-accent/50 streaming-dot"
                      style={{ animationDelay: "0.6s" }}
                    />
                  </div>
                  <p className="text-foreground font-semibold mb-2">
                    Preparing your results...
                  </p>
                  <p className="text-sm text-muted">
                    The model answer is still being generated. This usually
                    takes 1-2 minutes.
                  </p>
                </div>
              ) : (
                <StreamingFeedback
                  text={evalStream.text}
                  isStreaming={evalStream.isStreaming}
                  error={evalStream.error}
                  title="Full Debrief"
                />
              )}
            </div>
          )}

          {/* Model answer reveal */}
          {state.step === "reveal-answer" && (
            <div className="space-y-6">
              <StreamingFeedback
                text={state.answerFeedback}
                isStreaming={false}
                error={null}
                title="Full Debrief"
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
