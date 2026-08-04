// repair-question-marks.mjs — deterministically rescale printed marks to the house rule.
//
// The MW rule (universal in the corpus 2014-2025, and stated in the generation prompt) is that a
// question is worth EXACTLY 25 marks per wine. The generator gets the arithmetic wrong on roughly a
// quarter of drafts — always by OVER-allocating (the historical corpus never overshoots) — and
// question-rules.mjs then flags {rule:"marks", severity:"hard"}, which sets invalid_reasons and
// drops the question out of getEligibleBankedQuestions for every user.
//
// Regenerating those questions is unreliable: the model fails the same arithmetic on retry (one
// observed remediation burned all 6 attempts emitting 40,40,40,40,40,90 for a target of 50). But the
// question CONTENT — stem, wines, answer key — is fine; only the printed mark values are off. So we
// rescale them in place, preserving each sub-question's relative weighting (which encodes the
// family's mark emphasis), and clear the marks violation.
//
//   node --import ./scripts/ts-loader.mjs scripts/repair-question-marks.mjs           (dry run)
//   node --import ./scripts/ts-loader.mjs scripts/repair-question-marks.mjs --apply   (commit)
//
// Run from study-app/. Reads DATABASE_URL from env or .env.local. No LLM calls, no network beyond
// the database.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV = (() => {
  try { return readFileSync(join(ROOT, ".env.local"), "utf8"); } catch { return ""; }
})();
const envVal = (k) =>
  process.env[k] || (ENV.match(new RegExp(k + '\\s*=\\s*"?([^"\\n\\r]+)"?'))?.[1]?.trim() ?? "");
process.env.DATABASE_URL = envVal("DATABASE_URL");
if (!process.env.DATABASE_URL) {
  console.error("Missing DATABASE_URL (env or .env.local).");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const APPLY = process.argv.includes("--apply");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) || "").split("=")[1]) || Infinity;

// Mark tokens as authored by the generator, in the two shapes the parser understands:
//   "(15 marks)"      -> k=1  (a single or flight-shared allocation)
//   "(3 x 15 marks)"  -> k=3  (per-wine: the multiplier is the wine count, NOT a scalable value)
// Only the VALUE scales; the multiplier is structural and must be left alone.
const TOKEN_RE = /\((\d+)\s*[x×]\s*(\d+)\s*(marks?)\)|\((\d+)\s*(marks?)\)/gi;

export function parseMarkTokens(text) {
  const tokens = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m[1] !== undefined) {
      tokens.push({ index: m.index, raw: m[0], k: parseInt(m[1]), v: parseInt(m[2]), word: m[3], form: "per-wine" });
    } else {
      tokens.push({ index: m.index, raw: m[0], k: 1, v: parseInt(m[4]), word: m[5], form: "flat" });
    }
  }
  return tokens;
}

const total = (tokens) => tokens.reduce((s, t) => s + t.k * t.v, 0);

/**
 * Rescale token values so that sum(k*v) === target, keeping every value a positive integer and
 * staying as close as possible to the original proportions.
 *
 * Rounding alone will not generally land on the target, so the remainder is then walked off one
 * step at a time. Adjusting a token moves the total by its multiplier k, so we prefer the SMALLEST
 * k that still fits inside the remaining difference — that is what makes an exact landing possible
 * whenever a k=1 token exists, and keeps the correction spread sensibly when one does not.
 * Returns null when the target is unreachable in integers (caller then leaves the question alone).
 */
// Rescaling is only defensible when the draft is in the right ballpark and merely mis-added. A
// draft that is off by more than these bounds is structurally wrong, not miscounted, and rescaling
// would launder it into something exam-unrealistic rather than fix it — e.g. an observed 5-wine
// question printed at 60 marks scales to 125 and yields a single shared "(54 marks)" part, nearly
// half the question. Those stay quarantined for regeneration instead.
const MIN_FACTOR = 0.6;
const MAX_FACTOR = 1.5;
// No single flight-shared (k=1) part may swallow this share of the question.
const MAX_FLAT_SHARE = 0.4;

