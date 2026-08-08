import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STALE_ANALYSIS_MINUTES } from "@/lib/feedback-analysis";

/**
 * The reaper that unwedges abandoned feedback analyses.
 *
 * fa_65 (attempt 394) was inserted and never written to again — the invocation was killed, so the
 * catch in runFeedbackAnalysis never ran and the row sat in 'analyzing' for seven hours. That row was a
 * PERMANENT LOCK: the concurrency guard matched `status = 'analyzing'` with no TTL so every re-trigger
 * returned `already_analyzing`, and the stranded sweep requires `auto_analysis_id IS NULL`, which
 * createFeedbackAnalysis had already stamped. Every recovery path was closed.
 *
 * The reaper's ONE way of doing harm is killing an analysis that is still running, and the thing that
 * makes that impossible is the relationship between the TTL and the routes' own maxDuration: the
 * platform kills an invocation at maxDuration, so a TTL safely above it can only ever see corpses.
 * That relationship spans three files, which is exactly the kind of cross-file agreement this codebase
 * has been bitten by before (EK-0157: two Paper 1 rules disagreeing, stricter silently winning). So it
 * is asserted here rather than left to a comment.
 */

const ROUTES_THAT_RUN_ANALYSES = [
  "src/app/api/save-attempt/route.ts", // runs it in after(), post-response
  "src/app/api/feedback-analysis/trigger/route.ts", // the manual re-trigger
];

function declaredMaxDurationSeconds(relPath: string): number {
  const src = readFileSync(join(process.cwd(), relPath), "utf8");
  const m = src.match(/export\s+const\s+maxDuration\s*=\s*(\d+)/);
  expect(m, `${relPath} must declare maxDuration — the reaper's safety margin is measured against it`)
    .not.toBeNull();
  return Number(m![1]);
}

describe("reapStaleAnalyses — the TTL can never reap a live analysis", () => {
  it("every route that starts an analysis declares a maxDuration", () => {
    for (const r of ROUTES_THAT_RUN_ANALYSES) {
      expect(declaredMaxDurationSeconds(r)).toBeGreaterThan(0);
    }
  });

  it("the TTL is comfortably above the longest invocation ceiling", () => {
    const ceiling = Math.max(...ROUTES_THAT_RUN_ANALYSES.map(declaredMaxDurationSeconds));
    const ttlSeconds = STALE_ANALYSIS_MINUTES * 60;
    // Not merely greater — a 2x margin, so raising maxDuration a little cannot silently make the
    // reaper start killing live work. If this fails because maxDuration went up, raise the TTL too.
    expect(ttlSeconds).toBeGreaterThanOrEqual(ceiling * 2);
  });

  it("the TTL is long enough to clear the slowest real analysis by a wide margin", () => {
    // Measured over feedback_analyses 49-64: 31-73s wall clock. (The multi-hour created→updated spans
    // on rows 54 and 55 are a later admin apply bumping updated_at, not the model.)
    const SLOWEST_OBSERVED_SECONDS = 73;
    expect(STALE_ANALYSIS_MINUTES * 60).toBeGreaterThan(SLOWEST_OBSERVED_SECONDS * 5);
  });

  it("the TTL is not so long that a wedged attempt stays unreachable for a working day", () => {
    // The whole point is that recovery is possible within one sitting; a 24h TTL would technically be
    // safe and practically useless.
    expect(STALE_ANALYSIS_MINUTES).toBeLessThanOrEqual(60);
  });
});

describe("the guard that made fa_65 permanent", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/feedback-analysis.ts"), "utf8");

  it("reaps before consulting the in-flight guard", () => {
    // Order matters: reaping after the SELECT would still return already_analyzing on the very call
    // that was supposed to recover.
    const reapAt = src.indexOf("await reapStaleAnalyses({ attemptId })");
    const guardAt = src.indexOf("AND status = 'analyzing'");
    expect(reapAt).toBeGreaterThan(-1);
    expect(guardAt).toBeGreaterThan(-1);
    expect(reapAt).toBeLessThan(guardAt);
  });

  it("reaps on the sweep too, so an attempt nobody re-triggers still stops lying", () => {
    expect(src).toMatch(/const \{ reaped \} = await reapStaleAnalyses\(\)/);
  });

  it("does not silently retry — reaping unwedges, a human re-triggers", () => {
    // auto_apply_enabled is ON in production, so a retry can dispatch a branch-and-PR. The feedback
    // sitting behind a stale lock is by definition old, and 394's substance had already shipped as R11,
    // so an automatic retry would have proposed a fix for something already fixed.
    expect(src).toMatch(/DELIBERATELY NOT A RETRY/);
  });
});
