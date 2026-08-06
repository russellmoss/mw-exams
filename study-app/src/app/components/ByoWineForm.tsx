"use client";

import { useState } from "react";

type WineRow = { producer: string; wineName: string; vintage: string; country: string; region: string; price: string };

const EMPTY: WineRow = { producer: "", wineName: "", vintage: "", country: "", region: "", price: "" };

/**
 * BYO wine entry (migration 043) — used in two places with different auth:
 *  - the candidate's session page (posts to /api/live-tasting/[id]/wines — reveals the wines)
 *  - the no-auth partner page (posts to /api/shop/[token]/wines — keeps the candidate blind)
 * The endpoint streams SSE progress while the question generates (~2-3 minutes).
 */
export function ByoWineForm({
  endpoint,
  defaultCount,
  onDone,
}: {
  endpoint: string;
  defaultCount: number;
  onDone: () => void;
}) {
  const [rows, setRows] = useState<WineRow[]>(
    Array.from({ length: Math.min(4, Math.max(2, defaultCount)) }, () => ({ ...EMPTY }))
  );
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setField = (i: number, k: keyof WineRow, v: string) =>
    setRows((r) => r.map((row, j) => (j === i ? { ...row, [k]: v } : row)));

  const valid = rows.every(
    (r) => r.producer.trim().length >= 2 && r.country.trim() &&
      (/^(19|20)\d{2}$/.test(r.vintage.trim()) || r.vintage.trim().toUpperCase() === "NV" || r.vintage.trim() === "")
  );

  const submit = async () => {
    setError(null);
    setBusy(true);
    setProgress("Submitting the wines…");
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wines: rows.map((r) => ({
            producer: r.producer,
            wineName: r.wineName,
            vintage: r.vintage.trim() || "NV",
            country: r.country,
            region: r.region || undefined,
            price: r.price.trim() ? Number(r.price) : undefined,
          })),
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ok = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line || line === "data: [DONE]") continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "status" && evt.label) setProgress(evt.label);
            if (evt.type === "error") throw new Error(evt.message);
            if (evt.type === "result") ok = true;
          } catch (e) {
            if (e instanceof Error && e.message && !e.message.includes("JSON")) throw e;
          }
        }
      }
      if (!ok) throw new Error("Generation ended unexpectedly — please try again.");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
      setProgress(null);
    }
  };

  if (busy) {
    return (
      <div className="flex items-center gap-3 text-muted py-4">
        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" />
        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.3s" }} />
        <div className="w-2 h-2 rounded-full bg-accent/50 streaming-dot" style={{ animationDelay: "0.6s" }} />
        <span className="ml-2 text-sm">{progress}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="bg-fail/10 border border-fail/30 rounded-lg p-3">
          <p className="text-sm text-fail">{error}</p>
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} className="bg-background rounded-lg border border-border p-4">
          <p className="text-sm font-medium text-foreground mb-3">
            <span className="text-muted tabular-nums mr-2">#{i + 1}</span>Wine {i + 1}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text" value={row.producer} placeholder="Producer (e.g. Louis Jadot)"
              onChange={(e) => setField(i, "producer", e.target.value)}
              className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm"
            />
            <input
              type="text" value={row.wineName} placeholder="Wine / cuvée (e.g. Pouilly-Fuissé)"
              onChange={(e) => setField(i, "wineName", e.target.value)}
              className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text" value={row.vintage} placeholder="Vintage or NV" maxLength={4}
                onChange={(e) => setField(i, "vintage", e.target.value)}
                className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm tabular-nums"
              />
              <input
                type="number" value={row.price} placeholder="Price" min="0"
                onChange={(e) => setField(i, "price", e.target.value)}
                className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm tabular-nums"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text" value={row.region} placeholder="Region (optional)"
                onChange={(e) => setField(i, "region", e.target.value)}
                className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm"
              />
              <input
                type="text" value={row.country} placeholder="Country"
                onChange={(e) => setField(i, "country", e.target.value)}
                className="px-3 py-2 bg-card border border-border rounded-lg text-foreground placeholder-muted focus:outline-none focus:border-accent text-sm"
              />
            </div>
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        {rows.length < 4 && (
          <button
            onClick={() => setRows((r) => [...r, { ...EMPTY }])}
            className="px-4 py-2 border border-border text-muted hover:text-foreground hover:border-muted rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            + Add a wine
          </button>
        )}
        {rows.length > 2 && (
          <button
            onClick={() => setRows((r) => r.slice(0, -1))}
            className="px-4 py-2 border border-border text-muted hover:text-foreground hover:border-muted rounded-lg text-sm font-medium transition-colors cursor-pointer"
          >
            Remove last
          </button>
        )}
        <button
          onClick={submit}
          disabled={!valid}
          className="ml-auto px-6 py-2.5 bg-accent hover:bg-accent-hover text-background font-semibold rounded-lg transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Create the question
        </button>
      </div>
      <p className="text-xs text-muted">
        Producer, country and vintage (or NV) are required. The question takes 2–3 minutes to
        build — the wines get researched for tasting notes while you wait.
      </p>
    </div>
  );
}
