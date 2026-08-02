"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { useDraft } from "@/lib/use-draft";

interface Mockup { title: string; html: string }
interface ThreadTurn {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  mockups?: Mockup[];
}
interface FeatureRequestView {
  id: number;
  title: string | null;
  status: string;
  thread: ThreadTurn[];
  message: string;
  readyToBuild: boolean;
  hasSpec: boolean;
  technicalSpec: string | null;
  apply_status: string | null;
  work_branch: string | null;
  commit_sha: string | null;
  pr_url: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_STYLE: Record<string, string> = {
  drafting: "bg-muted/20 text-muted",
  clarifying: "bg-accent/15 text-accent",
  proposed: "bg-accent/20 text-accent",
  ready: "bg-borderline/20 text-borderline",
  building: "bg-accent/20 text-accent",
  built: "bg-success/20 text-success",
  pr_opened: "bg-borderline/20 text-borderline",
  failed: "bg-fail/20 text-fail",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_STYLE[status] || "bg-muted/20 text-muted"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function FeatureRequestPanel({ autoFeature }: { autoFeature: boolean }) {
  const [list, setList] = useState<FeatureRequestView[]>([]);
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState<FeatureRequestView | null>(null);
  // Unsent text survives closing the modal / reloading, per conversation. A
  // brand-new request (no id yet) keeps its own "new" draft.
  const [input, setInput] = useDraft(
    `feature-request:${current?.id && current.id > 0 ? current.id : "new"}`
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveText, setLiveText] = useState("");
  const [activeMockups, setActiveMockups] = useState<Mockup[] | null>(null);
  const [mockupIndex, setMockupIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/feature-request");
      if (res.ok) setList((await res.json()).featureRequests || []);
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!list.some((f) => f.status === "building")) return;
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [list, refresh]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [current?.thread.length, liveText, busy]);

  const latestMockups = (fr: FeatureRequestView | null): Mockup[] | null => {
    const turn = [...(fr?.thread ?? [])].reverse().find((t) => t.role === "assistant" && t.mockups?.length);
    return turn?.mockups ?? null;
  };

  // Drafts are keyed off `current`, so switching threads swaps the box contents
  // in for us — don't clear the input here or we'd bin what the user typed.
  const startNew = () => { setCurrent(null); setError(null); setActiveMockups(null); setMockupIndex(0); setOpen(true); };
  const openExisting = (fr: FeatureRequestView) => {
    setCurrent(fr); setError(null);
    const mk = latestMockups(fr); setActiveMockups(mk); setMockupIndex(0);
    setOpen(true);
  };
  const showMockups = (mk: Mockup[]) => { setActiveMockups(mk); setMockupIndex(0); };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true); setError(null); setInput(""); setLiveText("");

    const baseThread = current?.thread ?? [];
    const userTurn: ThreadTurn = { role: "user", content: text };
    const baseId = current?.id && current.id > 0 ? current.id : null;
    const rollback = current;
    setCurrent((c) =>
      c
        ? { ...c, thread: [...baseThread, userTurn] }
        : { id: -1, title: text.slice(0, 80), status: "drafting", thread: [userTurn], message: "", readyToBuild: false, hasSpec: false, technicalSpec: null, apply_status: null, work_branch: null, commit_sha: null, pr_url: null, created_at: "", updated_at: "" }
    );

