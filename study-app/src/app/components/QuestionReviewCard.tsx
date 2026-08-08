"use client";

// One question, as an expert reviewer needs to see it.
//
// The design rule here is that everything needed to rule on the question is on ONE card: the stem a
// candidate sees, the wines with their RESOLVED identity from the answer key, the generator's own
// intent, the model answer, and the hard/soft validator findings. Anything that makes the reviewer
// open a second surface costs ~30 seconds, and there are 511 of these.
//
// Examiner intent and the model answer are collapsed by default. Most questions are ruled on from
// the stem and the wine list alone; the detail is one keystroke away for the ones that aren't.

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import ReactMarkdown from "react-markdown";
import { useSpeech } from "@/lib/use-speech";
import { MicButton } from "./MicButton";
// -shared, never question-review: that module reaches the database, and everything a "use client"
// file imports is bundled for the browser (tests/client-server-boundary.test.ts enforces this).
import {
  REVIEW_REASON_OPTIONS,
  MAX_REVIEW_NOTE_CHARS,
  type ReviewCard as Card,
} from "@/lib/question-review-shared";

interface Props {
  card: Card;
  /**
   * The whole reject form lives in the parent. It has to: the ⌘/Ctrl+Enter shortcut is a
   * window-level key handler, and the alternative — having it scrape the tags and the note back out
   * of the DOM — is exactly the kind of thing that silently submits an empty reason one refactor later.
   */
  rejecting: boolean;
  tags: string[];
  note: string;
  onToggleTag: (value: string) => void;
  /** Accepts an updater so dictation can append to the latest value without reading a ref. */
  onNoteChange: Dispatch<SetStateAction<string>>;
  onOpenReject: () => void;
  onCancelReject: () => void;
  onApprove: () => void;
  onSkip: () => void;
  onReject: () => void;
  busy: boolean;
}

