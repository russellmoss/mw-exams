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
  /** For rendering. Re-read every render, so always current in JSX. */
  error: string | null;
  /**
   * The same value, in a ref — read this from inside a `useCallback`.
   * `error` is captured by the closure when the callback is created, so a callback that awaits
   * `run()` and then inspects `error` sees the value from BEFORE the stream ran (i.e. null) and
   * would silently swallow the server's message. The ref object is stable, so `.current` is live.
   */
  errorRef: React.RefObject<string | null>;
  /**
   * Open the stream and resolve with its `result` payload (null on failure/abort).
   * Pass `body` to POST it as JSON; omit for a GET.
   *
   * `onDelta` receives each thinking delta as it arrives, unbatched. State updates are throttled to
   * 80ms because re-rendering per token is wasteful for DISPLAY — but the Coach's voice mode needs
   * every delta the moment it lands, to cut sentences for text-to-speech while the answer is still
   * being written. Waiting for the resolved result would mean silence for the length of a turn.
   */
  run: <T>(
    url: string,
    body?: unknown,
    opts?: { timeoutMs?: number; onDelta?: (delta: string) => void }
  ) => Promise<T | null>;
  reset: () => void;
}

export function useProgressStream(): ProgressStream {
  const [statuses, setStatuses] = useState<string[]>([]);
  const [thinking, setThinking] = useState("");
  const [active, setActive] = useState(false);
  const [error, setErrorState] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Mirrors `error` so callbacks can read it after awaiting `run()` (see errorRef above).
  const errorRef = useRef<string | null>(null);
  const setError = useCallback((e: string | null) => {
    errorRef.current = e;
    setErrorState(e);
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatuses([]);
    setThinking("");
    setActive(false);
    setError(null);
  }, [setError]);

  const run = useCallback(async <T,>(
    url: string,
    body?: unknown,
    opts?: { timeoutMs?: number; onDelta?: (delta: string) => void }
  ): Promise<T | null> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // Safety net only. Progress events flow continuously, so a slow generation no longer needs a
    // tight client deadline to stay believable — this exists to stop a genuinely wedged connection
    // hanging forever, not to bound normal work.
    const timer = opts?.timeoutMs ? setTimeout(() => controller.abort(), opts.timeoutMs) : null;
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
        method: body === undefined ? "GET" : "POST",
        headers:
          body === undefined
            ? { Accept: "text/event-stream" }
            : { Accept: "text/event-stream", "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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
            // Unbatched, before the throttle: voice cuts sentences off this.
            opts?.onDelta?.(event.delta);
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
      if (timer) clearTimeout(timer);
      flush();
      setActive(false);
      if (abortRef.current === controller) abortRef.current = null;
    }

    return result;
  }, [setError]);

  return {
    status: statuses.length ? statuses[statuses.length - 1] : null,
    statuses,
    thinking,
    active,
    error,
    errorRef,
    run,
    reset,
  };
}
