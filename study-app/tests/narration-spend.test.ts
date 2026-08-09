import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => fs.readFileSync(path.join(appDir, rel), "utf8");

// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT HAPPENED, because these assertions are meaningless without it.
//
// On 2026-08-09 the verdict-narration path synthesised 85,214 characters in 115 calls in one day
// and emptied a 300,000-credit ElevenLabs plan. Read-aloud — the feature people actually press a
// button for — spent 363 characters the same day and stopped working as collateral, surfacing to
// the user as an unexplained 502.
//
// Nothing was broken. The pipeline speaks a clip for every analysis it completes, and the analysis
// pipeline had a busy day. Two defences now: background sweeps do not narrate at all, and there is
// a daily character ceiling under everything.
// ─────────────────────────────────────────────────────────────────────────────────────────────

describe("narration spend", () => {
  const src = read("src/lib/feedback-analysis.ts");

  it("does not narrate for the background sweeps", () => {
    // A swept verdict is fully readable in the UI; it is simply not pre-voiced for a candidate who
    // is not sitting there. Both sweep call sites must opt out explicitly.
    const sweepCalls = [...src.matchAll(/runFeedbackAnalysis\(\{[^}]*source: "server"[^}]*\}\)/g)].map(
      (m) => m[0]
    );
    expect(sweepCalls.length, "expected the background sweep call sites to be found").toBeGreaterThan(0);
    for (const call of sweepCalls) {
      expect(call, `a server-side sweep still narrates: ${call}`).toMatch(/narrate: false/);
    }
  });

  it("still narrates by default, so a candidate who just filed feedback gets audio", () => {
    // The gate is opt-OUT. If it were opt-in, every path that forgot it would go silent and nobody
    // would notice — the failure would be a missing clip, which looks like a clip nobody made.
    expect(src).toMatch(/narrate\?: boolean/);
    expect(src).toMatch(/opts\.narrate !== false/);
  });

  it("caps narration spend per day, under everything", () => {
    expect(src).toMatch(/NARRATION_DAILY_CHAR_BUDGET/);
    expect(src).toMatch(/narrationCharsToday/);
    // Fails OPEN: a budget we cannot read must not silence every notification.
    const fn = src.slice(src.indexOf("async function narrationCharsToday"));
    expect(fn.slice(0, 600)).toMatch(/catch\s*\{\s*return 0;/);
  });

  it("only counts SUCCESSFUL synthesis against the budget", () => {
    // A failed call bills nothing, so counting failures would throttle the app off the back of an
    // outage — precisely when it is already degraded.
    const fn = src.slice(src.indexOf("async function narrationCharsToday"));
    expect(fn.slice(0, 600)).toMatch(/AND success/);
  });
});

describe("synthesis failures say something the user can act on", () => {
  it("distinguishes the two causes the user can actually fix", () => {
    // ElevenLabs returns 401 for BOTH "out of credits" and "bad key", so the status alone is
    // useless — the body's `code` is the only thing that separates them.
    const el = read("src/lib/elevenlabs.ts");
    expect(el).toMatch(/quota_exceeded/);
    expect(el).toMatch(/invalid_key/);
    expect(el).toMatch(/SynthesizeOutcome/);
  });

  it("tells the candidate they are out of credits, on both user-facing paths", () => {
    // This is the whole fix: the client renders `error` verbatim, and it used to say "Voice
    // synthesis failed" for a billing state that takes a minute to resolve.
    for (const rel of [
      "src/app/api/coach/speak/route.ts",
      "src/app/api/user/voice-preview/route.ts",
    ]) {
      const route = read(rel);
      expect(route, rel).toMatch(/quota_exceeded/);
      expect(route, rel).toMatch(/Out of ElevenLabs credits/i);
      // 402, matching the no-key case — a step the user can complete, not a server fault.
      expect(route, rel).toMatch(/status: 402/);
    }
  });

  it("keeps a genuine vendor fault as a 502", () => {
    // An outage is not something the candidate can fix, and dressing it up as a billing problem
    // would send them to top up an account that is already funded.
    expect(read("src/app/api/coach/speak/route.ts")).toMatch(/status: 502/);
  });
});