function Chip({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "accent" | "fail" | "success" }) {
  const tones = {
    muted: "border-border text-muted",
    accent: "border-accent/40 text-accent",
    fail: "border-fail/40 text-fail",
    success: "border-success/40 text-success",
  };
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs ${tones[tone]}`}>
      {children}
    </span>
  );
}

function Collapsible({
  title,
  body,
  open,
  onToggle,
  hint,
}: {
  title: string;
  body: string | null;
  open: boolean;
  onToggle: () => void;
  hint?: string;
}) {
  if (!body) {
    return (
      <div className="border-t border-border px-5 py-3 text-xs text-muted">
        {title} — <span className="italic">none recorded</span>
      </div>
    );
  }
  return (
    <div className="border-t border-border">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-5 py-3 text-left cursor-pointer hover:bg-card-hover transition-colors"
        aria-expanded={open}
      >
        <span className="text-xs font-medium text-foreground">
          {title}
          {hint && <span className="ml-2 font-normal text-muted">{hint}</span>}
        </span>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          className={`text-muted transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="markdown-content px-5 pb-4 text-sm leading-relaxed">
          <ReactMarkdown>{body}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export function QuestionReviewCard({
  card, rejecting, tags, note, onToggleTag, onNoteChange,
  onOpenReject, onCancelReject, onApprove, onSkip, onReject, busy,
}: Props) {
  const [showIntent, setShowIntent] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Collapse the detail panes on every new card — an expanded model answer left open from the last
  // question buries the next stem below the fold. Reset DURING render off a previous-value marker
  // rather than in an effect (the NavBar flyout does the same): an effect would paint the new card
  // with the old panes still open for one frame, and React flags synchronous setState in an effect.
  const [lastCardId, setLastCardId] = useState(card.id);
  if (card.id !== lastCardId) {
    setLastCardId(card.id);
    setShowIntent(false);
    setShowAnswer(false);
  }

  useEffect(() => {
    if (rejecting) noteRef.current?.focus();
  }, [rejecting]);

  // Dictation appends rather than replaces, matching AnswerInput: a reviewer talking through a fault
  // in two passes must not have the first pass overwritten by the second. The updater form is what
  // makes that safe — the hook's callback identity is stable, so a captured `note` would go stale.
  const speech = useSpeech((text) =>
    onNoteChange((prev) => (prev.trim().length === 0 ? text : `${prev.trim()} ${text}`))
  );

  const hard = card.verdict?.hard ?? [];
  const soft = card.verdict?.soft ?? [];
  const canSubmit = note.trim().length > 0 && !busy;

  return (
    <div className="rounded-xl border border-border bg-card">
      {/* ── Header: what this question IS ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <Chip tone="accent">Paper {card.paper}</Chip>
        <Chip>{card.family} · {card.familyLabel}</Chip>
        <Chip>{card.totalMarks} marks</Chip>
        {card.curveball && <Chip>Curveball: {card.curveball}</Chip>}
        <Chip>
          <span className="tabular-nums">{card.timesServed}</span>
          <span className="ml-1">{card.timesServed === 1 ? "serve" : "serves"}</span>
        </Chip>
        <span className="ml-auto font-mono text-[11px] text-muted">{card.id}</span>
      </div>

      {/* ── The validator's verdict ────────────────────────────────────────────────────────────
          Shown BEFORE the reviewer decides, because the pane would otherwise show everything a
          candidate sees and nothing a validator knows. A null verdict is stated as unavailable
          rather than rendered as an all-clear. */}
      {card.verdict === null ? (
        <div className="border-b border-border px-5 py-2 text-xs text-muted">
          No answer key yet — automated checks unavailable for this question.
        </div>
      ) : (
        (hard.length > 0 || soft.length > 0) && (
          <div className="space-y-1.5 border-b border-border px-5 py-3">
            {hard.map((v, i) => (
              <p key={`h${i}`} className="text-xs text-fail">
                <span className="font-semibold">Hard · {v.rule}</span> — {v.detail}
              </p>
            ))}
            {soft.map((v, i) => (
              <p key={`s${i}`} className="text-xs text-borderline">
                <span className="font-semibold">Soft · {v.rule}</span> — {v.detail}
              </p>
            ))}
          </div>
        )
      )}

      {/* ── The stem, verbatim ─────────────────────────────────────────────────────────────────── */}
      <div className="px-5 py-4">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground">{card.stem}</p>
      </div>

      {/* ── The wines, with their resolved identity ─────────────────────────────────────────────
          The label is what the candidate is served; the resolved variety/region comes from the
          validated answer key. Showing both together is what lets a reviewer catch the defect class
          that matters most here — a key that does not agree with the bottle. */}
      <div className="border-t border-border">
        <table className="w-full text-sm">
          <tbody>
            {card.wines.map((w) => (
              <tr key={w.slot} className="border-b border-border/50 last:border-0 align-top">
                <td className="w-10 py-2.5 pl-5 pr-2 tabular-nums text-xs text-muted">{w.slot}</td>
                <td className="py-2.5 pr-4 text-foreground">
                  {w.text}
                  {(w.variety || w.region || w.country) && (
                    <div className="mt-0.5 text-xs text-muted">
                      {[w.variety, w.region, w.country].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="w-24 py-2.5 pr-5 text-right">
                  {w.role && <Chip tone={w.role === "curveball" ? "accent" : "muted"}>{w.role}</Chip>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Collapsible
        title="Examiner intent"
        hint="(e) — why these wines, why this stem"
        body={[card.examinerIntent, card.reasoningTrace].filter(Boolean).join("\n\n---\n\n") || null}
        open={showIntent}
        onToggle={() => setShowIntent((v) => !v)}
      />
      <Collapsible
        title="Model answer"
        hint="(m)"
        body={card.modelAnswer}
        open={showAnswer}
        onToggle={() => setShowAnswer((v) => !v)}
      />

      {/* ── The decision ───────────────────────────────────────────────────────────────────────── */}
      {!rejecting ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-5 py-4">
          <button
            type="button"
            onClick={onApprove}
            disabled={busy}
            className="rounded-lg border border-success/40 bg-success/10 px-4 py-2 text-sm font-semibold text-success transition-colors hover:bg-success/20 disabled:opacity-40 cursor-pointer"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={onOpenReject}
            disabled={busy}
            className="rounded-lg border border-fail/40 bg-fail/10 px-4 py-2 text-sm font-semibold text-fail transition-colors hover:bg-fail/20 disabled:opacity-40 cursor-pointer"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={onSkip}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-card-hover hover:text-foreground disabled:opacity-40 cursor-pointer"
          >
            Not sure — skip
          </button>
          <span className="ml-auto text-[11px] text-muted">
            <kbd className="font-mono">a</kbd> approve · <kbd className="font-mono">r</kbd> reject ·{" "}
            <kbd className="font-mono">s</kbd> skip
          </span>
        </div>
      ) : (
        <div className="space-y-3 border-t border-fail/30 bg-fail/5 px-5 py-4">
          <div>
            <p className="mb-2 text-xs font-medium text-foreground">
              What&rsquo;s wrong with it? <span className="font-normal text-muted">Tags are optional; the written reason is not.</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {REVIEW_REASON_OPTIONS.map((o) => {
                const on = tags.includes(o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onToggleTag(o.value)}
                    title={o.hint}
                    aria-pressed={on}
                    className={`rounded-md border px-2.5 py-1 text-xs transition-colors cursor-pointer ${
                      on
                        ? "border-accent bg-accent/15 text-accent"
                        : "border-border text-muted hover:border-accent/40 hover:text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative">
            <textarea
              ref={noteRef}
              value={note}
              onChange={(e) => onNoteChange(e.target.value.slice(0, MAX_REVIEW_NOTE_CHARS))}
              placeholder="Why is this question not good enough? Be specific — this goes straight to the automated analysis, and a concrete reason is the only kind it can act on."
              rows={4}
              className={`w-full resize-y rounded-lg border bg-card p-3 pr-14 text-sm leading-relaxed text-foreground transition-colors placeholder:text-muted/50 focus:outline-none ${
                speech.isListening ? "border-fail/60 bg-fail/5" : "border-border focus:border-accent/60"
              }`}
            />
            <div className="absolute right-3 top-3">
              <MicButton
                isListening={speech.isListening}
                isSupported={speech.isSupported}
                onClick={speech.toggle}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onReject}
              disabled={!canSubmit}
              className="rounded-lg border border-fail/40 bg-fail/15 px-4 py-2 text-sm font-semibold text-fail transition-colors hover:bg-fail/25 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            >
              {busy ? "Submitting…" : "Submit rejection"}
            </button>
            <button
              type="button"
              onClick={onCancelReject}
              disabled={busy}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted transition-colors hover:bg-card-hover hover:text-foreground cursor-pointer"
            >
              Cancel
            </button>
            <span className="ml-auto text-[11px] text-muted">
              <kbd className="font-mono">⌘/Ctrl + ↵</kbd> submit · <kbd className="font-mono">esc</kbd> cancel
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
