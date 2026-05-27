"use client";

import { useState, useCallback } from "react";
import type { Question } from "@/lib/study-session";
import { useSpeech } from "@/lib/use-speech";
import { MicButton } from "./MicButton";

interface AnswerInputProps {
  question: Question;
  onSubmit: (answer: string) => void;
}

export function AnswerInput({ question, onSubmit }: AnswerInputProps) {
  const [answer, setAnswer] = useState("");

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
          Address each sub-question. Remember: you have roughly 8 minutes per
          question in the real exam. Be structured, decisive, and specific.
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

      {/* Answer textarea with mic */}
      <div className="relative">
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
            onSubmit(answer);
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
    </div>
  );
}
