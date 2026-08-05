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
import { isReasoningEnabled } from "@/lib/settings";
import { supportsAdaptiveThinking } from "@/lib/model-capabilities";

// Re-exported so every existing importer keeps working. The predicate itself moved to
// model-capabilities.ts — it is a pure fact about a model id, and callers that only size max_tokens
// from it should not have to pull in this module's settings/database dependencies.
export { supportsAdaptiveThinking };

export type ProgressEvent =
  | { type: "status"; label: string }
  | { type: "thinking"; delta: string }
  | { type: "result"; data: unknown }
  | { type: "error"; message: string };

export type ProgressEmitter = (event: ProgressEvent) => void;

/** Reasoning depth. Every model on the adaptive-thinking list accepts at least low/medium/high. */
export type ReasoningEffort = "low" | "medium" | "high";

/**
 * The request fragment that turns visible reasoning on.
 *
 * `display: "summarized"` is required — the default on Opus 4.7+/Sonnet 5 is `"omitted"`, which
 * still streams thinking blocks but with empty text (i.e. a long silent pause, exactly the problem
 * we're fixing).
 *
 * `effort` defaults to `"low"`, which is right for the callers that stream reasoning purely as a
 * progress signal (the graders, tasting notes) — there it is a liveness cue, not a capability
 * upgrade, and the extra depth would only add latency to a short response. Callers whose OUTPUT
 * quality depends on the reasoning pass their own; question generation uses `medium` on both its
 * streaming and non-streaming paths, so a drill and a study question are generated identically.
 */
export function thinkingParams(
  model: string,
  effort: ReasoningEffort = "low"
): Record<string, unknown> {
  if (!supportsAdaptiveThinking(model)) return {};
  return {
    thinking: { type: "adaptive", display: "summarized" },
    output_config: { effort },
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

// Short in-memory cache so the hot generation path doesn't read app_settings on every model call.
// Mirrors the A/B model-selector cache; an admin save invalidates the instance that handled it
// immediately, and other serverless instances pick the change up within the TTL.
let reasoningCache: { enabled: boolean; at: number } | null = null;
const REASONING_TTL_MS = 30_000;

export function invalidateReasoningCache(): void {
  reasoningCache = null;
}

/**
 * The admin kill switch for visible reasoning (see settings.isReasoningEnabled).
 *
 * Fails OPEN — to the last known value, else to enabled. A database blip must not silently change
 * how questions are generated; the REASONING_HARD_DISABLE env override is the switch that works
 * without the database, and is the one to reach for in an emergency.
 */
export async function reasoningEnabled(): Promise<boolean> {
  if (process.env.REASONING_HARD_DISABLE === "1") return false;
  if (reasoningCache && Date.now() - reasoningCache.at < REASONING_TTL_MS) {
    return reasoningCache.enabled;
  }
  try {
    const enabled = await isReasoningEnabled();
    reasoningCache = { enabled, at: Date.now() };
    return enabled;
  } catch {
    return reasoningCache?.enabled ?? true;
  }
}

/**
 * `thinkingParams`, gated by the admin toggle. Returns `{}` when reasoning is switched off.
 *
 * Note what that empty return means for a caller that relies on the `effort` inside: switching
 * reasoning off also drops the effort, restoring the API default of `high`. A caller for whom that
 * matters must re-apply effort itself — see callGenerationModel, where the default is a 164s call.
 */
export async function resolveThinking(
  model: string,
  effort: ReasoningEffort = "low"
): Promise<Record<string, unknown>> {
  if (!(await reasoningEnabled())) return {};
  return thinkingParams(model, effort);
}

/**
 * Thinking config for a route that ALREADY streams its answer text over SSE (the graders).
 *
 * Returns the extra request fields plus a `max_tokens` grown to cover the reasoning, since
 * `max_tokens` caps thinking and response together — leaving the original value would silently
 * truncate the feedback the candidate reads. On a model without adaptive thinking it returns just
 * the untouched `max_tokens`, so the call is unchanged.
 */
export async function withThinking(
  model: string,
  maxTokens: number
): Promise<Record<string, unknown>> {
  const params = await resolveThinking(model);
  if (!Object.keys(params).length) return { max_tokens: maxTokens };
  // Doubling is right for the prose graders, whose budgets (1500-4000) leave ample room either
  // way. A route with a *small* budget should NOT use this helper — see flash-notes/grade, where
  // 400 tokens of headroom could truncate the JSON and turn a slow answer into a parse failure.
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
