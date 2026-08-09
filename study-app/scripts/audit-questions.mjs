// audit-questions.mjs — run the hard validator over every generated question.
//   node --import ./scripts/ts-loader.mjs scripts/audit-questions.mjs            (dry run: report only)
//   node --import ./scripts/ts-loader.mjs scripts/audit-questions.mjs --apply    (quarantine HARD violations)
//   ... --apply --only=wrong_colour_for_paper,paper-style-mix                     (quarantine ONLY those rules)
//
// The ts-loader is mandatory: question-validator.ts imports "./tasting-validators" extensionless, which
// plain `node` cannot resolve (ERR_MODULE_NOT_FOUND). Running this without it is how the nightly sweep
// went dark on 2026-08-07 — see .github/workflows/question-audit-daily.yml.
//
// --only=<rules> exists because a blanket --apply is a blunt instrument. When a NEW hard rule is added,
// the back catalogue can carry hundreds of hits from OTHER long-standing families, and quarantining all
// of them at once guts the servable pool. --only enforces just the named rules. In that mode the script
// also MERGES its reasons into invalid_reasons instead of replacing them, and skips the
// clear-stale-flags branch entirely — a question that is clean for the scoped rules may be legitimately
// quarantined for others, and clearing that would silently return it to service.
// Reads ground_truth from stem_answer_keys (already-resolved variety/region/country/is_blend per wine).
import { readFileSync } from "fs";
import { neon } from "@neondatabase/serverless";
import { validateQuestion, applyWineProfiles } from "../src/lib/question-validator.ts";
import { GROUND_TRUTH_INDEPENDENT_RULES } from "../src/lib/question-rules.mjs";
// The serve-time bank gate, imported so the sweep can enforce exactly what the serve path enforces
// rather than an approximation of it. See the SERVE-GATE PARITY note below.
import { bankedServeRejection } from "../src/lib/question-engine.ts";
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
// LEFT JOIN, not JOIN. The inner join is why this sweep never delivered the coverage its own header
// promised: a question with no stem_answer_key row simply was not in the result set, so the "backstop
// for rows the per-question audit cannot reach" reached exactly none of them. On 2026-08-08 that was
// 191 of the 409 servable questions — 47% of everything a candidate could be served had never been
// validated by any rule beyond the five in the serve gate.
const rows = await sql`
  SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, g.wines, g.model_answer,
         g.wine_profiles, g.metadata->>'source' AS source, g.invalid_reasons, k.ground_truth, k.validated
  FROM generated_questions g LEFT JOIN stem_answer_keys k ON k.question_id = g.question_id
  WHERE (g.metadata->>'archived') IS DISTINCT FROM 'true'
  ORDER BY g.paper, g.family`;

let hardCount = 0, softCount = 0, quarantined = 0, setScored = 0, unkeyed = 0, unkeyedCleared = 0;
const byRule = {};

// The rules an UNKEYED row is actually evaluated on: the ground-truth-independent set, plus the serve
// gate (which runs on every row regardless of key). A flag naming only these is one this pass could
// have re-set, so finding the row clean is real evidence the flag is stale. A flag naming anything
// else was written by an evaluation this pass cannot reproduce, and is left alone.
const UNKEYED_EVALUATED_RULES = new Set([...GROUND_TRUTH_INDEPENDENT_RULES, "serve-gate"]);

