"use client";

// A scripted, replayable mock of the Coach panel, used by the first-run Coach walkthrough.
//
// WHY SIMULATE RATHER THAN DRIVE THE REAL COACH. A live turn would cost the candidate an API call
// per slide, take an unpredictable ten to sixty seconds, and — being a language model — say something
// different every time, including occasionally saying it badly. A walkthrough has to be legible on
// the first play, so the conversation is fixed. Everything quoted in a script must nonetheless be
// something the real Coach genuinely does: the status labels are copied from run.ts's `labelFor`, and
// the confirmation card mirrors CoachChat's ConfirmCard, verdict line included.
//
// THE ONE THING THIS MUST GET RIGHT is that it does not feel like a video. The candidate can scroll
// back through the transcript mid-playback without being dragged forward again, pause, replay, or
// jump to the end — see `stickToBottom`.
//
// Scripts must be module-level constants. The playback effect keys on `script` identity, so an inline
// array literal would be a fresh reference every render and would restart the conversation forever.

import { useCallback, useEffect, useRef, useState } from "react";

// ── Script ───────────────────────────────────────────────────────────────────────────────────────

export type Beat =
  /** Types into the composer character by character, then sends. */
  | { kind: "ask"; text: string }
  /** The tool-progress line. `label` should be verbatim from run.ts's labelFor. */
  | { kind: "status"; label: string; ms?: number }
  /** A Coach reply, revealed word by word. `checked` renders the real "Checked: …" footer. */
  | { kind: "say"; text: string; checked?: string[] }
  /** A confirmation card, optionally auto-confirmed after a beat, optionally with a verdict. */
  | {
      kind: "card";
      preview: string;
      details: { label: string; value: string }[];
      /** Delay before the card confirms itself. Omit to leave it un-pressed. */
      confirmAfterMs?: number;
      result?: string;
      verdict?: { tone: "accept" | "partial" | "reject" | "endorse"; label: string; reason: string };
    }
  | { kind: "beat"; ms: number };

const VERDICT_CLASS: Record<string, string> = {
  accept: "text-success",
  partial: "text-borderline",
  reject: "text-muted",
  endorse: "text-accent",
};

// Pacing, set from reading speed rather than from what looks snappy.
//
// The first draft streamed at 42ms/word and then waited a flat 1.5s. That reveals a 106-word answer
// in six seconds and moves on — but READING 106 words of dense technical prose takes nearer
// twenty-five, so the reader was being shown the next question before they had finished the last
// answer. Two changes fix it:
//
//   • words arrive at roughly fast-reading speed, so the reveal itself is the pacing and the reader
//     is following live rather than catching up afterwards;
//   • the dwell afterwards SCALES with length, so a long answer gets a real pause and a short one
//     does not stall.
//
// Together that budgets about 280 words per minute end to end, which is comfortable for prose you
// have to think about. Pause, Skip to end and Replay exist for everyone that suits badly.
const TYPE_MS = 26;
const WORD_MS = 130;
const SEND_PAUSE_MS = 420;
const STATUS_MS = 1500;
/** Extra dwell per word once an answer is fully revealed, clamped to the bounds below. */
const READ_PER_WORD_MS = 90;
const DWELL_MIN_MS = 1800;
// High enough that the longest scripted answer does not hit it. When the cap bites, the longest
// replies become the most rushed ones, which is precisely backwards.
const DWELL_MAX_MS = 12000;
/** How long the card sits on "Reviewing…" before the verdict lands. */
const REVIEW_MS = 2600;

const dwellFor = (words: number) =>
  Math.min(DWELL_MAX_MS, Math.max(DWELL_MIN_MS, words * READ_PER_WORD_MS));

// ── Rendered transcript ──────────────────────────────────────────────────────────────────────────

type Item =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "coach"; text: string; checked?: string[]; streaming: boolean }
  | {
      id: number;
      role: "card";
      preview: string;
      details: { label: string; value: string }[];
      confirmed: boolean;
      result?: string;
      verdict?: { tone: "accept" | "partial" | "reject" | "endorse"; label: string; reason: string };
      showVerdict: boolean;
      reviewing: boolean;
    };

function CoachMark({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 3.5h8a2 2 0 012 2v6.8a5 5 0 01-2.2 4.15L12 19l-3.8-2.55A5 5 0 016 12.3V5.5a2 2 0 012-2z"
      />
      <path strokeLinecap="round" d="M9.5 8.5h5M9.5 11.5h3" />
    </svg>
  );
}

interface SimProps {
  script: Beat[];
  /** Restarts playback from the top whenever this changes — the slide index, in practice. */
  runKey: string | number;
  heightClass?: string;
}

/**
 * Playback is REMOUNTED rather than reset.
 *
 * The inner component's initial state is already the correct starting state, so keying it on
 * `runKey` + a replay counter means a restart never has to clear anything — which keeps the
 * playback effect append-only, and avoids the cascading-render that resetting five pieces of state
 * in an effect body produces.
 */
