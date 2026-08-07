"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { usePathname } from "next/navigation";
import { useProgressStream } from "@/lib/use-progress-stream";
import { useFeedbackPanelState } from "@/lib/feedback-context";
import { capturePage, type Capture } from "@/lib/coach/capture";
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

/** Rough USD for a Sonnet turn. Indicative only — the Cost dashboard holds the real accounting. */
function estimateUsd(u: CoachResult["usage"]): number {
  return (
    (u.input * 3 + u.output * 15 + u.cacheWrite * 3.75 + u.cacheRead * 0.3) / 1_000_000
  );
}

export function CoachChat() {
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

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
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
      });

      if (!result) {
        // BYOK: 402 means "no Anthropic key on this account", which is a setup step rather than a
        // failure — surface the fix, not the status code.
        const err = stream.errorRef.current || "";
        if (/402|api key/i.test(err)) setNeedsKey(true);
        setTurns((t) => [
          ...t,
          { role: "assistant", text: needsKeyMessage(err) },
        ]);
        return;
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
    },
    [busy, conversationId, stream, context, pathname, shot]
  );

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
                {t.messageId != null && (
                  <div className="flex items-center gap-1.5 pt-0.5">
                    {(["up", "down"] as const).map((r) => (
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

function needsKeyMessage(err: string): string {
  if (/402|api key/i.test(err)) {
    return "I need an Anthropic API key on your account before I can answer.";
  }
  return err || "Something went wrong. Try again.";
}
