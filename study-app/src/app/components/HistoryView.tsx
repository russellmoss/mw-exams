"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { FeedbackMarkdown } from "./FeedbackMarkdown";
import { TimingBadge } from "./StudyTimer";

function parseModelAnswer(text: string): {
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

  const cutoff = cleaned.search(/\n#{1,2}\s*\d+\.\s*(?:Proposed Annotation|Reasoning Trace|Study Diagram)/i);
  const answer = cutoff > 0 ? cleaned.slice(0, cutoff).trim() : cleaned;

  const findSection = (label: string) => {
    const pattern = new RegExp(`#{1,2}\\s*\\d+\\.\\s*${label}([\\s\\S]*?)(?=\\n#{1,2}\\s*\\d+\\.|$)`, "i");
    const match = cleaned.match(pattern);
    return match ? match[1].trim() : "";
  };

  return {
    answer,
    annotation: findSection("Proposed Annotation"),
    reasoning: findSection("Reasoning Trace"),
    studyDiagram: findSection("Study Diagram"),
  };
}

function CopyId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(id); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="inline-flex items-center gap-1 text-[10px] font-mono text-muted/60 hover:text-muted transition-colors cursor-pointer"
      title={id}
    >
      {id.length > 20 ? id.slice(0, 10) + "..." + id.slice(-6) : id}
      {copied ? (
        <svg className="w-3 h-3 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
      ) : (
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
      )}
    </button>
  );
}

export interface AttemptDetail {
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
  feedback_status: string | null;
  feedback_admin_note: string | null;
  feedback_reviewed_at: string | null;
  feedback_decided_by?: string | null; // 'auto' | 'manual'
  elapsed_seconds: number | null;
  // Auto-apply pipeline (admin views only)
  auto_recommendation?: string | null;
  apply_status?: string | null; // dispatched|verifying|merged|deployed|pr_opened|failed
  work_branch?: string | null;
  commit_sha?: string | null;
  pr_url?: string | null;
  deploy_state?: string | null;
  applied_by?: string | null;
  apply_error?: string | null;
}

export interface Stats {
  total_attempts: number;
  completed_attempts: number;
  pass_count: number;
  fail_count: number;
  borderline_count: number;
  by_paper: { paper: number; total: number; pass: number; fail: number; borderline: number }[];
  by_family: { family: string; family_label: string; total: number; pass: number; borderline: number; fail: number }[];
  recent_results: { pass_estimate: string; started_at: string }[];
}