export function CoachChatSim({ script, runKey, heightClass = "h-[26rem]" }: SimProps) {
  const [replays, setReplays] = useState(0);
  return (
    <SimRun
      key={`${runKey}:${replays}`}
      script={script}
      heightClass={heightClass}
      onReplay={() => setReplays((n) => n + 1)}
    />
  );
}

function SimRun({
  script,
  heightClass,
  onReplay,
}: {
  script: Beat[];
  heightClass: string;
  onReplay: () => void;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [composing, setComposing] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const skipRef = useRef(false);
  // Whether the reader is parked at the bottom. Playback only auto-scrolls while this is true, so
  // scrolling up to re-read something does not fight the animation — the most annoying way an
  // auto-scrolling transcript can behave. A ref, not state, because it is read on every reveal tick.
  const stickToBottom = useRef(true);

  /** Kept in a ref as well as state: the playback loop polls it, the header renders it. */
  const togglePause = useCallback(() => {
    setPaused((prev) => {
      pausedRef.current = !prev;
      return !prev;
    });
  }, []);

  const skipToEnd = useCallback(() => {
    skipRef.current = true;
    pausedRef.current = false;
    setPaused(false);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    stickToBottom.current = bottom;
    setAtBottom((prev) => (prev === bottom ? prev : bottom));
  }, []);

  const scrollDown = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = true;
    setAtBottom(true);
    el.scrollTop = el.scrollHeight;
  }, []);

  // Append-only: this component mounts fresh for every run (see CoachChatSim), so there is nothing
  // to clear here and no synchronous setState in the effect body.
  //
  // CANCELLATION IS PER-RUN AND LOCAL, not a shared ref, and both halves of that matter — each was
  // a bug in turn. StrictMode mounts, cleans up, then mounts again. With a shared ref that the effect
  // re-armed, the first cleanup's `true` was reset by the second mount, reviving the DISCARDED run:
  // two loops appended to one transcript and every message rendered twice. With a shared ref that
  // the effect did NOT re-arm, the cleanup's `true` persisted and the real run aborted on its first
  // sleep, so nothing played at all. A `let` scoped to this invocation is neither: the discarded run
  // sees its own `true` forever, and this run starts from its own `false`.
  useEffect(() => {
    let cancelled = false;
    let seq = 0;
    const nextId = () => ++seq;

    /** Sleep that respects pause, Skip to end, and unmount. False means abort playback. */
    const wait = async (ms: number): Promise<boolean> => {
      const step = 60;
      let waited = 0;
      while (waited < ms) {
        if (cancelled) return false;
        if (skipRef.current) return true;
        if (!pausedRef.current) waited += step;
        await new Promise((r) => setTimeout(r, step));
      }
      return !cancelled;
    };

    const settle = (id: number, beat: Extract<Beat, { kind: "say" }>) =>
      setItems((prev) =>
        prev.map((it) =>
          it.id === id ? { ...it, text: beat.text, streaming: false, checked: beat.checked } : it
        )
      );

    const run = async () => {
      // A moment before the first keystroke, so the panel is legible before anything moves.
      if (!(await wait(700))) return;

      for (const beat of script) {
        if (cancelled) return;

        if (beat.kind === "beat") {
          if (!(await wait(beat.ms))) return;
          continue;
        }

        if (beat.kind === "ask") {
          if (!skipRef.current) {
            for (let i = 1; i <= beat.text.length; i++) {
              if (cancelled) return;
              if (skipRef.current) break;
              setComposing(beat.text.slice(0, i));
              if (!(await wait(TYPE_MS))) return;
            }
            if (!skipRef.current) {
              setComposing(beat.text);
              if (!(await wait(SEND_PAUSE_MS))) return;
            }
          }
          setComposing("");
          setItems((prev) => [...prev, { id: nextId(), role: "user", text: beat.text }]);
          requestAnimationFrame(scrollDown);
          if (!(await wait(500))) return;
          continue;
        }

        if (beat.kind === "status") {
          setStatus(beat.label);
          if (!(await wait(beat.ms ?? STATUS_MS))) return;
          setStatus(null);
          continue;
        }

        if (beat.kind === "say") {
          const id = nextId();
          const words = beat.text.split(" ");
          setItems((prev) => [...prev, { id, role: "coach", text: "", streaming: true }]);
          if (!skipRef.current) {
            for (let i = 1; i <= words.length; i++) {
              if (cancelled) return;
              if (skipRef.current) break;
              const partial = words.slice(0, i).join(" ");
              setItems((prev) => prev.map((it) => (it.id === id ? { ...it, text: partial } : it)));
              requestAnimationFrame(scrollDown);
              if (!(await wait(WORD_MS))) return;
            }
          }
          settle(id, beat);
          requestAnimationFrame(scrollDown);
          if (!(await wait(dwellFor(words.length)))) return;
          continue;
        }

        // beat.kind === "card"
        const id = nextId();
        setItems((prev) => [
          ...prev,
          {
            id,
            role: "card",
            preview: beat.preview,
            details: beat.details,
            confirmed: false,
            result: beat.result,
            verdict: beat.verdict,
            showVerdict: false,
            reviewing: false,
          },
        ]);
        requestAnimationFrame(scrollDown);

        if (beat.confirmAfterMs != null) {
          if (!(await wait(beat.confirmAfterMs))) return;
          setItems((prev) =>
            prev.map((it) =>
              it.id === id && it.role === "card"
                ? { ...it, confirmed: true, reviewing: !!beat.verdict }
                : it
            )
          );
          requestAnimationFrame(scrollDown);
          if (beat.verdict) {
            if (!(await wait(REVIEW_MS))) return;
            setItems((prev) =>
              prev.map((it) =>
                it.id === id && it.role === "card" ? { ...it, showVerdict: true, reviewing: false } : it
              )
            );
            requestAnimationFrame(scrollDown);
          }
        }
        // A card is as much reading as an answer — the preview, four labelled fields and the
        // verdict reason — so it gets the same length-scaled dwell rather than a flat one.
        const cardWords = [
          beat.preview,
          ...beat.details.map((d) => `${d.label} ${d.value}`),
          beat.result ?? "",
          beat.verdict ? `${beat.verdict.label} ${beat.verdict.reason}` : "",
        ]
          .join(" ")
          .split(/\s+/)
          .filter(Boolean).length;
        if (!(await wait(dwellFor(cardWords)))) return;
      }

      if (!cancelled) setFinished(true);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [script, scrollDown]);

  return (
    <div
      className={`relative rounded-xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col ${heightClass}`}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <CoachMark className="w-4 h-4 text-accent shrink-0" />
          <span className="text-[13px] font-medium text-foreground truncate">Coach</span>
        </div>
        <div className="flex items-center gap-2">
          {finished ? (
            <button
              type="button"
              onClick={onReplay}
              className="text-[11px] text-muted hover:text-accent transition-colors cursor-pointer px-1"
            >
              Replay
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={togglePause}
                className="text-[11px] text-muted hover:text-accent transition-colors cursor-pointer px-1"
              >
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                type="button"
                onClick={skipToEnd}
                className="text-[11px] text-muted hover:text-accent transition-colors cursor-pointer px-1"
              >
                Skip to end
              </button>
            </>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 text-left"
      >
        {items.map((item) =>
          item.role === "user" ? (
            <div key={item.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-xl rounded-br-sm bg-card-hover border border-border px-3 py-2 text-[13px] text-foreground whitespace-pre-wrap">
                {item.text}
              </div>
            </div>
          ) : item.role === "coach" ? (
            <div key={item.id} className="space-y-1.5">
              <p className="text-[13px] leading-relaxed text-foreground whitespace-pre-wrap">
                {item.text}
                {item.streaming && <span className="streaming-dot ml-0.5">▍</span>}
              </p>
              {item.checked && item.checked.length > 0 && (
                <p className="text-[11px] text-muted">Checked: {item.checked.join(", ")}</p>
              )}
            </div>
          ) : (
            <div
              key={item.id}
              className="rounded-lg border border-border bg-card-hover/40 p-2.5 space-y-2"
            >
              <div className="text-[12.5px] font-medium text-foreground">{item.preview}</div>
              <dl className="space-y-1">
                {item.details.map((d) => (
                  <div key={d.label} className="text-[11.5px] leading-snug">
                    <dt className="text-muted inline">{d.label}: </dt>
                    <dd className="text-foreground inline whitespace-pre-wrap">{d.value}</dd>
                  </div>
                ))}
              </dl>
              {item.confirmed ? (
                <div className="space-y-1.5">
                  {item.result && <div className="text-[11.5px] text-success">{item.result}</div>}
                  {item.reviewing && (
                    <div className="text-[11.5px] text-muted">
                      Reviewing your report against the record…
                    </div>
                  )}
                  {item.showVerdict && item.verdict && (
                    <div className="space-y-0.5 border-t border-border pt-1.5">
                      <div className={`text-[11.5px] font-medium ${VERDICT_CLASS[item.verdict.tone]}`}>
                        {item.verdict.label}
                      </div>
                      <div className="text-[11.5px] text-muted leading-snug">{item.verdict.reason}</div>
                    </div>
                  )}
                </div>
              ) : (
                <span className="inline-block rounded-lg border border-accent px-2.5 py-1 text-[12px] text-accent">
                  Confirm
                </span>
              )}
            </div>
          )
        )}

        {status && <p className="text-[11px] text-muted">{status}</p>}
      </div>

      {/* Only while they have scrolled away — the way back down, since auto-scroll deliberately
          stops following them once they do. */}
      {!atBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute bottom-14 right-3 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted hover:text-accent hover:border-accent transition-colors cursor-pointer shadow-lg"
        >
          ↓ Latest
        </button>
      )}

      <div className="border-t border-border p-2 flex items-end gap-2 shrink-0">
        <span className="rounded-lg border border-border px-2 py-1.5 text-[12.5px] text-muted">📷</span>
        <div className="flex-1 text-[13px] px-1.5 py-1.5 min-h-[1.75rem]">
          {composing ? (
            <span className="text-foreground">
              {composing}
              <span className="streaming-dot">▍</span>
            </span>
          ) : (
            <span className="text-muted">Ask the Coach…</span>
          )}
        </div>
        <span className="rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] text-muted">
          Send
        </span>
      </div>
    </div>
  );
}
