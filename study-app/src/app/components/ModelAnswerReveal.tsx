"use client";

import ReactMarkdown from "react-markdown";
import type { Question } from "@/lib/study-session";
import {
  deriveQuestion,
  SECTION_A_HEADING,
  SECTION_B_HEADING,
} from "@/lib/question-sections";
import { SourceList } from "./WineReveal";
import type { WineProvenance } from "@/lib/wine-provenance";

// Split Sections: if the model answer was keyed under the two section sub-headings, split it so each
// half renders beneath its own Fraunces heading (matching the question's section cards). Returns null
// when the headings aren't present, so a single-scope or legacy answer renders as one block.
function splitAnswerBySection(answer: string): { a: string; b: string } | null {
  const aRe = /#{2,5}\s*Section A[^\n]*\n/i;
  const bRe = /#{2,5}\s*Section B[^\n]*\n/i;
  const aMatch = answer.match(aRe);
  const bMatch = answer.match(bRe);
  if (!aMatch || !bMatch || aMatch.index === undefined || bMatch.index === undefined) return null;
  if (bMatch.index <= aMatch.index) return null;
  const a = answer.slice(aMatch.index + aMatch[0].length, bMatch.index).trim();
  const b = answer.slice(bMatch.index + bMatch[0].length).trim();
  if (!a || !b) return null;
  return { a, b };
}

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
  /** The tasting notes shown during the session, in flight order (index i = wines[i]). */
  tastingNotes?: string[];
  /** Where each note's reference profile came from, in flight order. */
  provenance?: WineProvenance[];
  /**
   * The answer is still being written in the background. Distinguishes "wait a moment" from
   * "this never arrived" — without it a pending answer and a failed one render the same dead end.
   */
  pending?: boolean;
}

export function ModelAnswerReveal({
  question,
  onNextQuestion,
  tastingNotes,
  provenance,
  pending = false,
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

  // Render the model answer under the two section headings when the question spans both scopes and the
  // exemplar keyed its prose accordingly; otherwise fall back to one block.
  const derived = deriveQuestion(question.text, question.wines.length);
  const multiScope = derived.scopes.length > 1;
  const sectioned = multiScope ? splitAnswerBySection(parsed.answer) : null;

  return (
    <div className="space-y-6">
      {/* The question itself renders at the top of the review screen (QuestionRecap in study/page). */}
      {/* Wine identities reveal — each row expands to the tasting note the candidate saw for that
          wine, with its source citations. Post-answer surface, so showing sources is safe. */}
      <div className="bg-card rounded-xl border border-accent/30 p-6">
        <h3 className="text-sm font-semibold text-accent uppercase tracking-wider mb-1">
          Wine Identities
        </h3>
        {tastingNotes && tastingNotes.length > 0 && (
          <p className="text-xs text-muted mb-3">
            Click a wine to revisit its tasting note and sources.
          </p>
        )}
        <div className={tastingNotes && tastingNotes.length > 0 ? "" : "mt-3"}>
          {question.wines.map((w, i) => {
            const note = tastingNotes?.[i];
            if (!note) {
              return (
                <div
                  key={w.slot}
                  className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0"
                >
                  <span className="text-xs font-mono text-muted w-16 shrink-0 pt-0.5">
                    Wine {w.slot}
                  </span>
                  <span className="text-sm text-foreground">{w.fullText}</span>
                </div>
              );
            }
            return (
              <details key={w.slot} className="group border-b border-border/50 last:border-0">
                <summary className="flex items-start gap-3 py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-card-hover/50 rounded-lg px-1 -mx-1 transition-colors">
                  <span className="text-xs font-mono text-muted w-16 shrink-0 pt-0.5">
                    Wine {w.slot}
                  </span>
                  <span className="text-sm text-foreground flex-1">{w.fullText}</span>
                  <span
                    className="text-muted text-xs shrink-0 pt-0.5 transition-transform duration-150 group-open:rotate-90"
                    aria-hidden
                  >
                    ▸
                  </span>
                </summary>
                <div className="mb-3 mt-1 rounded-lg border border-border bg-background/40 p-4 font-[family-name:var(--font-geist-mono)] text-sm leading-relaxed">
                  <div className="markdown-content">
                    <ReactMarkdown>{note}</ReactMarkdown>
                  </div>
                  {provenance?.[i] && <SourceList p={provenance[i]} />}
                </div>
              </details>
            );
          })}
        </div>
      </div>

      {/* Model answer — only the answer body, not annotation/trace/diagram */}
      {hasModelAnswer && (
        <div className="bg-card rounded-xl border border-border p-6 overflow-hidden">
          <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
            Model Answer
          </h3>
          {sectioned ? (
            <div className="space-y-6">
              <div>
                <h4 className="font-display text-lg text-foreground mb-2">{SECTION_A_HEADING}</h4>
                <div className="markdown-content text-[15px] leading-relaxed">
                  <ReactMarkdown>{sectioned.a}</ReactMarkdown>
                </div>
              </div>
              <div>
                <h4 className="font-display text-lg text-foreground mb-2">{SECTION_B_HEADING}</h4>
                <div className="markdown-content text-[15px] leading-relaxed">
                  <ReactMarkdown>{sectioned.b}</ReactMarkdown>
                </div>
              </div>
            </div>
          ) : (
            <div className="markdown-content text-[15px] leading-relaxed">
              <ReactMarkdown>{parsed.answer}</ReactMarkdown>
            </div>
          )}
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

      {/* No model answer yet — still being written, or genuinely absent */}
      {!hasModelAnswer && (
        <div className="bg-card rounded-xl border border-border p-6 text-center">
          {pending ? (
            <div className="flex items-center justify-center gap-3">
              <span
                className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-border border-t-accent"
                aria-hidden="true"
              />
              <p className="text-muted text-sm" role="status">
                The model answer is still being written — it will appear here in a moment.
              </p>
            </div>
          ) : (
            <p className="text-muted text-sm">
              No model answer available for this question yet.
            </p>
          )}
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
