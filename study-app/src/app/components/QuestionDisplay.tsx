"use client";

import type { Question } from "@/lib/study-session";

interface QuestionDisplayProps {
  question: Question;
  onStartReasoning: () => void;
  onGenerateFresh?: () => void;
  isGenerating?: boolean;
}

function parseQuestionText(text: string): {
  preamble: string;
  subQuestions: { label: string; text: string; marks: string }[];
  totalMarks: string | null;
} {
  // Pre-process: insert newlines before sub-question markers that are inline
  let processed = text
    .replace(/&nbsp;/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\*/g, "");

  // Split inline sub-questions: "... a) ..." → "...\na) ..."
  // Match letter labels like "a)", "b)", "c)" and roman "i)", "ii)" that appear mid-text
  processed = processed.replace(/\s+([a-z])\)\s+/gi, (match, letter) => {
    // Only split if it looks like a sub-question label (single letter a-z)
    if (letter.match(/^[a-h]$/i)) return `\n${letter}) `;
    return match;
  });
  // Also handle roman numerals
  processed = processed.replace(/\s+(i{1,3}|iv|v)\)\s+/gi, (match, numeral) => {
    return `\n${numeral}) `;
  });
  // Split on "For each wine:" "For all" "With reference to" mid-line
  processed = processed.replace(/\.\s+(For (?:each|all|both) wine)/gi, ".\n$1");
  processed = processed.replace(/\.\s+(With reference to)/gi, ".\n$1");

  const lines = processed
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const preambleLines: string[] = [];
  const subQuestions: { label: string; text: string; marks: string }[] = [];
  let totalMarks: string | null = null;
  let currentSub: { label: string; text: string; marks: string } | null = null;

  for (const line of lines) {
    // Check for total marks
    const totalMatch = line.match(/^Total:\s*(\d+\s*marks?)/i);
    if (totalMatch) {
      totalMarks = totalMatch[1];
      continue;
    }

    // Check for sub-question: matches both "a) ..." and "(a) ..."
    const subMatch = line.match(
      /^\(?([a-z]|[iv]+)\)\s*(.*)/i
    );
    if (subMatch) {
      if (currentSub) subQuestions.push(currentSub);
      const label = subMatch[1];
      let rest = subMatch[2];

      // Extract marks from the text
      let marks = "";
      const marksMatch = rest.match(/\((\d+(?:\s*[x×]\s*\d+)?\s*(?:marks?)?(?:\s*=\s*\d+\s*marks?)?)\)\s*$/i);
      if (marksMatch) {
        marks = marksMatch[1];
        rest = rest.slice(0, rest.lastIndexOf("(" + marksMatch[1])).trim();
      }

      currentSub = { label, text: rest, marks };
      continue;
    }

    // Check for standalone marks line
    const standaloneMarks = line.match(/^\((\d+(?:\s*[x×]\s*\d+)?\s*(?:marks?)?(?:\s*=\s*\d+\s*marks?)?)\)\s*$/i);
    if (standaloneMarks && currentSub) {
      currentSub.marks = standaloneMarks[1];
      continue;
    }

    // Check for "For each wine:" or "With reference to" prefixes
    const contextMatch = line.match(/^(For (?:each|all|both) wine|With reference to|For each of|Then for each)/i);
    if (contextMatch) {
      if (currentSub) {
        currentSub.text += " " + line;
      } else {
        preambleLines.push(line);
      }
      continue;
    }

    // If we have an active sub-question, append to it
    if (currentSub) {
      // Could be continuation text or a marks line
      if (line.match(/^\d+\s*marks?$/i) || line.match(/^\(\d+/)) {
        const m = line.replace(/[()]/g, "").trim();
        if (!currentSub.marks) currentSub.marks = m;
      } else {
        currentSub.text += " " + line;
      }
      continue;
    }

    // Otherwise it's preamble
    preambleLines.push(line);
  }

  if (currentSub) subQuestions.push(currentSub);

  return {
    preamble: preambleLines.join(" "),
    subQuestions,
    totalMarks,
  };
}

