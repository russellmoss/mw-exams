"use client";

import { useState } from "react";
import type { Question } from "@/lib/study-session";

interface AnswerInputProps {
  question: Question;
  onSubmit: (answer: string) => void;
}

export function AnswerInput({ question, onSubmit }: AnswerInputProps) {
  const [answer, setAnswer] = useState("");

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

      {/* Answer textarea */}
      <textarea
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="Write your full exam answer here...

Address each sub-question (a, b, c, etc.) with:
- Identification (variety, origin, vintage)
- Reasoning from what you tasted
- Quality assessment in context
- Winemaking observations
- Commercial awareness"
        className="w-full min-h-[300px] bg-card border border-border rounded-xl p-4 text-foreground text-[15px] leading-relaxed resize-y placeholder:text-muted/50 focus:outline-none focus:border-accent/60 transition-colors"
        rows={15}
      />

      {/* Word count and submit */}
      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted tabular-nums">
          {answer.split(/\s+/).filter(Boolean).length} words
        </span>
        <button
          onClick={() => onSubmit(answer)}
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
