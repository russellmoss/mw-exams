"use client";

import { useState, useCallback } from "react";
import type { Question } from "@/lib/study-session";
import { useSpeech } from "@/lib/use-speech";
import { useDraft } from "@/lib/use-draft";
import { MicButton } from "./MicButton";
import ReactMarkdown from "react-markdown";

const DICTATING_KEY = "answer-input-method-voice";

interface AnswerInputProps {
  question: Question;
  /** `inputMethod` tells the grader whether to score spelling (see marking-principles). */
  onSubmit: (answer: string, inputMethod: "typed" | "voice") => void;
  tastingNotes?: string[];
  /** Practice mode — "known-wine" writes from the revealed identity (no tasting notes yet). */
  mode?: "full" | "stem-only" | "known-wine";
}

export function AnswerInput({ question, onSubmit, tastingNotes, mode = "full" }: AnswerInputProps) {
  const knownWine = mode === "known-wine";
  // An answer in progress is the most expensive thing in the app to lose — a
  // stray reload or a closed tab mid-write would otherwise take the lot. Held
  // per question and mode, and forgotten once the answer is submitted.
  const [answer, setAnswer, clearAnswer] = useDraft(`answer:${question.id}:${mode}`);
  // Which wine's notes are open beside the answer, restored per question so a reload doesn't also
  // cost the candidate their place in the flight. `null` = notes closed, answer full width.
  const NOTES_KEY = `notes-wine:${question.id}:${mode}`;
  const [activeWine, setActiveWineState] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const saved = window.sessionStorage.getItem(NOTES_KEY);
    return saved === null || saved === "" ? null : Number(saved);
  });
  const setActiveWine = useCallback(
    (next: number | null) => {
      setActiveWineState(next);
      if (typeof window === "undefined") return;
      if (next === null) window.sessionStorage.removeItem(NOTES_KEY);
      else window.sessionStorage.setItem(NOTES_KEY, String(next));
    },
    [NOTES_KEY]
  );
  const [showConfirm, setShowConfirm] = useState(false);
  // How the candidate writes is a stable habit, not a per-question choice — remember it. Read
  // lazily so the checkbox renders in the right state on first paint.
  const [dictating, setDictatingState] = useState<boolean>(
    () => typeof window !== "undefined" && window.localStorage.getItem(DICTATING_KEY) === "true"
  );
  const setDictating = useCallback((next: boolean) => {
    setDictatingState(next);
    if (typeof window !== "undefined") window.localStorage.setItem(DICTATING_KEY, String(next));
  }, []);

  const handleTranscript = useCallback((text: string) => {
    setAnswer((prev) => {
      const trimmed = prev.trim();
      if (trimmed.length === 0) return text;
      return trimmed + " " + text;
    });
  }, [setAnswer]);

  const speech = useSpeech(handleTranscript);

  return (
    <div>
      {/* Instructions */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">Write Your Answer</h3>
        <p className="text-sm text-muted leading-relaxed">
          {knownWine
            ? "You know what these wines are — write the perfect assessment. The identities and question stay on screen; focus on style & winemaking, quality, state of maturity, and commercial position. You'll be graded on the write-up, not identification."
            : "Now that you have seen the tasting notes, write your full exam answer. Address each sub-question. Remember: you have roughly 6-8 minutes per wine in the real exam. Be structured, decisive, and specific."}
        </p>
      </div>

      {/* Question stem for reference — kept open in Known-Wine mode so it stays visible while writing */}
      <details open={knownWine} className="bg-card rounded-lg border border-border mb-4">
        <summary className="px-4 py-3 cursor-pointer text-sm text-muted hover:text-foreground transition-colors">
          {knownWine ? "Question" : "Show question stem"}
        </summary>
        <div className="px-4 pb-4 text-sm text-foreground/80 whitespace-pre-line leading-relaxed">
          {question.text}
        </div>
      </details>

      {/* Answer textarea, tasting notes, and the wine tabs.
          The notes pane is a SIBLING of the answer, not an overlay — tasting is a back-and-forth
          between glass and page, so both have to be readable at once. The textarea keeps its place
          in the tree when the pane opens or the wine changes, so its text, caret and scroll are
          never disturbed. Stacks on narrow screens rather than squeezing to nothing. */}
      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1 relative min-w-0">
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type or speak your exam answer..."
            className={`w-full min-h-[300px] bg-card border rounded-xl p-4 pr-14 text-foreground text-[15px] leading-relaxed resize-y placeholder:text-muted/50 focus:outline-none transition-colors ${
              speech.isListening
                ? "border-fail/60 bg-fail/5"
                : "border-border focus:border-accent/60"
            }`}
            rows={15}
          />
          <div className="absolute top-3 right-3">
            <MicButton
              isListening={speech.isListening}
              isSupported={speech.isSupported}
              onClick={speech.toggle}
            />
          </div>
        </div>

        {/* Tasting notes pane */}
        {activeWine !== null && tastingNotes && tastingNotes[activeWine] && (
          <div className="w-full lg:w-[24rem] shrink-0 bg-card border border-border rounded-xl flex flex-col max-h-[18rem] lg:max-h-none">
            <div className="border-b border-border px-4 py-2.5 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-accent">
                Wine {question.wines[activeWine]?.slot} — Tasting Notes
              </h3>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActiveWine(null)}
                title="Close notes"
                aria-label="Close tasting notes"
                className="text-muted hover:text-foreground transition-colors cursor-pointer p-1"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-4 py-3 markdown-content text-sm overflow-y-auto">
              <ReactMarkdown>{tastingNotes[activeWine]}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Wine quick-reference tabs. `onMouseDown` preventDefault keeps focus in the answer field,
            so switching wines mid-sentence doesn't interrupt typing or dictation. */}
        {tastingNotes && tastingNotes.length > 0 && (
          <div className="flex flex-row lg:flex-col flex-wrap gap-2 shrink-0">
            {question.wines.map((w, i) => (
              <button
                key={w.slot}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setActiveWine(activeWine === i ? null : i)}
                aria-pressed={activeWine === i}
                className={`w-10 h-10 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                  activeWine === i
                    ? "bg-accent text-background border-accent"
                    : "bg-card text-muted border-border hover:border-accent hover:text-accent"
                }`}
                title={`View Wine ${w.slot} tasting notes`}
              >
                W{w.slot}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dictation declaration. MW examiners do deduct for blatant/repeated misspellings, so the
          grader is right to flag them — but on a dictated answer that penalty lands on the
          transcription engine rather than on what the candidate knows. Declaring it keeps the
          spelling critique visible while taking it out of the mark. */}
      <label className="flex items-start gap-2 mt-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={dictating}
          onChange={(e) => setDictating(e.target.checked)}
          className="mt-0.5 accent-[var(--accent)] cursor-pointer"
        />
        <span className="text-xs text-muted leading-relaxed">
          I&rsquo;m dictating this answer
          <span className="block text-[11px] text-muted/70">
            Misspellings will still be shown, but won&rsquo;t cost marks. The real exam is handwritten, so
            spelling counts there.
          </span>
        </span>
      </label>

      {/* Word count + status + submit */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted tabular-nums">
            {answer.split(/\s+/).filter(Boolean).length} words
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
            setShowConfirm(true);
          }}
          disabled={answer.trim().length < 50}
          className={`px-8 py-3 font-semibold rounded-lg transition-all duration-200 cursor-pointer ${
            answer.trim().length >= 50
              ? "bg-accent hover:bg-accent-hover text-background"
              : "bg-border text-muted cursor-not-allowed"
          }`}
        >
          {knownWine ? "Submit Write-Up" : "Submit Answer"}
        </button>
      </div>

      {/* Confirmation modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setShowConfirm(false)} />
          <div className="relative w-full max-w-md bg-card rounded-xl border border-accent/30 shadow-2xl p-6 text-center">
            <h3 className="text-lg font-semibold text-foreground mb-2">Submit your answer?</h3>
            <p className="text-sm text-muted mb-6">
              Once submitted, your answer will be graded and you won&apos;t be able to edit it. Make sure you&apos;ve addressed all sub-questions.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-6 py-2.5 rounded-lg border border-border text-muted hover:text-foreground hover:border-foreground/30 transition-colors cursor-pointer font-medium"
              >
                Keep Writing
              </button>
              <button
                onClick={() => {
                  setShowConfirm(false);
                  clearAnswer();
                  onSubmit(answer, dictating ? "voice" : "typed");
                }}
                className="px-6 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-background transition-colors cursor-pointer font-semibold"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
