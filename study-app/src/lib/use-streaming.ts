"use client";

import { useState, useCallback, useRef } from "react";

// Hide raw [[IMG:...]] image tokens from the live view. During streaming the model emits these
// markers; the server replaces them with real images and sends a final "enriched" payload. Until
// that lands we just suppress the tokens so the user never sees the raw markup.
function hideImageTokens(text: string): string {
  return text.replace(/\[\[IMG:[^\]]*\]\]/g, "");
}

interface UseStreamingResult {
  text: string;
  isStreaming: boolean;
  error: string | null;
  startStream: (url: string, body: Record<string, unknown>) => Promise<string>;
  reset: () => void;
}

export function useStreaming(): UseStreamingResult {
  const [text, setText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setText("");
    setIsStreaming(false);
    setError(null);
  }, []);

  const startStream = useCallback(
    async (url: string, body: Record<string, unknown>): Promise<string> => {
      reset();
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let accumulated = "";

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`API error ${response.status}: ${errBody}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // Parse SSE format: lines starting with "data: "
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.enriched) {
                  // Authoritative final text from the server: image tokens already replaced with
                  // real images. Use it verbatim (this is what gets persisted).
                  accumulated = parsed.enriched;
                } else if (parsed.t) {
                  accumulated += parsed.t;
                } else if (parsed.error) {
                  accumulated += `\n\n**Error:** ${parsed.error}`;
                }
              } catch {
                // Fallback for non-JSON data
                accumulated += data;
              }
              setText(hideImageTokens(accumulated));
            }
          }
        }

        setIsStreaming(false);
        // If the enriched payload never arrived (e.g. error before it), make sure no raw tokens leak
        // into the persisted text.
        accumulated = hideImageTokens(accumulated);
        setText(accumulated);
        return accumulated;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // Intentional abort, don't treat as error
          setIsStreaming(false);
          return accumulated;
        }
        const message = err instanceof Error ? err.message : "Unknown error";
        setError(message);
        setIsStreaming(false);
        return accumulated;
      }
    },
    [reset]
  );

  return { text, isStreaming, error, startStream, reset };
}
