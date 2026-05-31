// stem-answer-key.ts — LIVE stem answer-key derivation for the running app.
//
// Thin wrapper over the shared derivation in ./stem-answer-key.mjs (the single source of truth,
// also used by the offline CI backfill — so a live-generated drill is keyed by the SAME logic as
// the banked pool). Loads the lexicon/bank data from study-app/public/data (synced from repo-root
// data/ at prebuild by scripts/sync-stem-data.mjs). The key is a DERIVED artifact read off the
// wine_profiles the engine already produced — not a separate source of truth.

import { readFileSync } from "fs";
import { join } from "path";
import { neon } from "@neondatabase/serverless";
import { createAnswerKeyBuilder } from "./stem-answer-key.mjs";

export interface StemKey {
  ground: Array<{
    slot: number;
    varieties: string[];
    is_blend: boolean;
    region: string;
    country: string;
    style?: string;
    style_category?: string;
    style_tokens?: string[];
  }>;
  plausible: Array<{ variety: string; region: string; country: string | null; tier: string }>;
  source: Record<string, string>;
  ok: boolean;
  problems: string[];
}

export interface StemKeyRow {
  question_id?: string;
  paper: number;
  question_text: string;
  wines: unknown;
  wine_profiles: unknown;
}

type Builder = { buildKeyForRow: (row: StemKeyRow) => StemKey };

// Lazily build the derivation context once per server instance (the data files are static per deploy).
let cached: Builder | null = null;
function builder(): Builder {
  if (cached) return cached;
  const dir = join(process.cwd(), "public", "data");
  const load = (f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));
  cached = createAnswerKeyBuilder({
    variety_lexicon: load("variety_lexicon.json"),
    appellation_varieties: load("appellation_varieties.json"),
    stem_proprietary_blends: load("stem_proprietary_blends.json"),
    stem_style_lexicon: load("stem_style_lexicon.json"),
    mock_wine_bank: load("mock_wine_bank.json"),
  }) as unknown as Builder;
  return cached;
}

// Pure: derive the key for an in-hand row (identical logic & data to the offline backfill).
export function deriveStemKey(row: StemKeyRow): StemKey {
  return builder().buildKeyForRow(row);
}

// Upsert a derived key. validated = key.ok (§2b). Same SQL as the offline backfill's upsertKey.
export async function persistStemKey(questionId: string, key: StemKey): Promise<void> {
  const sql = neon(process.env.DATABASE_URL!);
  await sql`
    INSERT INTO stem_answer_keys (question_id, ground_truth, plausible, source, validated, generated_at)
    VALUES (${questionId}, ${JSON.stringify(key.ground)}::jsonb, ${JSON.stringify(key.plausible)}::jsonb,
            ${JSON.stringify(key.source)}::jsonb, ${key.ok}, now())
    ON CONFLICT (question_id) DO UPDATE SET
      ground_truth = EXCLUDED.ground_truth, plausible = EXCLUDED.plausible,
      source = EXCLUDED.source, validated = EXCLUDED.validated, generated_at = now()`;
}

/**
 * Live: derive + upsert the stem_answer_key for a generated question. Reads the row (incl. the
 * wine_profiles the engine produced) and writes validated = key.ok (§2b: every wine must resolve a
 * variety + origin consistently). Returns the validation outcome, or an error if the row/profiles
 * aren't ready yet (the caller can retry once enrichment completes — the background-during-stem model).
 */
export async function buildStemKeyForQuestion(
  questionId: string
): Promise<{ ok: boolean; problems: string[] } | { error: string }> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT question_id, paper, question_text, wines, wine_profiles
    FROM generated_questions WHERE question_id = ${questionId}
  `;
  const r = rows[0];
  if (!r) return { error: "question not found" };
  // The backfill only keys rows with wine_profiles; match that policy so live keys are as reliable.
  if (r.wine_profiles == null) return { error: "wine_profiles not ready" };

  const key = deriveStemKey(r as StemKeyRow);
  await persistStemKey(questionId, key);
  return { ok: key.ok, problems: key.problems };
}