export function QuestionDisplay({
  question,
  onStartReasoning,
  onGenerateFresh,
  isGenerating,
}: QuestionDisplayProps) {
  const paperLabel =
    question.paper === 1
      ? "Paper 1 — Whites"
      : question.paper === 2
        ? "Paper 2 — Reds"
        : "Paper 3 — Special";

  const parsed = parseQuestionText(question.text);

  return (
    <div>
      {/* Header badges */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        <span className="text-xs font-mono px-3 py-1.5 rounded-full bg-accent/15 text-accent border border-accent/20">
          {paperLabel}
        </span>
        <span className="text-xs font-mono px-3 py-1.5 rounded-full bg-card text-muted border border-border">
          {question.familyLabel}
        </span>
        <span className="text-xs font-mono px-3 py-1.5 rounded-full bg-card text-muted border border-border">
          {question.totalMarks} marks
        </span>
      </div>

      {/* Question card */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden mb-8">
        {/* Preamble */}
        <div className="px-8 pt-8 pb-6">
          <p className="text-lg text-foreground leading-relaxed font-medium">
            {parsed.preamble}
          </p>
        </div>

        {/* Sub-questions */}
        {parsed.subQuestions.length > 0 && (
          <div className="border-t border-border/50">
            {parsed.subQuestions.map((sq, i) => (
              <div
                key={i}
                className={`px-8 py-5 flex gap-4 ${
                  i < parsed.subQuestions.length - 1
                    ? "border-b border-border/30"
                    : ""
                }`}
              >
                <span className="text-accent font-mono text-sm font-semibold shrink-0 mt-0.5">
                  {sq.label})
                </span>
                <div className="flex-1">
                  <p className="text-[15px] text-foreground/90 leading-relaxed">
                    {sq.text}
                  </p>
                </div>
                {sq.marks && (
                  <span className="text-xs text-muted font-mono shrink-0 mt-0.5 whitespace-nowrap">
                    {sq.marks}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Total marks footer */}
        {parsed.totalMarks && (
          <div className="px-8 py-3 bg-border/10 border-t border-border/50">
            <p className="text-xs text-muted font-mono text-right">
              Total: {parsed.totalMarks}
            </p>
          </div>
        )}
      </div>

      {/* Wine count indicator */}
      <div className="bg-card/50 rounded-xl border border-border/50 p-5 mb-8">
        <div className="flex items-center gap-4">
          <div className="flex gap-1">
            {question.wines.map((w) => (
              <div
                key={w.slot}
                className="w-4 h-7 rounded-sm bg-accent/10 border border-accent/20"
                title={`Wine ${w.slot}`}
              />
            ))}
          </div>
          <span className="text-sm text-muted">
            {question.wines.length}{" "}
            {question.wines.length === 1 ? "wine" : "wines"} in this flight —
            identities hidden until after your stem analysis
          </span>
        </div>

        {/* Visual appearance cues for Paper 3 */}
        {question.paper === 3 && question.wines.some((w) => w.appearance) && (
          <div className="mt-4 pt-4 border-t border-border/30">
            <p className="text-xs font-semibold text-accent mb-2 uppercase tracking-wide">
              Visual Appearance
            </p>
            <div className="space-y-1.5">
              {question.wines.map((w) =>
                w.appearance ? (
                  <div key={w.slot} className="flex gap-2 text-sm">
                    <span className="text-muted font-mono shrink-0">
                      {w.slot}.
                    </span>
                    <span className="text-foreground/80">{w.appearance}</span>
                  </div>
                ) : null
              )}
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={onStartReasoning}
          className="px-10 py-3.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-xl transition-colors duration-200 cursor-pointer text-[15px]"
        >
          Begin Stem Analysis
        </button>
        {onGenerateFresh && (
          <button
            onClick={onGenerateFresh}
            disabled={isGenerating}
            className="text-sm text-muted hover:text-accent transition-colors cursor-pointer disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Skip — generate a fresh question instead"}
          </button>
        )}
      </div>
    </div>
  );
}
