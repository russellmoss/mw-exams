// first-pass.bench.test.ts — measure the REAL first-pass rate against the live model.
//
// The other tests prove the mechanism: a spec makes the arithmetic rules unfireable, and a retry
// carries its violations back. What they cannot prove is behaviour — whether a real model actually
// copies the spec's mark tokens, and how often the remaining judgement rules (variety, paperScope,
// banker) still reject a first draft. That needs real calls, so it lives behind an explicit opt-in
// and is SKIPPED by default: `npm test` must stay free, offline and deterministic.
//
// Run it:
//   ANTHROPIC_API_KEY=sk-...  DATABASE_URL=postgres://...  GENERATION_BENCH=1  GENERATION_BENCH_RUNS=12 \
//     npx vitest run tests/first-pass.bench.test.ts --disable-console-intercept --testTimeout=900000
//
// SAFETY
//   * Costs money — one Anthropic call per attempt.
//   * WRITES to generated_questions and generation_attempts. Point DATABASE_URL at a Neon BRANCH,
//     not production, unless you want these questions in the real bank. A branch is instant:
//     `neon branches create --name genbench` (or the Branches tab in the Neon console).
//   * Attributes nothing to a real user (userId: null, source "server"), so it cannot pollute
//     anyone's attempt history — see the "no real-user test pollution" rule.
//
// Read the printed FIRST-PASS RATE before and after a prompt/spec change. That difference is the
// only honest measure of whether the change worked.
import { describe, it, expect } from "vitest";
import { neon } from "@neondatabase/serverless";
import { generateFreshQuestion } from "@/lib/question-engine";

const enabled = process.env.GENERATION_BENCH === "1";
const runs = Number(process.env.GENERATION_BENCH_RUNS || 12);
const PAPERS = process.env.GENERATION_BENCH_PAPER
  ? [Number(process.env.GENERATION_BENCH_PAPER)]
  : [1, 2, 3];
const FAMILIES = process.env.GENERATION_BENCH_FAMILY
  ? [process.env.GENERATION_BENCH_FAMILY]
  : ["F1", "F2", "F4", "F5", "F6", "F7"];

describe.skipIf(!enabled)("live first-pass rate", () => {
  it(
    `generates ${runs} questions and reports the first-pass rate`,
    async () => {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      expect(apiKey, "ANTHROPIC_API_KEY is required").toBeTruthy();
      expect(process.env.DATABASE_URL, "DATABASE_URL is required").toBeTruthy();

      const sql = neon(process.env.DATABASE_URL!);
      const startedAt = new Date().toISOString();

      console.log(`\nRunning ${runs} live generations…\n`);
      for (let i = 0; i < runs; i++) {
        const paper = PAPERS[i % PAPERS.length];
        const family = FAMILIES[i % FAMILIES.length];
        const t0 = Date.now();
        try {
          const out = await generateFreshQuestion(paper, family, apiKey!, { source: "server", userId: null });
          const kind = "error" in out ? "ERROR" : out.source;
          console.log(`  ${String(i + 1).padStart(3)}/${runs}  P${paper} ${family.padEnd(3)} ${String(kind).padEnd(13)} ${Math.round((Date.now() - t0) / 1000)}s`);
        } catch (err) {
          console.log(`  ${String(i + 1).padStart(3)}/${runs}  P${paper} ${family.padEnd(3)} THREW  ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      // Telemetry writes are fire-and-forget; let the inserts land before reading them back.
      await new Promise((r) => setTimeout(r, 3000));

      const rows = (await sql`
        SELECT attempt, passed, is_repair, rules_fired
        FROM generation_attempts
        WHERE attempt > 0 AND created_at >= ${startedAt}
        ORDER BY created_at ASC`) as {
        attempt: number;
        passed: boolean;
        is_repair: boolean;
        rules_fired: string[] | null;
      }[];

      const firsts = rows.filter((r) => r.attempt === 1);
      const firstPass = firsts.filter((r) => r.passed).length;
      const repairs = rows.filter((r) => r.attempt > 1 && r.is_repair);

      const ruleCounts: Record<string, number> = {};
      for (const r of firsts) for (const rule of r.rules_fired || []) ruleCounts[rule] = (ruleCounts[rule] || 0) + 1;

      console.log(`\n${"=".repeat(62)}`);
      console.log(`FIRST-PASS RATE: ${firstPass}/${firsts.length} (${Math.round((firstPass / Math.max(firsts.length, 1)) * 100)}%)`);
      console.log(`Total attempts:  ${rows.length} (mean ${(rows.length / Math.max(firsts.length, 1)).toFixed(2)} per question)`);
      if (repairs.length) {
        console.log(`Repair attempts: ${repairs.filter((r) => r.passed).length}/${repairs.length} passed`);
      }
      const ranked = Object.entries(ruleCounts).sort((a, b) => b[1] - a[1]);
      if (ranked.length) {
        console.log(`\nRules that rejected a first draft:`);
        for (const [rule, n] of ranked) console.log(`  ${rule.padEnd(18)} ${n}`);
      } else {
        console.log(`\nNo validator rejected a first draft.`);
      }
      console.log(`${"=".repeat(62)}\n`);
      console.log(`Full breakdown: node scripts/analyze-generation.mjs --days 1 --examples\n`);

      // These rules are solved by the flight spec, so a live run should never see them. If one
      // appears, the model is not copying the spec and the spec block needs to be more forceful —
      // that is a real finding, and it should fail the bench rather than hide in the log.
      for (const solved of ["marks", "flightSize", "markMix"]) {
        expect(ruleCounts[solved] ?? 0, `${solved} fired on a first draft despite being pre-solved by the flight spec`).toBe(0);
      }

      expect(firsts.length).toBeGreaterThan(0);
    },
    // Scales with the run count instead of a fixed 15 minutes. The hard-coded value silently
    // overrode --testTimeout on the CLI and killed a 15-run bench at question 13, discarding the
    // summary. 3 minutes per question is generous against the 150s generation budget.
    Number(process.env.GENERATION_BENCH_TIMEOUT_MS) || runs * 180_000
  );
});