function paperLabel(paper: number): string {
  return paper === 1 ? "P1 Whites" : paper === 2 ? "P2 Reds" : "P3 Special";
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function PassBadge({ estimate }: { estimate: string | null }) {
  if (!estimate) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted/20 text-muted">In progress</span>;
  }
  const colors = {
    pass: "bg-success/15 text-success border-success/30",
    fail: "bg-fail/15 text-fail border-fail/30",
    borderline: "bg-borderline/15 text-borderline border-borderline/30",
  };
  const color = colors[estimate as keyof typeof colors] || colors.fail;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${color}`}>{estimate.charAt(0).toUpperCase() + estimate.slice(1)}</span>;
}

const GITHUB_REPO_URL = "https://github.com/russellmoss/mw-exams";

function ApplyStatusBadge({ status, commitSha, prUrl, deployState, error }: {
  status: string;
  commitSha: string | null;
  prUrl: string | null;
  deployState: string | null;
  error: string | null;
}) {
  const map: Record<string, { label: string; cls: string }> = {
    dispatched: { label: "Dispatched — CI starting", cls: "bg-accent/15 text-accent" },
    verifying: { label: "Verifying (lint · typecheck · build)", cls: "bg-accent/15 text-accent" },
    merged: { label: "Merged to master", cls: "bg-success/15 text-success" },
    deployed: { label: "Deployed to production", cls: "bg-success/15 text-success" },
    pr_opened: { label: "Couldn’t verify — PR opened for review", cls: "bg-borderline/15 text-borderline" },
    failed: { label: "Pipeline failed", cls: "bg-fail/15 text-fail" },
  };
  const s = map[status] || { label: status, cls: "bg-muted/20 text-muted" };
  return (
    <div className="space-y-1">
      <div className={`text-xs px-2 py-1 rounded inline-flex items-center gap-2 ${s.cls}`}>
        <span className="font-semibold">{s.label}</span>
        {deployState && <span className="text-muted">· deploy: {deployState}</span>}
      </div>
      <div className="flex items-center gap-3 text-xs">
        {commitSha && (
          <a href={`${GITHUB_REPO_URL}/commit/${commitSha}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            commit {commitSha.slice(0, 7)}
          </a>
        )}
        {prUrl && (
          <a href={prUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            view PR
          </a>
        )}
      </div>
      {error && <p className="text-xs text-fail italic">{error}</p>}
    </div>
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

// Decision groups used by the admin filter chips. Color is keyed to the feedback_status
// (accepted=green, partial=orange, rejected=red); the "auto" flag drives the 🤖 marker.
type DecisionGroup = "auto-accept" | "partial" | "auto-reject" | "manual";

interface Decision {
  group: DecisionGroup;
  auto: boolean;
  label: string; // e.g. "Auto-accepted", "Partial", "Rejected"
  tail: string; // trailing clause for the detail badge
  chip: string; // tailwind classes for the small badge
  bg: string; // tailwind classes for the card background tint
  color: string; // CSS var for the card's left accent border
}

function getDecision(status: string | null, decidedBy: string | null | undefined): Decision | null {
  if (!status) return null;
  const auto = decidedBy === "auto";
  if (status === "partial") {
    return { group: "partial", auto, label: "Partial", tail: "— review recommended",
      chip: "bg-borderline/20 text-borderline", bg: "bg-borderline/5", color: "var(--borderline)" };
  }
  if (status === "accepted") {
    return { group: auto ? "auto-accept" : "manual", auto, label: auto ? "Auto-accepted" : "Accepted",
      tail: "— change applied", chip: "bg-success/20 text-success", bg: "bg-success/5", color: "var(--success)" };
  }
  if (status === "rejected") {
    return { group: auto ? "auto-reject" : "manual", auto, label: auto ? "Auto-rejected" : "Rejected",
      tail: "— no change needed", chip: "bg-fail/20 text-fail", bg: "bg-fail/5", color: "var(--fail)" };
  }
  return null;
}

function DecisionBadge({ decision }: { decision: Decision }) {
  return (
    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${decision.chip}`}>
      {decision.auto ? "🤖 " : ""}{decision.label}
    </span>
  );
}

function AttemptCard({ attempt, readOnly, isAdmin }: { attempt: AttemptDetail; readOnly?: boolean; isAdmin?: boolean }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [feedbackText, setFeedbackText] = useState(attempt.user_feedback || "");
  const [feedbackSaved, setFeedbackSaved] = useState(!!attempt.user_feedback);
  const [reviewStatus, setReviewStatus] = useState(attempt.feedback_status);
  const [adminNote, setAdminNote] = useState(attempt.feedback_admin_note || "");
  const [reviewSaving, setReviewSaving] = useState(false);
  const [savingFeedback, setSavingFeedback] = useState(false);
  const [applyState, setApplyState] = useState<string | null>(attempt.apply_status || null);
  const [applying, setApplying] = useState(false);
  const commitSha = attempt.commit_sha || null;
  const prUrl = attempt.pr_url || null;
  const deployState = attempt.deploy_state || null;
  // Live decision reflects the current review state (so manual Accept/Reject updates instantly).
  const decision = getDecision(reviewStatus, attempt.feedback_decided_by);

  const handleApplyShip = async () => {
    setApplying(true);
    try {
      const res = await fetch("/api/admin/apply-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId: attempt.id }),
      });
      if (res.ok) {
        setReviewStatus("accepted");
        setApplyState("dispatched");
      }
    } finally {
      setApplying(false);
    }
  };
  const wines = typeof attempt.wines === "string" ? JSON.parse(attempt.wines) : attempt.wines;
  const wineCount = Array.isArray(wines) ? wines.length : 4;
  const tastingNotes = typeof attempt.tasting_notes === "string" ? JSON.parse(attempt.tasting_notes) : attempt.tasting_notes;

  const handleRedo = () => {
    const questionData = {
      id: attempt.question_id,
      source: "history-redo",
      year: null,
      paper: attempt.paper,
      questionNumber: 1,
      text: attempt.question_text,
      wines,
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
        body: JSON.stringify({ action: "update", attemptId: attempt.id, user_feedback: feedbackText.trim() }),
      });
      setFeedbackSaved(true);
    } catch (err) {
      console.error("Failed to save feedback:", err);
    } finally {
      setSavingFeedback(false);
    }
  };

  return (
    <div
      className={`border-b border-border last:border-b-0 ${decision ? decision.bg : ""}`}
      style={decision ? { borderLeft: `4px solid ${decision.color}` } : undefined}
    >
      {/* role=button (not <button>) so the nested CopyId/DecisionBadge buttons are valid HTML and
          don't trip a hydration error. Keyboard-accessible via Enter/Space. */}
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        className="w-full px-5 py-4 flex items-center gap-4 hover:bg-card-hover transition-colors cursor-pointer text-left"
      >
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
          attempt.pass_estimate === "pass" ? "bg-success"
            : attempt.pass_estimate === "fail" ? "bg-fail"
              : attempt.pass_estimate === "borderline" ? "bg-borderline" : "bg-muted/40"
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-accent/15 text-accent">{paperLabel(attempt.paper)}</span>
            <span className="text-xs text-muted">{attempt.family_label}</span>
            <CopyId id={attempt.question_id} />
            {decision && <DecisionBadge decision={decision} />}
          </div>
          <p className="text-sm text-foreground truncate">
            {attempt.question_text.slice(0, 120)}{attempt.question_text.length > 120 ? "..." : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <PassBadge estimate={attempt.pass_estimate} />
          {attempt.elapsed_seconds != null && <TimingBadge seconds={attempt.elapsed_seconds} wineCount={wineCount} />}
          {attempt.marks_estimate && <span className="text-xs text-muted font-mono">{attempt.marks_estimate}</span>}
          <div className="text-right">
            <p className="text-xs text-muted">{formatDate(attempt.started_at)}</p>
            <p className="text-xs text-muted/60">{formatTime(attempt.started_at)}</p>
          </div>
          <svg className={`w-4 h-4 text-muted transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {!readOnly && (
            <div className="flex items-center gap-3 py-2">
              <button onClick={handleRedo} className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer bg-accent hover:bg-accent-hover text-background">
                Redo This Question
              </button>
              <button
                onClick={() => { document.getElementById(`feedback-${attempt.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); document.getElementById(`feedback-${attempt.id}`)?.querySelector("textarea")?.focus(); }}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer bg-card hover:bg-card-hover border border-border text-foreground"
              >
                Leave Feedback
              </button>
              {feedbackSaved && <span className="text-xs text-success">{reviewStatus === "accepted" ? "Feedback saved — change applied" : "Feedback saved"}</span>}
            </div>
          )}

          <ExpandedSection title="Question Stem">
            <div className="markdown-content text-sm"><ReactMarkdown>{attempt.question_text}</ReactMarkdown></div>
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

          {attempt.pre_glass_reasoning && (
            <ExpandedSection title="Pre-Glass Reasoning">
              <div className="markdown-content text-sm"><ReactMarkdown>{attempt.pre_glass_reasoning}</ReactMarkdown></div>
            </ExpandedSection>
          )}

          {tastingNotes && tastingNotes.length > 0 && (
            <ExpandedSection title="Tasting Notes Received">
              <div className="space-y-3">
                {tastingNotes.map((note: string, i: number) => (
                  <div key={i} className="markdown-content text-sm"><ReactMarkdown>{note}</ReactMarkdown></div>
                ))}
              </div>
            </ExpandedSection>
          )}

          {attempt.user_answer && (
            <ExpandedSection title={readOnly ? "Answer" : "Your Answer"}>
              <div className="markdown-content text-sm"><ReactMarkdown>{attempt.user_answer}</ReactMarkdown></div>
            </ExpandedSection>
          )}

          {attempt.answer_feedback && (
            <ExpandedSection title="AI Evaluation / Debrief">
              <div className="markdown-content text-sm"><FeedbackMarkdown>{attempt.answer_feedback}</FeedbackMarkdown></div>
            </ExpandedSection>
          )}

          {attempt.model_answer && (() => {
            const parsed = parseModelAnswer(attempt.model_answer!);
            return (
              <>
                <ExpandedSection title="Model Answer">
                  <div className="markdown-content text-sm"><ReactMarkdown>{parsed.answer}</ReactMarkdown></div>
                </ExpandedSection>
                {parsed.annotation && (
                  <ExpandedSection title="Examiner Intent / Annotation">
                    <div className="markdown-content text-sm"><ReactMarkdown>{parsed.annotation}</ReactMarkdown></div>
                  </ExpandedSection>
                )}
                {parsed.reasoning && (
                  <ExpandedSection title="Reasoning Trace">
                    <div className="markdown-content text-sm"><ReactMarkdown>{parsed.reasoning}</ReactMarkdown></div>
                  </ExpandedSection>
                )}
                {parsed.studyDiagram && (
                  <ExpandedSection title="Study Diagram Assist">
                    <div className="markdown-content text-sm"><ReactMarkdown>{parsed.studyDiagram}</ReactMarkdown></div>
                  </ExpandedSection>
                )}
              </>
            );
          })()}

          {attempt.user_feedback && (
            <ExpandedSection title={`User Feedback${decision ? ` — ${decision.label}` : ""}`}>
              <div className="markdown-content text-sm mb-3"><ReactMarkdown>{attempt.user_feedback}</ReactMarkdown></div>
              {isAdmin && (
                <div className="border-t border-border/60 pt-3 space-y-2">
                  {attempt.auto_recommendation && (
                    <div className="text-xs text-muted">
                      Auto-analysis: <span className={`font-semibold ${attempt.auto_recommendation === "accept" ? "text-success" : attempt.auto_recommendation === "reject" ? "text-fail" : "text-borderline"}`}>{attempt.auto_recommendation.toUpperCase()}</span>
                    </div>
                  )}
                  {decision && (
                    <div className={`text-xs px-2 py-1 rounded inline-flex items-center gap-1.5 ${decision.chip}`}
                         title={decision.auto ? "Decided automatically by Auto-Apply — no human review" : undefined}>
                      <span className="font-semibold">{decision.auto ? "🤖 " : ""}{decision.label} {decision.tail}</span>
                      {attempt.feedback_reviewed_at && <span className="text-muted">({new Date(attempt.feedback_reviewed_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })})</span>}
                    </div>
                  )}
                  {attempt.feedback_admin_note && reviewStatus && (
                    <p className="text-xs text-muted italic">{attempt.feedback_admin_note}</p>
                  )}

                  {/* Auto-apply pipeline status */}
                  {applyState && <ApplyStatusBadge status={applyState} commitSha={commitSha} prUrl={prUrl} deployState={deployState} error={attempt.apply_error || null} />}

                  {!reviewStatus && (
                    <>
                      <textarea
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                        placeholder="Admin note (optional) — what did you change or why rejected?"
                        className="w-full px-3 py-2 text-xs rounded-lg border border-border bg-background text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent resize-y min-h-[50px]"
                        rows={2}
                      />
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={handleApplyShip}
                          disabled={applying || reviewSaving}
                          title="Auto-code the change, verify in CI (lint/typecheck/build), and ship if green"
                          className="px-3 py-1 text-xs font-semibold rounded-md bg-accent/15 text-accent border border-accent/40 hover:bg-accent/25 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {applying ? "Dispatching…" : "Apply & ship 🚀"}
                        </button>
                        <button
                          onClick={async () => {
                            setReviewSaving(true);
                            await fetch("/api/save-attempt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review-feedback", attemptId: attempt.id, feedbackStatus: "accepted", adminNote }) });
                            setReviewStatus("accepted");
                            setReviewSaving(false);
                          }}
                          disabled={reviewSaving || applying}
                          title="Mark accepted without shipping code (manual change)"
                          className="px-3 py-1 text-xs font-semibold rounded-md bg-success/15 text-success border border-success/30 hover:bg-success/25 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Accept (no ship)
                        </button>
                        <button
                          onClick={async () => {
                            setReviewSaving(true);
                            await fetch("/api/save-attempt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "review-feedback", attemptId: attempt.id, feedbackStatus: "rejected", adminNote }) });
                            setReviewStatus("rejected");
                            setReviewSaving(false);
                          }}
                          disabled={reviewSaving || applying}
                          className="px-3 py-1 text-xs font-semibold rounded-md bg-fail/15 text-fail border border-fail/30 hover:bg-fail/25 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </ExpandedSection>
          )}

          {!readOnly && (
            <div id={`feedback-${attempt.id}`}>
              <ExpandedSection title="Your Feedback">
                <div className="space-y-3">
                  <p className="text-xs text-muted">Disagree with the evaluation? Note what you think was missed or misjudged.</p>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => { setFeedbackText(e.target.value); setFeedbackSaved(false); }}
                    placeholder="e.g., I correctly identified the Riesling as Mosel Kabinett..."
                    className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent resize-y min-h-[80px]"
                    rows={3}
                  />
                  <div className="flex items-center gap-3">
                    <button onClick={handleSaveFeedback} disabled={savingFeedback || !feedbackText.trim() || feedbackSaved} className="px-4 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-accent hover:bg-accent-hover text-background">
                      {savingFeedback ? "Saving..." : feedbackSaved ? "Saved" : "Save Feedback"}
                    </button>
                    {feedbackSaved && <span className="text-xs text-success">Feedback recorded</span>}
                  </div>
                </div>
              </ExpandedSection>
            </div>
          )}

          {!readOnly && (
            <div className="flex justify-end pt-2">
              <button onClick={handleRedo} className="px-5 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer bg-card hover:bg-card-hover border border-border text-foreground">
                Redo This Question
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Filters {
  results: Set<string>;
  papers: Set<number>;
  families: Set<string>;
  decisions: Set<string>; // DecisionGroup values: auto-accept | partial | auto-reject | manual
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
    if (filters.decisions.size > 0) {
      const d = getDecision(a.feedback_status, a.feedback_decided_by);
      if (!d || !filters.decisions.has(d.group)) return false;
    }
    return true;
  });
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

function Chip({ active, color, onClick, children }: { active: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  const colorClass = active && color ? color : active ? "bg-accent text-background font-semibold" : "bg-card hover:bg-card-hover text-muted border border-border";
  return <button onClick={onClick} className={`px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer ${colorClass}`}>{children}</button>;
}

export function HistoryView({
  attempts,
  stats,
  readOnly = false,
  isAdmin = false,
  emptyAction,
}: {
  attempts: AttemptDetail[];
  stats: Stats | null;
  readOnly?: boolean;
  isAdmin?: boolean;
  emptyAction?: React.ReactNode;
}) {
  const [filters, setFilters] = useState<Filters>({ results: new Set(), papers: new Set(), families: new Set(), decisions: new Set() });

  const passRate = stats && stats.completed_attempts > 0 ? Math.round((stats.pass_count / stats.completed_attempts) * 100) : 0;
  const passOrBorderlineRate = stats && stats.completed_attempts > 0 ? Math.round(((stats.pass_count + stats.borderline_count) / stats.completed_attempts) * 100) : 0;

  const timedAttempts = attempts.filter((a) => a.elapsed_seconds != null && a.elapsed_seconds > 0);
  const avgPerWineSecs = timedAttempts.length > 0
    ? Math.round(timedAttempts.reduce((sum, a) => {
        const w = typeof a.wines === "string" ? JSON.parse(a.wines) : a.wines;
        const wc = Array.isArray(w) ? w.length : 4;
        return sum + (a.elapsed_seconds || 0) / wc;
      }, 0) / timedAttempts.length)
    : null;
  const avgPerWineMins = avgPerWineSecs ? (avgPerWineSecs / 60).toFixed(1) : null;

  return (
    <>
      {/* Scoreboard */}
      {stats && (
        <div className="mb-10 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Questions Attempted"
              value={stats.completed_attempts}
              sub={stats.total_attempts > stats.completed_attempts ? `${stats.total_attempts - stats.completed_attempts} in progress` : undefined}
            />
            <StatCard
              label="Results"
              value={stats.completed_attempts > 0 ? `${passOrBorderlineRate}% exam-ready` : "--"}
              sub={stats.completed_attempts > 0 ? `${stats.pass_count}P + ${stats.borderline_count}B + ${stats.fail_count}F — borderlines are near-passes` : "No completed attempts"}
            />
            <StatCard
              label="Papers Practiced"
              value={stats.by_paper.length}
              sub={stats.by_paper.map((p) => `P${p.paper}`).join(", ") || "None yet"}
            />
            <StatCard
              label="Avg Time / Wine"
              value={avgPerWineMins ? `${avgPerWineMins} min` : "--"}
              sub={avgPerWineMins ? (
                Number(avgPerWineMins) < 6 ? "Fast — consider adding depth"
                : Number(avgPerWineMins) <= 8 ? "Ideal MW pace (6-8 min/wine)"
                : Number(avgPerWineMins) <= 12 ? "A bit long — aim for 6-8 min/wine"
                : "Too slow — practice speed"
              ) : `${timedAttempts.length} timed`}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card rounded-xl border border-border p-4">
              <h3 className="text-xs text-muted uppercase tracking-wider mb-3">By Paper</h3>
              {stats.by_paper.length === 0 ? (
                <p className="text-sm text-muted">No completed attempts yet</p>
              ) : (
                <div className="space-y-3">
                  {stats.by_paper.map((p) => {
                    const passAndBorderline = p.pass + p.borderline;
                    const pbRate = p.total > 0 ? Math.round((passAndBorderline / p.total) * 100) : 0;
                    return (
                      <div key={p.paper}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-foreground">{paperLabel(p.paper)}</span>
                          <span className="text-xs text-muted">
                            {p.total} attempts · {p.pass}P {p.borderline}B {p.fail}F · {pbRate}% pass+borderline
                          </span>
                        </div>
                        <div className="w-full h-2 bg-background rounded-full overflow-hidden">
                          <div className="h-full flex">
                            {p.pass > 0 && <div className="bg-success h-full" style={{ width: `${(p.pass / p.total) * 100}%` }} />}
                            {p.borderline > 0 && <div className="bg-borderline h-full" style={{ width: `${(p.borderline / p.total) * 100}%` }} />}
                            {p.fail > 0 && <div className="bg-fail h-full" style={{ width: `${(p.fail / p.total) * 100}%` }} />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

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
                        r.pass_estimate === "pass" ? "bg-success/15 text-success border border-success/30"
                          : r.pass_estimate === "fail" ? "bg-fail/15 text-fail border border-fail/30"
                            : "bg-borderline/15 text-borderline border border-borderline/30"
                      }`}
                      title={formatDate(r.started_at)}
                    >
                      {r.pass_estimate === "pass" ? "P" : r.pass_estimate === "fail" ? "F" : "B"}
                    </div>
                  ))}
                  <span className="text-xs text-muted ml-2">(most recent {String.fromCharCode(8594)} oldest)</span>
                </div>
              )}
              <h3 className="text-xs text-muted uppercase tracking-wider mb-3 mt-4 pt-3 border-t border-border">By Family</h3>
              {stats.by_family.length === 0 ? (
                <p className="text-sm text-muted">No completed attempts yet</p>
              ) : (
                <div className="space-y-1.5">
                  {stats.by_family.slice(0, 6).map((f) => {
                    const pb = f.pass + (f.borderline || 0);
                    const pbRate = f.total > 0 ? Math.round((pb / f.total) * 100) : 0;
                    return (
                      <div key={f.family} className="flex items-center justify-between">
                        <span className="text-sm text-foreground">{f.family_label}</span>
                        <span className="text-xs text-muted">
                          {f.total} · {f.pass}P {f.borderline || 0}B {f.fail || 0}F · {pbRate}% P+B
                        </span>
                      </div>
                    );
                  })}
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
          {attempts.length > 0 && <span className="text-sm font-normal text-muted ml-2">({attempts.length})</span>}
        </h2>

        {attempts.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-8 text-center">
            <p className="text-muted">No study sessions yet.</p>
            {emptyAction}
          </div>
        ) : (
          <>
            {(() => {
              const activeFilterCount = filters.results.size + filters.papers.size + filters.families.size + filters.decisions.size;
              const hasDecisions = isAdmin && attempts.some((a) => a.feedback_status);
              const afterPaperAndResult = attempts.filter((a) => {
                if (filters.results.size > 0) {
                  const result = !a.completed_at ? "in_progress" : (a.pass_estimate || "unknown");
                  if (!filters.results.has(result)) return false;
                }
                if (filters.papers.size > 0 && !filters.papers.has(a.paper)) return false;
                return true;
              });
              const visibleFamilies = [...new Set(afterPaperAndResult.map((a) => a.family_label))].sort();
              const uniquePapers = [...new Set(attempts.map((a) => a.paper))].sort();
              const filtered = applyFilters(attempts, filters);

              return (
                <>
                  <div className="bg-card rounded-xl border border-border p-4 mb-4 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center gap-1.5">
                        {uniquePapers.map((p) => (
                          <Chip key={p} active={filters.papers.has(p)} onClick={() => setFilters((f) => ({ ...f, papers: toggleInSet(f.papers, p) }))}>{paperLabel(p)}</Chip>
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
                          <button onClick={() => setFilters({ results: new Set(), papers: new Set(), families: new Set(), decisions: new Set() })} className="text-xs text-accent hover:text-accent-hover cursor-pointer">Clear ({activeFilterCount})</button>
                        </>
                      )}
                    </div>
                    {hasDecisions && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
                        <span className="text-[10px] uppercase tracking-wider text-muted mr-1">Decision</span>
                        <Chip active={filters.decisions.has("auto-accept")} color="bg-success/20 text-success font-semibold border border-success/40" onClick={() => setFilters((f) => ({ ...f, decisions: toggleInSet(f.decisions, "auto-accept") }))}>🤖 Auto-accepted</Chip>
                        <Chip active={filters.decisions.has("partial")} color="bg-borderline/20 text-borderline font-semibold border border-borderline/40" onClick={() => setFilters((f) => ({ ...f, decisions: toggleInSet(f.decisions, "partial") }))}>Partial</Chip>
                        <Chip active={filters.decisions.has("auto-reject")} color="bg-fail/20 text-fail font-semibold border border-fail/40" onClick={() => setFilters((f) => ({ ...f, decisions: toggleInSet(f.decisions, "auto-reject") }))}>🤖 Auto-rejected</Chip>
                        <Chip active={filters.decisions.has("manual")} onClick={() => setFilters((f) => ({ ...f, decisions: toggleInSet(f.decisions, "manual") }))}>Manual</Chip>
                      </div>
                    )}
                    {visibleFamilies.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
                        {visibleFamilies.map((fl) => (
                          <Chip key={fl} active={filters.families.has(fl)} onClick={() => setFilters((f) => ({ ...f, families: toggleInSet(f.families, fl) }))}>{FAMILY_SHORT[fl] || fl}</Chip>
                        ))}
                      </div>
                    )}
                  </div>
                  {activeFilterCount > 0 && <p className="text-xs text-muted mb-3">Showing {filtered.length} of {attempts.length} attempts</p>}
                  {filtered.length === 0 ? (
                    <div className="bg-card rounded-xl border border-border p-6 text-center">
                      <p className="text-sm text-muted">No attempts match these filters.</p>
                    </div>
                  ) : (
                    <div className="bg-card rounded-xl border border-border overflow-hidden">
                      {filtered.map((attempt) => <AttemptCard key={attempt.id} attempt={attempt} readOnly={readOnly} isAdmin={isAdmin} />)}
                    </div>
                  )}
                </>
              );
            })()}
          </>
        )}
      </div>
    </>
  );
}
