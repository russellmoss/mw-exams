"use client";

import type { Question } from "@/lib/study-session";

interface QuestionDisplayProps {
  question: Question;
  onStartReasoning: () => void;
}

export function QuestionDisplay({
  question,
  onStartReasoning,
}: QuestionDisplayProps) {
  const paperLabel =
    question.paper === 1
      ? "Paper 1 -- Whites"
      : question.paper === 2
        ? "Paper 2 -- Reds"
        : "Paper 3 -- Special";

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <span className="text-xs font-mono px-2 py-1 rounded bg-accent/20 text-accent">
          {paperLabel}
        </span>
        <span className="text-xs font-mono px-2 py-1 rounded bg-card text-muted">
          {question.year} Q{question.questionNumber}
        </span>
        <span className="text-xs font-mono px-2 py-1 rounded bg-card text-muted">
          {question.family}: {question.familyLabel}
        </span>
        <span className="text-xs font-mono px-2 py-1 rounded bg-card text-muted">
          {question.totalMarks} marks
        </span>
      </div>

      {/* Question stem */}
      <div className="bg-card rounded-xl border border-border p-6 mb-6">
        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
          Question Stem
        </h3>
        <div className="text-foreground leading-relaxed whitespace-pre-line text-[15px]">
          {question.text}
        </div>
      </div>

      {/* Wine count indicator */}
      <div className="bg-card rounded-lg border border-border p-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            {question.wines.map((w) => (
              <div
                key={w.slot}
                className="w-5 h-8 rounded-sm bg-border/50 border border-border"
                title={`Wine ${w.slot}`}
              />
            ))}
          </div>
          <span className="text-sm text-muted">
            {question.wines.length}{" "}
            {question.wines.length === 1 ? "wine" : "wines"} in this flight
            &mdash; identities hidden until after your stem analysis
          </span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={onStartReasoning}
        className="w-full sm:w-auto px-8 py-3 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer"
      >
        Begin Stem Analysis
      </button>
    </div>
  );
}
