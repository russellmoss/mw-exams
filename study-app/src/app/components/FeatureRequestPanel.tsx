"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface ThreadTurn {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
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
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/feature-request");
      if (res.ok) {
        const data = await res.json();
        setList(data.featureRequests || []);
      }
    } catch {}
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Poll while anything is building so status flips to built/pr_opened/failed without a manual refresh.
  useEffect(() => {
    if (!list.some((f) => f.status === "building")) return;
    const t = setInterval(refresh, 10000);
    return () => clearInterval(t);
  }, [list, refresh]);

  // Keep the conversation scrolled to the newest turn.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [current?.thread.length, busy]);

  const startNew = () => {
    setCurrent(null);
    setInput("");
    setError(null);
    setOpen(true);
  };

  const openExisting = (fr: FeatureRequestView) => {
    setCurrent(fr);
    setInput("");
    setError(null);
    setOpen(true);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body = current
        ? { action: "reply", id: current.id, message: text }
        : { action: "start", request: text };
      const res = await fetch("/api/admin/feature-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "Failed"); return; }
      setCurrent(data.featureRequest);
      setInput("");
      refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  };

  const build = async (id: number, action: "confirm" | "build-now") => {
    setBusy(true);
    setError(null);
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
        <button
          onClick={startNew}
          className="shrink-0 text-sm px-4 py-2 bg-accent hover:bg-accent-hover text-background rounded-lg transition-colors font-medium cursor-pointer"
        >
          + New feature request
        </button>
      </div>
      <p className="text-xs text-muted mb-4 max-w-xl">
        Describe a feature in plain language. Claude asks a few questions, proposes how it will look and
        work, and — once you click <span className="font-semibold">Build it</span> — builds it for you.
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
                {fr.pr_url && (
                  <a href={fr.pr_url} target="_blank" rel="noreferrer" className="text-[11px] text-borderline underline">PR</a>
                )}
                {fr.commit_sha && (
                  <span className="text-[11px] text-muted font-mono">{fr.commit_sha.slice(0, 7)}</span>
                )}
                <span className="text-[11px] text-muted ml-auto">{new Date(fr.updated_at).toLocaleString()}</span>
              </div>
              {(fr.status === "ready" || fr.status === "proposed" || fr.status === "failed") && (
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => build(fr.id, "build-now")}
                    disabled={busy || !fr.hasSpec}
                    className="text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover text-background rounded-md font-medium cursor-pointer disabled:opacity-50"
                  >
                    Build now
                  </button>
                  <button onClick={() => openExisting(fr)} className="text-xs px-3 py-1.5 border border-border rounded-md text-muted hover:text-foreground cursor-pointer">
                    Open
                  </button>
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

      {/* Conversation modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-2xl bg-card rounded-xl border border-border shadow-2xl flex flex-col max-h-[85vh]">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">{current ? (current.title || `Feature #${current.id}`) : "New feature request"}</h3>
                {current && <StatusBadge status={current.status} />}
              </div>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground cursor-pointer p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
              {!current && (
                <p className="text-sm text-muted">Tell Claude what you&apos;d like to add — what it should do and roughly where it fits. It&apos;ll ask a couple of questions, then propose how it&apos;ll look and work.</p>
              )}
              {current?.thread.map((t, i) => (
                <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${t.role === "user" ? "bg-accent/15 text-foreground" : "bg-background border border-border/60 text-foreground/90"}`}>
                    {t.content}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 text-muted px-2">
                    <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
                    <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
                    <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
                  </div>
                </div>
              )}
            </div>

            {error && <p className="px-5 text-xs text-fail">{error}</p>}

            <div className="p-4 border-t border-border space-y-3">
              {current?.readyToBuild && (
                <button
                  onClick={() => build(current.id, "confirm")}
                  disabled={busy}
                  className="w-full px-4 py-2.5 bg-accent hover:bg-accent-hover text-background rounded-lg font-semibold cursor-pointer disabled:opacity-50"
                >
                  {autoFeature ? "Build it" : "Save for build"}
                </button>
              )}
              <div className="flex gap-2">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }}
                  placeholder={current ? "Reply…  (⌘/Ctrl+Enter to send)" : "Describe the feature you want…"}
                  className="flex-1 min-h-[64px] bg-background border border-border rounded-lg p-3 text-sm text-foreground resize-y placeholder:text-muted/50 focus:outline-none focus:border-accent/60"
                />
                <button
                  onClick={send}
                  disabled={busy || !input.trim()}
                  className="self-end px-5 py-2.5 bg-accent hover:bg-accent-hover text-background rounded-lg font-medium cursor-pointer disabled:opacity-50"
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
