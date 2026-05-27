"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import ReactMarkdown from "react-markdown";

interface AttemptDetail {
  id: number;
  question_id: string;
  pre_glass_reasoning: string | null;
  pre_glass_feedback: string | null;
  tasting_notes: string[] | null;
  user_answer: string | null;
  answer_feedback: string | null;
  pass_estimate: "pass" | "fail" | "borderline" | null;
  marks_estimate: string | null;
  started_at: string;
  completed_at: string | null;
  paper: number;
  family: string;
  family_label: string;
  question_text: string;
  wines: { slot: number; fullText: string }[] | string;
  model_answer: string | null;
  total_marks: number;
  user_feedback: string | null;
  subcategory: string | null;
}

interface Stats {
  total_attempts: number;
  completed_attempts: number;
  pass_count: number;
  fail_count: number;
  borderline_count: number;
  by_paper: { paper: number; total: number; pass: number; fail: number; borderline: number }[];
  by_family: { family: string; family_label: string; total: number; pass: number }[];
  recent_results: { pass_estimate: string; started_at: string }[];
}

function paperLabel(paper: number): string {
  return paper === 1 ? "P1 Whites" : paper === 2 ? "P2 Reds" : "P3 Special";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PassBadge({ estimate }: { estimate: string | null }) {
  if (!estimate) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted/20 text-muted">
        In progress
      </span>
    );
  }
  const colors = {
    pass: "bg-success/15 text-success border-success/30",
    fail: "bg-fail/15 text-fail border-fail/30",
    borderline: "bg-borderline/15 text-borderline border-borderline/30",
  };
  const color = colors[estimate as keyof typeof colors] || colors.fail;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${color}`}>
      {estimate.charAt(0).toUpperCase() + estimate.slice(1)}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-muted uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>
  );
}

function AttemptCard({ attempt }: { attempt: AttemptDetail }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [feedbackText, setFeedbackText] = useState(attempt.user_feedback || "");
  const [feedbackSaved, setFeedbackSaved] = useState(!!attempt.user_feedback);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const wines = typeof attempt.wines === "string" ? JSON.parse(attempt.wines) : attempt.wines;
  const tastingNotes = typeof attempt.tasting_notes === "string"
    ? JSON.parse(attempt.tasting_notes)
    : attempt.tasting_notes;

  const handleRedo = () => {
    const questionData = {
      id: attempt.question_id,
      source: "history-redo",
      year: null,
      paper: attempt.paper,
      questionNumber: 1,
      text: attempt.question_text,
      wines: wines,
      totalMarks: attempt.total_marks,
      family: attempt.family,
      familyLabel: attempt.family_label,
      subcategory: attempt.subcategory || "",
      hasModelAnswer: !!attempt.model_answer,
      hasDecisionMatrix: false,
      hasWineResearch: false,
      modelAnswer: attempt.model_answer || undefined,
    };
    sessionStorage.setItem("mw-current-question", JSON.stringify(questionData));
    router.push("/study");
  };

  const handleSaveFeedback = async () => {
    if (!feedbackText.trim()) return;
    setSavingFeedback(true);
    try {
      await fetch("/api/save-attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update",
          attemptId: attempt.id,
          user_feedback: feedbackText.trim(),
        }),
      });
      setFeedbackSaved(true);
    } catch (err) {
      console.error("Failed to save feedback:", err);
    } finally {
      setSavingFeedback(false);
    }
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-card-hover transition-colors cursor-pointer text-left"
      >
        {/* Result dot */}
        <div
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
            attempt.pass_estimate === "pass"
              ? "bg-success"
              : attempt.pass_estimate === "fail"
                ? "bg-fail"
                : attempt.pass_estimate === "borderline"
                  ? "bg-borderline"
                  : "bg-muted/40"
          }`}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent">
              {paperLabel(attempt.paper)}
            </span>
            <span className="text-xs text-muted">
              {attempt.family_label}
            </span>
          </div>
          <p className="text-sm text-foreground truncate">
            {attempt.question_text.slice(0, 120)}
            {attempt.question_text.length > 120 ? "..." : ""}
          </p>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          <PassBadge estimate={attempt.pass_estimate} />
          {attempt.marks_estimate && (
            <span className="text-xs text-muted font-mono">
              {attempt.marks_estimate}
            </span>
          )}
          <div className="text-right">
            <p className="text-xs text-muted">{formatDate(attempt.started_at)}</p>
            <p className="text-xs text-muted/60">{formatTime(attempt.started_at)}</p>
          </div>
          <svg
            className={`w-4 h-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Quick actions bar */}
          {attempt.completed_at && (
            <div className="flex items-center gap-3 py-2">
              <button
                onClick={handleRedo}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer bg-accent hover:bg-accent-hover text-background"
              >
                Redo This Question
              </button>
              <button
                onClick={() => {
                  const el = document.getElementById(`feedback-${attempt.id}`);
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                  el?.querySelector("textarea")?.focus();
                }}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer bg-card hover:bg-card-hover border border-border text-foreground"
              >
                Leave Feedback
              </button>
              {feedbackSaved && (
                <span className="text-xs text-success">Feedback saved</span>
              )}
            </div>
          )}

          {/* Question stem */}
          <ExpandedSection title="Question Stem">
            <div className="markdown-content text-sm">
              <ReactMarkdown>{attempt.question_text}</ReactMarkdown>
            </div>
            {wines && wines.length > 0 && (
              <div className="mt-3 space-y-1">
                <p className="text-xs text-muted uppercase tracking-wider mb-2">Wines</p>
                {wines.map((w: { slot: number; fullText: string }) => (
                  <p key={w.slot} className="text-xs text-foreground/80">
                    <span className="text-accent font-mono">Wine {w.slot}:</span> {w.fullText}
                  </p>
                ))}
              </div>
            )}
          </ExpandedSection>

          {/* Pre-glass reasoning */}
          {attempt.pre_glass_reasoning && (
            <ExpandedSection title="Pre-Glass Reasoning">
              <div className="markdown-content text-sm">
                <ReactMarkdown>{attempt.pre_glass_reasoning}</ReactMarkdown>
              </div>
            </ExpandedSection>
          )}

          {/* Tasting notes */}
          {tastingNotes && tastingNotes.length > 0 && (
            <ExpandedSection title="Tasting Notes Received">
              <div className="space-y-3">
                {tastingNotes.map((note: string, i: number) => (
                  <div key={i} className="markdown-content text-sm">
                    <ReactMarkdown>{note}</ReactMarkdown>
                  </div>
                ))}
              </div>
            </ExpandedSection>
          )}

          {/* User answer */}
          {attempt.user_answer && (
            <ExpandedSection title="Your Answer">
              <div className="markdown-content text-sm">
                <ReactMarkdown>{attempt.user_answer}</ReactMarkdown>
              </div>
            </ExpandedSection>
          )}

          {/* AI evaluation */}
          {attempt.answer_feedback && (
            <ExpandedSection title="AI Evaluation / Debrief">
              <div className="markdown-content text-sm">
                <ReactMarkdown>{attempt.answer_feedback}</ReactMarkdown>
              </div>
            </ExpandedSection>
          )}

          {/* Model answer */}
          {attempt.model_answer && (
            <ExpandedSection title="Model Answer">
              <div className="markdown-content text-sm">
                <ReactMarkdown>{attempt.model_answer}</ReactMarkdown>
              </div>
            </ExpandedSection>
          )}

          {/* User feedback / dispute */}
          {attempt.completed_at && (
            <div id={`feedback-${attempt.id}`}>
            <ExpandedSection title="Your Feedback">
              <div className="space-y-3">
                <p className="text-xs text-muted">
                  Disagree with the evaluation? Note what you think was missed or misjudged. This helps calibrate the system over time.
                </p>
                <textarea
                  value={feedbackText}
                  onChange={(e) => {
                    setFeedbackText(e.target.value);
                    setFeedbackSaved(false);
                  }}
                  placeholder="e.g., I correctly identified the Riesling as Mosel Kabinett — the critique docked marks for not mentioning Spätlese but I explicitly ruled it out based on alcohol level..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent resize-y min-h-[80px]"
                  rows={3}
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSaveFeedback}
                    disabled={savingFeedback || !feedbackText.trim() || feedbackSaved}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-background"
                  >
                    {savingFeedback ? "Saving..." : feedbackSaved ? "Saved" : "Save Feedback"}
                  </button>
                  {feedbackSaved && (
                    <span className="text-xs text-success">Feedback recorded</span>
                  )}
                </div>
              </div>
            </ExpandedSection>
            </div>
          )}

          {/* Redo button */}
          {attempt.completed_at && (
            <div className="flex justify-end pt-2">
              <button
                onClick={handleRedo}
                className="px-5 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer bg-card hover:bg-card-hover border border-border text-foreground"
              >
                Redo This Question
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ExpandedSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-background rounded-lg border border-border/60 overflow-hidden">
      <div className="px-4 py-2 border-b border-border/60 bg-card/30">
        <h4 className="text-xs font-semibold text-accent uppercase tracking-wider">{title}</h4>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

interface Filters {
  results: Set<string>;
  papers: Set<number>;
  families: Set<string>;
}

function toggleInSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function applyFilters(attempts: AttemptDetail[], filters: Filters): AttemptDetail[] {
  return attempts.filter((a) => {
    if (filters.results.size > 0) {
      const result = !a.completed_at ? "in_progress" : (a.pass_estimate || "unknown");
      if (!filters.results.has(result)) return false;
    }
    if (filters.papers.size > 0 && !filters.papers.has(a.paper)) return false;
    if (filters.families.size > 0 && !filters.families.has(a.family_label)) return false;
    return true;
  });
}

function groupBySubcategory(attempts: AttemptDetail[]): { subcategory: string; attempts: AttemptDetail[] }[] {
  const map = new Map<string, AttemptDetail[]>();
  for (const a of attempts) {
    const key = a.subcategory || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  return [...map.entries()].map(([subcategory, attempts]) => ({ subcategory, attempts }));
}

const FAMILY_SHORT: Record<string, string> = {
  "Same Variety": "Same Variety",
  "Same Origin": "Same Origin",
  "Blend Logic": "Blend",
  "Mixed Breadth": "Breadth",
  "Method / Production": "Method",
  "Style Mechanism": "Style",
  "Quality Hierarchy": "Hierarchy",
};

function Chip({ active, color, onClick, children }: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const colorClass = active && color ? color : active
    ? "bg-accent text-background font-semibold"
    : "bg-card hover:bg-card-hover text-muted border border-border";
  return (
    <button onClick={onClick} className={`px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer ${colorClass}`}>
      {children}
    </button>
  );
}

export default function HistoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [attempts, setAttempts] = useState<AttemptDetail[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    results: new Set(),
    papers: new Set(),
    families: new Set(),
  });

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Fetch history data
  useEffect(() => {
    if (!user) return;

    fetch("/api/history")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setAttempts(data.attempts || []);
        setStats(data.stats || null);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load history:", err);
        setError("Failed to load history");
        setLoading(false);
      });
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="flex flex-col flex-1">
        <main className="flex-1">
          <div className="max-w-4xl mx-auto px-6 py-20">
            <div className="flex items-center justify-center">
              <div className="flex items-center gap-3 text-muted">
                <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
                <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
                <span className="ml-2 text-sm">Loading history...</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!user) return null;

  const passRate = stats && stats.completed_attempts > 0
    ? Math.round((stats.pass_count / stats.completed_attempts) * 100)
    : 0;
  const passOrBorderlineRate = stats && stats.completed_attempts > 0
    ? Math.round(((stats.pass_count + stats.borderline_count) / stats.completed_attempts) * 100)
    : 0;

  return (
    <div className="flex flex-col flex-1">
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {/* Page header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Study History
            </h1>
            <p className="text-sm text-muted mt-1">
              Track your progress across practice sessions
            </p>
          </div>

          {error && (
            <div className="bg-fail/10 border border-fail/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-fail">{error}</p>
            </div>
          )}

          {/* Scoreboard */}
          {stats && (
            <div className="mb-10 space-y-6">
              {/* Top-level stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  label="Questions Attempted"
                  value={stats.completed_attempts}
                  sub={stats.total_attempts > stats.completed_attempts
                    ? `${stats.total_attempts - stats.completed_attempts} in progress`
                    : undefined}
                />
                <StatCard
                  label="Results"
                  value={stats.completed_attempts > 0 ? `${stats.pass_count}P / ${stats.borderline_count}B / ${stats.fail_count}F` : "--"}
                  sub={stats.completed_attempts > 0
                    ? `${passRate}% pass · ${passOrBorderlineRate}% pass+borderline`
                    : "No completed attempts"}
                />
                <StatCard
                  label="Papers Practiced"
                  value={stats.by_paper.length}
                  sub={stats.by_paper.map(p => `P${p.paper}`).join(", ") || "None yet"}
                />
                <StatCard
                  label="Families Covered"
                  value={stats.by_family.length}
                  sub={stats.by_family.length > 0
                    ? `Top: ${stats.by_family[0]?.family_label}`
                    : "None yet"}
                />
              </div>

              {/* Paper breakdown + Recent trend */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* By paper */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="text-xs text-muted uppercase tracking-wider mb-3">By Paper</h3>
                  {stats.by_paper.length === 0 ? (
                    <p className="text-sm text-muted">No completed attempts yet</p>
                  ) : (
                    <div className="space-y-3">
                      {stats.by_paper.map((p) => {
                        const pRate = p.total > 0 ? Math.round((p.pass / p.total) * 100) : 0;
                        return (
                          <div key={p.paper}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-sm font-medium text-foreground">
                                {paperLabel(p.paper)}
                              </span>
                              <span className="text-xs text-muted">
                                {p.total} attempts / {pRate}% pass
                              </span>
                            </div>
                            <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                              <div className="h-full flex">
                                {p.pass > 0 && (
                                  <div
                                    className="bg-success h-full"
                                    style={{ width: `${(p.pass / p.total) * 100}%` }}
                                  />
                                )}
                                {p.borderline > 0 && (
                                  <div
                                    className="bg-borderline h-full"
                                    style={{ width: `${(p.borderline / p.total) * 100}%` }}
                                  />
                                )}
                                {p.fail > 0 && (
                                  <div
                                    className="bg-fail h-full"
                                    style={{ width: `${(p.fail / p.total) * 100}%` }}
                                  />
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Recent trend + By family */}
                <div className="bg-card rounded-xl border border-border p-4">
                  <h3 className="text-xs text-muted uppercase tracking-wider mb-3">Recent Trend</h3>
                  {stats.recent_results.length === 0 ? (
                    <p className="text-sm text-muted">No results yet</p>
                  ) : (
                    <div className="flex items-center gap-2 mb-4">
                      {stats.recent_results.map((r, i) => (
                        <div
                          key={i}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                            r.pass_estimate === "pass"
                              ? "bg-success/15 text-success border border-success/30"
                              : r.pass_estimate === "fail"
                                ? "bg-fail/15 text-fail border border-fail/30"
                                : "bg-borderline/15 text-borderline border border-borderline/30"
                          }`}
                          title={formatDate(r.started_at)}
                        >
                          {r.pass_estimate === "pass" ? "P" : r.pass_estimate === "fail" ? "F" : "B"}
                        </div>
                      ))}
                      <span className="text-xs text-muted ml-2">
                        (most recent {String.fromCharCode(8594)} oldest)
                      </span>
                    </div>
                  )}

                  <h3 className="text-xs text-muted uppercase tracking-wider mb-3 mt-4 pt-3 border-t border-border">
                    By Family
                  </h3>
                  {stats.by_family.length === 0 ? (
                    <p className="text-sm text-muted">No completed attempts yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {stats.by_family.slice(0, 6).map((f) => (
                        <div key={f.family} className="flex items-center justify-between">
                          <span className="text-sm text-foreground">{f.family_label}</span>
                          <span className="text-xs text-muted">
                            {f.total} attempts / {f.total > 0 ? Math.round((f.pass / f.total) * 100) : 0}% pass
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Attempt list */}
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-4">
              All Attempts
              {attempts.length > 0 && (
                <span className="text-sm font-normal text-muted ml-2">
                  ({attempts.length})
                </span>
              )}
            </h2>

            {attempts.length === 0 ? (
              <div className="bg-card rounded-xl border border-border p-8 text-center">
                <p className="text-muted">No study sessions yet.</p>
                <button
                  onClick={() => router.push("/")}
                  className="mt-4 px-6 py-2 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Start Studying
                </button>
              </div>
            ) : (
              <>{(() => {
                const activeFilterCount = filters.results.size + filters.papers.size + filters.families.size;

                // Apply paper + result filters first to determine what families are visible
                const afterPaperAndResult = attempts.filter((a) => {
                  if (filters.results.size > 0) {
                    const result = !a.completed_at ? "in_progress" : (a.pass_estimate || "unknown");
                    if (!filters.results.has(result)) return false;
                  }
                  if (filters.papers.size > 0 && !filters.papers.has(a.paper)) return false;
                  return true;
                });

                // Dynamic: only show families that exist in the paper+result filtered set
                const visibleFamilies = [...new Set(afterPaperAndResult.map((a) => a.family_label))].sort();
                const uniquePapers = [...new Set(attempts.map((a) => a.paper))].sort();

                const filtered = applyFilters(attempts, filters);
                const grouped = groupBySubcategory(filtered);

                return (
                  <>
                    {/* Filter bar */}
                    <div className="bg-card rounded-xl border border-border p-4 mb-4 space-y-2.5">
                      {/* Row 1: Paper + Result */}
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-1.5">
                          {uniquePapers.map((p) => (
                            <Chip
                              key={p}
                              active={filters.papers.has(p)}
                              onClick={() => setFilters((f) => ({ ...f, papers: toggleInSet(f.papers, p) }))}
                            >
                              {paperLabel(p)}
                            </Chip>
                          ))}
                        </div>

                        <div className="w-px h-5 bg-border" />

                        <div className="flex items-center gap-1.5">
                          <Chip active={filters.results.has("pass")} color="bg-success/20 text-success font-semibold border border-success/40" onClick={() => setFilters((f) => ({ ...f, results: toggleInSet(f.results, "pass") }))}>Pass</Chip>
                          <Chip active={filters.results.has("borderline")} color="bg-borderline/20 text-borderline font-semibold border border-borderline/40" onClick={() => setFilters((f) => ({ ...f, results: toggleInSet(f.results, "borderline") }))}>Borderline</Chip>
                          <Chip active={filters.results.has("fail")} color="bg-fail/20 text-fail font-semibold border border-fail/40" onClick={() => setFilters((f) => ({ ...f, results: toggleInSet(f.results, "fail") }))}>Fail</Chip>
                          <Chip active={filters.results.has("in_progress")} color="bg-accent/15 text-accent font-semibold border border-accent/30" onClick={() => setFilters((f) => ({ ...f, results: toggleInSet(f.results, "in_progress") }))}>In Progress</Chip>
                        </div>

                        {activeFilterCount > 0 && (
                          <>
                            <div className="w-px h-5 bg-border" />
                            <button
                              onClick={() => setFilters({ results: new Set(), papers: new Set(), families: new Set() })}
                              className="text-xs text-accent hover:text-accent-hover cursor-pointer"
                            >
                              Clear ({activeFilterCount})
                            </button>
                          </>
                        )}
                      </div>

                      {/* Row 2: Family (dynamic — only shows families present in current paper+result filter) */}
                      {visibleFamilies.length > 1 && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
                          {visibleFamilies.map((fl) => (
                            <Chip
                              key={fl}
                              active={filters.families.has(fl)}
                              onClick={() => setFilters((f) => ({ ...f, families: toggleInSet(f.families, fl) }))}
                            >
                              {FAMILY_SHORT[fl] || fl}
                            </Chip>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Result count */}
                    {activeFilterCount > 0 && (
                      <p className="text-xs text-muted mb-3">
                        Showing {filtered.length} of {attempts.length} attempts
                      </p>
                    )}

                    {/* Grouped list by subcategory */}
                    {filtered.length === 0 ? (
                      <div className="bg-card rounded-xl border border-border p-6 text-center">
                        <p className="text-sm text-muted">No attempts match these filters.</p>
                      </div>
                    ) : grouped.length === 1 ? (
                      <div className="bg-card rounded-xl border border-border overflow-hidden">
                        {filtered.map((attempt) => (
                          <AttemptCard key={attempt.id} attempt={attempt} />
                        ))}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {grouped.map((group) => (
                          <div key={group.subcategory}>
                            <div className="flex items-center gap-2 mb-2 px-1">
                              <h3 className="text-xs font-semibold text-muted uppercase tracking-wider truncate">
                                {group.subcategory}
                              </h3>
                              <span className="text-xs text-muted/50 shrink-0">
                                ({group.attempts.length})
                              </span>
                            </div>
                            <div className="bg-card rounded-xl border border-border overflow-hidden">
                              {group.attempts.map((attempt) => (
                                <AttemptCard key={attempt.id} attempt={attempt} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}</>
            )}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-auto">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <p className="text-xs text-muted text-center">
            Built for MW practical exam preparation. Powered by Claude.
          </p>
        </div>
      </footer>
    </div>
  );
}
