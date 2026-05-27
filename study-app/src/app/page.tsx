"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PaperSelector } from "./components/PaperSelector";
import { FamilyFilter } from "./components/FamilyFilter";
import { SessionHistory } from "./components/SessionHistory";
import {
  loadQuestionIndex,
  filterQuestions,
  selectRandomQuestion,
  getQuestionCounts,
  type QuestionIndex,
} from "@/lib/question-loader";

type LandingStep = "select-paper" | "select-family";

export default function Home() {
  const router = useRouter();
  const [index, setIndex] = useState<QuestionIndex | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<LandingStep>("select-paper");
  const [selectedPaper, setSelectedPaper] = useState<number>(0);

  useEffect(() => {
    loadQuestionIndex()
      .then((data) => {
        setIndex(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const handlePaperSelect = useCallback((paper: number) => {
    setSelectedPaper(paper);
    setStep("select-family");
  }, []);

  const handleFamilySelect = useCallback(
    (family: string) => {
      if (!index) return;

      const filtered = filterQuestions(index.questions, selectedPaper, family);
      const question = selectRandomQuestion(filtered);

      if (!question) {
        setError("No questions available for this filter.");
        return;
      }

      // Store selected question in sessionStorage for the study page
      sessionStorage.setItem("mw-current-question", JSON.stringify(question));
      router.push("/study");
    },
    [index, selectedPaper, router]
  );

  const counts =
    index && selectedPaper ? getQuestionCounts(index.questions, selectedPaper) : {};

  return (
    <div className="flex flex-col flex-1">
      {/* Header */}
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            MW Practical Exam Study Tool
          </h1>
          <p className="text-sm text-muted mt-1">
            Practice stem analysis, tasting, and answer writing with AI coaching
          </p>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-10">
          {loading && (
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
                <span className="ml-2 text-sm">Loading question bank...</span>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-fail/10 border border-fail/30 rounded-lg p-4 mb-6">
              <p className="text-sm text-fail">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setStep("select-paper");
                }}
                className="text-xs text-fail/70 hover:text-fail mt-2 underline cursor-pointer"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && index && (
            <>
              {step === "select-paper" && (
                <div>
                  <div className="mb-8">
                    <h2 className="text-xl font-semibold text-foreground mb-2">
                      Choose a paper
                    </h2>
                    <p className="text-sm text-muted">
                      {index.totalQuestions} questions from 2011-2025 historical
                      exams and mock papers
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
            </>
          )}

          {/* Session history */}
          {step === "select-paper" && !loading && <SessionHistory />}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <p className="text-xs text-muted text-center">
            Built for MW practical exam preparation. Based on 10 years of
            historical papers.
          </p>
        </div>
      </footer>
    </div>
  );
}