    try {
      const body = baseId ? { action: "reply", id: baseId, message: text } : { action: "start", request: text };
      const res = await fetch("/api/admin/feature-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        // The route saves the user turn before it starts streaming, so a
        // non-streaming failure means nothing was persisted — undo the
        // optimistic turn and hand the text back so it isn't lost.
        const e = await res.json().catch(() => ({}));
        setError(e.error || "Failed");
        setCurrent(rollback);
        setInput(text);
        setBusy(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      let meta: { id: number; status: string; readyToBuild: boolean; title: string | null; mockups: Mockup[] } | null = null;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload);
            if (typeof obj.t === "string") { acc += obj.t; setLiveText(acc); }
            else if (obj.meta) meta = obj.meta;
            else if (obj.error) setError(obj.error);
          } catch {}
        }
      }

      const assistantTurn: ThreadTurn = { role: "assistant", content: acc, ...(meta?.mockups?.length ? { mockups: meta.mockups } : {}) };
      setCurrent((c) => ({
        ...(c as FeatureRequestView),
        id: meta?.id ?? (c?.id ?? -1),
        title: meta?.title ?? c?.title ?? null,
        status: meta?.status ?? c?.status ?? "clarifying",
        readyToBuild: meta?.readyToBuild ?? false,
        hasSpec: meta?.readyToBuild ?? (c?.hasSpec ?? false),
        thread: [...baseThread, userTurn, assistantTurn],
      }));
      if (meta?.mockups?.length) showMockups(meta.mockups);
      setLiveText("");
      refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  const build = async (id: number, action: "confirm" | "build-now") => {
    if (id <= 0) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/feature-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); return; }
      setCurrent(data.featureRequest);
      await refresh();
      if (data.dispatched) setOpen(false);
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="feature-request" className="bg-card rounded-xl border border-border p-5 mb-8 scroll-mt-6">
      <div className="flex items-center justify-between gap-4 mb-1">
        <h2 className="font-bold text-foreground">Feature Request</h2>
        <button onClick={startNew} className="shrink-0 text-sm px-4 py-2 bg-accent hover:bg-accent-hover text-background rounded-lg transition-colors font-medium cursor-pointer">
          + New feature request
        </button>
      </div>
      <p className="text-xs text-muted mb-4 max-w-xl">
        Describe a feature in plain language. Claude asks a few questions, shows you a mockup of how it
        will look and work, and — once you click <span className="font-semibold">Build it</span> — builds it.
        {autoFeature ? " Auto-Feature is ON: Build it ships it." : " Auto-Feature is OFF: Build it saves the spec; use Build now to ship."}
      </p>

      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((fr) => (
            <div key={fr.id} className="bg-background rounded-lg border border-border/60 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <button onClick={() => openExisting(fr)} className="text-sm font-medium text-foreground hover:text-accent transition-colors cursor-pointer text-left">
                  {fr.title || `Feature #${fr.id}`}
                </button>
                <StatusBadge status={fr.status} />
                {fr.pr_url && <a href={fr.pr_url} target="_blank" rel="noreferrer" className="text-[11px] text-borderline underline">PR</a>}
                {fr.commit_sha && <span className="text-[11px] text-muted font-mono">{fr.commit_sha.slice(0, 7)}</span>}
                <span className="text-[11px] text-muted ml-auto">{fr.updated_at ? new Date(fr.updated_at).toLocaleString() : ""}</span>
              </div>
              {(fr.status === "ready" || fr.status === "proposed" || fr.status === "failed") && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => build(fr.id, "build-now")} disabled={busy || !fr.hasSpec} className="text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover text-background rounded-md font-medium cursor-pointer disabled:opacity-50">Build now</button>
                  <button onClick={() => openExisting(fr)} className="text-xs px-3 py-1.5 border border-border rounded-md text-muted hover:text-foreground cursor-pointer">Open</button>
                </div>
              )}
              {fr.technicalSpec && (
                <details className="mt-2">
                  <summary className="text-[11px] text-muted cursor-pointer hover:text-foreground">Technical spec (internal — for debugging)</summary>
                  <pre className="mt-1 text-[11px] text-foreground/70 whitespace-pre-wrap bg-card rounded p-2 border border-border/50 max-h-60 overflow-y-auto">{fr.technicalSpec}</pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Conversation modal — claude.ai-style: chat + artifact preview */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className={`relative w-full ${activeMockups?.length ? "max-w-6xl" : "max-w-2xl"} bg-card rounded-xl border border-border shadow-2xl flex flex-col max-h-[88vh]`}>
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{current ? (current.title || `Feature #${current.id}`) : "New feature request"}</h3>
                {current && <StatusBadge status={current.status} />}
              </div>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground cursor-pointer p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex flex-col lg:flex-row flex-1 min-h-0">
              {/* Chat column */}
              <div className={`flex flex-col min-h-0 ${activeMockups?.length ? "lg:w-1/2 lg:border-r border-border" : "w-full"}`}>
                <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
                  {!current && (
                    <p className="text-sm text-muted">Tell Claude what you&apos;d like to add — what it should do and roughly where it fits. It&apos;ll ask a couple of questions, then show you a mockup before anything is built.</p>
                  )}
                  {current?.thread.map((t, i) => (
                    <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[90%] rounded-xl px-4 py-2.5 text-sm ${t.role === "user" ? "bg-accent/15 text-foreground" : "bg-background border border-border/60 text-foreground/90"}`}>
                        {t.role === "assistant" ? (
                          <div className="markdown-content text-sm"><ReactMarkdown>{t.content}</ReactMarkdown></div>
                        ) : (
                          <span className="whitespace-pre-wrap">{t.content}</span>
                        )}
                        {t.role === "assistant" && t.mockups?.length ? (
                          <button onClick={() => showMockups(t.mockups!)} className="mt-2 text-xs text-accent hover:text-accent-hover underline cursor-pointer">
                            View {t.mockups.length === 1 ? "mockup" : `${t.mockups.length}-screen flow`} →
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                  {busy && (
                    <div className="flex justify-start">
                      <div className="max-w-[90%] rounded-xl px-4 py-2.5 text-sm bg-background border border-border/60 text-foreground/90">
                        {liveText ? (
                          <div className="markdown-content text-sm"><ReactMarkdown>{liveText}</ReactMarkdown></div>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-muted">
                            <span className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                            <span className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
                            <span className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {error && <p className="px-5 text-xs text-fail">{error}</p>}

                <div className="p-4 border-t border-border space-y-3">
                  {current?.readyToBuild && current.id > 0 && (
                    <button onClick={() => build(current.id, "confirm")} disabled={busy} className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-background rounded-lg font-semibold cursor-pointer disabled:opacity-50">
                      {autoFeature ? "Build it" : "Save for build"}
                    </button>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
                      placeholder={current ? "Reply…  (⌘/Ctrl+Enter to send)" : "Describe the feature you want…"}
                      disabled={busy}
                      className="flex-1 min-h-[60px] bg-background border border-border rounded-lg p-3 text-sm text-foreground resize-y placeholder:text-muted/50 focus:outline-none focus:border-accent/60 disabled:opacity-60"
                    />
                    <button onClick={send} disabled={busy || !input.trim()} className="self-end px-5 py-2.5 bg-accent hover:bg-accent-hover text-background rounded-lg font-medium cursor-pointer disabled:opacity-50">Send</button>
                  </div>
                </div>
              </div>

              {/* Artifact / mockup preview pane */}
              {activeMockups?.length ? (
                <div className="lg:w-1/2 flex flex-col min-h-0 border-t lg:border-t-0 border-border">
                  <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-foreground truncate">
                      {activeMockups[mockupIndex]?.title || "Mockup"}
                      {activeMockups.length > 1 && <span className="text-muted font-normal"> · screen {mockupIndex + 1} of {activeMockups.length}</span>}
                    </span>
                    {activeMockups.length > 1 && (
                      <span className="flex gap-1 shrink-0">
                        <button onClick={() => setMockupIndex((i) => Math.max(0, i - 1))} disabled={mockupIndex === 0} className="text-xs px-2 py-1 border border-border rounded text-muted hover:text-foreground disabled:opacity-40 cursor-pointer">←</button>
                        <button onClick={() => setMockupIndex((i) => Math.min(activeMockups.length - 1, i + 1))} disabled={mockupIndex === activeMockups.length - 1} className="text-xs px-2 py-1 border border-border rounded text-muted hover:text-foreground disabled:opacity-40 cursor-pointer">→</button>
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-h-[360px] bg-background p-2">
                    <iframe
                      key={mockupIndex}
                      sandbox=""
                      srcDoc={activeMockups[mockupIndex]?.html || ""}
                      title={activeMockups[mockupIndex]?.title || "Mockup"}
                      className="w-full h-full min-h-[360px] rounded-lg border border-border bg-background"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
