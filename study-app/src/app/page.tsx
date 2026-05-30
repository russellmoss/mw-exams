"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { PaperSelector } from "./components/PaperSelector";
import { FamilyFilter } from "./components/FamilyFilter";
import { SessionHistory } from "./components/SessionHistory";

type LandingStep = "select-paper" | "select-family" | "select-mode" | "generating";
type StudyMode = "full" | "stem-only";

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

  const handleModeSelect = useCallback(
    async (mode: StudyMode) => {
      setStep("generating");
      setError(null);

      // Bound each request and auto-retry once on a gateway/timeout response. The server now
      // always returns within its generation budget (a fresh question or a fast banked
      // fallback), so a retry reliably resolves transient 502/503/504s without the user
      // ever seeing a timeout error.
      const requestQuestion = async (): Promise<Response> => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 120_000);
        try {
          return await fetch("/api/get-question", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paper: selectedPaper, family: selectedFamily }),
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }
      };

      try {
        let res: Response | null = null;
        const MAX_TRIES = 2;
        for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
          try {
            res = await requestQuestion();
          } catch {
            // Network error or client-side timeout/abort.
            if (attempt < MAX_TRIES) continue;
            throw new Error("Question generation timed out. Please try again.");
          }
          // Retry once on transient gateway errors — the retry hits the fast banked fallback.
          if (!res.ok && [502, 503, 504].includes(res.status) && attempt < MAX_TRIES) {
            continue;
          }
          break;
        }

        if (!res || !res.ok) {
          let msg = res ? `HTTP ${res.status}` : "Request failed";
          if (res) {
            try {
              const errData = await res.json();
              msg = errData.error || msg;
              if (errData.violations?.length) msg += ` (${errData.violations.join("; ")})`;
            } catch {
              if (res.status === 504) msg = "Question generation timed out. This can happen when generating fresh questions. Please try again.";
            }
          }
          throw new Error(msg);
        }

        const data = await res.json();

        const q = data.question;
        const question = {
          id: q.question_id,
          source: data.source,
          paper: q.paper,
          questionNumber: 1,
          text: q.question_text,
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
          reasoningTrace: q.reasoning_trace || "",
          studyDiagramAssist: q.study_diagram_assist || "",
          year: null,
        };

        sessionStorage.setItem("mw-current-question", JSON.stringify(question));
        sessionStorage.setItem("mw-study-mode", mode);
        router.push("/study");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to get question");
        setStep("select-family");
      }
    },
    [selectedPaper, selectedFamily, router]
  );

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center gap-4">
          <Image src="/logo.png" alt="Bhutan Wine Company" width={56} height={56} />
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              MW Practical Exam Study Tool
            </h1>
            <p className="text-sm text-muted mt-1">
              Practice stem analysis, tasting, and answer writing with AI coaching
            </p>
          </div>
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
              </div>
            </div>
          )}

          {step === "generating" && (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="flex items-center gap-3 text-muted mb-4">
                <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                <div
                  className="w-2 h-2 rounded-full bg-accent/50 streaming-dot"
                  style={{ animationDelay: "0.3s" }}
                />
                <div
                  className="w-2 h-2 rounded-full bg-accent/50 streaming-dot"
                  style={{ animationDelay: "0.6s" }}
                />
              </div>
              <p className="text-foreground font-semibold mb-2">
                Preparing your question...
              </p>
              <p className="text-sm text-muted text-center max-w-md">
                {totalQuestions > 0
                  ? "Selecting from the question bank."
                  : "Generating a fresh question with AI. This takes about 30-60 seconds."}
              </p>
            </div>
          )}

          {/* Session history */}
          {step === "select-paper" && !loading && (
            <SessionHistory />
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
