"use client";

import type { Question } from "@/lib/study-session";
import { deriveQuestion, markPhrase } from "@/lib/question-sections";

// The Review step's restatement of the question being debriefed. Sits at the very top of the review
// screen so the pace rows, debrief and identities below are all read against what was actually asked.
export function QuestionRecap({ question }: { question: Question }) {
  const derived = deriveQuestion(question.text, question.wines.length);
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <h3 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">
        The Question
      </h3>
      <p className="text-[15px] text-foreground leading-relaxed font-medium">
        {derived.preamble}
      </p>
      {derived.subParts.length > 0 && (
        <div className="mt-4 space-y-3">
          {derived.subParts.map((sq) => (
            <div key={sq.label} className="flex gap-3">
              <span className="text-accent font-mono text-xs font-semibold shrink-0 mt-0.5">
                {sq.label})
              </span>
              <p className="flex-1 text-sm text-foreground/90 leading-relaxed">{sq.text}</p>
              {sq.marks > 0 && (
                <span className="text-xs text-muted font-mono shrink-0 mt-0.5 whitespace-nowrap tabular-nums">
                  {markPhrase(sq, question.wines.length)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
