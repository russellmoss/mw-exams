"use client";

import ReactMarkdown from "react-markdown";
import type { Question } from "@/lib/study-session";

function cleanModelAnswer(text: string): {
  answer: string;
  annotation: string;
  reasoning: string;
  studyDiagram: string;
} {
  const cleaned = text
    .replace(/^```markdown\s*\n?/, "")
    .replace(/```\s*$/, "")
    .replace(/^---\n[\s\S]*?\n---\n*/m, "")
    .trim();

  // Split into sections by ## numbered headers like "## 2. Proposed Annotation" or "# 2. Proposed Annotation"
  const sectionPattern = /\n(?=#{1,2}\s*\d+\.\s*(?:Proposed Annotation|Reasoning Trace|Study Diagram))/i;
  const parts = cleaned.split(sectionPattern);

  const answer = parts[0]?.trim() || cleaned;

  const findSection = (label: string) => {
    const pattern = new RegExp(`#{1,2}\\s*\\d+\\.\\s*${label}[\\s\\S]*?(?=\\n#{1,2}\\s*\\d+\\.|$)`, "i");
    const match = cleaned.match(pattern);
    return match ? match[0].trim() : "";
  };

  return {
    answer,
    annotation: findSection("Proposed Annotation"),
    reasoning: findSection("Reasoning Trace"),
    studyDiagram: findSection("Study Diagram"),
  };
}

interface ModelAnswerRevealProps {
  question: Question;
  onNextQuestion: () => void;
}

export function ModelAnswerReveal({
  question,
  onNextQuestion,
}: ModelAnswerRevealProps) {
  const parsed = cleanModelAnswer(question.modelAnswer || "");
  const hasModelAnswer = parsed.answer.length > 0;
  // Use dedicated fields if available, otherwise fall back to parsed sections from model answer
  const annotationText = (question.proposedAnnotation && question.proposedAnnotation.length > 0)
    ? question.proposedAnnotation
    : parsed.annotation;
  const hasAnnotation = annotationText.length > 0;
  const studyDiagramText = (question.studyDiagramAssist && question.studyDiagramAssist.length > 0)
    ? question.studyDiagramAssist
    : parsed.studyDiagram;
  const hasStudyDiagram = studyDiagramText.length > 0;
  const hasReasoning = parsed.reasoning.length > 0;

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
              <span className="text-sm text-foreground">
                {w.fullText}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Model answer — only the answer body, not annotation/trace/diagram */}
      {hasModelAnswer && (
        <div className="bg-card rounded-xl border border-border p-6 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
            Model Answer
          </h3>
          <div className="markdown-content text-[15px] leading-relaxed">
            <ReactMarkdown>{parsed.answer}</ReactMarkdown>
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
              <ReactMarkdown>{annotationText}</ReactMarkdown>
            </div>
          </div>
        </details>
      )}

      {/* Reasoning trace */}
      {hasReasoning && (
        <details className="bg-card rounded-xl border border-border">
          <summary className="px-6 py-4 cursor-pointer text-sm font-semibold text-muted uppercase tracking-wider hover:text-foreground transition-colors">
            Reasoning Trace
          </summary>
          <div className="px-6 pb-6">
            <div className="markdown-content text-sm leading-relaxed">
              <ReactMarkdown>{parsed.reasoning}</ReactMarkdown>
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
              <ReactMarkdown>{studyDiagramText}</ReactMarkdown>
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
