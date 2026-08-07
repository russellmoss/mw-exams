import { describe, it, expect, vi } from "vitest";
import type { CoachState } from "@/lib/coach/state";

// The EK digest is a database read; the cache STRUCTURE is what's under test, not its content.
vi.mock("@/lib/db", () => ({
  getEmpiricalKnowledgeDigest: async () => "EK-0001 STRONG SIGNAL — a digest line.",
}));

const { buildSystemBlocks, tierForTurn } = await import("@/lib/coach/prompt");

const OPEN: CoachState = { state: "in_progress", openAttemptId: 7, restricted: true };
const CLEAR: CoachState = { state: "none", openAttemptId: null, restricted: false };

// Anthropic caches a byte-identical prefix. Everything here is checking one property: nothing that
// varies may sit in front of anything that doesn't. Getting it wrong doesn't fail loudly — it just
// silently bills a full cache write on every turn, on the candidate's own key.

describe("prompt cache tiers", () => {
  it("puts the dynamic block last and never caches it", async () => {
    const blocks = await buildSystemBlocks({ tier: "full", state: OPEN });
    const last = blocks[blocks.length - 1];
    expect(last.cache_control).toBeUndefined();
    expect(last.text).toMatch(/CURRENT STATE/);
    // Every earlier block must be cacheable, or the breakpoint is in the wrong place.
    for (const b of blocks.slice(0, -1)) expect(b.cache_control).toEqual({ type: "ephemeral" });
  });

  it("keeps the base block byte-identical across attempt states", async () => {
    const a = await buildSystemBlocks({ tier: "light", state: OPEN });
    const b = await buildSystemBlocks({ tier: "light", state: CLEAR });
    expect(a[0].text).toBe(b[0].text);
    // ...while the tail genuinely differs, which is the whole reason it must come after.
    expect(a[a.length - 1].text).not.toBe(b[b.length - 1].text);
  });

  it("keeps the base block byte-identical across tiers", async () => {
    const light = await buildSystemBlocks({ tier: "light", state: CLEAR });
    const full = await buildSystemBlocks({ tier: "full", state: CLEAR });
    expect(light[0].text).toBe(full[0].text);
  });

  it("omits the heavy corpus block on a light turn", async () => {
    const light = await buildSystemBlocks({ tier: "light", state: CLEAR });
    const full = await buildSystemBlocks({ tier: "full", state: CLEAR });
    expect(light).toHaveLength(2); // base + dynamic
    expect(full.length).toBeGreaterThan(light.length);
  });

  it("starts a conversation light so a greeting is not billed as a 20k cache write", () => {
    expect(tierForTurn({ toolsUsedSoFar: [] })).toBe("light");
  });

  it("promotes to full once a corpus tool has been used, and stays there", () => {
    expect(tierForTurn({ toolsUsedSoFar: ["query_corpus"] })).toBe("full");
    expect(tierForTurn({ toolsUsedSoFar: ["get_decision_tree"] })).toBe("full");
    // A performance lookup needs none of the reference corpus, so it must not trigger promotion.
    expect(tierForTurn({ toolsUsedSoFar: ["query_my_performance"] })).toBe("light");
  });
});

// With the reference tools unrestricted, the process-mode prompt IS the control — it is the only
// thing standing between "coach the routing" and "here's the answer". So it gets asserted as
// carefully as the registry filter.
describe("process-mode prompt", () => {
  it("instructs the model to coach the routing rather than withhold it", async () => {
    const blocks = await buildSystemBlocks({ tier: "light", state: OPEN });
    const tail = blocks[blocks.length - 1].text;
    expect(tail).toMatch(/COACH THE ROUTING/);
    expect(tail).toMatch(/trees/i);
    // Confidence tiers are the vocabulary the candidate is training in.
    expect(tail).toMatch(/STRONG SIGNAL/);
    expect(tail).toMatch(/CURVEBALL/);
  });

  it("draws the line at stating the conclusion", async () => {
    const blocks = await buildSystemBlocks({ tier: "light", state: OPEN });
    const tail = blocks[blocks.length - 1].text;
    expect(tail).toMatch(/do not state the conclusion/i);
    expect(tail).toMatch(/identification has to be theirs/i);
  });

  it("says plainly that nothing is in progress otherwise", async () => {
    const blocks = await buildSystemBlocks({ tier: "light", state: CLEAR });
    expect(blocks[blocks.length - 1].text).toMatch(/No attempt is in progress/);
  });
});
