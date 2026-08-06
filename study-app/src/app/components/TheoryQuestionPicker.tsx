"use client";

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

function label(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function TheoryQuestionPicker({
  questions,
  onSelect,
}: {
  questions: TheoryQuestionSummary[];
  onSelect: (question: TheoryQuestionSummary) => void;
}) {
  const [year, setYear] = useState("all");
  const [paper, setPaper] = useState("all");
  const [domain, setDomain] = useState("all");
  const [theme, setTheme] = useState("");
  const years = useMemo(() => [...new Set(questions.map((question) => question.year))].sort(), [questions]);
  const domains = useMemo(() => [...new Set(questions.map((question) => question.domain))].sort(), [questions]);
  const filtered = useMemo(() => {
    const needle = theme.trim().toLocaleLowerCase("en");
    return questions.filter((question) => {
      if (year !== "all" && question.year !== Number(year)) return false;
      if (paper !== "all" && question.paper !== Number(paper)) return false;
      if (domain !== "all" && question.domain !== domain) return false;
      if (!needle) return true;
      return question.searchText.toLocaleLowerCase("en").includes(needle);
    });
  }, [questions, year, paper, domain, theme]);

  const control = "w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-accent";

  return (
    <section className="bg-card rounded-xl border border-border p-5 sm:p-6" aria-labelledby="theory-picker-title">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h2 id="theory-picker-title" className="text-lg font-semibold text-foreground">Choose a past question</h2>
          <p className="text-xs text-muted mt-1">{filtered.length} examiner-rubric-backed questions match</p>
        </div>
        <button
          type="button"
          disabled={!filtered.length}
          onClick={() => onSelect(filtered[Math.floor(Math.random() * filtered.length)])}
          className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs text-muted hover:text-foreground hover:border-muted disabled:opacity-40 cursor-pointer"
        >
          Pick at random
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <label className="text-xs text-muted">
          Year
          <select value={year} onChange={(event) => setYear(event.target.value)} className={`${control} mt-1`}>
            <option value="all">All years</option>
            {years.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          Paper
          <select value={paper} onChange={(event) => setPaper(event.target.value)} className={`${control} mt-1`}>
            <option value="all">All papers</option>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>Paper {value}</option>)}
          </select>
        </label>
        <label className="text-xs text-muted">
          Domain
          <select value={domain} onChange={(event) => setDomain(event.target.value)} className={`${control} mt-1`}>
            <option value="all">All domains</option>
            {domains.map((value) => <option key={value} value={value}>{label(value)}</option>)}
          </select>
        </label>
      </div>
      <label className="text-xs text-muted block mb-5">
        Theme
        <input
          value={theme}
          onChange={(event) => setTheme(event.target.value)}
          placeholder="e.g. sustainability, SO2, luxury, climate"
          className={`${control} mt-1`}
        />
      </label>

      <div className="max-h-[32rem] overflow-y-auto space-y-2 pr-1">
        {filtered.map((question) => (
          <button
            key={question.id}
            type="button"
            onClick={() => onSelect(question)}
            className="w-full text-left rounded-lg border border-border bg-background/30 p-4 hover:border-accent/50 hover:bg-card-hover transition-colors cursor-pointer group"
          >
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-mono text-[10px] rounded bg-accent/15 px-1.5 py-0.5 text-accent">
                {question.year} · P{question.paper} · Q{question.question}
              </span>
              <span className="text-[10px] text-muted uppercase tracking-wide">{label(question.domain)}</span>
              <span className="ml-auto text-[10px] text-muted tabular-nums">{question.timeMinutes} min</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground group-hover:text-accent transition-colors">
              {question.questionText}
            </p>
          </button>
        ))}
        {!filtered.length && (
          <div className="rounded-lg border border-border p-6 text-center text-sm text-muted">
            No questions match those filters.
          </div>
        )}
      </div>
    </section>
  );
}
