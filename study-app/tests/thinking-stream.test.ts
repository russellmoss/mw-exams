/**
 * Tests for the streaming-thinking layer.
 *
 * Two things here fail silently in production rather than loudly, so they're worth pinning:
 *   1. `supportsAdaptiveThinking` — a false positive means a 400 that kills a whole generation
 *      (Haiku and pre-4.6 Opus reject `thinking: {type:"adaptive"}`), and a false negative just
 *      silently drops the reasoning feed.
 *   2. The SSE wire format — the client parses `data: {json}` line by line, so a malformed or
 *      multi-line frame shows up as a drill that never loads, not as an error.
 */
import { describe, it, expect } from "vitest";
import {
  supportsAdaptiveThinking,
  thinkingParams,
  withThinking,
  thinkingFrame,
  sseStream,
  reasoningEnabled,
  resolveThinking,
  invalidateReasoningCache,
} from "../src/lib/thinking-stream";

async function readSse(res: Response): Promise<string[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.startsWith("data: "))
    .map((l) => l.slice(6));
}

describe("supportsAdaptiveThinking", () => {
  it("accepts the models that actually take adaptive thinking", () => {
    for (const m of [
      "claude-opus-4-6",
      "claude-opus-4-7",
      "claude-opus-4-8",
      "claude-opus-5",
      "claude-sonnet-4-6",
      "claude-sonnet-5",
      "claude-fable-5",
    ]) {
      expect(supportsAdaptiveThinking(m), m).toBe(true);
    }
  });

  it("rejects models that would 400 on it", () => {
    // Haiku 4.5 and pre-4.6 Opus/Sonnet only support the old budget_tokens form. getLatestOpus can
    // resolve an older Opus id, so a loose /opus/ match would break the generation path outright.
    for (const m of [
      "claude-haiku-4-5-20251001",
      "claude-opus-4-5",
      "claude-opus-4-1",
      "claude-sonnet-4-5",
      "claude-3-5-sonnet-20241022",
    ]) {
      expect(supportsAdaptiveThinking(m), m).toBe(false);
    }
  });
});

describe("thinking request params", () => {
  it("asks for summarized display — the default is omitted, i.e. empty thinking text", () => {
    const p = thinkingParams("claude-sonnet-4-6") as {
      thinking: { type: string; display: string };
      output_config: { effort: string };
    };
    expect(p.thinking).toEqual({ type: "adaptive", display: "summarized" });
    // Low is the DEFAULT, for the callers that stream reasoning purely as a liveness cue — the
    // graders and tasting notes, whose responses are short and whose quality doesn't hinge on the
    // reasoning pass. It is deliberately no longer generation's setting: generation passes its own
    // (see GENERATION_EFFORT), because tying its depth to this default meant a Stem Sniper drill was
    // generated at lower effort than the identical question on the study page.
    expect(p.output_config.effort).toBe("low");
  });

  it("lets a caller whose output quality depends on reasoning ask for more", () => {
    const p = thinkingParams("claude-sonnet-4-6", "medium") as {
      thinking: { type: string; display: string };
      output_config: { effort: string };
    };
    expect(p.output_config.effort).toBe("medium");
    // The override must not disturb the display opt-in, or the reasoning streams back empty.
    expect(p.thinking).toEqual({ type: "adaptive", display: "summarized" });
  });

  it("returns nothing for an unsupported model, leaving the call unchanged", () => {
    // Including when an effort was requested — output_config.effort is a 400 on Haiku 4.5.
    expect(thinkingParams("claude-haiku-4-5-20251001")).toEqual({});
    expect(thinkingParams("claude-haiku-4-5-20251001", "medium")).toEqual({});
  });

  it("grows max_tokens when thinking is on, because it caps thinking + response together", async () => {
    expect((await withThinking("claude-sonnet-4-6", 2000)).max_tokens).toBe(4000);
    // Unsupported model: max_tokens passes through untouched and no thinking fields are added.
    expect(await withThinking("claude-haiku-4-5-20251001", 2000)).toEqual({ max_tokens: 2000 });
  });

  it("the admin kill switch strips thinking entirely and restores the original max_tokens", async () => {
    // REASONING_HARD_DISABLE short-circuits before any database read, which is what makes it the
    // switch to reach for in an emergency — it works even if Neon is unreachable.
    process.env.REASONING_HARD_DISABLE = "1";
    invalidateReasoningCache();
    try {
      expect(await reasoningEnabled()).toBe(false);
      expect(await resolveThinking("claude-sonnet-4-6")).toEqual({});
      expect(await withThinking("claude-sonnet-4-6", 2000)).toEqual({ max_tokens: 2000 });
    } finally {
      delete process.env.REASONING_HARD_DISABLE;
      invalidateReasoningCache();
    }
  });

  it("emits a single-line SSE frame per thinking delta", () => {
    const frame = thinkingFrame("a\nb");
    expect(frame).toBe('data: {"k":"a\\nb"}\n\n');
    // The newline inside the delta must be JSON-escaped, not literal — a literal one would split
    // the frame and the client would drop the tail.
    expect(frame.split("\n").filter(Boolean)).toHaveLength(1);
  });
});

describe("sseStream", () => {
  it("streams progress events then the result, and closes with [DONE]", async () => {
    const res = sseStream(async (emit) => {
      emit({ type: "status", label: "Drafting the flight…" });
      emit({ type: "thinking", delta: "considering Riesling" });
      return { questionId: "gen_p1_F1_1" };
    });

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    // Without this some proxies buffer the whole response and deliver it at once — which would
    // reproduce the exact "looks stuck" bug this module exists to fix.
    expect(res.headers.get("X-Accel-Buffering")).toBe("no");

    const frames = await readSse(res);
    expect(frames.slice(0, 2).map((f) => JSON.parse(f))).toEqual([
      { type: "status", label: "Drafting the flight…" },
      { type: "thinking", delta: "considering Riesling" },
    ]);
    expect(JSON.parse(frames[2])).toEqual({
      type: "result",
      data: { questionId: "gen_p1_F1_1" },
    });
    expect(frames[3]).toBe("[DONE]");
  });

  it("reports a thrown producer as an error event rather than a dead stream", async () => {
    const res = sseStream(async () => {
      throw new Error("No drills available for that filter");
    });
    const frames = await readSse(res);
    expect(JSON.parse(frames[0])).toEqual({
      type: "error",
      message: "No drills available for that filter",
    });
    expect(frames[1]).toBe("[DONE]");
  });

  it("keeps every frame on its own line so the client's line parser can't merge them", async () => {
    // The client splits on newlines and requires each frame to be exactly one `data: ` line.
    // A status label containing a newline would otherwise split into two frames, the second of
    // which isn't valid JSON — silently dropping progress.
    const res = sseStream(async (emit) => {
      emit({ type: "status", label: "line one\nline two" });
      return null;
    });
    const frames = await readSse(res);
    expect(JSON.parse(frames[0])).toEqual({ type: "status", label: "line one\nline two" });
    expect(frames).toHaveLength(3); // status, result, [DONE]
  });
});
