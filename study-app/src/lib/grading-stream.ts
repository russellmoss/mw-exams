import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "@/lib/api-key";
import { normalizeDictatedTerms, type Substitution } from "@/lib/dictation-normalizer";
import { selectModel, type ModelTier } from "@/lib/model-selector";
import { restyleForPersona } from "@/lib/persona-restyle";
import { needsRestyle, type PersonaId, type PersonaSurface } from "@/lib/personas";
import { thinkingFrame, withThinking } from "@/lib/thinking-stream";
import { logClaudeUsage } from "@/lib/usage-log";
import { loadWineTerms } from "@/lib/wine-terms";

export interface GradingRuntime {
  apiKey: string;
  source: "user" | "server";
  user: { id: number; isAdmin: boolean };
  model: string;
  abGroup: string | null;
}

export async function prepareGradingRuntime(
  request: Request,
  taskType: string,
  defaultTier: ModelTier
): Promise<GradingRuntime | Response> {
  const key = await requireApiKey(request);
  if (key instanceof Response) return key;
  const selected = await selectModel(taskType, key.apiKey, defaultTier);
  return {
    apiKey: key.apiKey,
    source: key.source,
    user: key.user,
    model: selected.model,
    abGroup: selected.abGroup,
  };
}

export function normalizeGradingAnswer(
  answer: string,
  inputMethod: "typed" | "voice"
): { answer: string; substitutions: Substitution[] } {
  if (inputMethod !== "voice") return { answer, substitutions: [] };
  const normalized = normalizeDictatedTerms(answer, loadWineTerms());
  return { answer: normalized.text, substitutions: normalized.substitutions };
}

export interface GradingCompletionContext {
  /**
   * The text to persist and show. When a re-voicing pass ran and was accepted this is the STYLED
   * text — safe to parse machine tags out of, because the fingerprint gate reproduces them byte
   * for byte or discards the rewrite. When it did not run, or was rejected, it is pass 1's text.
   */
  fullText: string;
  runtime: GradingRuntime;
  finalMessage: Anthropic.Message;
}

export interface StreamGradedResponseOptions {
  runtime: GradingRuntime;
  taskType: string;
  system: string;
  userMessage: string;
  maxTokens?: number;
  initialFrames?: unknown[];
  usage?: { attemptId?: number | null; questionId?: string | null };
  onComplete?: (context: GradingCompletionContext) => Promise<unknown[] | void>;
  onError?: (error: unknown) => Promise<void>;
  /**
   * Re-voice the finished grade in the candidate's chosen persona (pass 2 of the two-pass split —
   * see lib/persona-restyle.ts). `system` above must already have been built with the NEUTRAL
   * voice; this never touches the call that decides the marks.
   *
   * When set to a non-default persona, pass 1's text is withheld from the client and the styled
   * text streams instead, so the candidate does not read the whole grade in one voice and then
   * watch it re-write itself in another.
   */
  restyle?: { persona: PersonaId; surface: PersonaSurface };
}

/** Shared SSE/model/usage scaffold for practical and Theory grading routes. */
export async function streamGradedResponse(
  options: StreamGradedResponseOptions
): Promise<Response> {
  const { runtime } = options;
  const client = new Anthropic({ apiKey: runtime.apiKey });
  const startedAt = Date.now();
  const stream = await client.messages.stream({
    model: runtime.model,
    system: options.system,
    messages: [{ role: "user", content: options.userMessage }],
    ...(await withThinking(runtime.model, options.maxTokens ?? 2000, runtime.user.id)),
  } as Parameters<typeof client.messages.stream>[0]);

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          closed = true;
        }
      };

      try {
        controller.enqueue(encoder.encode(": open\n\n"));
      } catch {
        closed = true;
      }

      try {
        for (const frame of options.initialFrames ?? []) send(frame);

        const willRestyle =
          !!options.restyle && needsRestyle(options.restyle.persona, options.restyle.surface);

        let fullText = "";
        for await (const event of stream) {
          if (event.type !== "content_block_delta") continue;
          if (event.delta.type === "text_delta") {
            fullText += event.delta.text;
            // Withheld when a rewrite is coming — the styled pass streams below instead.
            if (!willRestyle) send({ t: event.delta.text });
          } else if (event.delta.type === "thinking_delta" && !closed) {
            controller.enqueue(encoder.encode(thinkingFrame(event.delta.thinking)));
          }
        }

        const finalMessage = await stream.finalMessage();
        await logClaudeUsage(
          {
            taskType: options.taskType,
            model: runtime.model,
            source: runtime.source,
            userId: runtime.user.id,
            abGroup: runtime.abGroup,
            attemptId: options.usage?.attemptId,
            questionId: options.usage?.questionId,
          },
          finalMessage.usage,
          { latencyMs: Date.now() - startedAt }
        );

        // PASS 2 — the candidate's voice, on text that is already marked. Before onComplete so the
        // styled prose is what gets persisted; the machine tags onComplete parses survive the gate
        // byte for byte, so reading them off the styled text is safe.
        let gradedText = fullText;
        if (willRestyle) {
          const restyled = await restyleForPersona({
            neutralText: fullText,
            persona: options.restyle!.persona,
            surface: options.restyle!.surface,
            client,
            apiKey: runtime.apiKey,
            userId: runtime.user.id,
            usage: {
              taskType: `${options.taskType}_persona_restyle`,
              source: runtime.source,
              userId: runtime.user.id,
            },
            onDelta: (t) => send({ t }),
          });
          gradedText = restyled.text;
          if (restyled.outcome !== "applied") {
            // The client is holding a rewrite the gate threw away. Callers of this helper end with
            // an authoritative frame (theory's `{final}`) that replaces the buffer, so it
            // self-corrects — but say so in the log, since a persistently-rejecting gate means the
            // feature is silently inert.
            console.warn(`[grading-stream] ${options.taskType} restyle not applied: ${restyled.outcome}`);
          }
        }

        const completionFrames = await options.onComplete?.({ fullText: gradedText, runtime, finalMessage });
        for (const frame of completionFrames ?? []) send(frame);
        if (!closed) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        try {
          await options.onError?.(err);
        } catch (persistenceError) {
          console.error("grading stream error persistence failed:", persistenceError);
        }
        send({
          t: `\n\n[Error during streaming: ${err instanceof Error ? err.message : "unknown"}]`,
        });
      }

      if (!closed) {
        try {
          controller.close();
        } catch {
          // Browser disconnected after the final frame.
        }
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
