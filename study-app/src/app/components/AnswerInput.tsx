"use client";

import { useState, useCallback } from "react";
import type { Question } from "@/lib/study-session";
import { useSpeech } from "@/lib/use-speech";
import { MicButton } from "./MicButton";
import ReactMarkdown from "react-markdown";

interface AnswerInputProps {
  question: Question;
  onSubmit: (answer: string) => void;
  tastingNotes?: string[];
}

export function AnswerInput({ question, onSubmit, tastingNotes }: AnswerInputProps) {
  const [answer, setAnswer] = useState("");
  const [activeWine, setActiveWine] = useState<number | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleTranscript = useCallback((text: string) => {
    setAnswer((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return text;
      return trimmed + " " + text;
    });
  }, []);

  const speech = useSpeech(handleTranscript);

  return (
    <div>
      {/* Instructions */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Write Your Answer</h3>
        <p className="text-sm text-muted leading-relaxed">
          Now that you have seen the tasting notes, write your full exam answer.
          Address each sub-question. Remember: you have roughly 6-8 minutes per
          wine in the real exam. Be structured, decisive, and specific.
        </p>
      </div>

      {/* Collapsed question stem for reference */}
      <details className="bg-card rounded-lg border border-border mb-4">
        <summary className="px-4 py-3 cursor-pointer text-sm text-muted hover:text-foreground transition-colors">
          Show question stem
        </summary>
        <div className="px-4 pb-4 text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
          {question.text}
        </div>
      </details>

      {/* Answer textarea with mic + wine buttons */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type or speak your exam answer..."
            className={`w-full min-h-[300px] bg-card border rounded-xl p-4 pr-14 text-foreground text-[15px] leading-relaxed resize-y placeholder:text-muted/50 focus:outline-none transition-colors ${
              speech.isListening
                ? "border-fail/60 bg-fail/5"
                : "border-border focus:border-accent/60"
            }`}
            rows={15}
          />
          <div className="absolute top-3 right-3">
            <MicButton
              isListening={speech.isListening}
              isSupported={speech.isSupported}
              onClick={speech.toggle}
            />
          </div>
        </div>

        {/* Wine quick-reference buttons */}
        {tastingNotes && tastingNotes.length > 0 && (
          <div className="flex flex-col gap-2 shrink-0">
            {question.wines.map((w, i) => (
              <button
                key={w.slot}
                onClick={() => setActiveWine(activeWine === i ? null : i)}
                className={`w-10 h-10 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                  activeWine === i
                    ? "bg-accent text-background border-accent"
                    : "bg-card text-muted border-border hover:border-accent hover:text-accent"
                }`}
                title={`View Wine ${w.slot} tasting notes`}
              >
                W{w.slot}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Wine tasting notes overlay */}
      {activeWine !== null && tastingNotes && tastingNotes[activeWine] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setActiveWine(null)} />
          <div className="relative w-full max-w-2xl max-h-[80vh] overflow-y-auto bg-card rounded-xl border border-accent/30 shadow-2xl">
            <div className="sticky top-0 bg-card border-b border-border px-5 py-3 flex items-center justify-between z-10">
              <h3 className="text-sm font-semibold text-accent">
                Wine {question.wines[activeWine]?.slot} — Tasting Notes
              </h3>
              <button
                onClick={() => setActiveWine(null)}
                className="text-muted hover:text-foreground transition-colors cursor-pointer p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 markdown-content text-sm">
              <ReactMarkdown>{tastingNotes[activeWine]}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* Word count + status + submit */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted tabular-nums">
            {answer.split(/\s+/).filter(Boolean).length} words
          </span>
          {speech.isListening && (
            <span className="text-xs text-fail flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-fail animate-pulse" />
              Listening...
            </span>
          )}
        </div>
        <button
          onClick={() => {
            speech.stop();
            setShowConfirm(true);
          }}
          disabled={answer.trim().length < 50}
          className={`px-8 py-3 font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
            answer.trim().length >= 50
              ? "bg-accent hover:bg-accent-hover text-background"
              : "bg-border text-muted cursor-not-allowed"
          }`}
        >
          Submit Answer
        </button>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div className="relative w-full max-w-md bg-card rounded-xl border border-accent/30 shadow-2xl p-6 text-center">
            <h3 className="text-lg font-semibold text-foreground mb-2">Submit your answer?</h3>
            <p className="text-sm text-muted mb-6">
              Once submitted, your answer will be graded and you won&apos;t be able to edit it. Make sure you&apos;ve addressed all sub-questions.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-6 py-2.5 rounded-lg border border-border text-muted hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer font-medium"
              >
                Keep Writing
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  onSubmit(answer);
                }}
                className="px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-background transition-colors cursor-pointer font-semibold"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
