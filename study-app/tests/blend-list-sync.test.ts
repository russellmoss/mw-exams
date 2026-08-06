// blend-list-sync.test.ts — the prompt's blend list must match what the validator enforces.
//
// The single-variety rule rejects wines from blend appellations, but the prompt only ever showed
// ILLUSTRATIVE examples ("Tawny Port, Champagne, Bordeaux blends…"). A Paper 2 batch then lost 7
// attempts to Gigondas and Saint-Estèphe — both already in the validator's list, neither named in the
// prompt. The model cannot avoid a rule it has not been shown.
//
// The list now lives in the prompt module as BLEND_APPELLATIONS, mirroring KNOWN_BLEND_INDICATORS in
// question-engine.ts (itself duplicated in question-rules.mjs). It cannot simply be imported —
// question-engine imports the prompt module, so that dependency would be circular — so this file
// enforces the invariant instead.
//
// The direction that matters is one-way: every appellation the prompt names as rejected MUST actually
// be rejected. The reverse is fine — the validator may know blends the prompt does not list, which
// costs a redraft rather than a broken promise.
import { describe, it, expect } from "vitest";
import { BLEND_APPELLATIONS } from "../src/lib/prompts/question-generation-prompt";
import { isLikelyBlend } from "../src/lib/question-rules.mjs";

describe("prompt blend list matches the enforced rule", () => {
  it("has entries", () => {
    expect(BLEND_APPELLATIONS.length).toBeGreaterThan(20);
  });

  it("every appellation the prompt names is genuinely detected", () => {
    // Rendered as a wine label would be, so the word-boundary matching is exercised realistically.
    const missed = BLEND_APPELLATIONS.filter(
      (name) => !isLikelyBlend(`Some Producer, Cuvée. ${name}, Country. (13.5%)`)
    );
    expect(missed).toEqual([]);
  });

  it("names the two appellations that caused the Paper 2 failures", () => {
    // Regression guard on the specific gap: both were enforced but unnamed.
    expect(BLEND_APPELLATIONS).toContain("Gigondas");
    expect(BLEND_APPELLATIONS).toContain("Saint-Estephe");
  });

  it("does not name appellations that are legitimately single-varietal", () => {
    // Deliberate exclusions — listing these would tell the model to avoid correct flights.
    for (const notABlend of ["Madeira", "Chianti Classico", "Stellenbosch", "Barolo", "Sancerre"]) {
      expect(BLEND_APPELLATIONS).not.toContain(notABlend);
    }
  });
});
