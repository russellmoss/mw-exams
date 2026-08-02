"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Client half of `lib/thinking-stream.ts`.
 *
 * Consumes a GET SSE endpoint that emits `status` / `thinking` / `result` / `error` events and
 * exposes them as React state so a long generation renders as visible work instead of a frozen
 * spinner. `run()` resolves with the endpoint's `result` payload (or null if it failed/aborted),
 * so call sites read almost exactly like the plain `fetch(...).json()` they replace.
 *
 * `fetch` + a stream reader rather than `EventSource`: EventSource can't surface the HTTP status,
 * and auth failures on these routes come back as a normal 401/403 JSON response, not a stream.
 */
export interface ProgressStream {
  /** Most recent phase label — always safe to display, never contains wine names. */
  status: string | null;
  /** Every phase label so far, in order. Shown in the expanded trace. */
  statuses: string[];
  /** The model's summarized reasoning so far. MAY name the wines — gate it behind a spoiler. */
  thinking: string;
  active: boolean;
  error: string | null;
  run: <T>(url: string) => Promise<T | null>;
  reset: () => void;
}

export function useProgressStream(): ProgressStream {
  const [statuses, setStatuses] = useState<string[]>([]);
  const [thinking, setThinking] = useState("");
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatuses([]);
    setThinking("");
    setActive(false);
    setError(null);
  }, []);

  const run = useCallback(async <T,>(url: string): Promise<T | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatuses([]);
    setThinking("");
    setError(null);
    setActive(true);

    let result: T | null = null;
    // Thinking arrives as many tiny deltas; appending straight to state would re-render per token.
    // Accumulate locally and flush on a short interval instead.
    let thinkingBuf = "";
    let pending = false;
    const flush = () => {
      pending = false;
      setThinking(thinkingBuf);
    };

    try {
      const res = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // SSE frames can straddle chunk boundaries, so hold the incomplete tail between reads.
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data: ")) continue; // heartbeats / blank separators
          const payload = line.slice(6);
          if (payload === "[DONE]") continue;
          let event: { type?: string; label?: string; delta?: string; data?: unknown; message?: string };
          try {
            event = JSON.parse(payload);
          } catch {
            continue;
          }
          if (event.type === "status" && event.label) {
            setStatuses((prev) => [...prev, event.label as string]);
          } else if (event.type === "thinking" && event.delta) {
            thinkingBuf += event.delta;
            if (!pending) {
              pending = true;
              setTimeout(flush, 80);
            }
          } else if (event.type === "result") {
            result = event.data as T;
          } else if (event.type === "error") {
            setError(event.message || "Generation failed");
          }
        }
      }
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "Generation failed");
      }
    } finally {
      flush();
      setActive(false);
      if (abortRef.current === controller) abortRef.current = null;
    }

    return result;
  }, []);

  return {
    status: statuses.length ? statuses[statuses.length - 1] : null,
    statuses,
    thinking,
    active,
    error,
    run,
    reset,
  };
}
