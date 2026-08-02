// thinking-stream.ts — the shared "show your working" layer.
//
// Long AI generations (a Stem Sniper drill takes 20-60s through the engine's validate-and-retry
// loop) used to render as a single dead "Loading drill…" line. Nothing was broken — there was just
// no signal, so a working request looked hung. This module is the one place that turns a long
// server-side generation into a live SSE feed of two kinds of event:
//
//   • `status` — a short, SAFE phase label emitted by our own code ("Drafting the flight…",
//     "Validating marks…"). Never contains wine names, so it can always be shown.
//   • `thinking` — the model's own summarized reasoning, streamed token by token. This DOES name
//     the wines, so callers that hide the answer (Stem Sniper) must keep it behind a spoiler.
//
// Callers that don't pass an emitter keep the exact non-streaming behaviour they had before.

import type Anthropic from "@anthropic-ai/sdk";

export type ProgressEvent =
  | { type: "status"; label: string }
  | { type: "thinking"; delta: string }
  | { type: "result"; data: unknown }
  | { type: "error"; message: string };

export type ProgressEmitter = (event: ProgressEvent) => void;

/**
 * Models that accept `thinking: {type:"adaptive"}`. Deliberately an allow-list of exact ids rather
 * than a loose /opus/ match: adaptive thinking is Opus 4.6+ / Sonnet 4.6+ only, and sending it to
 * Haiku 4.5 (or an older Opus resolved by getLatestOpus) is a 400 that would kill the generation.
 */
export function supportsAdaptiveThinking(model: string): boolean {
  return /^claude-(opus-(4-6|4-7|4-8|5)|sonnet-(4-6|5)|fable-5|mythos-5)\b/.test(model);
}

/**
 * The request fragment that turns visible reasoning on.
 *
 * `display: "summarized"` is required — the default on Opus 4.7+/Sonnet 5 is `"omitted"`, which
 * still streams thinking blocks but with empty text (i.e. a long silent pause, exactly the problem
 * we're fixing). `effort: "low"` keeps the reasoning short: this is a progress signal, not a
 * capability upgrade, and the generation path runs against a hard wall-clock budget.
 */
export function thinkingParams(model: string): Record<string, unknown> {
  if (!supportsAdaptiveThinking(model)) return {};
  return {
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort: "low" },
  };
}

/**
 * `client.messages.create` with the thinking deltas forwarded to `emit`.
 *
 * Streams purely so the reasoning can be surfaced live; the return value is the same complete
 * `Message` a non-streaming call would give, so call sites parse it identically. Thinking config is
 * NOT added here — the caller adds `thinkingParams(model)` itself, because it also has to size
 * `max_tokens` for the extra thinking tokens (max_tokens caps thinking + response together).
 */
export async function streamWithThinking(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  options: { timeout?: number; maxRetries?: number },
  emit: ProgressEmitter
): Promise<Anthropic.Message> {
  const stream = client.messages.stream(params, options);
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "thinking_delta") {
      emit({ type: "thinking", delta: event.delta.thinking });
    }
  }
  return stream.finalMessage();
}

/**
 * Thinking config for a route that ALREADY streams its answer text over SSE (the graders).
 *
 * Returns the extra request fields plus a `max_tokens` grown to cover the reasoning, since
 * `max_tokens` caps thinking and response together — leaving the original value would silently
 * truncate the feedback the candidate reads. On a model without adaptive thinking it returns just
 * the untouched `max_tokens`, so the call is unchanged.
 */
export function withThinking(model: string, maxTokens: number): Record<string, unknown> {
  const params = thinkingParams(model);
  if (!Object.keys(params).length) return { max_tokens: maxTokens };
  return { max_tokens: maxTokens * 2, ...params };
}

/** SSE frame for one thinking delta on the graders' existing `{t: ...}` text stream. */
export function thinkingFrame(delta: string): string {
  return `data: ${JSON.stringify({ k: delta })}\n\n`;
}

/**
 * Wrap a long-running producer in a Server-Sent Events response.
 *
 * The producer emits progress as it goes and returns the final payload, which is sent as a
 * `result` event immediately before `[DONE]`. Every event is one `data:` line of JSON so the client
 * parser stays trivial. Enqueues are guarded because the browser can disconnect mid-generation
 * (navigate away, filter change) and writing to a closed controller throws.
 */
export function sseStream(produce: (emit: ProgressEmitter) => Promise<unknown>): Response {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true; // client went away — stop writing, let the producer finish quietly
        }
      };

      // Flush a comment immediately so proxies commit to the stream and the client's first
      // paint happens now rather than after the first real event (which can be ~10s away).
      try {
        controller.enqueue(encoder.encode(": open\n\n"));
      } catch {
        closed = true;
      }

      try {
        const data = await produce((event) => send(event));
        send({ type: "result", data });
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "Generation failed" });
      }
      if (!closed) {
        try {
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch {
          /* client gone */
        }
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Without this some proxies buffer the whole response and the stream arrives all at once —
      // which would reproduce the exact "looks stuck" bug this module exists to fix.
      "X-Accel-Buffering": "no",
    },
  });
}
