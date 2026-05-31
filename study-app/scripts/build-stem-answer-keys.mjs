// build-stem-answer-keys.mjs — Stem Sniper answer-key backfill (offline / CI).
//
// The DERIVATION lives in src/lib/stem-answer-key.mjs (the single source of truth, shared with the
// live path so the two can never drift). This script is the thin offline driver: it loads the
// repo-root data files, runs migrations, derives a key for every generated_questions row, and
// upserts. Invoked by .github/workflows/auto-feedback.yml when the lexicons change, and runnable
// locally:  node study-app/scripts/build-stem-answer-keys.mjs
//
// 1. Idempotent migrations: user_attempts.mode/drill_payload + the stem_answer_keys table.
// 2. buildKeyForRow per row (variety/region via source-priority resolver; plausible = same variety,
//    other classic regions). §2b: validated:true only if every wine resolves variety + origin
//    consistently; failures are written validated:false and excluded from the drill pool.
// 3. Upsert into stem_answer_keys and print a summary.

import { readFileSync } from "fs";
import { fileURLToPath, pathToFileURL } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";
import { createAnswerKeyBuilder } from "../src/lib/stem-answer-key.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataFile = (f) => JSON.parse(readFileSync(join(ROOT, "data", f), "utf8"));

// Prefer the env var (CI / the auto-feedback Action) and fall back to study-app/.env.local (local).
const DATABASE_URL =
  process.env.DATABASE_URL ||
  readFileSync(join(ROOT, "study-app", ".env.local"), "utf8").match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
const sql = neon(DATABASE_URL);

// Single source of truth for the derivation — same module the live path imports.
const { buildKeyForRow: _buildKeyForRow } = createAnswerKeyBuilder({
  variety_lexicon: dataFile("variety_lexicon.json"),
  appellation_varieties: dataFile("appellation_varieties.json"),
  stem_proprietary_blends: dataFile("stem_proprietary_blends.json"),
  stem_style_lexicon: dataFile("stem_style_lexicon.json"),
  mock_wine_bank: dataFile("mock_wine_bank.json"),
});

// Re-exported so the remediation loop / tests can validate a freshly generated question.
export const buildKeyForRow = _buildKeyForRow;

// ---------- migrations ----------
async function migrate() {
  await sql`ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'full'`;
  await sql`ALTER TABLE user_attempts ADD COLUMN IF NOT EXISTS drill_payload JSONB`;
  await sql`
    CREATE TABLE IF NOT EXISTS stem_answer_keys (
      question_id  TEXT PRIMARY KEY REFERENCES generated_questions(question_id),
      ground_truth JSONB NOT NULL,
      plausible    JSONB NOT NULL,
      source       JSONB NOT NULL,
      validated    BOOLEAN NOT NULL DEFAULT false,
      generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;
  console.log("migrations applied (user_attempts.mode/drill_payload, stem_answer_keys).");
}

// ---------- upsert one key ----------
export async function upsertKey(questionId, { ground, plausible, source, ok }) {
  await sql`
    INSERT INTO stem_answer_keys (question_id, ground_truth, plausible, source, validated, generated_at)
    VALUES (${questionId}, ${JSON.stringify(ground)}::jsonb, ${JSON.stringify(plausible)}::jsonb,
            ${JSON.stringify(source)}::jsonb, ${ok}, now())
    ON CONFLICT (question_id) DO UPDATE SET
      ground_truth = EXCLUDED.ground_truth, plausible = EXCLUDED.plausible,
      source = EXCLUDED.source, validated = EXCLUDED.validated, generated_at = now()`;
}

// ---------- build (all live rows) ----------
export async function build() {
  // Skip archived rows (Phase D: a quarantined question replaced by a regenerated one is marked
  // metadata.archived=true so it leaves the live pool and is never re-validated here).
  const rows = await sql`
    SELECT question_id, paper, family, question_text, wines, wine_profiles
    FROM generated_questions
    WHERE wine_profiles IS NOT NULL
      AND (metadata->>'archived') IS DISTINCT FROM 'true'`;
  let validated = 0;
  const failures = [];
  for (const r of rows) {
    const key = buildKeyForRow(r);
    if (key.ok) validated++;
    else failures.push(`${r.question_id} (P${r.paper} ${r.family}): ${key.problems.join("; ")}`);
    await upsertKey(r.question_id, key);
  }
  console.log(`\nstem_answer_keys built: ${validated}/${rows.length} validated:true (${Math.round((validated / rows.length) * 100)}%).`);
  if (failures.length) {
    console.log("validated:false (excluded from drills):");
    failures.forEach((f) => console.log("  " + f));
  }
}

// Auto-run migrations + full build only when executed directly (not when imported as a lib,
// and not under `node -e` where argv[1] is undefined).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await migrate();
  await build();
  console.log("done.");
}
