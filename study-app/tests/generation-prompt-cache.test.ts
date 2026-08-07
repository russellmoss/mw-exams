import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildQuestionGenerationPrompt } from "../src/lib/prompts/question-generation-prompt";

/**
 * The prompt-cache breakpoint.
 *
 * Measured 2026-08-07: 0.0% cache hits across 3,358 generation calls, with a ~42k-token median
 * input re-sent and re-paid on every one. ~31k of that is corpus text loaded once from disk and
 * memoised in module scope — byte-identical all day. It could not be cached because it sat behind
 * `${paper}` and the flight-size draw in the middle of the system prompt, so the prefix differed
 * per question.
 *
 * The fix is a separate `cachedPrefix` carrying the breakpoint. The failure mode it replaces is
 * INVISIBLE: interpolate one per-question value into that prefix and the hit rate silently returns
 * to zero, the bill quietly doubles, and nothing breaks, errors or looks different. Hence this file.
 */

const PAPERS = [1, 2, 3] as const;

async function build(paper: number, overrides: Partial<{ family: string; wines: string[] }> = {}) {
  return buildQuestionGenerationPrompt(paper, overrides.family ?? "any", overrides.wines ?? []);
}

describe("the cached prefix is byte-identical across questions", () => {
  it.each(PAPERS)("Paper %i: same prefix regardless of family", async (paper) => {
    const a = await build(paper, { family: "F1" });
    const b = await build(paper, { family: "F4" });
    expect(a.cachedPrefix).toBe(b.cachedPrefix);
  });

  it.each(PAPERS)("Paper %i: same prefix regardless of the avoid-list", async (paper) => {
    const a = await build(paper, { wines: [] });
    const b = await build(paper, {
      wines: ["Domaine X, Cuvée Y, 2019. Chablis, France. (12.5%)", "Bodegas Z, 2020. Rioja, Spain."],
    });
    expect(a.cachedPrefix).toBe(b.cachedPrefix);
  });

  it.each(PAPERS)("Paper %i: prefix is stable across repeated builds", async (paper) => {
    const a = await build(paper);
    const b = await build(paper);
    expect(a.cachedPrefix).toBe(b.cachedPrefix);
  });

  it("differs BETWEEN papers — three prefixes, not one", async () => {
    // Per-paper is intended: the historical examples are paper-specific. Three stable prefixes each
    // hit hundreds of times a day is the design, not a bug.
    const [p1, p2, p3] = await Promise.all(PAPERS.map((p) => build(p)));
    expect(new Set([p1.cachedPrefix, p2.cachedPrefix, p3.cachedPrefix]).size).toBe(3);
  });
});

describe("the cached prefix carries the payload that makes caching worth it", () => {
  it("is large enough to be worth a breakpoint", async () => {
    // Anthropic will not cache a trivially short prefix, and the whole saving is in the corpus bulk.
    const { cachedPrefix } = await build(1);
    expect(cachedPrefix.length).toBeGreaterThan(50_000); // ~12k+ tokens, comfortably over any floor
  });

  it("contains the corpus documents, not the per-question rules", async () => {
    const { cachedPrefix } = await build(1);
    expect(cachedPrefix).toContain("MOCK EXAM WRITER AGENT INSTRUCTIONS");
    expect(cachedPrefix).toContain("WINE COMPOSITION RULES");
    expect(cachedPrefix).toContain("REAL HISTORICAL QUESTION EXAMPLES");
  });

  it("holds the majority of the total system prompt", async () => {
    const { cachedPrefix, system } = await build(1);
    const share = cachedPrefix.length / (cachedPrefix.length + system.length);
    expect(share).toBeGreaterThan(0.5);
  });
});

describe("per-question values never leak into the prefix", () => {
  it("no flight size, family or exam-mix text in the prefix", async () => {
    const { cachedPrefix } = await buildQuestionGenerationPrompt(3, "F6", [], null, null, null, 5);
    // The flight size is 5 here; if it appeared in the prefix the byte-identity would be gone.
    expect(cachedPrefix).not.toMatch(/FLIGHT SIZE FOR THIS QUESTION/);
    expect(cachedPrefix).not.toMatch(/question family F6/);
  });

  it("a flight-size override does not change the prefix", async () => {
    const two = await buildQuestionGenerationPrompt(1, "any", [], null, null, null, 2);
    const five = await buildQuestionGenerationPrompt(1, "any", [], null, null, null, 5);
    expect(two.cachedPrefix).toBe(five.cachedPrefix);
    // ...and it MUST change the dynamic half, or the override isn't reaching the model at all.
    expect(two.system).not.toBe(five.system);
  });

  it("a pinned latest-question does not change the prefix", async () => {
    const withLatest = await buildQuestionGenerationPrompt(2, "any", [], {
      questionText: "Wines 1 and 2 are Syrah.",
      wines: [{ slot: 1, fullText: "Producer, 2019. Cornas, France." }],
      paper: 2,
      family: "F1",
    });
    const without = await build(2);
    expect(withLatest.cachedPrefix).toBe(without.cachedPrefix);
  });
});

describe("the engine actually sends the breakpoint", () => {
  const engine = readFileSync(join(__dirname, "..", "src", "lib", "question-engine.ts"), "utf-8");

  it("sets cache_control on the prefix block", () => {
    expect(engine).toMatch(/cache_control:\s*\{\s*type:\s*"ephemeral"/);
  });

  it("threads cachedPrefix through the REPAIR path", () => {
    // The repair path rebuilds the prompt object. Omitting cachedPrefix there would drop the
    // breakpoint on precisely the attempts that re-read the most cached text.
    const repairBlock = engine.slice(engine.indexOf("Repair attempt:"));
    expect(repairBlock.slice(0, 1200)).toMatch(/cachedPrefix:\s*prompt\.cachedPrefix/);
  });

  it("appends per-question blocks to `system`, never to the prefix", () => {
    // Every `prompt.system +=` must stay on the mutable half; a `prompt.cachedPrefix +=` anywhere
    // would shift the bytes the cache is keyed on.
    expect(engine).not.toMatch(/cachedPrefix\s*\+=/);
  });
});
