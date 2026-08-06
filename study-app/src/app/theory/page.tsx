"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useDraft } from "@/lib/use-draft";
import { useSpeech } from "@/lib/use-speech";
import type { TheoryRubric } from "@/lib/theory/types";
import { FeedbackMarkdown } from "../components/FeedbackMarkdown";
import { MicButton } from "../components/MicButton";
import { TheoryModelAnswer, type TheoryAnswerPayload } from "../components/TheoryModelAnswer";
import { TheoryQuestionPicker, type TheoryQuestionSummary } from "../components/TheoryQuestionPicker";
import { TheoryRubricPanel } from "../components/TheoryRubricPanel";
import { ThinkingTrace } from "../components/ThinkingTrace";

type Phase = "writing" | "grading" | "complete" | "error";
interface SourceFrame {
  route: "kb" | "web" | "none";
  status: "available" | "unavailable" | "error";
  notice: string;
  checkedAt: string;
  fromCache: boolean;
  citations: Array<{ publisher: string; title: string | null; url: string; publishedAt: string | null }>;
}

function wordCount(value: string) {
  return (value.match(/\b[\w'-]+\b/g) ?? []).length;
}

function formatClock(seconds: number) {
  const minutes = Math.floor(Math.abs(seconds) / 60);
  const remainder = Math.abs(seconds) % 60;
  return `${seconds < 0 ? "+" : ""}${minutes}:${String(remainder).padStart(2, "0")}`;
}

function verdictFromText(value: string): "PASS" | "BORDERLINE" | "FAIL" | null {
  return value.match(/\b(PASS|BORDERLINE|FAIL)\b/i)?.[1]?.toUpperCase() as "PASS" | "BORDERLINE" | "FAIL" | undefined ?? null;
}

function hideAuditComment(value: string) {
  return value.replace(/<!--[^]*$/i, "").trimEnd();
}

function TheoryWorkspace({
  question,
  onExit,
}: {
  question: TheoryQuestionSummary;
  onExit: () => void;
}) {
  const [rubric, setRubric] = useState<TheoryRubric | null>(null);
  const [answer, setAnswer, clearAnswer] = useDraft(`theory:${question.id}`);
  const [submittedAnswer, setSubmittedAnswer] = useState("");
  const [voiceUsed, setVoiceUsed] = useState(false);
  const [phase, setPhase] = useState<Phase>("writing");
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef(0);
  const [feedback, setFeedback] = useState("");
  const [thinking, setThinking] = useState("");
  const [sources, setSources] = useState<SourceFrame | null>(null);
  const [verdict, setVerdict] = useState<"PASS" | "BORDERLINE" | "FAIL" | null>(null);
  const [attemptId, setAttemptId] = useState<number | null>(null);
  const [modelAnswer, setModelAnswer] = useState<TheoryAnswerPayload | null>(null);
  const [modelAnswerError, setModelAnswerError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const submissionStorageKey = `mw-theory-submission:${question.id}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/theory/rubric/${encodeURIComponent(question.id)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error || `Rubric request failed (${response.status})`);
        return response.json();
      })
      .then((payload) => { if (!cancelled) setRubric(payload.rubric); })
      .catch((caught) => { if (!cancelled) { setError(caught.message); setPhase("error"); } });
    return () => { cancelled = true; };
  }, [question.id]);

  useEffect(() => {
    if (!rubric || phase !== "writing") return;
    const interval = window.setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
    return () => window.clearInterval(interval);
  }, [rubric, phase]);

  const handleTranscript = useCallback((text: string) => {
    setVoiceUsed(true);
    setAnswer((current) => current.trim() ? `${current.trim()} ${text}` : text);
  }, [setAnswer]);
  const speech = useSpeech(handleTranscript);
  const words = wordCount(answer);
  const budgetSeconds = question.timeMinutes * 60;
  const remaining = budgetSeconds - elapsed;
  const wordTone = words < question.wordBand.min
    ? "text-muted"
    : words <= question.wordBand.max
      ? "text-success"
      : "text-borderline";

  const loadModelAnswer = useCallback(async () => {
    try {
      const response = await fetch(`/api/theory/answer/${encodeURIComponent(question.id)}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || `Model answer request failed (${response.status})`);
      setModelAnswer(payload);
    } catch (caught) {
      setModelAnswerError(caught instanceof Error ? caught.message : "Model answer could not be loaded");
    }
  }, [question.id]);

  const submit = useCallback(async () => {
    if (!answer.trim() || phase !== "writing") return;
    speech.stop();
    setConfirming(false);
    setPhase("grading");
    setError(null);
    setSubmittedAnswer(answer);
    let submissionId = window.sessionStorage.getItem(submissionStorageKey);
    if (!submissionId) {
      submissionId = window.crypto.randomUUID();
      window.sessionStorage.setItem(submissionStorageKey, submissionId);
    }
    let finalSeen = false;
    try {
      const response = await fetch("/api/theory/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({
          id: question.id,
          answer,
          inputMethod: voiceUsed ? "voice" : "typed",
          elapsedSeconds: elapsedRef.current,
          submissionId,
        }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `Grading request failed (${response.status})`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamed = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") continue;
          let event: Record<string, unknown>;
          try { event = JSON.parse(raw); } catch { continue; }
          if (typeof event.t === "string") {
            streamed += event.t;
            setFeedback(hideAuditComment(streamed));
          } else if (typeof event.k === "string") {
            setThinking((current) => current + event.k);
          } else if (event.sources) {
            setSources(event.sources as SourceFrame);
          } else if (typeof event.final === "string") {
            finalSeen = true;
            setFeedback(event.final);
            setAttemptId(typeof event.attemptId === "number" ? event.attemptId : null);
            const finalVerdict = event.verdict === "PASS" || event.verdict === "BORDERLINE" || event.verdict === "FAIL"
              ? event.verdict
              : verdictFromText(event.final);
            setVerdict(finalVerdict);
            setPhase("complete");
            clearAnswer();
            window.sessionStorage.removeItem(submissionStorageKey);
            void loadModelAnswer();
          }
        }
      }
      if (!finalSeen) throw new Error("Grading ended without a final result. The attempt is preserved in History.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Theory grading failed");
      setPhase("error");
    }
  }, [answer, clearAnswer, loadModelAnswer, phase, question.id, speech, submissionStorageKey, voiceUsed]);

  const retryAfterError = useCallback(() => {
    // A terminal failed attempt keeps its audit row. A deliberate retry is a new submission and
    // therefore gets a new idempotency key; the candidate's local draft remains intact.
    window.sessionStorage.removeItem(submissionStorageKey);
    setPhase("writing");
    setError(null);
    setFeedback("");
    setThinking("");
    setSources(null);
    setVerdict(null);
    setAttemptId(null);
    setSubmittedAnswer("");
  }, [submissionStorageKey]);

  const displayedVerdict = verdict ?? verdictFromText(feedback);
  const verdictTone = displayedVerdict === "PASS"
    ? "text-success border-success/30 bg-success/10"
    : displayedVerdict === "FAIL"
      ? "text-fail border-fail/30 bg-fail/10"
      : displayedVerdict === "BORDERLINE"
        ? "text-borderline border-borderline/30 bg-borderline/10"
        : "text-muted border-border bg-card";

  if (!rubric && phase !== "error") {
    return <div className="bg-card rounded-xl border border-border p-8 text-sm text-muted">Loading examiner rubric…</div>;
  }

  return (
    <div className="space-y-6">
      <button onClick={onExit} className="text-sm text-muted hover:text-foreground cursor-pointer">← Choose another question</button>

      <section className="bg-card rounded-xl border border-border p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="font-mono text-xs rounded bg-accent/15 px-2 py-1 text-accent">
            {question.year} · Paper {question.paper} · Question {question.question}
          </span>
          <span className="text-xs text-muted">{question.paperTitle}</span>
          {question.exAnte && <span className="text-[10px] border border-border rounded-full px-2 py-1 text-muted">Ex-ante</span>}
        </div>
        <h1 className="text-2xl font-semibold text-foreground leading-snug">{question.questionText}</h1>
        <div className="flex flex-wrap gap-4 mt-4 text-xs text-muted tabular-nums">
          <span>{question.timeMinutes}-minute budget</span>
          <span>{question.wordBand.min}–{question.wordBand.max} words</span>
          <span>{question.domain.replaceAll("_", " ")}</span>
        </div>
      </section>

      {phase === "writing" && rubric && (
        <section className="bg-card rounded-xl border border-border p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Write your answer</h2>
              <p className="text-xs text-muted mt-1">The examiner rubric stays hidden until submission.</p>
            </div>
            <div className={`font-mono text-lg font-semibold tabular-nums ${remaining < 300 ? "text-fail" : remaining < 600 ? "text-borderline" : "text-foreground"}`}>
              {formatClock(remaining)}
              <span className="block text-[10px] text-muted text-right font-sans font-normal">{remaining < 0 ? "over time" : "remaining"}</span>
            </div>
          </div>
          <div className="relative">
            <textarea
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="Plan first. Examiners reward structure — a clear line of argument beats a list of facts."
              rows={24}
              className={`w-full min-h-[34rem] resize-y rounded-xl border bg-background p-4 pr-14 text-[15px] leading-relaxed text-foreground placeholder:text-muted/50 focus:outline-none ${speech.isListening ? "border-fail/60" : "border-border focus:border-accent"}`}
            />
            <div className="absolute right-3 top-3">
              <MicButton isListening={speech.isListening} isSupported={speech.isSupported} onClick={speech.toggle} />
            </div>
          </div>
          {speech.transcript && <p className="text-xs text-muted mt-2">Hearing: {speech.transcript}</p>}
          {voiceUsed && <p className="text-xs text-muted mt-2">Dictation detected. Wine terms are normalized before grading; transcription spelling does not affect the band.</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <p className={`text-xs tabular-nums ${wordTone}`}>
              {words} words · target {question.wordBand.min}–{question.wordBand.max}
            </p>
            <button
              onClick={() => { speech.stop(); setConfirming(true); }}
              disabled={words < 50}
              className="rounded-lg bg-accent px-7 py-3 text-sm font-semibold text-background hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              Submit for grading
            </button>
          </div>
        </section>
      )}

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-background/75 backdrop-blur-sm" aria-label="Cancel submission" onClick={() => setConfirming(false)} />
          <div className="relative w-full max-w-md bg-card rounded-xl border border-accent/30 p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-foreground">Submit this Theory answer?</h2>
            <p className="text-sm text-muted mt-2">Grading can take 30–60 seconds. The submission locks immediately to prevent duplicate cost.</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setConfirming(false)} className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground cursor-pointer">Keep writing</button>
              <button onClick={() => void submit()} className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-background hover:bg-accent-hover cursor-pointer">Submit</button>
            </div>
          </div>
        </div>
      )}

      {(phase === "grading" || phase === "complete" || phase === "error") && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(24rem,0.9fr)] gap-5 items-start">
            <section className="bg-card rounded-xl border border-border p-5 sm:p-6 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Examiner-derived assessment</p>
                  <h2 className="font-display text-xl font-semibold text-foreground mt-1">Feedback</h2>
                </div>
                <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${verdictTone}`}>
                  {displayedVerdict ?? (phase === "grading" ? "Grading…" : "No verdict")} · indicative
                </span>
              </div>
              {sources && (
                <div className={`rounded-lg border p-3 mb-4 ${sources.status === "available" ? "border-border bg-background/30" : sources.status === "error" ? "border-fail/30 bg-fail/5" : "border-border bg-background/30"}`}>
                  <p className="text-xs text-muted leading-relaxed">{sources.notice}</p>
                  {sources.citations.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                      {sources.citations.map((citation) => (
                        <a key={citation.url} href={citation.url} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:text-accent-hover underline">
                          {citation.title || citation.publisher}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-fail/30 bg-fail/10 p-3 text-sm text-fail mb-4">
                  <p>{error}</p>
                  <button
                    onClick={retryAfterError}
                    className="mt-3 rounded-lg border border-fail/30 px-3 py-2 text-xs font-semibold hover:bg-fail/10 cursor-pointer"
                  >
                    Return to the draft and retry
                  </button>
                </div>
              )}
              {thinking && phase === "grading" && (
                <div className="mb-4"><ThinkingTrace status={null} statuses={[]} thinking={thinking} active idleLabel="Reading the essay…" /></div>
              )}
              {feedback ? (
                <div className="markdown-content text-[15px] leading-relaxed"><FeedbackMarkdown streaming={phase === "grading"}>{feedback}</FeedbackMarkdown></div>
              ) : phase === "grading" ? (
                <div className="flex items-center gap-2 text-sm text-muted"><span className="w-2 h-2 rounded-full bg-accent streaming-dot" />Reading the essay against every rubric requirement…</div>
              ) : null}
              {attemptId && <p className="text-[10px] font-mono text-muted mt-5">Attempt #{attemptId}</p>}
            </section>
            {rubric && <TheoryRubricPanel rubric={rubric} />}
          </div>

          {submittedAnswer && (
            <details className="bg-card rounded-xl border border-border">
              <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-foreground">Your submitted answer ({wordCount(submittedAnswer)} words)</summary>
              <div className="border-t border-border px-5 py-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{submittedAnswer}</div>
            </details>
          )}

          {phase === "complete" && !modelAnswer && !modelAnswerError && (
            <div className="bg-card rounded-xl border border-border p-5 text-sm text-muted">Loading annotated model answer…</div>
          )}
          {modelAnswerError && <div className="rounded-xl border border-fail/30 bg-fail/10 p-4 text-sm text-fail">{modelAnswerError}</div>}
          {modelAnswer && <TheoryModelAnswer answer={modelAnswer} />}
        </>
      )}
    </div>
  );
}

export default function TheoryPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [questions, setQuestions] = useState<TheoryQuestionSummary[]>([]);
  const [attemptedIds, setAttemptedIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<TheoryQuestionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/theory/questions")
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error || `Question request failed (${response.status})`);
        return response.json();
      })
      .then((payload) => {
        const rows = payload.questions as TheoryQuestionSummary[];
        setQuestions(rows);
        const requested = new URLSearchParams(window.location.search).get("question");
        if (requested) setSelected(rows.find((question) => question.id === requested) ?? null);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Theory questions could not be loaded"))
      .finally(() => setLoading(false));
    // Attempted state for the browse table's Status column — best-effort; a failed fetch just
    // renders every row as New.
    fetch("/api/history")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        const attempts = (payload?.attempts ?? []) as { mode: string | null; question_id: string }[];
        setAttemptedIds(new Set(attempts.filter((attempt) => attempt.mode === "theory").map((attempt) => attempt.question_id)));
      })
      .catch(() => {});
  }, [user]);

  const selectQuestion = useCallback((question: TheoryQuestionSummary) => {
    setSelected(question);
    window.history.replaceState(null, "", `/theory?question=${encodeURIComponent(question.id)}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const exitQuestion = useCallback(() => {
    setSelected(null);
    window.history.replaceState(null, "", "/theory");
  }, []);

  const content = useMemo(() => {
    if (authLoading || loading) return <div className="bg-card rounded-xl border border-border p-8 text-sm text-muted">Loading Theory corpus…</div>;
    if (!user) return null;
    if (!user.hasApiKey) {
      return (
        <div className="rounded-xl border border-fail/30 bg-fail/10 p-6">
          <h2 className="text-lg font-semibold text-fail">Anthropic API key required</h2>
          <p className="text-sm text-muted mt-2">Add your key before submitting Theory answers. The question corpus and rubrics remain available once configured.</p>
          <Link href="/settings" className="inline-block rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-background mt-4">Open Settings</Link>
        </div>
      );
    }
    if (error) return <div className="rounded-xl border border-fail/30 bg-fail/10 p-5 text-sm text-fail">{error}</div>;
    if (selected) return <TheoryWorkspace key={selected.id} question={selected} onExit={exitQuestion} />;
    return <TheoryQuestionPicker questions={questions} attemptedIds={attemptedIds} onSelect={selectQuestion} />;
  }, [attemptedIds, authLoading, error, exitQuestion, loading, questions, selectQuestion, selected, user]);

  // "Give me a question" (§7): a random unattempted question, falling back to any question once
  // the corpus is exhausted.
  const giveMeAQuestion = useCallback(() => {
    const pool = questions.filter((question) => !attemptedIds.has(question.id));
    const candidates = pool.length ? pool : questions;
    if (!candidates.length) return;
    selectQuestion(candidates[Math.floor(Math.random() * candidates.length)]);
  }, [questions, attemptedIds, selectQuestion]);

  const yearMin = questions.length ? Math.min(...questions.map((question) => question.year)) : null;
  const yearMax = questions.length ? Math.max(...questions.map((question) => question.year)) : null;

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Theory</h1>
            <p className="text-sm text-muted mt-1">
              {questions.length ? `${questions.length} past questions` : "Past questions"}
              {yearMin !== null && <>, {yearMin}&ndash;{yearMax}</>}
              {" · graded against the examiners’ reports"}
            </p>
          </div>
          {!selected && !loading && questions.length > 0 && (
            <button
              onClick={giveMeAQuestion}
              className="rounded-lg bg-accent hover:bg-accent-hover px-5 py-2.5 text-sm font-medium text-background transition-colors cursor-pointer"
            >
              Give me a question
            </button>
          )}
        </div>
      </header>
      <main className="flex-1">
        <div className="max-w-6xl mx-auto px-6 py-8">{content}</div>
      </main>
      <footer className="border-t border-border mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-4"><p className="text-xs text-muted text-center">Theory verdicts are indicative and rubric-anchored, never calibrated numeric marks.</p></div>
      </footer>
    </div>
  );
}
