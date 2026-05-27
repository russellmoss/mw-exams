"use client";

import { useState } from "react";
import type { Question } from "@/lib/study-session";

interface PreGlassReasoningProps {
  question: Question;
  onSubmit: (reasoning: string) => void;
}

export function PreGlassReasoning({
  question,
  onSubmit,
}: PreGlassReasoningProps) {
  const [reasoning, setReasoning] = useState("");

  const paperLabel =
    question.paper === 1
      ? "Paper 1 -- Whites"
      : question.paper === 2
        ? "Paper 2 -- Reds"
        : "Paper 3 -- Special";

  return (
    <div>
      {/* Question context */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-xs font-mono px-2 py-1 rounded bg-accent/20 text-accent">
          {paperLabel}
        </span>
        <span className="text-xs font-mono px-2 py-1 rounded bg-card text-muted">
          {question.year} Q{question.questionNumber}
        </span>
        <span className="text-xs font-semibold text-accent">
          Pre-Glass Analysis
        </span>
      </div>

      {/* Collapsed question stem */}
      <details className="bg-card rounded-lg border border-border mb-6">
        <summary className="px-4 py-3 cursor-pointer text-sm text-muted hover:text-foreground transition-colors">
          Show question stem
        </summary>
        <div className="px-4 pb-4 text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
          {question.text}
        </div>
      </details>

      {/* Instructions */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">
          What does the stem tell you?
        </h3>
        <p className="text-sm text-muted leading-relaxed">
          Before tasting, analyze the question stem. What varieties and regions
          should you have in mind? What signals does the question structure give
          you? Consider: paper number, number of wines, whether they share
          variety/origin, mark allocations, any specific instructions.
        </p>
      </div>

      {/* Reasoning textarea */}
      <textarea
        value={reasoning}
        onChange={(e) => setReasoning(e.target.value)}
        placeholder="Write your pre-glass stem analysis here...

For example:
- Paper 1 means white wines
- 4 wines from the same region + same vintage suggests a quality hierarchy
- High marks for origin identification means the region has distinguishable tiers
- Likely candidates: Burgundy (Chablis to Grand Cru), Loire, Alsace..."
        className="w-full min-h-[200px] bg-card border border-border rounded-xl p-4 text-foreground text-[15px] leading-relaxed resize-y placeholder:text-muted/50 focus:outline-none focus:border-accent/60 transition-colors"
        rows={10}
      />

      {/* Character count and submit */}
      <div className="flex items-center justify-between mt-4">
        <span className="text-xs text-muted tabular-nums">
          {reasoning.length} characters
        </span>
        <button
          onClick={() => onSubmit(reasoning)}
          disabled={reasoning.trim().length < 20}
          className={`px-8 py-3 font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
            reasoning.trim().length >= 20
              ? "bg-accent hover:bg-accent-hover text-background"
              : "bg-border text-muted cursor-not-allowed"
          }`}
        >
          Submit Reasoning
        </button>
      </div>
    </div>
  );
}
