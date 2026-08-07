// audit-questions.mjs — run the hard validator over every generated question.
//   node --import ./scripts/ts-loader.mjs scripts/audit-questions.mjs           (dry run: report only)
//   node --import ./scripts/ts-loader.mjs scripts/audit-questions.mjs --apply   (quarantine HARD violations)
//   ... --apply --only=wrong_colour_for_paper,paper-style-mix                    (quarantine ONLY those rules)
//
// The ts-loader is required: question-validator.ts imports ./tasting-validators extensionless, which
// Node 24's native type-stripping will not resolve. Plain `node` dies with ERR_MODULE_NOT_FOUND.
//
// --only=<rules> exists because a blanket --apply is a blunt instrument. The corpus currently has hard
// violations on 62% of questions, overwhelmingly from two long-standing rule families
// (id-mark-allocation, flight-composition). Quarantining all of them at once would gut the servable
// pool. --only lets a NEW rule be enforced over the back catalogue on its own. In that mode the script
// also MERGES its reasons into invalid_reasons instead of replacing them, and skips the
// clear-stale-flags branch entirely — a question that is clean for the scoped rules may be legitimately
// quarantined for others, and clearing that would silently return it to service.
// Reads ground_truth from stem_answer_keys (already-resolved variety/region/country/is_blend per wine).
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { validateQuestion } from "../src/lib/question-validator.ts";
// Load-bearing: registers the appellation → primary-variety fallback. This script runs in its own
// process, so without this import detectPrimaryVariety returns "unknown" for every appellation-only
// label and the sweep cannot see a Hermitage sitting in a Paper 1 flight.
import "../src/lib/appellation-resolver.ts";

