// generation-thinking-gate.test.ts — a generation call may only REQUEST thinking from a model that
// reasons by default.
//
// The incident this pins (2026-08-05/06): callGenerationModel asked every adaptive-thinking-capable
// model for visible reasoning whenever a progress emitter was attached. On Opus 5 that request is
// display-only — the model reasons anyway. On Sonnet 4.6, which reasons ONLY when asked, the request
// changed the model's behaviour, and on the generation prompt it sometimes answered with a thinking
// spiral: the entire 16,000-token output budget spent thinking, zero text, ~280 seconds per call
// (generation_attempts: 11 rows, all `stop_reason=max_tokens blocks=[thinking]`). One spiral
// outlived the whole 180s generation budget, so the study page showed a five-minute wait ending in
// a timeout instead of a question.
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { generationThinkingEligible } from "../src/lib/question-engine";
import { reasonsByDefault, supportsAdaptiveThinking } from "../src/lib/model-capabilities";

describe("generationThinkingEligible", () => {
  it("allows the default reasoners, where the request is display-only", () => {
    for (const m of ["claude-opus-5", "claude-opus-4-7", "claude-sonnet-5", "claude-fable-5"]) {
      expect(generationThinkingEligible(m), m).toBe(true);
    }
  });

  it("refuses the request-only reasoners — asking is what caused the spirals", () => {
    // Sonnet 4.6 is every retry attempt's model AND a first-attempt A/B arm, so this single value
    // is what protects the bulk of generation traffic.
    for (const m of ["claude-sonnet-4-6", "claude-opus-4-6"]) {
      expect(generationThinkingEligible(m), m).toBe(false);
      // The trap this guards: both models pass the SIZING predicate. Gating the request on
      // supportsAdaptiveThinking is precisely the bug.
      expect(supportsAdaptiveThinking(m), m).toBe(true);
    }
  });

  it("agrees with reasonsByDefault — one fact, one predicate", () => {
    for (const m of [
      "claude-opus-5",
      "claude-opus-4-6",
      "claude-sonnet-5",
      "claude-sonnet-4-6",
      "claude-haiku-4-5-20251001",
    ]) {
      expect(generationThinkingEligible(m), m).toBe(reasonsByDefault(m));
    }
  });
});

describe("the call site actually applies the gate", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/question-engine.ts"), "utf8");

  it("the thinking request is conditioned on generationThinkingEligible, not just on the emitter", () => {
    expect(src).toMatch(/emit\s*&&\s*generationThinkingEligible\(model\)/);
  });

  it("no generation path resolves thinking gated on the emitter alone", () => {
    // The exact shape of the regression: `emit ? await resolveThinking(...)`.
    const live = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(live).not.toMatch(/emit\s*\?\s*await resolveThinking/);
  });
});
