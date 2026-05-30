"use client";

import { useState, useCallback, useRef } from "react";

// Hide raw [[IMG:...]] image tokens from the live view. During streaming the model emits these
// markers; the server resolves each to a real image and pushes an incremental "image" event the
// moment it's ready (and a final "enriched" payload at the end). Tokens not yet resolved stay hidden.
function hideImageTokens(text: string): string {
  return text.replace(/\[\[(?:IMG|HERO):[^\]]*\]\]/g, "");
}

// Apply the image replacements received so far (token -> markdown), then hide any tokens still pending.
// Using split/join avoids $-substitution pitfalls of String.replace with arbitrary markdown.
function applyImages(text: string, replacements: Map<string, string>): string {
  let out = text;
  for (const [token, markdown] of replacements) {
    out = out.split(token).join(markdown);
  }
  return hideImageTokens(out);
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
      // token -> resolved image markdown, filled by incremental "image" events during the stream.
      const imageReplacements = new Map<string, string>();
      let enrichedArrived = false;

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
                  enrichedArrived = true;
                  imageReplacements.clear();
                  setText(accumulated);
                  continue;
                } else if (parsed.image) {
                  // An image resolved mid-stream — surface it immediately in place of its token.
                  imageReplacements.set(parsed.image.token, parsed.image.markdown || "");
                } else if (parsed.t) {
                  accumulated += parsed.t;
                } else if (parsed.error) {
                  accumulated += `\n\n**Error:** ${parsed.error}`;
                }
              } catch {
                // Fallback for non-JSON data
                accumulated += data;
              }
              setText(applyImages(accumulated, imageReplacements));
            }
          }
        }

        setIsStreaming(false);
        // Final persisted text: the server's enriched payload if it arrived, otherwise the streamed
        // text with whatever images resolved applied and any remaining raw tokens stripped.
        const finalText = enrichedArrived ? accumulated : applyImages(accumulated, imageReplacements);
        accumulated = finalText;
        setText(finalText);
        return finalText;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          // Intentional abort, don't treat as error
          setIsStreaming(false);
          return applyImages(accumulated, imageReplacements);
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
