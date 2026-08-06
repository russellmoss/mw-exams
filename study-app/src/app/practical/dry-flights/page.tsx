"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PaperSelector } from "../../components/PaperSelector";
import { FamilyFilter } from "../../components/FamilyFilter";
import { FocusSelector, type FocusValue } from "../../components/FocusSelector";
import { StemDetailSegments, stemForLevel } from "../../components/StemDetailControl";
import { STEM_DETAIL_HELPER_COPY, type StemDetailLevel } from "@/lib/prompts/stemDetail";
import { FAMILY_LABELS } from "@/lib/question-loader";
import { ThinkingTrace } from "../../components/ThinkingTrace";
import { useProgressStream } from "@/lib/use-progress-stream";
import type { Question } from "@/lib/study-session";

type LandingStep =
  | "select-paper"
  | "select-family"
  | "select-mode"
  | "acquire"
  | "stem-detail"
  | "generating";
type StudyMode = "full" | "stem-only" | "known-wine" | "flash";

const MODE_LABELS: Record<StudyMode, string> = {
  full: "Full Question",
  "stem-only": "Stem Analysis Only",
  "known-wine": "Dry Notes",
  flash: "Flash Notes",
};

// What the question endpoints resolve to — the engine's outcome shape, minus the error case
// (which the stream surfaces as an `error` event instead).
type QuestionPayload = {
  source: string;
  hasModelAnswer: boolean;
  question: {
    question_id: string;
    paper: number;
    question_text: string;
    wines: unknown;
    total_marks: number;
    family: string;
    family_label: string;
    subcategory?: string | null;
    // The two stem-detail variants. Absent until the out-of-band backfill fills them in, at
    // which point the client falls back to question_text for that level.
    stem_guided?: string | null;
    stem_exam_real?: string | null;
    model_answer?: string | null;
    proposed_annotation?: string | null;
    study_diagram_assist?: string | null;
  };
};

