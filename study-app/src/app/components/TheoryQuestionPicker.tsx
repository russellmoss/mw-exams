"use client";

// Theory question browser (docs/design/2026-08-06-shell-redesign/ §7): a table led by paper
// filter pills and an "Unattempted only" toggle. Every row is rubric-backed by construction —
// the 54 questions without an examiners' report never reach this component.

import { useMemo, useState } from "react";

export interface TheoryQuestionSummary {
  id: string;
  year: number;
  paper: number;
  question: number;
  section: "A" | "B" | null;
  domain: string;
  paperTitle: string | null;
  questionText: string;
  timeMinutes: number;
  wordBand: { min: number; max: number };
  evidenceQuality: "rich" | "moderate" | "thin" | null;
  exAnte: boolean;
  searchText: string;
}

const PAPER_PILLS = [
  { paper: 0, label: "All papers" },
  { paper: 1, label: "P1 Viticulture" },
  { paper: 2, label: "P2 Vinification" },
  { paper: 3, label: "P3 Handling of wine" },
  { paper: 4, label: "P4 Business of wine" },
  { paper: 5, label: "P5 Contemporary issues" },
];

export function TheoryQuestionPicker({
  questions,
  attemptedIds,
  onSelect,
}: {
  questions: TheoryQuestionSummary[];
  attemptedIds: Set<string>;
  onSelect: (question: TheoryQuestionSummary) => void;
}) {
  const [paper, setPaper] = useState(0);
  const [unattemptedOnly, setUnattemptedOnly] = useState(false);
  const [theme, setTheme] = useState("");

  const filtered = useMemo(() => {
    const needle = theme.trim().toLocaleLowerCase("en");
    return questions.filter((question) => {
      if (paper !== 0 && question.paper !== paper) return false;
      if (unattemptedOnly && attemptedIds.has(question.id)) return false;
      if (needle && !question.searchText.toLocaleLowerCase("en").includes(needle)) return false;
      return true;
    });
  }, [questions, paper, unattemptedOnly, attemptedIds, theme]);

  return (
    <div className="space-y-4">
      {/* Filter row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {PAPER_PILLS.map((pill) => (
            <button
              key={pill.paper}
              type="button"
              onClick={() => setPaper(pill.paper)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                paper === pill.paper
                  ? "bg-accent text-background"
                  : "border border-border text-muted hover:text-foreground hover:border-muted"
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setUnattemptedOnly((value) => !value)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
            unattemptedOnly
              ? "border border-accent/60 text-accent bg-accent/10"
              : "border border-border text-muted hover:text-foreground hover:border-muted"
          }`}
        >
          Unattempted only
        </button>
      </div>
      <input
        value={theme}
        onChange={(event) => setTheme(event.target.value)}
        placeholder="Filter by theme — e.g. sustainability, SO2, luxury, climate"
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted/60 focus:outline-none focus:border-accent"
      />

      {/* Table card */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="hidden sm:grid grid-cols-[64px_170px_1fr_90px_70px] gap-3 px-5 py-3 border-b border-border">
          {["Year", "Paper", "Question", "Budget", "Status"].map((heading) => (
            <span key={heading} className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted">
              {heading}
            </span>
          ))}
        </div>
        <div className="max-h-[34rem] overflow-y-auto">
          {filtered.map((question) => {
            const attempted = attemptedIds.has(question.id);
            return (
              <button
                key={question.id}
                type="button"
                onClick={() => onSelect(question)}
                className="w-full text-left grid sm:grid-cols-[64px_170px_1fr_90px_70px] grid-cols-1 gap-x-3 gap-y-1 px-5 py-3 border-b border-border last:border-b-0 hover:bg-card-hover transition-colors duration-[60ms] cursor-pointer items-baseline"
              >
                <span className="text-xs text-muted tabular-nums">{question.year}</span>
                <span className="text-xs text-muted truncate">
                  P{question.paper}{question.paperTitle ? ` · ${question.paperTitle}` : ""}
                </span>
                <span className="text-sm text-foreground leading-snug line-clamp-2">{question.questionText}</span>
                <span className="text-xs text-muted tabular-nums">{question.timeMinutes} min</span>
                <span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[0.625rem] font-bold ${
                      attempted ? "text-muted bg-card-hover" : "text-accent bg-accent/12"
                    }`}
                  >
                    {attempted ? "Attempted" : "New"}
                  </span>
                </span>
              </button>
            );
          })}
          {!filtered.length && (
            <div className="p-8 text-center text-sm text-muted">No questions match those filters.</div>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-t border-border">
          <span className="text-xs text-muted tabular-nums">
            Showing {filtered.length} of {questions.length}
          </span>
          <span className="text-xs text-muted">Papers 1&ndash;4: 60 min · Paper 5: 90 min</span>
        </div>
      </div>
    </div>
  );
}
