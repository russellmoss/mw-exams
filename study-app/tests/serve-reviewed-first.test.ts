import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Serve-path review gating.
 *
 * TWO different columns, and the difference is the whole point of this file:
 *
 *   review_state   DEFAULT 'kept'        — the batch-workflow state (pending/kept/binned)
 *   review_status  DEFAULT 'unreviewed'  — whether a HUMAN has actually decided on it
 *
 * Every serve path gates on `review_state = 'kept'`, which a freshly generated question satisfies
 * the instant it is inserted. So "passes the review gate" has never meant "a human looked at it".
 *
 * Measured on production 2026-08-07: of the 126 distinct questions ever served, 99 (79%) had
 * review_status='unreviewed', while the human bin rate on questions that DID get reviewed was
 * 33.7%. Recency ordering made it worse rather than better — unreviewed questions are by definition
 * the newest, so `ORDER BY created_at DESC` served the least-vetted material first.
 *
 * The fix is a PREFERENCE, not a filter: `(review_status = 'kept') DESC` leads every serve ORDER BY,
 * so human-approved questions go first and unreviewed ones remain available as fallback. A hard
 * filter would cut the pool from 550 to 309 and could starve a candidate mid-session — a worse
 * failure than an unvetted question. See docs/plans/2026-08-07-generation-quality-and-cost.md §6.2.
 *
 * These are source-text assertions rather than query tests because the invariant lives in SQL
 * string literals; pinning it here needs no database and cannot drift from what actually ships.
 */

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf-8");

/** Split a source file into its `sql\`...\`` template literals. */
function sqlBlocks(src: string): string[] {
  return src.match(/sql`[\s\S]*?`/g) ?? [];
}

/**
 * A SERVE query — one that hands whole question rows to a candidate. Distinguished from the
 * analytics reads that also filter `review_state = 'kept'` (the producer tally in bank-health, the
 * bank composition counts): those aggregate, and ordering them by review status would be
 * meaningless. The test must not chase them, or it becomes noise everyone learns to ignore.
 */
function isServeQuery(block: string): boolean {
  if (!/FROM\s+generated_questions/i.test(block)) return false;
  if (/\bGROUP BY\b/i.test(block)) return false;
  if (/\bCOUNT\s*\(/i.test(block)) return false;
  // Must project question rows, not scalars: `q.*`, bare `*`, or the question columns themselves.
  return /SELECT\s+(?:q\.\*|\*|[\s\S]{0,200}?\bq?\.?question_(?:id|text)\b)/i.test(block);
}

const SERVE_FILES = [
  "src/lib/db.ts",
  "src/app/api/stem-sniper/next/route.ts",
  "src/app/api/stem-sniper/drill/produce.ts",
];

describe("serve paths prefer human-reviewed questions", () => {
  it.each(SERVE_FILES)("%s: every review-gated serve query orders reviewed-first", (file) => {
    const blocks = sqlBlocks(read(file)).filter(
      (b) => isServeQuery(b) && /review_state\s*=\s*'kept'/.test(b) && /\bORDER BY\b/i.test(b)
    );
    expect(blocks.length).toBeGreaterThan(0);

    for (const block of blocks) {
      const orderBy = block.match(/ORDER BY([\s\S]*?)(?:LIMIT|`)/i)?.[1] ?? "";
      expect(
        /\(\s*(?:q\.)?review_status\s*=\s*'kept'\s*\)\s*DESC/.test(orderBy),
        `A serve query in ${file} filters review_state='kept' but does not lead its ORDER BY with ` +
          `(review_status = 'kept') DESC, so it can serve never-reviewed questions ahead of ` +
          `human-approved ones.\n\nORDER BY was:${orderBy}`
      ).toBe(true);
    }
  });

  it("the reviewed-first key comes FIRST, not buried behind recency", () => {
    // Ordering by created_at first and review_status second would be a no-op in practice: the
    // newest questions are exactly the unreviewed ones, so recency would win every comparison.
    for (const file of SERVE_FILES) {
      for (const block of sqlBlocks(read(file))) {
        const orderBy = block.match(/ORDER BY([\s\S]*?)(?:LIMIT|`)/i)?.[1];
        if (!orderBy || !/review_status/.test(orderBy)) continue;
        const firstKey = orderBy.split(",")[0];
        expect(
          /review_status/.test(firstKey),
          `${file}: review_status must be the FIRST ORDER BY key, otherwise recency dominates and ` +
            `the preference does nothing. Got: ${orderBy.trim()}`
        ).toBe(true);
      }
    }
  });
});

describe("no serve path is missing the review gate entirely", () => {
  // stem-sniper/next shipped without any review_state filter (found 2026-08-07), so 22 BINNED
  // questions were reachable through it and nowhere else. Its sibling drill/produce.ts had the
  // gate; this one was overlooked when the rule rolled out.
  it.each([
    ["src/app/api/stem-sniper/next/route.ts", "generated_questions"],
    ["src/app/api/stem-sniper/drill/produce.ts", "generated_questions"],
  ])("%s selects from the bank only behind review_state='kept'", (file, table) => {
    for (const block of sqlBlocks(read(file))) {
      if (!new RegExp(`FROM\\s+${table}`, "i").test(block)) continue;
      expect(
        /review_state\s*=\s*'kept'/.test(block),
        `${file} reads ${table} on a serve path without a review_state='kept' filter — binned ` +
          `questions would reach a candidate.`
      ).toBe(true);
    }
  });
});