export default function Home() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<LandingStep>("select-paper");
  const [selectedPaper, setSelectedPaper] = useState<number>(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [, setRecentAttempts] = useState<unknown[]>([]);
  const [selectedFamily, setSelectedFamily] = useState<string>("");
  // Paper 3 'Focus' override — session-only, never rehydrated from storage, so it resets to
  // 'balanced' on every page load. Sent with the question fetch so the P3 sampler can bias the
  // session; ignored server-side for Papers 1/2.
  const [focus, setFocus] = useState<FocusValue>("balanced");
  // Stem Detail setup: the fetched-but-not-yet-started question, the mode it was fetched for, and the
  // chosen level (defaults to the user's stem_detail_default).
  const [pendingQuestion, setPendingQuestion] = useState<Question | null>(null);
  const [pendingMode, setPendingMode] = useState<StudyMode>("full");
  const [stemDetail, setStemDetail] = useState<StemDetailLevel>("exam_real");
  // "New or Banked" setup card. bankCount is how many banked questions this user has never seen for
  // the current paper+family+mode (null = still loading). bankLoading covers the sub-second banked
  // fetch; bankTaken is the race flag when the last eligible question was consumed under us (409).
  const [bankCount, setBankCount] = useState<number | null>(null);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankTaken, setBankTaken] = useState(false);
  // Onboarding default (migration 047): when the user's default is 'banked', arriving on the
  // acquire card auto-requests a free banked question. Armed only on the mode→acquire transition —
  // never when the user comes BACK to acquire (e.g. from the stem-detail screen), which would trap
  // them in a fetch loop.
  const autoBankedRef = useRef(false);
  // Live progress for the question fetch. Serving from the bank is instant; writing a fresh one
  // runs the engine's validate-and-retry loop for 30-60s, which used to be a static spinner.
  const questionTrace = useProgressStream();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [authLoading, user, router]);

  // Load question counts from Neon
  useEffect(() => {
    if (!user) return;
    fetch("/api/question-counts")
      .then((r) => r.json())
      .then((data) => {
        if (data.counts) {
          // Build counts by paper
          const allCounts: Record<string, Record<string, number>> = {};
          let total = 0;
          for (const row of data.counts) {
            const key = `p${row.paper}`;
            if (!allCounts[key]) allCounts[key] = { any: 0 };
            allCounts[key][row.family] = row.count;
            allCounts[key].any += row.count;
            total += row.count;
          }
          setTotalQuestions(total);
          // Store for later use
          sessionStorage.setItem("mw-question-counts", JSON.stringify(allCounts));
        }
        if (data.recentAttempts) {
          setRecentAttempts(data.recentAttempts);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load counts:", err);
        setLoading(false);
      });
  }, [user]);

  const handlePaperSelect = useCallback((paper: number) => {
    setSelectedPaper(paper);

    // Load paper-specific counts
    const stored = sessionStorage.getItem("mw-question-counts");
    if (stored) {
      const allCounts = JSON.parse(stored);
      setCounts(allCounts[`p${paper}`] || { any: 0 });
    }

    setStep("select-family");
  }, []);

  const handleFamilySelect = useCallback(
    (family: string) => {
      setSelectedFamily(family);
      setStep("select-mode");
    },
    []
  );

  // Map an /api/get-question(-/banked) payload to the study-session Question shape. New and Banked
  // return the identical shape, so both paths funnel through here — a banked question is built no
  // differently from a fresh one (no "banked" marker ever reaches the candidate).
  const toQuestion = useCallback((data: QuestionPayload): Question => {
    const q = data.question;
    return {
      id: q.question_id,
      source: data.source,
      paper: q.paper,
      questionNumber: 1,
      text: q.question_text,
      stemGuided: q.stem_guided ?? null,
      stemExamReal: q.stem_exam_real ?? null,
      wines: typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines,
      totalMarks: q.total_marks,
      family: q.family,
      familyLabel: q.family_label,
      subcategory: q.subcategory || "",
      hasModelAnswer: data.hasModelAnswer,
      hasDecisionMatrix: false,
      hasWineResearch: false,
      modelAnswer: q.model_answer || "",
      proposedAnnotation: q.proposed_annotation || "",
      studyDiagramAssist: q.study_diagram_assist || "",
      year: null,
    };
  }, []);

  // Hand a freshly-acquired question (New or Banked) to the Stem Detail setup screen — the shared
  // tail of both acquisition paths. Preselects the user's saved default level and backfills the
  // stem variants out of band (the question renders from its canonical stem until they land).
  const beginStemDetail = useCallback(
    (question: Question) => {
      setPendingQuestion(question);
      setStemDetail((user?.stemDetailDefault as StemDetailLevel) || "exam_real");
      setStep("stem-detail");

      if (!question.stemGuided || !question.stemExamReal) {
        fetch("/api/stem-detail/ensure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questionId: question.id }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => {
            if (!d?.variants) return;
            setPendingQuestion((prev) =>
              prev && prev.id === question.id
                ? {
                    ...prev,
                    stemGuided: d.variants.guided ?? prev.stemGuided,
                    stemExamReal: d.variants.exam_real ?? prev.stemExamReal,
                  }
                : prev
            );
          })
          .catch(() => {});
      }
    },
    [user]
  );

  // Persist the drill configuration server-side for the home launcher's Continue card
  // (migration 050). Fire-and-forget: a failed write costs one Continue suggestion, nothing else.
  const saveLastDrill = useCallback(
    (config: { paper: number; family: string; mode: string; stemDetail?: string }) => {
      fetch("/api/user/shell-prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lastDrillConfig: config }),
      }).catch(() => {});
    },
    []
  );

  const handleModeSelect = useCallback(
    (mode: StudyMode) => {
      // Flash Notes runs its own mode-setup → deck flow on a dedicated screen (build a deck or go
      // infinite), so it does NOT fetch a single question here. Hand off the paper + family and let
      // /flash-notes drive question selection per card.
      if (mode === "flash") {
        sessionStorage.setItem(
          "mw-flash-setup",
          JSON.stringify({ paper: selectedPaper, family: selectedFamily })
        );
        saveLastDrill({ paper: selectedPaper, family: selectedFamily, mode: "flash" });
        router.push("/flash-notes");
        return;
      }

      // The three question modes now pick HOW to acquire the question (New vs Banked) on the setup
      // card rather than always generating. Record the mode and show that card; the bank count for
      // this paper+family+mode loads there.
      setPendingMode(mode);
      setError(null);
      setBankTaken(false);
      setBankCount(null); // show "Checking…" until the effect below loads the live count
      autoBankedRef.current = user?.questionSourceDefault === "banked";
      setStep("acquire");
    },
    [selectedPaper, selectedFamily, router, user, saveLastDrill]
  );

  // Continue card deep link: /practical/dry-flights?repeat=1 restores the saved config and jumps
  // straight to the acquire card (or straight into Flash Notes). Runs once, after auth resolves.
  const repeatHandledRef = useRef(false);
  useEffect(() => {
    if (repeatHandledRef.current || authLoading || !user) return;
    repeatHandledRef.current = true;
    const params = new URLSearchParams(window.location.search);
    if (params.get("repeat") !== "1") return;
    const config = user.lastDrillConfig;
    if (!config?.paper || !config.mode) return;
    const family = config.family || "any";
    if (config.mode === "flash") {
      sessionStorage.setItem("mw-flash-setup", JSON.stringify({ paper: config.paper, family }));
      router.push("/flash-notes");
      return;
    }
    setSelectedPaper(config.paper);
    setSelectedFamily(family);
    setPendingMode(config.mode as StudyMode);
    setError(null);
    setBankTaken(false);
    setBankCount(null);
    autoBankedRef.current = user.questionSourceDefault === "banked";
    setStep("acquire");
  }, [authLoading, user, router]);

  // "New Question" — generate a fresh one, the full existing behaviour. Streamed so the 30-60s wait
  // is legible; auto-retries once. The 180s cap is a wedged-connection backstop, not a deadline.
  const handleNewQuestion = useCallback(async () => {
    setStep("generating");
    setError(null);
    try {
      let data: QuestionPayload | null = null;
      const MAX_TRIES = 2;
      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        data = await questionTrace.run<QuestionPayload>(
          "/api/get-question/stream",
          {
            paper: selectedPaper,
            family: selectedFamily,
            // Focus only steers Paper 3; harmless (ignored) for Papers 1/2.
            focus: selectedPaper === 3 ? focus : "balanced",
          },
          { timeoutMs: 180_000 }
        );
        if (data?.question) break;
      }

      if (!data?.question) {
        // errorRef, not error: `error` here is the closure's value from before the stream ran.
        throw new Error(
          questionTrace.errorRef.current || "Question generation failed. Please try again."
        );
      }

      beginStemDetail(toQuestion(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get question");
      setStep("acquire");
    }
  }, [selectedPaper, selectedFamily, focus, questionTrace, toQuestion, beginStemDetail]);

  // "Banked Question" — serve one this user has never seen. Instant (a pool read, no model call). A
  // 409 means the last eligible one was just taken from under us: flag it inline and disable the
  // button, leaving New Question as the way forward.
  const handleBankedQuestion = useCallback(async () => {
    setBankLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/get-question/banked", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paper: selectedPaper,
          family: selectedFamily,
          mode: pendingMode,
        }),
      });

      if (res.status === 409) {
        setBankTaken(true);
        setBankCount(0);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data: QuestionPayload = await res.json();
      if (!data?.question) throw new Error("Banked question was empty. Try New Question.");
      beginStemDetail(toQuestion(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load a banked question");
    } finally {
      setBankLoading(false);
    }
  }, [selectedPaper, selectedFamily, pendingMode, toQuestion, beginStemDetail]);

  // Lead with the user's default acquire path. Fires the free banked fetch once per arrival from
  // the mode step; on an empty pool (409) handleBankedQuestion sets bankTaken and the two-button
  // choice remains as the fallback.
  useEffect(() => {
    if (step !== "acquire" || !autoBankedRef.current) return;
    autoBankedRef.current = false;
    handleBankedQuestion();
  }, [step, handleBankedQuestion]);

  // Keep the banked count live: refetch whenever the acquire card is showing and the
  // paper / family / mode selection changes. Clears the race flag on every fresh selection.
  useEffect(() => {
    if (step !== "acquire" || !selectedPaper || !user) return;
    let cancelled = false;
    const params = new URLSearchParams({
      paper: String(selectedPaper),
      family: selectedFamily || "any",
      mode: pendingMode,
    });
    fetch(`/api/question-counts?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const n = typeof d.bankCount === "number" ? d.bankCount : 0;
        setBankCount(n);
        // A fresh count supersedes an earlier race flag: if questions are available again, re-enable.
        if (n > 0) setBankTaken(false);
      })
      .catch(() => {
        if (!cancelled) setBankCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [step, selectedPaper, selectedFamily, pendingMode, user]);

  // Start the question from the Stem Detail setup screen. Persist the chosen level so /study can
  // render/save it, then hand off to the study flow.
  const handleStart = useCallback(() => {
    if (!pendingQuestion) return;
    sessionStorage.setItem("mw-current-question", JSON.stringify(pendingQuestion));
    sessionStorage.setItem("mw-study-mode", pendingMode);
    sessionStorage.setItem("mw-stem-detail", stemDetail);
    saveLastDrill({ paper: selectedPaper, family: selectedFamily, mode: pendingMode, stemDetail });
    router.push("/study");
  }, [pendingQuestion, pendingMode, stemDetail, router, saveLastDrill, selectedPaper, selectedFamily]);

  return (
    <div className="flex flex-col flex-1">
      {/* Header — page-header pattern from the shell redesign: title + subtitle on the left,
          the selections so far as outline breadcrumb pills on the right. */}
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-6 py-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">Dry Flights</h1>
            <p className="text-sm text-muted mt-1">
              Simulated exam flights — no wine. Stem analysis, tasting reasoning, timed writing, graded debrief.
            </p>
          </div>
          {step !== "select-paper" && selectedPaper > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                Paper {selectedPaper}
              </span>
              {step !== "select-family" && (
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                  {selectedFamily && selectedFamily !== "any"
                    ? FAMILY_LABELS[selectedFamily] || selectedFamily
                    : "Any family"}
                </span>
              )}
              {(step === "acquire" || step === "stem-detail" || step === "generating") && (
                <span className="rounded-full border border-border px-3 py-1 text-xs text-muted">
                  {MODE_LABELS[pendingMode]}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-10">
          {(loading || authLoading) && (
            <div className="flex items-center justify-center py-20">
              <div className="flex items-center gap-3 text-muted">
                <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                <div
                  className="w-2 h-2 rounded-full bg-accent/50 streaming-dot"
                  style={{ animationDelay: "0.3s" }}
                />
                <div
                  className="w-2 h-2 rounded-full bg-accent/50 streaming-dot"
                  style={{ animationDelay: "0.6s" }}
                />
                <span className="ml-2 text-sm">Loading...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-fail/10 border border-fail/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-fail">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setStep("select-family");
                }}
                className="text-xs text-fail/70 hover:text-fail mt-2 underline cursor-pointer"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !authLoading && user && !user.hasApiKey && (
            <div className="bg-fail/10 border-2 border-fail/40 rounded-xl p-8 mb-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-fail/20 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-fail" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="text-lg font-bold text-fail mb-2">API key required to use this app</h2>
                  <p className="text-sm text-foreground mb-1">
                    This app uses Claude AI to generate questions, tasting notes, and feedback.
                    You need to add your own Anthropic API key before you can start studying.
                  </p>
                  <p className="text-sm text-muted mb-4">
                    Go to Settings where we&apos;ll walk you through getting a key — it takes about 2 minutes.
                  </p>
                  <button
                    onClick={() => router.push("/settings")}
                    className="px-8 py-3 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors cursor-pointer text-sm"
                  >
                    Set up your API key &rarr;
                  </button>
                </div>
              </div>
            </div>
          )}

          {!loading && step === "select-paper" && (user?.hasApiKey !== false) && (
            <div>
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  Choose a paper
                </h2>
                <p className="text-sm text-muted">
                  {totalQuestions > 0
                    ? `${totalQuestions} questions in the bank`
                    : "Questions will be generated fresh for you"}
                </p>
              </div>
              <PaperSelector onSelect={handlePaperSelect} />
            </div>
          )}

          {step === "select-family" && (
            <FamilyFilter
              paper={selectedPaper}
              counts={counts}
              onSelect={handleFamilySelect}
              onBack={() => setStep("select-paper")}
            />
          )}

          {step === "select-mode" && (
            <div className="max-w-lg mx-auto">
              <button
                onClick={() => setStep("select-family")}
                className="text-sm text-muted hover:text-foreground mb-6 flex items-center gap-1 cursor-pointer"
              >
                &larr; Back
              </button>
              <h2 className="text-xl font-semibold text-foreground mb-2">Choose your practice mode</h2>
              <p className="text-sm text-muted mb-6">How do you want to work this question?</p>
              {/* Paper 3 only: optional Focus override. It sits above the mode list because it
                  changes WHICH question gets fetched, and every mode below fetches one. */}
              {selectedPaper === 3 && <FocusSelector value={focus} onChange={setFocus} />}
              <div className="space-y-3">
                <button
                  onClick={() => handleModeSelect("full")}
                  className="w-full text-left bg-card rounded-xl border border-border hover:border-accent/50 p-5 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors">Full Question</h3>
                      <p className="text-sm text-muted mt-1">
                        Stem analysis, tasting notes, write your answer, get full feedback with marks.
                        The complete exam simulation.
                      </p>
                      <p className="text-xs text-muted/70 mt-2">~20-30 minutes</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleModeSelect("stem-only")}
                  className="w-full text-left bg-card rounded-xl border border-border hover:border-accent/50 p-5 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors">Stem Analysis Only</h3>
                      <p className="text-sm text-muted mt-1">
                        Practice reading the question stem. What does it tell you before you taste?
                        Get coaching on your reasoning, then see the wines.
                      </p>
                      <p className="text-xs text-muted/70 mt-2">~5-10 minutes</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleModeSelect("known-wine")}
                  className="w-full text-left bg-card rounded-xl border border-border hover:border-accent/50 p-5 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors">Dry Notes</h3>
                      <p className="text-sm text-muted mt-1">
                        The wines are revealed up front — no identification gamble. Perfect your
                        dry notes for a known classic (single wine) or a known flight, graded on
                        style, quality, maturity and commercial alone.
                      </p>
                      <p className="text-xs text-muted/70 mt-2">~15-25 minutes</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => handleModeSelect("flash")}
                  className="w-full text-left bg-card rounded-xl border border-border hover:border-accent/50 p-5 transition-colors cursor-pointer group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0 mt-0.5">
                      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-accent transition-colors">Flash Notes</h3>
                      <p className="text-sm text-muted mt-1">
                        Rapid single-prompt drills. Wines shown up front. Quick verdict + pace tracking.
                      </p>
                      <p className="text-xs text-muted/70 mt-2">~1-2 minutes per card</p>
                    </div>
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* Acquire step — the study setup card. Choose HOW to start this paper·family·mode:
              generate a fresh question, or serve a banked one this user has never seen. */}
          {step === "acquire" && (
            <div className="max-w-lg mx-auto">
              <button
                onClick={() => setStep("select-mode")}
                className="text-sm text-muted hover:text-foreground mb-6 flex items-center gap-1 cursor-pointer"
              >
                &larr; Back
              </button>
              <h2 className="text-xl font-semibold text-foreground mb-2">Start your question</h2>
              <p className="text-sm text-muted mb-6">
                {`Paper ${selectedPaper}`}
                {" · "}
                {selectedFamily && selectedFamily !== "any"
                  ? FAMILY_LABELS[selectedFamily] || selectedFamily
                  : "Any family"}
                {" · "}
                {MODE_LABELS[pendingMode]}
              </p>

              {/* 2-up on ≥480px, stacked below it. The user's default source (migration 047) takes
                  the amber primary treatment; the other option is the stone outline. */}
              <div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">
                <button
                  onClick={handleNewQuestion}
                  className={
                    user?.questionSourceDefault === "banked"
                      ? "border border-border text-foreground hover:text-foreground hover:border-muted rounded-lg px-4 py-4 text-center cursor-pointer transition-colors"
                      : "bg-accent hover:bg-accent-hover text-background font-medium rounded-lg px-4 py-4 transition-colors cursor-pointer text-center"
                  }
                >
                  New Question
                  <span className={`block text-xs font-normal mt-0.5 ${user?.questionSourceDefault === "banked" ? "text-muted" : "text-background/70"}`}>
                    Written fresh for you
                  </span>
                </button>

                <button
                  onClick={handleBankedQuestion}
                  disabled={bankLoading || bankCount === 0 || bankTaken}
                  className={
                    bankCount === 0 || bankTaken
                      ? "border border-border/60 text-muted/50 rounded-lg px-4 py-4 text-center cursor-not-allowed"
                      : user?.questionSourceDefault === "banked"
                        ? "bg-accent hover:bg-accent-hover text-background font-medium rounded-lg px-4 py-4 transition-colors cursor-pointer text-center"
                        : "border border-border text-foreground hover:text-foreground hover:border-muted rounded-lg px-4 py-4 text-center cursor-pointer transition-colors"
                  }
                >
                  Banked Question
                  <span className={`block text-xs font-normal mt-0.5 ${user?.questionSourceDefault === "banked" && !(bankCount === 0 || bankTaken) ? "text-background/70" : "text-muted"}`}>
                    {bankLoading
                      ? "Loading…"
                      : bankTaken
                        ? "No banked questions yet"
                        : bankCount === null
                          ? "Checking…"
                          : bankCount === 0
                            ? "No banked questions yet"
                            : `${bankCount} available`}
                  </span>
                </button>
              </div>

              {/* Race: the last eligible banked question was consumed under us (409). */}
              {bankTaken && (
                <p className="text-xs text-muted mt-3">
                  That one just got taken — try New Question.
                </p>
              )}
            </div>
          )}

          {/* Stem Detail setup. The question is already fetched at this point; this screen picks how
              much organising information its stem reveals, previews the result, and starts the run.
              Any level whose variant has not been backfilled yet previews the canonical stem (see
              stemForLevel), so this screen is never blocked on the derivation request. */}
          {step === "stem-detail" && pendingQuestion && (
            <div className="max-w-2xl mx-auto">
              <button
                onClick={() => {
                  setPendingQuestion(null);
                  setStep("acquire");
                }}
                className="text-sm text-muted hover:text-foreground mb-6 flex items-center gap-1 cursor-pointer"
              >
                &larr; Back
              </button>
              <h2 className="text-xl font-semibold text-foreground mb-2">How much should the stem tell you?</h2>
              <p className="text-sm text-muted mb-6">{STEM_DETAIL_HELPER_COPY}</p>

              <StemDetailSegments value={stemDetail} onChange={setStemDetail} />

              <div className="bg-card rounded-xl border border-border p-6 mt-4">
                <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted mb-3">
                  Preview
                </p>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {stemForLevel(pendingQuestion, stemDetail)}
                </p>
              </div>

              <button
                onClick={handleStart}
                className="w-full mt-6 bg-accent hover:bg-accent-hover text-background font-medium rounded-lg px-4 py-3 transition-colors cursor-pointer"
              >
                Start question
              </button>
            </div>
          )}

          {step === "generating" && (
            <div className="py-16 max-w-2xl mx-auto">
              <p className="text-foreground font-semibold mb-1 text-center">
                Preparing your question…
              </p>
              <p className="text-sm text-muted text-center mb-5">
                Banked questions are instant; a fresh one takes about 30-60 seconds.
              </p>
              {/* Spoiler-gated: the phase labels never name a wine, but the model's reasoning
                  does — and you're about to be asked to identify those wines blind. */}
              <ThinkingTrace
                status={questionTrace.status}
                statuses={questionTrace.statuses}
                thinking={questionTrace.thinking}
                active={!questionTrace.error}
                error={questionTrace.error}
                spoiler
                idleLabel="Starting up…"
              />
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <p className="text-xs text-muted text-center">
            Built for MW practical exam preparation. Powered by Claude.
          </p>
        </div>
      </footer>
    </div>
  );
}