function clearableUnkeyed(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) return false;
  return reasons.every((x) => x && typeof x.rule === "string" && UNKEYED_EVALUATED_RULES.has(x.rule));
}
for (const r of rows) {
  const gt = typeof r.ground_truth === "string" ? JSON.parse(r.ground_truth) : r.ground_truth;
  const raw = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
  const rawWines = Array.isArray(raw) ? raw : [];
  const bySlot = new Map(rawWines.map((w) => [w.slot, w.fullText]));
  // A row with no key has no resolved variety/region/country at all, so the wines it can offer the
  // rule layer are bare labels. Everything the rules infer from a key is simply absent.
  const hasKey = !!gt;
  if (!hasKey) unkeyed++;
  const existingReasons =
    typeof r.invalid_reasons === "string" ? JSON.parse(r.invalid_reasons) : r.invalid_reasons;
  // Zip the raw label back onto each resolved key wine, by slot. A slot holding the generator's
  // deliberation instead of a wine still resolves to a plausible-looking key (a paragraph mentioning
  // "Amontillado" and "Spain" keys as Palomino/Jerez/Spain), so the shape rule is the only one that
  // can see the defect — and it needs the string ground_truth discarded.
  // wine_profiles was in this SELECT but never read, so the sweep judged every wine on the key alone
  // while auditAndQuarantineQuestion had at least been zipping the colour on — the two audits were
  // looking at different wines. applyWineProfiles is now the single place that merges the enrichment
  // in (colour, and the full grape list the key reduces to a dominant grape), used by both.
  const wines = applyWineProfiles(
    hasKey
      ? gt.map((w) => (bySlot.has(w.slot) ? { ...w, fullText: bySlot.get(w.slot) } : w))
      : rawWines.map((w) => ({ slot: w.slot, varieties: [], region: "", fullText: w.fullText })),
    r.wine_profiles
  );
  const res = validateQuestion({
    questionId: r.question_id, paper: r.paper, family: r.family,
    questionText: r.question_text, totalMarks: r.total_marks, wines,
    // Answer-content rules (answer-content-rules.mjs) run over the stored model answer when one
    // exists — missing wines, absent identities, placeholders quarantine alongside the stem rules.
    modelAnswer: r.model_answer ?? null,
    // Historical imports carry a verbatim past-paper stem, so the stem-SHAPE rules stand down here
    // exactly as they do in auditAndQuarantineQuestion. Without this the DAILY audit re-quarantines
    // every imported row on rules that reject up to 64% of the real corpus — which is precisely what
    // happened on 2026-08-08: eleven rows that passed generation came back id-mark-allocation.
    stemIsAuthoritative: r.source === "historical_stem",
  });
  // Same-variety flights are scored by origin POOL, not per-wine binary, in the Stem Sniper drill.
  if (res.scoringModel === "set") setScored++;
  let hardAll = res.violations.filter((x) => x.severity === "hard");

  // UNKEYED ROWS ENFORCE ONLY THE GROUND-TRUTH-INDEPENDENT RULES.
  //
  // The rest are not merely unreliable on bare labels, they are actively wrong: `country-diversity`
  // fires on 187 keyed questions when their ground truth is stripped and on zero of the same
  // questions keyed, because "N different countries" cannot be checked against wines whose country
  // nobody has resolved. Enforcing the full set here would quarantine most of the bank over nothing.
  // GROUND_TRUTH_INDEPENDENT_RULES is derived from that same two-way comparison — see the note on it
  // in question-rules.mjs and tests/ground-truth-independent-rules.test.ts, which re-derives it.
  if (!hasKey) hardAll = hardAll.filter((x) => GROUND_TRUTH_INDEPENDENT_RULES.includes(x.rule));

  // SERVE-GATE PARITY. filterValidBanked refuses questions at serve time that the SQL eligibility
  // predicate happily counts, so the "N available" on the setup card overstated the pool by 36 of 409
  // and those 36 sat as permanently unservable inventory that nothing ever flagged. Recording the
  // rejection here collapses the two gates into one: what the count advertises is what can be served.
  const serveRejection = bankedServeRejection({ ...r, wines: raw });
  if (serveRejection)
    hardAll.push({ rule: "serve-gate", severity: "hard", detail: serveRejection });

  // In scoped mode only the named rules can quarantine; everything else is still REPORTED.
  const hard = scoped ? hardAll.filter((x) => onlyRules.includes(x.rule)) : hardAll;
  // Report what is ENFORCED plus every soft finding. On an unkeyed row the hard rules that were
  // filtered out above are deliberately not printed as findings — they were never evaluated, and
  // listing them would read as "checked and passed".
  const reported = scoped
    ? hard
    : [...hardAll, ...res.violations.filter((x) => x.severity !== "hard")];
  // Tally the REPORTED set, not res.violations: counting a rule that ran on an unkeyed row but was
  // not enforced puts a number in the summary that no quarantine will ever match (country-diversity
  // showed 42 that way, all of them unenforceable verdicts on bare labels).
  for (const x of reported) byRule[x.rule] = (byRule[x.rule] || 0) + 1;
  if (reported.length) {
    console.log(
      `${hard.length ? "HARD" : "soft"}  ${r.question_id}  (P${r.paper} ${r.family})${hasKey ? "" : "  [unkeyed: only ground-truth-independent rules evaluated]"}`
    );
    reported.forEach((x) => console.log(`        [${x.severity}] ${x.rule}: ${x.detail}`));
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
    // A dry run REPORTS what it would clear (see the CLEAR lines below) but writes nothing: the
    // condition deliberately does not test `apply`, so `--apply` and a dry run agree on the verdict
    // and differ only in whether it is executed. Reviewing an un-quarantine before running it was
    // impossible while this branch was gated on `apply` — which is how the 60-row limbo went unnoticed.
  } else if (!scoped && (hasKey || clearableUnkeyed(existingReasons))) {
    // Clean now — clear any stale VALIDATOR flag so a fixed/regenerated question returns to service.
    //
    // KEYED ROWS, plus the one unkeyed case where "clean" actually means something. On an unkeyed row
    // "clean" is normally clean on eight rules out of thirty, which is no evidence that a flag set by a
    // full evaluation is stale — un-quarantining on that basis would return genuinely broken questions
    // to service. Same reasoning as scoped mode.
    //
    // But the quarantine side does NOT respect that boundary: the serve-gate check below runs on every
    // row, keyed or not, so an unkeyed question can be flagged by a rule we CAN re-evaluate and then
    // never released by a branch that refuses to look at it. R-OW-ANCHOR did exactly that on
    // 2026-08-09 — it matched "cabernet sauvignon" against the Sauvignon Blanc home region, quarantined
    // an unkeyed Napa + Western Cape Cabernet pair, and the fix could not free it; the row had to be
    // cleared by hand, and 60 unkeyed rows were sitting in the same limbo.
    //
    // So: an unkeyed row is clearable when EVERY reason on it names a rule this pass actually
    // evaluated. That keeps the original argument intact (a flag we cannot reproduce is never cleared
    // on partial evidence) while closing the asymmetry — we only release what we could have re-set.
    // Feedback quarantines (rule 'feedback-question', set by apply-change.ts) are preserved: they
    // encode defects the rules can't see, and this script now runs nightly (question-audit-daily.yml)
    // — clearing them here would silently un-quarantine every user-reported bad question each night.
    if (!hasKey && Array.isArray(existingReasons) && existingReasons.length) {
      unkeyedCleared++;
      console.log(
        `CLEAR ${r.question_id}  (unkeyed; stale flag${existingReasons.length > 1 ? "s" : ""}: ${existingReasons.map((x) => x.rule).join(", ")})${apply ? "" : "  [dry run]"}`
      );
    }
    // Guarded, not `continue`d — the soft tally at the bottom of the loop still has to run for this
    // row, or a dry run reports a different soft count than the same pass with --apply.
    if (apply) {
    await sql`
      UPDATE generated_questions SET invalid_reasons = NULL
      WHERE question_id = ${r.question_id} AND invalid_reasons IS NOT NULL
        AND invalid_reasons::text NOT LIKE '%feedback-question%'`;
    // The quarantine writes TWO flags (see the hard branch above): generated_questions gates the main
    // study flow, stem_answer_keys.validated gates the drills and Live Tasting. Clearing only the first
    // left a rule false-positive permanently fatal to the other two — after the 2026-08-07 AC2
    // stem-numbering fix, four flights would have returned to study and stayed dead as tastings.
    // validated is only restored when the key still resolves on its own terms (§2b: every slot keys a
    // variety and an origin), because validated=false is ALSO how the key builder records an
    // unresolvable wine — that reason is not this script's to clear.
    const keyResolves =
      Array.isArray(wines) && wines.length > 0 && wines.every((w) => (w.varieties || []).length && (w.region || w.country));
    if (keyResolves) {
      await sql`
        UPDATE stem_answer_keys SET validated = true, invalid_reasons = NULL
        WHERE question_id = ${r.question_id} AND invalid_reasons IS NOT NULL
          AND invalid_reasons::text NOT LIKE '%feedback-question%'`;
    } else {
      await sql`
        UPDATE stem_answer_keys SET invalid_reasons = NULL
        WHERE question_id = ${r.question_id} AND invalid_reasons IS NOT NULL
          AND invalid_reasons::text NOT LIKE '%feedback-question%'`;
    }
    }
  }
  if (!hard.length && res.violations.length) softCount++;
}

console.log(`\n──────── AUDIT SUMMARY ────────`);
console.log(`questions audited:   ${rows.length}`);
console.log(
  `  of which unkeyed:  ${unkeyed}  (evaluated on the ${GROUND_TRUTH_INDEPENDENT_RULES.length} ground-truth-independent rules + the serve gate only)`
);
if (unkeyedCleared) console.log(`  stale flags cleared on unkeyed rows: ${unkeyedCleared}`);
console.log(`HARD violations:     ${hardCount}  (${Math.round((hardCount / rows.length) * 100)}%)`);
console.log(`soft-only:           ${softCount}`);
console.log(`set-scored flights:  ${setScored}  (same-variety → origin-pool scoring, not per-wine)`);
console.log(`by rule:             ${JSON.stringify(byRule)}`);
console.log(apply ? `QUARANTINED (validated=false): ${quarantined}` : `(dry run — pass --apply to quarantine the HARD ones)`);
