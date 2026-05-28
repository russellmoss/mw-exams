"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { PaperSelector } from "./components/PaperSelector";
import { FamilyFilter } from "./components/FamilyFilter";
import { SessionHistory } from "./components/SessionHistory";

type LandingStep = "select-paper" | "select-family" | "generating";

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
    async (family: string) => {
      setStep("generating");
      setError(null);

      try {
        const res = await fetch("/api/get-question", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paper: selectedPaper, family }),
        });

        if (!res.ok) {
          let msg = `HTTP ${res.status}`;
          try {
            const errData = await res.json();
            msg = errData.error || msg;
            if (errData.violations?.length) msg += ` (${errData.violations.join("; ")})`;
          } catch {
            if (res.status === 504) msg = "Question generation timed out. This can happen when generating fresh questions. Please try again.";
          }
          throw new Error(msg);
        }

        const data = await res.json();

        // Map DB question to the Question type the study page expects
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
        router.push("/study");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to get question");
        setStep("select-family");
      }
    },
    [selectedPaper, router]
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