export function rescaleTokens(tokens, target) {
  const current = total(tokens);
  if (current <= 0 || tokens.length === 0) return null;
  if (current === target) return tokens.map((t) => ({ ...t }));

  const factor = target / current;
  if (factor < MIN_FACTOR || factor > MAX_FACTOR) return null;
  const out = tokens.map((t) => ({ ...t, v: Math.max(1, Math.round(t.v * factor)) }));

  let diff = target - total(out);
  let guard = 10000;
  while (diff !== 0 && guard-- > 0) {
    const step = Math.sign(diff);
    // Smallest multiplier that does not overshoot; a token may never drop below 1 mark.
    const candidates = out
      .filter((t) => t.k <= Math.abs(diff) && (step > 0 || t.v > 1))
      .sort((a, b) => a.k - b.k || b.v - a.v);
    if (candidates.length === 0) return null;
    candidates[0].v += step;
    diff -= step * candidates[0].k;
  }
  if (diff !== 0) return null;
  if (out.some((t) => t.k === 1 && t.v > target * MAX_FLAT_SHARE)) return null;
  return out;
}

export function rewriteMarks(text, newTokens) {
  // Rebuild right-to-left so earlier match indices stay valid.
  let out = text;
  for (let i = newTokens.length - 1; i >= 0; i--) {
    const t = newTokens[i];
    const replacement = t.form === "per-wine"
      ? `(${t.k} x ${t.v} ${t.word})`
      : `(${t.v} ${t.word})`;
    out = out.slice(0, t.index) + replacement + out.slice(t.index + t.raw.length);
  }
  return out;
}

async function main() {
  // Only questions whose SOLE quarantine reason is marks. Anything with a content defect
  // (same-variety, country-diversity, a no-variety wine) is a real problem that rescaling cannot
  // fix, so it stays quarantined and out of scope here.
  const rows = await sql`
    SELECT question_id, paper, family, question_text, wines, total_marks, invalid_reasons
    FROM generated_questions q
    WHERE q.invalid_reasons IS NOT NULL
      AND (q.metadata->>'archived') IS DISTINCT FROM 'true'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(q.invalid_reasons) r WHERE r->>'rule' <> 'marks'
      )
    ORDER BY q.paper, q.created_at`;

  const targets = Number.isFinite(LIMIT) ? rows.slice(0, LIMIT) : rows;
  console.log(`Marks-only quarantined questions: ${rows.length}. Repairing ${targets.length}. apply=${APPLY}\n`);

  let fixed = 0, skipped = 0;
  for (const q of targets) {
    const wines = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
    const nWines = Array.isArray(wines) ? wines.length : 0;
    if (!nWines) { console.log(`  ⊘ ${q.question_id}: no wines, skipped`); skipped++; continue; }

    const target = nWines * 25;
    const tokens = parseMarkTokens(q.question_text);
    const before = total(tokens);
    const rescaled = rescaleTokens(tokens, target);

    if (!rescaled) {
      console.log(`  ⊘ ${q.question_id} (P${q.paper}): cannot rescale ${before} → ${target} safely (factor out of range, target unreachable in integers, or an oversized shared part) — left quarantined`);
      skipped++;
      continue;
    }

    const newText = rewriteMarks(q.question_text, rescaled);
    const after = total(rescaled);
    if (after !== target) {
      console.log(`  ⊘ ${q.question_id}: internal check failed (${after} != ${target}) — left alone`);
      skipped++;
      continue;
    }

    console.log(`  ✓ ${q.question_id} (P${q.paper} ${q.family}, ${nWines} wines): ${before} → ${after} marks`);
    console.log(`      ${tokens.map((t) => t.raw).join("  ")}`);
    console.log(`   →  ${rescaled.map((t) => (t.form === "per-wine" ? `(${t.k} x ${t.v} ${t.word})` : `(${t.v} ${t.word})`)).join("  ")}`);

    if (APPLY) {
      await sql`
        UPDATE generated_questions
        SET question_text = ${newText},
            total_marks = ${target},
            invalid_reasons = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              marks_repaired: true,
              marks_before: before,
              marks_after: target,
            })}::jsonb
        WHERE question_id = ${q.question_id}`;
    }
    fixed++;
  }

  console.log(`\n──────── SUMMARY ────────`);
  console.log(`  repaired: ${fixed}   skipped: ${skipped}`);
  console.log(APPLY ? "  Committed (invalid_reasons cleared — these re-enter the live pool)." : "  Dry run — pass --apply to commit.");
}

// Allow importing the pure helpers from a test without running the migration.
if (!process.argv.includes("--import-only")) {
  await main();
  console.log("done.");
}