const DB = process.env.DATABASE_URL || readFileSync(".env.local", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
const sql = neon(DB);
const apply = process.argv.includes("--apply");
const onlyRules = (process.argv.find((a) => a.startsWith("--only=")) || "")
  .slice("--only=".length)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const scoped = onlyRules.length > 0;
if (scoped) console.log(`Scoped to rules: ${onlyRules.join(", ")} (merging, not replacing; no flag clearing)\n`);

if (apply) {
  await sql`ALTER TABLE stem_answer_keys ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
  // CF-1: flag the question row itself so the MAIN study flow (not just Stem Sniper) can exclude it.
  await sql`ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
}

// Skip archived rows (Phase D: a quarantined question replaced by a regenerated one is marked
// metadata.archived=true). They stay hidden from both study flows and out of the audit's tally,
// so a remediated corpus can report 0 HARD violations on the live pool.
// g.wines comes along for the ride so the raw label can be zipped back onto the resolved key below —
// the wine-reference-shape rule needs the original string, which ground_truth has already thrown away.
const rows = await sql`
  SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, g.wines, g.model_answer,
         k.ground_truth, k.validated
  FROM generated_questions g JOIN stem_answer_keys k ON k.question_id = g.question_id
  WHERE (g.metadata->>'archived') IS DISTINCT FROM 'true'
  ORDER BY g.paper, g.family`;

let hardCount = 0, softCount = 0, quarantined = 0, setScored = 0;
const byRule = {};
for (const r of rows) {
  const gt = typeof r.ground_truth === "string" ? JSON.parse(r.ground_truth) : r.ground_truth;
  // Zip the raw label back onto each resolved key wine, by slot. A slot holding the generator's
  // deliberation instead of a wine still resolves to a plausible-looking key (a paragraph mentioning
  // "Amontillado" and "Spain" keys as Palomino/Jerez/Spain), so the shape rule is the only one that
  // can see the defect — and it needs the string ground_truth discarded.
  const raw = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
  const bySlot = new Map((Array.isArray(raw) ? raw : []).map((w) => [w.slot, w.fullText]));
  const wines = (gt || []).map((w) => (bySlot.has(w.slot) ? { ...w, fullText: bySlot.get(w.slot) } : w));
  const res = validateQuestion({
    questionId: r.question_id, paper: r.paper, family: r.family,
    questionText: r.question_text, totalMarks: r.total_marks, wines,
    // Answer-content rules (answer-content-rules.mjs) run over the stored model answer when one
    // exists — missing wines, absent identities, placeholders quarantine alongside the stem rules.
    modelAnswer: r.model_answer ?? null,
  });
  // Same-variety flights are scored by origin POOL, not per-wine binary, in the Stem Sniper drill.
  if (res.scoringModel === "set") setScored++;
  const hardAll = res.violations.filter((x) => x.severity === "hard");
  // In scoped mode only the named rules can quarantine; everything else is still REPORTED.
  const hard = scoped ? hardAll.filter((x) => onlyRules.includes(x.rule)) : hardAll;
  for (const x of res.violations) byRule[x.rule] = (byRule[x.rule] || 0) + 1;
  if (scoped ? hard.length : res.violations.length) {
    console.log(`${hard.length ? "HARD" : "soft"}  ${r.question_id}  (P${r.paper} ${r.family})`);
    (scoped ? hard : res.violations).forEach((x) => console.log(`        [${x.severity}] ${x.rule}: ${x.detail}`));
  }
  if (hard.length) {
    hardCount++;
    if (apply) {
      const payload = JSON.stringify(hard);
      if (scoped) {
        // MERGE + dedupe, so quarantining for a new rule does not erase reasons another rule recorded.
        await sql`
          UPDATE stem_answer_keys SET validated = false, invalid_reasons = (
            SELECT jsonb_agg(DISTINCT v) FROM jsonb_array_elements(
              (CASE WHEN jsonb_typeof(invalid_reasons) = 'array' THEN invalid_reasons ELSE '[]'::jsonb END)
              || ${payload}::jsonb) v)
          WHERE question_id = ${r.question_id}`;
        await sql`
          UPDATE generated_questions SET invalid_reasons = (
            SELECT jsonb_agg(DISTINCT v) FROM jsonb_array_elements(
              (CASE WHEN jsonb_typeof(invalid_reasons) = 'array' THEN invalid_reasons ELSE '[]'::jsonb END)
              || ${payload}::jsonb) v)
          WHERE question_id = ${r.question_id}`;
      } else {
        await sql`UPDATE stem_answer_keys SET validated = false, invalid_reasons = ${payload}::jsonb WHERE question_id = ${r.question_id}`;
        await sql`UPDATE generated_questions SET invalid_reasons = ${payload}::jsonb WHERE question_id = ${r.question_id}`;
      }
      quarantined++;
    }
  } else if (apply && !scoped) {
    // Clean now — clear any stale VALIDATOR flag so a fixed/regenerated question returns to service.
    // Feedback quarantines (rule 'feedback-question', set by apply-change.ts) are preserved: they
    // encode defects the rules can't see, and this script now runs nightly (question-audit-daily.yml)
    // — clearing them here would silently un-quarantine every user-reported bad question each night.
    await sql`
      UPDATE generated_questions SET invalid_reasons = NULL
      WHERE question_id = ${r.question_id} AND invalid_reasons IS NOT NULL
        AND invalid_reasons::text NOT LIKE '%feedback-question%'`;
  }
  if (!hard.length && res.violations.length) softCount++;
}

console.log(`\n──────── AUDIT SUMMARY ────────`);
console.log(`questions audited:   ${rows.length}`);
console.log(`HARD violations:     ${hardCount}  (${Math.round((hardCount / rows.length) * 100)}%)`);
console.log(`soft-only:           ${softCount}`);
console.log(`set-scored flights:  ${setScored}  (same-variety → origin-pool scoring, not per-wine)`);
console.log(`by rule:             ${JSON.stringify(byRule)}`);
console.log(apply ? `QUARANTINED (validated=false): ${quarantined}` : `(dry run — pass --apply to quarantine the HARD ones)`);
