// generation-telemetry.ts — make the generation retry loop measurable.
//
// The engine computes a full violation list on every attempt and then throws it away. Recording it
// is what turns "the generator feels flaky" into "novelty fired on 13% of recent drafts". Every
// attempt is logged, passed or failed, so a failure like "7 of 7 bank questions fell back" can be
// read off the data instead of inferred.
//
// Strictly fire-and-forget. Generation is on the request path with a hard wall-clock budget, so this
// never blocks and never throws: a telemetry outage must degrade to "no data", not "no question".
//
// The table (migrations 018/019) has existed in production since 2026-08-03 but was never written
// to — the writer lived only on claude/study-question-validators-fe6edb, whose preview deploy
// migrated the shared production database without its code ever reaching master.
import { neon } from "@neondatabase/serverless";

// Groups attempts by the prompt that produced them, so a prompt change can be A/B'd against the
// first-pass rate. NOTE THE NAMESPACE: claude/study-question-validators-fe6edb uses "gen-N" for its
// spec-driven prompt lineage (it is up to gen-17). Master's prompt is a DIFFERENT lineage, so its
// attempts must not be grouped with those measurements — hence "master-N". If that branch ever
// lands, its versioning replaces this rather than continuing it.
export const PROMPT_VERSION = "master-1";

export type GenerationAttemptRecord = {
  paper: number;
  family?: string | null;
  source?: string | null;
  userId?: number | null;
  attempt: number;
  model?: string | null;
  abGroup?: string | null;
  specVersion?: string | null;
  isRepair: boolean;
  specWineCount?: number | null;
  specAxis?: string | null;
  passed: boolean;
  /** Validator names that produced at least one violation, e.g. ["markMix", "banker"]. */
  rulesFired: string[];
  /** Rule -> violation strings. Kept in full so real failures can be read back as examples. */
  violations?: Record<string, string[]> | null;
  questionId?: string | null;
  latencyMs?: number | null;
  parseFailed?: boolean;
  modelError?: string | null;
  /** The transport caps in force for this attempt, so timeout tuning is a GROUP BY (migration 019). */
  callTimeoutMs?: number | null;
  budgetMs?: number | null;
};

export function logGenerationAttempt(record: GenerationAttemptRecord): void {
  // Deliberately not awaited by callers.
  void (async () => {
    try {
      if (!process.env.DATABASE_URL) return;
      const sql = neon(process.env.DATABASE_URL);
      await sql`
        INSERT INTO generation_attempts (
          paper, family, source, user_id, attempt, model, ab_group,
          prompt_version, spec_version, is_repair, spec_wine_count, spec_axis,
          passed, rules_fired, violations, question_id, latency_ms, parse_failed, model_error,
          call_timeout_ms, budget_ms
        ) VALUES (
          ${record.paper}, ${record.family ?? null}, ${record.source ?? null}, ${record.userId ?? null},
          ${record.attempt}, ${record.model ?? null}, ${record.abGroup ?? null},
          ${PROMPT_VERSION}, ${record.specVersion ?? null}, ${record.isRepair},
          ${record.specWineCount ?? null}, ${record.specAxis ?? null},
          ${record.passed}, ${record.rulesFired}, ${JSON.stringify(record.violations ?? {})},
          ${record.questionId ?? null}, ${record.latencyMs ?? null},
          ${record.parseFailed ?? false}, ${record.modelError ?? null},
          ${record.callTimeoutMs ?? null}, ${record.budgetMs ?? null}
        )`;
    } catch (err) {
      // A missing table (migration not yet applied) or a transient DB blip must not surface.
      console.error("generation telemetry write failed (non-fatal):", err instanceof Error ? err.message : err);
    }
  })();
}
