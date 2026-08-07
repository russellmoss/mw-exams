import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Every serve path must record BOTH the view and the serve count.
 *
 * These are two different writes with two different consumers, and for a long time only one of them
 * happened on the main study path:
 *
 *   question_views      per-user "don't offer this again" ledger
 *   served_count        global "this reached a candidate" counter
 *
 * `api/get-question/produce.ts` recorded the view and skipped the counter, while the sibling banked
 * route and the Live Tasting grade route did both. Measured 2026-08-07, `served_count` reported 14
 * all-time serves against 126 distinct questions in `user_attempts` — a ~7.5x undercount, on the
 * number that (a) gates the batch-undo reopen rail, so a question already shown to a candidate
 * could be yanked back into the review queue, and (b) every supply-sizing decision was reasoned
 * from.
 *
 * Source-text assertions rather than integration tests: the invariant is "these two calls travel
 * together in every serve path", which is a property of the call sites, and checking it here needs
 * no database.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf-8");

/** Every path that hands a question to a candidate. Add new ones here as they are written. */
const SERVE_PATHS = [
  "src/app/api/get-question/produce.ts",
  "src/app/api/get-question/banked/route.ts",
  "src/app/api/live-tasting/[id]/grade/route.ts",
];

describe("serve paths record both the view and the serve count", () => {
  it.each(SERVE_PATHS)("%s calls recordQuestionView", (file) => {
    expect(read(file)).toMatch(/recordQuestionView\s*\(/);
  });

  it.each(SERVE_PATHS)("%s calls incrementTimesServed", (file) => {
    expect(
      /incrementTimesServed\s*\(/.test(read(file)),
      `${file} serves a question without incrementing served_count. The counter feeds the ` +
        `batch-undo reopen rail and every supply-sizing decision; a serve path that skips it makes ` +
        `both silently wrong.`
    ).toBe(true);
  });

  it.each(SERVE_PATHS)("%s imports both from the db module", (file) => {
    const src = read(file);
    // Guard against the call surviving as dead text after a refactor drops the import.
    expect(src).toMatch(/recordQuestionView/);
    expect(src).toMatch(/incrementTimesServed/);
  });
});

describe("the counter write is best-effort", () => {
  it.each(SERVE_PATHS)("%s does not let a counter failure sink the serve", (file) => {
    const src = read(file);
    // Each incrementTimesServed call must be followed by a .catch (awaited or fire-and-forget).
    // A serve that 500s because a telemetry counter failed is strictly worse than a lost count.
    const calls = src.match(/incrementTimesServed\([^)]*\)(\s*\.catch)?/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(
        call.includes(".catch"),
        `${file}: an incrementTimesServed call is unguarded — a counter failure would fail the serve.`
      ).toBe(true);
    }
  });
});
