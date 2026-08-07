"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { usePathname } from "next/navigation";
import { useProgressStream } from "@/lib/use-progress-stream";
import { useFeedbackPanelState } from "@/lib/feedback-context";
import { capturePage, type Capture } from "@/lib/coach/capture";
import type { VoiceState } from "@/lib/voice/state-types";
import { useReadAloud, type ReadAloud } from "./voice/useReadAloud";
import { useVoiceSession } from "./voice/useVoiceSession";
import { VoiceInlineBar } from "./voice/VoiceInlineBar";
import {
  clearSession,
  resumableConversationId,
  sessionWentStale,
  touchSession,
} from "@/lib/coach/session";

interface ProposalCard {
  tool: string;
  preview: string;
  details: { label: string; value: string }[];
  blockers?: string[];
  /** Null on a draft. The Confirm button does not render without it — see ConfirmCard. */
  token: string | null;
}

interface Turn {
  role: "user" | "assistant";
  text: string;
  hadScreenshot?: boolean;
  messageId?: number;
  toolsUsed?: string[];
  restricted?: boolean;
  proposals?: ProposalCard[];
}

interface CoachResult {
  conversationId: string;
  messageId: number;
  text: string;
  toolsUsed: string[];
  proposals: ProposalCard[];
  guardCodes: string[];
  attemptState: string;
  restricted: boolean;
  truncated: boolean;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

const SUGGESTIONS = [
  "Has Paper 1 single-variety ever been all Semillon?",
  "How do the examiners judge quality statements?",
  "Where am I weakest right now?",
];

/**
 * Lifts the voice state up to the dock, which draws the orb in its title bar.
 *
 * The orb belongs to the dock chrome rather than the chat body — that is what lets voice run
 * alongside the conversation instead of covering it. `null` means voice is off.
 */
export type VoiceStatusCallback = (state: VoiceState | null, getLevel: () => number) => void;

/** Rough USD for a Sonnet turn. Indicative only — the Cost dashboard holds the real accounting. */
function estimateUsd(u: CoachResult["usage"]): number {
  return (
    (u.input * 3 + u.output * 15 + u.cacheWrite * 3.75 + u.cacheRead * 0.3) / 1_000_000
  );
}

export function CoachChat({ onVoiceStatus }: { onVoiceStatus?: VoiceStatusCallback }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [needsKey, setNeedsKey] = useState(false);
  const [spend, setSpend] = useState(0);
  const [ratings, setRatings] = useState<Record<number, "up" | "down">>({});
  const [shot, setShot] = useState<Capture | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<
    { id: string; title: string | null; updated_at: string }[]
  >([]);
  const [resumedNotice, setResumedNotice] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(false);
  // Whether this account can use voice at all — i.e. has an ElevenLabs key, or is an admin falling
  // back to the server one. Checked once when the dock mounts rather than discovered on first use:
  // without it, someone with no key opens the mic, says a whole sentence, and only THEN gets told.
  // `null` while unknown, so the controls do not flicker disabled on load.
  const [voiceAvailable, setVoiceAvailable] = useState<boolean | null>(null);
  const readAloud = useReadAloud();
  const stream = useProgressStream();
  const scrollRef = useRef<HTMLDivElement>(null);
  const busy = stream.active;
  // Reuse the provider the Feedback tab already fills in, rather than adding a second one — study
  // screens publish their question/wine there on load and clear it on unmount.
  const { context } = useFeedbackPanelState();
  const pathname = usePathname();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [turns, stream.thinking, stream.status]);

