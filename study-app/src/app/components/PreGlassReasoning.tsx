"use client";

import { useState, useCallback } from "react";
import type { Question } from "@/lib/study-session";
import { useSpeech } from "@/lib/use-speech";
import { MicButton } from "./MicButton";

interface PreGlassReasoningProps {
  question: Question;
  onSubmit: (reasoning: string) => void;
}

export function PreGlassReasoning({
  question,
  onSubmit,
}: PreGlassReasoningProps) {
  const [reasoning, setReasoning] = useState("");

  const handleTranscript = useCallback((text: string) => {
    setReasoning((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return text;
      return trimmed + " " + text;
    });
  }, []);

  const speech = useSpeech(handleTranscript);

  const paperLabel =
    question.paper === 1
      ? "Paper 1 — Whites"
      : question.paper === 2
        ? "Paper 2 — Reds"
        : "Paper 3 — Special";

  return (
    <div>
      {/* Question context */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <span className="text-xs font-mono px-2 py-1 rounded bg-accent/20 text-accent">
          {paperLabel}
        </span>
        <span className="text-xs font-semibold text-accent">
          Pre-Glass Analysis
        </span>
      </div>

      {/* Collapsed question stem */}
      <details className="bg-card rounded-lg border border-border mb-6">
        <summary className="px-4 py-3 cursor-pointer text-sm text-muted hover:text-foreground transition-colors">
          Show question stem
        </summary>
        <div className="px-4 pb-4 text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
          {question.text}
        </div>
      </details>

      {/* Visual appearance cues for Paper 3 */}
      {question.paper === 3 && question.wines.some((w) => w.appearance) && (
        <div className="bg-card rounded-lg border border-accent/20 mb-6 p-4">
          <p className="text-xs font-semibold text-accent mb-2 uppercase tracking-wide">
            Visual Appearance (what you see in the glasses)
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

      {/* Instructions */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">
          What does the stem tell you?
        </h3>
        <p className="text-sm text-muted leading-relaxed">
          Before tasting, analyze the question stem. What varieties and regions
          should you have in mind? What signals does the question structure give
          you? Consider: paper number, number of wines, whether they share
          variety/origin, mark allocations, any specific instructions.
        </p>
      </div>

      {/* Reasoning textarea with mic */}
      <div className="relative">
        <textarea
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          placeholder="Type or speak your pre-glass stem analysis..."
          className={`w-full min-h-[200px] bg-card border rounded-xl p-4 pr-14 text-foreground text-[15px] leading-relaxed resize-y placeholder:text-muted/50 focus:outline-none transition-colors ${
            speech.isListening
              ? "border-fail/60 bg-fail/5"
              : "border-border focus:border-accent/60"
          }`}
          rows={10}
        />
        <div className="absolute top-3 right-3">
          <MicButton
            isListening={speech.isListening}
            isSupported={speech.isSupported}
            onClick={speech.toggle}
          />
        </div>
      </div>

      {/* Status + submit */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted tabular-nums">
            {reasoning.length} characters
          </span>
          {speech.isListening && (
            <span className="text-xs text-fail flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-fail animate-pulse" />
              Listening...
            </span>
          )}
        </div>
        <button
          onClick={() => {
            speech.stop();
            onSubmit(reasoning);
          }}
          disabled={reasoning.trim().length < 20}
          className={`px-8 py-3 font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
            reasoning.trim().length >= 20
              ? "bg-accent hover:bg-accent-hover text-background"
              : "bg-border text-muted cursor-not-allowed"
          }`}
        >
          Submit Reasoning
        </button>
      </div>
    </div>
  );
}
