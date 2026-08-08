// backfill-answer-key-roles.mjs — stamp a banker/curveball ROLE onto every stored answer key.
//
//   node --import ./scripts/ts-loader.mjs scripts/backfill-answer-key-roles.mjs --dry-run
//   node --import ./scripts/ts-loader.mjs scripts/backfill-answer-key-roles.mjs
//   node --import ./scripts/ts-loader.mjs scripts/backfill-answer-key-roles.mjs --refresh-derived
//
// RUN --refresh-derived AFTER ANY CHANGE TO BANKER_SIGNALS. A derived role is a cached verdict from that
// table, and a stored role is ENFORCED — so recalibrating the table silently leaves stale roles behind
// that Rule 1 will act on, rewriting prose to agree with a verdict the table no longer holds. Adding the
// Tavel signal left exactly one such row out of 2265 keyed wines; a broader recalibration would leave
// more. Generator-declared roles are never touched by the refresh: they record intent, not an inference.
//
// WHY THIS EXISTS. validateAnswerKeyClaims Rule 1 checks that a debrief's "banker"/"curveball" label
// agrees with the wine's keyed role, and it only ENFORCES (triggers a correction pass) against a role
// the answer key actually stores. Migration 065 makes the generator declare roles — but only for
// questions generated from now on. Without this backfill the ~900 already-banked questions would stay
// unenforced forever, including the one that produced the original report (fb_188).
//
// PROVENANCE MATTERS, so every row this script writes is stamped role_source='derived', versus
// 'generator' for a declared one. The distinction is not cosmetic:
//
//   'generator' is a RECORD of what the flight was built to do.
//   'derived'   is an INFERENCE from isBanker() — the reviewer-calibrated region×variety table in
//               question-validator.ts (curated against the real exam in PR #112, pinned by
//               tests/flight-composition.test.ts). Good evidence, but still an inference.
//
// Keeping them separable means the grading_telemetry rows can be split by source later, so if derived
// roles turn out to disagree with examiners more often than declared ones, that is measurable rather
// than a matter of opinion — and this whole backfill is revertible with one UPDATE.
//
// IDEMPOTENT: without --refresh-derived an existing role is left exactly as it is, so re-running never
// overwrites a generator-declared role with a derived one, in either order. It also never fills a role
// the AGREEMENT GATE withheld — on a question whose generator declared its roles, a missing role means
// the declaration and the classifier disagreed and neither is trusted enough to enforce.

import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { isBanker } from "../src/lib/question-validator.ts";

const DRY_RUN = process.argv.includes("--dry-run");
const REFRESH = process.argv.includes("--refresh-derived");

// Prefer the env var (CI); fall back to study-app/.env.local when run by hand, the same way
// build-stem-answer-keys.mjs and regen-model-answers.mjs do. Run from study-app/.
function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const text = readFileSync(".env.local", "utf8");
  const match = text.match(/DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/);
  if (!match) throw new Error("DATABASE_URL not in the environment or study-app/.env.local");
  return match[1].trim();
}
const sql = neon(databaseUrl());

const rows = await sql`
  SELECT k.question_id, k.ground_truth, g.wines, g.paper, g.curveball_slots
  FROM stem_answer_keys k
  JOIN generated_questions g ON g.question_id = k.question_id
  ORDER BY k.question_id
`;

let examined = 0;
let updated = 0;
let winesStamped = 0;
let skippedAlreadyRoled = 0;
let refreshedWines = 0;
let skippedGateDeclined = 0;
const tally = { banker: 0, curveball: 0 };

for (const r of rows) {
  examined += 1;
  const ground = typeof r.ground_truth === "string" ? JSON.parse(r.ground_truth) : r.ground_truth;
  if (!Array.isArray(ground) || ground.length === 0) continue;

  const wines = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
  const labelBySlot = new Map((wines || []).map((w) => [w.slot, w.fullText]));

  // Did the GENERATOR declare this flight's roles? If so, a wine with no role is not a gap this script
  // should fill — it is the agreement gate in buildKeyForRow having DECLINED to key it, because the
  // declaration and the classifier disagreed. Stamping a derived role there re-enforces the very verdict
  // the gate withheld, which is what a first run of this script did to three wines before this check
  // existed. Only questions with NO declaration (everything predating migration 065) are in scope.
  const generatorDeclared = Array.isArray(r.curveball_slots);

  let changed = false;
  const next = ground.map((g) => {
    if (!g || typeof g.slot !== "number") return g;
    if (!g.role && generatorDeclared) { skippedGateDeclined += 1; return g; }
    // Never clobber a role — EXCEPT a derived one under --refresh-derived, where the whole point is to
    // recompute the cached verdict. A generator-declared role is intent and is never recomputed.
    if (g.role && !(REFRESH && g.role_source === "derived")) { skippedAlreadyRoled += 1; return g; }
    // isBanker reads region + country + label together, so give it the label the candidate sees —
    // it is what carries "Châteauneuf-du-Pape Blanc", and the blanc exclusion depends on seeing it.
    const role = isBanker({
      slot: g.slot,
      varieties: g.varieties || [],
      region: g.region || "",
      country: g.country,
      fullText: labelBySlot.get(g.slot),
    })
      ? "banker"
      : "curveball";
    if (g.role === role) { skippedAlreadyRoled += 1; return g; } // already correct; not a write
    if (g.role) refreshedWines += 1;
    changed = true;
    winesStamped += 1;
    tally[role] += 1;
    return { ...g, role, role_source: "derived" };
  });

  if (!changed) continue;
  updated += 1;
  if (!DRY_RUN) {
    await sql`
      UPDATE stem_answer_keys SET ground_truth = ${JSON.stringify(next)}::jsonb
      WHERE question_id = ${r.question_id}
    `;
  }
}

console.log(`\n${DRY_RUN ? "DRY RUN — nothing written" : "WROTE"}`);
console.log(`  answer keys examined     ${examined}`);
console.log(`  answer keys updated      ${updated}`);
console.log(`  wines stamped            ${winesStamped}  (banker ${tally.banker}, curveball ${tally.curveball})`);
console.log(`  wines left alone         ${skippedAlreadyRoled}  (already carried a correct role)`);
console.log(`  gate declined, untouched ${skippedGateDeclined}  (generator declared; the gate withheld a role)`);
if (REFRESH) console.log(`  stale roles CORRECTED    ${refreshedWines}  (--refresh-derived)`);
if (winesStamped) {
  const pct = ((tally.curveball / winesStamped) * 100).toFixed(1);
  console.log(`\n  curveball share ${pct}% — sanity-check this against flight composition: the rule expects`);
  console.log(`  at least one banker per flight and at most ~half the flight as curveballs, so a share`);
  console.log(`  far above 50% would mean the table is under-matching, not that the bank is exotic.`);
}
console.log(`\nRevert with:  UPDATE stem_answer_keys SET ground_truth = (`);
console.log(`  SELECT jsonb_agg(e - 'role' - 'role_source') FROM jsonb_array_elements(ground_truth) e`);
console.log(`) WHERE ground_truth::text LIKE '%"role_source": "derived"%';`);