  const openConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/coach/conversations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    setTurns(
      (data.messages || []).map((m: { role: string; text: string; toolsUsed: string[]; restricted: boolean; id: number }) => ({
        role: m.role as "user" | "assistant",
        text: m.text,
        messageId: m.role === "assistant" ? m.id : undefined,
        toolsUsed: m.toolsUsed,
        restricted: m.restricted,
      }))
    );
    setRatings(data.ratings || {});
    setConversationId(id);
    touchSession(id);
    setHistoryOpen(false);
    setResumedNotice(false);
  }, []);

  // Resume or start clean, decided once on mount. The dock lives in the root layout and survives
  // every client navigation, so without this a thread would run for as long as the tab is open.
  useEffect(() => {
    // Deliberate: whether to resume depends on localStorage and the wall clock, neither of which is
    // knowable during render — reading them there would desync hydration. Runs once on mount with a
    // stable dep, so it settles rather than cascading. Same pattern as the dock's rect restore.
    const resumable = resumableConversationId();
    if (resumable) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void openConversation(resumable);
    } else if (sessionWentStale()) {
      // Say it rather than silently resetting — someone who left mid-question needs to know their
      // thread went to History rather than vanished.
      setResumedNotice(true);
      clearSession();
    }
  }, [openConversation]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user/api-key?provider=elevenlabs")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { hasKey?: boolean; usingServerKey?: boolean } | null) => {
        if (!cancelled) setVoiceAvailable(!!(d?.hasKey || d?.usingServerKey));
      })
      .catch(() => {
        // Unreachable is not the same as unconfigured — leave the controls enabled and let the
        // route's own 402 explain, rather than hiding voice because one probe failed.
        if (!cancelled) setVoiceAvailable(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startNewChat = useCallback(() => {
    setTurns([]);
    setConversationId(null);
    setRatings({});
    setShot(null);
    setResumedNotice(false);
    setHistoryOpen(false);
    clearSession();
  }, []);

  const loadConversations = useCallback(async () => {
    const res = await fetch("/api/coach");
    if (!res.ok) return;
    const data = await res.json();
    setConversations(data.conversations || []);
  }, []);

  /**
   * Send one message and record the exchange.
   *
   * Shared with voice mode, which is why it takes `onDelta` and returns the answer: a spoken turn is
   * the same turn — same endpoint, same conversation, same transcript — it just also needs the text
   * as it streams, to cut sentences for synthesis. Forking a second send path for voice would have
   * meant two places to keep the conversation bookkeeping right.
   */
  const send = useCallback(
    async (text: string, opts?: { onDelta?: (delta: string) => void }): Promise<string | null> => {
      const trimmed = text.trim();
      if (!trimmed || busy) return null;
      setInput("");
      setNeedsKey(false);
      setTurns((t) => [...t, { role: "user", text: trimmed, hadScreenshot: !!shot }]);
      // Consumed by this send only. A screenshot attached to one question should not silently ride
      // along with the next one — and under BYOK it would be re-billed if it did.
      const attached = shot;
      setShot(null);

      // Re-check freshness at SEND, not only at open. A dock left sitting for an hour would
      // otherwise continue its old thread the moment someone typed into it.
      const resumable = resumableConversationId();
      const continuing = conversationId && resumable === conversationId ? conversationId : null;
      if (conversationId && !continuing) {
        setTurns([{ role: "user", text: trimmed, hadScreenshot: !!shot }]);
        setConversationId(null);
        setRatings({});
      }

      const result = await stream.run<CoachResult>("/api/coach", {
        message: trimmed,
        conversationId: continuing,
        screenshot: attached?.base64 ?? null,
        screen: {
          route: pathname,
          mode: context?.mode ?? null,
          paper: context?.paper ?? null,
          questionId: context?.questionId ?? null,
          attemptId: context?.attemptId ?? null,
          wineIndex: context?.wineIndex ?? null,
        },
      }, { onDelta: opts?.onDelta });

      if (!result) {
        // BYOK: 402 means "no Anthropic key on this account", which is a setup step rather than a
        // failure — surface the fix, not the status code.
        const err = stream.errorRef.current || "";
        if (/402|api key/i.test(err)) setNeedsKey(true);
        setTurns((t) => [
          ...t,
          { role: "assistant", text: needsKeyMessage(err) },
        ]);
        return null;
      }

      setConversationId(result.conversationId);
      touchSession(result.conversationId);
      setResumedNotice(false);
      setSpend((s) => s + estimateUsd(result.usage));
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          text: result.text,
          messageId: result.messageId,
          toolsUsed: result.toolsUsed,
          restricted: result.restricted,
          proposals: result.proposals,
        },
      ]);
      return result.text;
    },
    [busy, conversationId, stream, context, pathname, shot]
  );

  // Voice mode runs the same turn through the same `send`, so a spoken exchange lands in the
  // transcript and the conversation exactly like a typed one.
  const ask = useCallback(
    (message: string, onDelta: (delta: string) => void) => send(message, { onDelta }),
    [send]
  );
  const voice = useVoiceSession({ ask, disabled: needsKey });

  const closeVoice = useCallback(() => {
    voice.stop();
    setVoiceOpen(false);
  }, [voice]);

  const openVoice = useCallback(() => {
    // Reading a message aloud and talking to it are two audio graphs competing for the speaker.
    readAloud.stop();
    setVoiceOpen(true);
    void voice.start();
  }, [readAloud, voice]);

  // Publish the voice state to the dock so it can draw the orb in its title bar.
  //
  // From an EFFECT keyed on the primitive state, never during render (React warns on cross-component
  // updates) and never with a freshly-allocated object in the deps — that would re-publish every
  // render and drag the dock through a re-render at audio frame rate. The callback itself goes
  // through a ref so a parent that re-creates it inline cannot cause the same storm.
  const statusCbRef = useRef(onVoiceStatus);
  useEffect(() => {
    statusCbRef.current = onVoiceStatus;
  });
  const voiceLevel = voice.getLevel;
  const voiceState = voice.state;
  useEffect(() => {
    statusCbRef.current?.(voiceOpen ? voiceState : null, voiceLevel);
  }, [voiceOpen, voiceState, voiceLevel]);
  useEffect(() => () => statusCbRef.current?.(null, () => 0), []);

  const rate = useCallback(async (messageId: number, rating: "up" | "down") => {
    setRatings((r) => ({ ...r, [messageId]: rating }));
    await fetch("/api/coach/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, rating }),
    }).catch(() => {
      /* a lost rating is not worth interrupting the conversation for */
    });
  }, []);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-border">
        <button
          type="button"
          onClick={startNewChat}
          disabled={busy}
          className="text-[11.5px] text-muted hover:text-accent transition-colors cursor-pointer disabled:opacity-40"
        >
          + New chat
        </button>
        <button
          type="button"
          onClick={() => {
            const next = !historyOpen;
            setHistoryOpen(next);
            if (next) void loadConversations();
          }}
          aria-expanded={historyOpen}
          className="text-[11.5px] text-muted hover:text-accent transition-colors cursor-pointer"
        >
          History
        </button>
      </div>

      {historyOpen && (
        <div className="border-b border-border max-h-44 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="px-3 py-2 text-[11.5px] text-muted">No earlier conversations.</div>
          ) : (
            conversations.map((c) => (
              <div key={c.id} className="flex items-center gap-1 px-2 py-1 hover:bg-card-hover/50">
                <button
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className="flex-1 text-left text-[12px] text-foreground truncate cursor-pointer px-1 py-0.5"
                >
                  {c.title || "Untitled"}
                </button>
                <button
                  type="button"
                  aria-label="Remove this conversation"
                  onClick={async () => {
                    await fetch(`/api/coach/conversations/${c.id}`, { method: "DELETE" });
                    if (c.id === conversationId) startNewChat();
                    void loadConversations();
                  }}
                  className="text-[12px] text-muted hover:text-fail transition-colors cursor-pointer px-1"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {resumedNotice && (
          <div className="text-[11.5px] text-muted border border-border rounded-lg px-2.5 py-1.5">
            Fresh start — it had been a while. Your last conversation is under History.
          </div>
        )}
        {turns.length === 0 && !busy && (
          <div className="space-y-3">
            <p className="text-[13px] text-muted leading-relaxed">
              Ask about past papers, how the examiners think, the decision trees, or your own record.
            </p>
            <div className="flex flex-col gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="text-left text-[12.5px] rounded-lg border border-border px-2.5 py-1.5 text-muted hover:text-foreground hover:border-muted transition-colors cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div key={i} className={t.role === "user" ? "flex justify-end" : ""}>
            {t.role === "user" ? (
              <div className="max-w-[85%] rounded-xl rounded-br-sm bg-card-hover border border-border px-3 py-2 text-[13px] text-foreground whitespace-pre-wrap">
                {t.text}
                {t.hadScreenshot && (
                  <span className="block mt-1 text-[11px] text-muted">📎 screenshot attached</span>
                )}
              </div>
            ) : (
              <div className="space-y-1.5">
                {t.restricted && (
                  <div className="text-[11px] text-borderline">
                    Attempt in progress — coaching the routing, not the answer.
                  </div>
                )}
                <div className="markdown-content text-[13px] leading-relaxed text-foreground">
                  <ReactMarkdown>{t.text}</ReactMarkdown>
                </div>
                {t.proposals?.map((p, pi) => (
                  <ConfirmCard key={pi} proposal={p} route={pathname} />
                ))}
                {t.toolsUsed && t.toolsUsed.length > 0 && (
                  <div className="text-[11px] text-muted">Checked: {t.toolsUsed.join(", ")}</div>
                )}
                {t.text.trim() && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <SpeakButton
                      id={`m${i}`}
                      markdown={t.text}
                      readAloud={readAloud}
                      disabled={voiceOpen || voiceAvailable === false}
                      unavailable={voiceAvailable === false}
                    />
                    <CopyButton text={t.text} />
                    {/* Ratings only exist for a persisted turn; the two buttons above work on any
                        rendered answer, including one from a thread that failed to save. */}
                    {t.messageId != null &&
                      (["up", "down"] as const).map((r) => (
                        <button
                          key={r}
                          type="button"
                          aria-label={r === "up" ? "Helpful" : "Not helpful"}
                          aria-pressed={ratings[t.messageId!] === r}
                          onClick={() => rate(t.messageId!, r)}
                          className={`text-[13px] leading-none rounded-md px-1.5 py-1 border transition-colors cursor-pointer ${
                            ratings[t.messageId!] === r
                              ? "border-accent text-accent"
                              : "border-transparent text-muted hover:text-foreground"
                          }`}
                        >
                          {r === "up" ? "👍" : "👎"}
                        </button>
                      ))}
                  </div>
                )}
                {readAloud.error?.id === `m${i}` && (
                  <div className="text-[11px] text-fail">{readAloud.error.message}</div>
                )}
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="space-y-1.5">
            {stream.status && <div className="text-[11px] text-muted">{stream.status}</div>}
            {stream.thinking ? (
              <div className="markdown-content text-[13px] leading-relaxed text-foreground">
                <ReactMarkdown>{stream.thinking}</ReactMarkdown>
              </div>
            ) : (
              <div className="streaming-dot" aria-label="Thinking" />
            )}
          </div>
        )}

        {needsKey && (
          <div className="rounded-lg border border-border p-2.5 text-[12.5px] text-muted">
            The Coach runs on your own Anthropic key.{" "}
            <Link href="/settings" className="text-accent hover:text-accent-hover underline">
              Add one in Settings
            </Link>
            .
          </div>
        )}
      </div>

      {voiceOpen && (
        <VoiceInlineBar
          session={voice}
          onClose={closeVoice}
          // Retires itself once the loop has round-tripped once.
          showHint={voice.turns.length === 0}
        />
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-border p-2 flex items-end gap-2"
      >
        {/* Capture is always an explicit act — never automatic, and always visibly attached before
            it is sent. A screenshot of the app can contain a graded answer or a wine list, so it
            leaves the browser only because the candidate asked for it to. */}
        <button
          type="button"
          aria-label={shot ? "Remove the attached screenshot" : "Attach a screenshot of this page"}
          title={shot ? "Screenshot attached — click to remove" : "Attach a screenshot of this page"}
          disabled={busy || capturing}
          onClick={async () => {
            if (shot) {
              setShot(null);
              return;
            }
            setCapturing(true);
            const c = await capturePage();
            setCapturing(false);
            if (c) setShot(c);
          }}
          className={`rounded-lg border px-2 py-1.5 text-[12.5px] transition-colors cursor-pointer disabled:opacity-40 ${
            shot ? "border-accent text-accent" : "border-border text-muted hover:text-foreground"
          }`}
        >
          {capturing ? "…" : shot ? "📎" : "📷"}
        </button>
        {/* Talk / End, as ONE button that changes in place rather than two that swap.
            Opening needs a real click: both the microphone prompt and the autoplay policy require a
            user gesture, and `start()` satisfies them together. Keeping the same DOM node means
            focus stays on the right control when voice starts — moving it would be the disruptive
            act — and the composer row never reflows mid-sentence. */}
        <button
          type="button"
          aria-label={voiceOpen ? "End voice mode" : "Talk to the Coach"}
          aria-pressed={voiceOpen}
          title={
            needsKey
              ? "Add an Anthropic key in Settings first"
              : voiceAvailable === false
                ? "Add an ElevenLabs key in Settings to talk to the Coach"
                : voiceOpen
                  ? "End voice mode"
                  : "Talk to the Coach"
          }
          // Not disabled while busy when voice is ON: ending a session mid-answer is exactly when
          // someone reaches for it.
          disabled={needsKey || voiceAvailable === false || (busy && !voiceOpen)}
          onClick={voiceOpen ? closeVoice : openVoice}
          className={`rounded-lg border px-2 py-1.5 transition-colors cursor-pointer disabled:opacity-40 disabled:hover:text-muted disabled:hover:border-border ${
            voiceOpen
              ? "border-accent text-accent"
              : "border-border text-muted hover:text-accent hover:border-accent"
          }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
            <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
            <path strokeLinecap="round" d="M4.5 9a5.5 5.5 0 0011 0M10 14.5v3" />
            {voiceOpen && <path strokeLinecap="round" d="M3.5 3.5l13 13" />}
          </svg>
        </button>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends, Shift+Enter breaks the line — the convention every chat UI uses, and
            // getting it backwards is the fastest way to lose a half-typed question.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
          rows={1}
          placeholder="Ask the Coach…"
          disabled={busy}
          className="flex-1 resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted outline-none px-1.5 py-1.5 max-h-28"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg border border-border px-2.5 py-1.5 text-[12.5px] text-muted hover:text-accent hover:border-accent disabled:opacity-40 disabled:hover:text-muted disabled:hover:border-border transition-colors cursor-pointer"
        >
          Send
        </button>
      </form>

      {spend > 0 && (
        <div className="px-3 pb-2 -mt-1 text-[10.5px] text-muted">
          ≈ ${spend.toFixed(3)} this session, on your key
        </div>
      )}
    </div>
  );
}

/**
 * How the analysis's rulings read to the candidate who filed the report.
 *
 * All FOUR terminal verdicts, deliberately. `endorse` is the easy one to miss — it exists because
 * praise had no bucket and was being auto-rejected — and omitting it here would not fail loudly: the
 * card would just report a decided verdict as "still under review". Colours track History's, so the
 * same ruling does not look like two different things in two places.
 * The fifth value, "pending", is the analysis's own "could not classify" and is not a ruling.
 */
const VERDICT: Record<string, { label: string; className: string }> = {
  accept: { label: "Accepted — you were right", className: "text-success" },
  partial: { label: "Partly accepted", className: "text-borderline" },
  reject: { label: "Not upheld", className: "text-muted" },
  endorse: { label: "Endorsed — logged as an exemplar", className: "text-accent" },
};

interface Verdict {
  status: string;
  recommendation: string | null;
  reason: string | null;
}

/**
 * The confirmation card. Nothing the Coach proposes happens until this is pressed.
 *
 * A draft (no token) renders its blockers and NO Confirm button — the absence of the token is what
 * makes it uncommittable, so there is no state where the button exists but shouldn't work. The
 * double-gate on `!proposal.token` in the handler is belt-and-braces for a future refactor.
 *
 * After a question report commits, the card POLLS for the adjudication and shows the ruling in
 * place. That closes the loop the standalone feedback form never closed: filing used to end at
 * "sent", and the verdict — which may well disagree with what the Coach argued a moment earlier —
 * arrived later, elsewhere, if the candidate went looking for it.
 */
function ConfirmCard({ proposal, route }: { proposal: ProposalCard; route: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [waiting, setWaiting] = useState(false);
  const isDraft = !proposal.token;

  async function confirm() {
    if (!proposal.token || state !== "idle") return;
    setState("sending");
    try {
      const res = await fetch("/api/coach/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: proposal.token, route }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(data?.error || "That didn't work.");
        return;
      }
      setState("done");
      setMessage(data?.message || "Done.");
      const attemptId = data?.data?.attemptId;
      if (data?.data?.awaitingVerdict && typeof attemptId === "number") {
        void pollVerdict(attemptId);
      }
    } catch {
      setState("error");
      setMessage("Couldn't reach the server.");
    }
  }

  /**
   * Wait for the ruling, then stop waiting.
   *
   * The analysis is an Opus pass that runs well over a minute, so this is a slow poll on a ~3.5min
   * budget. Giving up is a normal outcome, not an error: the run continues server-side and the
   * verdict still reaches History and the notification bell. The card just stops claiming to know.
   */
  async function pollVerdict(attemptId: number) {
    setWaiting(true);
    const deadline = Date.now() + 210_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 7000));
      try {
        const res = await fetch(`/api/coach/verdict?attemptId=${attemptId}`);
        if (!res.ok) break;
        const v: Verdict = await res.json();
        // 'pending' is the analysis's own placeholder for "could not classify", so a complete row
        // without one of the three rulings is finished, not still running — stop either way.
        if (v.status === "complete" || v.status === "error") {
          setWaiting(false);
          setVerdict(v);
          return;
        }
      } catch {
        break;
      }
    }
    setWaiting(false);
  }

  return (
    <div className="rounded-lg border border-border bg-card-hover/40 p-2.5 space-y-2">
      <div className="text-[12.5px] font-medium text-foreground">{proposal.preview}</div>
      <dl className="space-y-1">
        {proposal.details.map((d, i) => (
          <div key={i} className="text-[11.5px] leading-snug">
            <dt className="text-muted inline">{d.label}: </dt>
            <dd className="text-foreground inline whitespace-pre-wrap">{d.value}</dd>
          </div>
        ))}
      </dl>

      {isDraft ? (
        <div className="text-[11.5px] text-borderline">
          Not ready to send — {proposal.blockers?.join("; ")}
        </div>
      ) : state === "done" ? (
        <div className="space-y-1.5">
          <div className="text-[11.5px] text-success">{message}</div>
          {waiting && (
            <div className="text-[11.5px] text-muted">Reviewing your report against the record…</div>
          )}
          {verdict && <VerdictLine verdict={verdict} />}
        </div>
      ) : state === "error" ? (
        <div className="text-[11.5px] text-fail">{message}</div>
      ) : (
        <button
          type="button"
          onClick={confirm}
          disabled={state === "sending"}
          className="rounded-lg border border-accent px-2.5 py-1 text-[12px] text-accent hover:bg-accent hover:text-background disabled:opacity-50 transition-colors cursor-pointer"
        >
          {state === "sending" ? "Sending…" : "Confirm"}
        </button>
      )}
    </div>
  );
}

/**
 * The ruling, in place on the card that filed it.
 *
 * An unclassified or errored analysis renders as "still under review" rather than as a non-verdict:
 * the report is filed either way, and inventing a third outcome for a run that did not reach one
 * would misreport it. The reason is the analysis's own words, not a re-summary.
 */
function VerdictLine({ verdict }: { verdict: Verdict }) {
  const v = verdict.recommendation ? VERDICT[verdict.recommendation] : undefined;
  if (!v) {
    return <div className="text-[11.5px] text-muted">Still under review — you&apos;ll get the outcome in History.</div>;
  }
  return (
    <div className="space-y-0.5 border-t border-border pt-1.5">
      <div className={`text-[11.5px] font-medium ${v.className}`}>{v.label}</div>
      {verdict.reason && (
        // Through ReactMarkdown, not as plain text: these paragraphs use bold for the phrase the
        // ruling turns on, and rendering them raw would print the asterisks.
        <div className="markdown-content text-[11.5px] text-muted leading-snug">
          <ReactMarkdown>{verdict.reason}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

/**
 * Read this answer aloud.
 *
 * Disabled while hands-free mode is open: that loop owns the speaker and is mid-turn, and letting a
 * second Web Audio graph play over it produces two voices talking at once with no way to stop
 * either cleanly.
 */
function SpeakButton({
  id,
  markdown,
  readAloud,
  disabled,
  unavailable,
}: {
  id: string;
  markdown: string;
  readAloud: ReadAloud;
  disabled: boolean;
  /** No ElevenLabs key — say why rather than presenting a dead control. */
  unavailable?: boolean;
}) {
  const active = readAloud.activeId === id;
  const loading = active && readAloud.state === "loading";
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={active ? "Stop reading this answer" : "Read this answer aloud"}
      aria-pressed={active}
      title={
        unavailable
          ? "Add an ElevenLabs key in Settings to have answers read aloud"
          : disabled
            ? "Close voice mode to use this"
            : active
              ? "Stop"
              : "Read aloud"
      }
      onClick={() => readAloud.toggle(id, markdown)}
      className={`rounded-md border px-1.5 py-1 leading-none transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        active ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {loading ? (
        <span className="streaming-dot block w-3.5 h-3.5 text-[13px] leading-none">·</span>
      ) : active ? (
        // Stop square, so the control reads as a toggle rather than a replay.
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <rect x="5" y="5" width="10" height="10" rx="1.5" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 8v4h2.5L10 15V5L6.5 8H4z" />
          <path strokeLinecap="round" d="M13 7.5a3.5 3.5 0 010 5M15.2 5.3a6.5 6.5 0 010 9.4" />
        </svg>
      )}
    </button>
  );
}

/**
 * Copy the answer's markdown.
 *
 * The raw markdown deliberately, not the rendered text: it is what pastes usefully into notes, and
 * it is what the candidate saw.
 *
 * TWO PATHS, because the modern one is refused more often than you would think. `navigator.clipboard`
 * needs a secure context AND document focus, so it throws NotAllowedError in an unfocused window, in
 * an iframe without permission, and on plain http — none of which are exotic. The textarea fallback
 * works in all three. If both fail the button SAYS so, because the one thing worse than not copying
 * is a green tick claiming you did.
 */
function CopyButton({ text }: { text: string }) {
  const [result, setResult] = useState<"idle" | "copied" | "failed">("idle");
  const copied = result === "copied";

  useEffect(() => {
    if (result === "idle") return;
    const timer = setTimeout(() => setResult("idle"), 1800);
    return () => clearTimeout(timer);
  }, [result]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setResult("copied");
      return;
    } catch {
      /* fall through to the legacy path */
    }
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      // Off-screen rather than hidden: a display:none textarea cannot be selected.
      ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      setResult(ok ? "copied" : "failed");
    } catch {
      setResult("failed");
    }
  };

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : result === "failed" ? "Couldn't copy" : "Copy this answer"}
      title={copied ? "Copied" : result === "failed" ? "Couldn't copy — select and copy manually" : "Copy"}
      onClick={copy}
      className={`rounded-md border px-1.5 py-1 leading-none transition-colors cursor-pointer ${
        copied
          ? "border-success text-success"
          : result === "failed"
            ? "border-fail text-fail"
            : "border-transparent text-muted hover:text-foreground"
      }`}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5l3.5 3.5 7-7.5" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
          <rect x="7" y="7" width="8.5" height="8.5" rx="1.6" />
          <path strokeLinecap="round" d="M12.5 4.5H5.6A1.1 1.1 0 004.5 5.6v6.9" />
        </svg>
      )}
    </button>
  );
}

function needsKeyMessage(err: string): string {
  if (/402|api key/i.test(err)) {
    return "I need an Anthropic API key on your account before I can answer.";
  }
  return err || "Something went wrong. Try again.";
}
