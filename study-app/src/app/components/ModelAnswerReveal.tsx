"use client";

import ReactMarkdown from "react-markdown";
import type { Question } from "@/lib/study-session";

interface ModelAnswerRevealProps {
  question: Question;
  onNextQuestion: () => void;
}

export function ModelAnswerReveal({
  question,
  onNextQuestion,
}: ModelAnswerRevealProps) {
  const hasModelAnswer = question.modelAnswer && question.modelAnswer.length > 0;
  const hasAnnotation =
    question.proposedAnnotation && question.proposedAnnotation.length > 0;
  const hasStudyDiagram =
    question.studyDiagramAssist && question.studyDiagramAssist.length > 0;

  return (
    <div className="space-y-6">
      {/* Wine identities reveal */}
      <div className="bg-card rounded-xl border border-accent/30 p-6">
        <h3 className="text-sm font-semibold text-accent uppercase tracking-wider mb-4">
          Wine Identities
        </h3>
        <div className="space-y-2">
          {question.wines.map((w) => (
            <div
              key={w.slot}
              className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0"
            >
              <span className="text-xs font-mono text-muted w-16 shrink-0 pt-0.5">
                Wine {w.slot}
              </span>
              <span className="text-sm text-foreground font-[family-name:var(--font-geist-mono)]">
                {w.fullText}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Model answer */}
      {hasModelAnswer && (
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
            Model Answer
          </h3>
          <div className="markdown-content text-[15px] leading-relaxed font-[family-name:var(--font-geist-mono)]">
            <ReactMarkdown>{question.modelAnswer!}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Proposed annotation */}
      {hasAnnotation && (
        <details className="bg-card rounded-xl border border-border">
          <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-muted uppercase tracking-wider hover:text-foreground transition-colors">
            Examiner Intent / Annotation
          </summary>
          <div className="px-6 pb-6">
            <div className="markdown-content text-sm leading-relaxed">
              <ReactMarkdown>{question.proposedAnnotation!}</ReactMarkdown>
            </div>
          </div>
        </details>
      )}

      {/* Study diagram assist */}
      {hasStudyDiagram && (
        <details className="bg-card rounded-xl border border-border">
          <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-muted uppercase tracking-wider hover:text-foreground transition-colors">
            Study Diagram Assist
          </summary>
          <div className="px-6 pb-6">
            <div className="markdown-content text-sm leading-relaxed">
              <ReactMarkdown>{question.studyDiagramAssist!}</ReactMarkdown>
            </div>
          </div>
        </details>
      )}

      {/* No model answer fallback */}
      {!hasModelAnswer && (
        <div className="bg-card rounded-xl border border-border p-6 text-center">
          <p className="text-muted text-sm">
            No model answer available for this question yet.
          </p>
        </div>
      )}

      {/* Next question button */}
      <div className="flex justify-center pt-4">
        <button
          onClick={onNextQuestion}
          className="px-10 py-3 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer"
        >
          Next Question
        </button>
      </div>
    </div>
  );
}
