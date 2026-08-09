// The xAI (Grok) chat client — used for ONE thing: writing the Unhinged persona's copy.
//
// WHY A SECOND VENDOR AT ALL. Anthropic will not write the register this persona is specified in,
// and the honest options were to ship a watered-down version or to send the copy somewhere that
// will. The split is what makes that acceptable: Claude still does every piece of REASONING —
// the marks, the verdict, the findings, the corpus lookups, the feedback adjudication — and Grok
// only ever receives text that has already been decided and rewrites the words. It is a
// thesaurus with a temper, not a judge.
//
// So the failure mode of this vendor being down, unkeyed, or refusing is always the same: the
// candidate gets the neutral Claude text. Nothing about their marks or their study material
// depends on xAI being reachable.

import { logClaudeUsage } from "@/lib/usage-log";

/**
 * Default model. `grok-4.20-0309-non-reasoning` because re-voicing finished text needs no
 * reasoning at all — it is cheaper and faster than the reasoning variants, and measured on the
 * real task it also produced the more committed copy, which is the entire point of this persona.
 * Override with GROK_MODEL if xAI retires it.
 */
const DEFAULT_GROK_MODEL = "grok-4.20-0309-non-reasoning";
const GROK_URL = "https://api.x.ai/v1/chat/completions";

export interface GrokResult {
  text: string;
  model: string;
}

/**
 * One non-streaming chat completion.
 *
 * NOT STREAMED, deliberately. Every caller uses this to re-voice text the candidate is waiting on,
 * and each of them already has an authoritative "here is the final text" frame that replaces
 * whatever the client is holding. Streaming a second vendor's tokens into that buffer would buy a
 * little perceived speed and add a second partial-output failure mode to reason about.
 *
 * Returns null on ANY failure — no key, network, non-2xx, empty completion. Callers fall back to
 * the Claude text, so a null here is a cosmetic downgrade rather than an error worth surfacing.
 */
export async function grokComplete(opts: {
  apiKey: string;
  system: string;
  user: string;
  maxTokens?: number;
  /** For model_usage attribution. Grok rows are logged with their real model id. */
  usage?: { taskType: string; userId?: number | null; source?: "user" | "server" };
}): Promise<GrokResult | null> {
  const model = process.env.GROK_MODEL || DEFAULT_GROK_MODEL;
  const t0 = Date.now();
  try {
    const res = await fetch(GROK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey.trim()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 8000,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`[grok] ${res.status} — falling back to the neutral text`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) {
      console.warn("[grok] empty completion — falling back to the neutral text");
      return null;
    }

    if (opts.usage) {
      // Same ledger as every Claude call, so the Cost dashboard shows what this persona actually
      // costs instead of it being invisible spend on a second vendor.
      logClaudeUsage(
        { ...opts.usage, model },
        {
          input_tokens: data.usage?.prompt_tokens ?? 0,
          output_tokens: data.usage?.completion_tokens ?? 0,
        } as never,
        { latencyMs: Date.now() - t0 }
      );
    }

    return { text, model };
  } catch (err) {
    console.warn("[grok] request failed — falling back to the neutral text:", err);
    return null;
  }
}
