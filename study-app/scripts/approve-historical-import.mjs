// approve-historical-import.mjs — move clean historical imports into the servable pool.
//
//   node --import ./scripts/ts-loader.mjs scripts/approve-historical-import.mjs [--year=2024] [--dry-run]
//
// Imported questions land review_state='pending' so nothing reaches a candidate unreviewed. Every
// serving read gates on review_state='kept' AND status='approved', so until they are kept they are
// banked but invisible — which is the correct default and also, on its own, a dead end.
//
// This applies the SAME field set the admin "keep" action applies (db.ts keepAllPending):
//
//     status='approved', review_state='kept', review_status='kept',
//     reviewed_at=NOW(), reviewed_by=<admin>, auto_kept=false
//
// so an approved import is indistinguishable from one an admin kept in the UI, and the Recent-batches
// strip and reviewer attribution still read correctly.
//
// QUARANTINED ROWS ARE NEVER TOUCHED. A row with invalid_reasons is excluded, because keeping it would
// put a question the audit has rejected in front of a candidate — and the serve-time gate would
// exclude it anyway, leaving a row that claims to be kept and never appears.

import { neon } from "@neondatabase/serverless";

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const YEAR = arg("year", null);
const DRY = process.argv.includes("--dry-run");

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const sql = neon(process.env.DATABASE_URL);

// Attribute the keep to a real admin, as the UI would. reviewed_by is a bare int with no FK, but
// pointing it at a non-existent user would make "Reviewed by …" render blank in the admin strip.
const [admin] = await sql`
  SELECT id, email FROM users
  WHERE is_admin = true AND is_active = true AND deleted_at IS NULL
  ORDER BY id LIMIT 1`;
if (!admin) throw new Error("no active admin user to attribute the review to");

const pattern = YEAR ? `hist_${YEAR}\\_%` : "hist\\_%";
const pending = await sql`
  SELECT question_id, paper, batch_id, (invalid_reasons IS NOT NULL) AS quarantined
  FROM generated_questions
  WHERE question_id LIKE ${pattern} AND review_state = 'pending'
  ORDER BY question_id`;

const clean = pending.filter((r) => !r.quarantined);
const held = pending.filter((r) => r.quarantined);

console.log(`[approve] ${pending.length} pending imported question(s)${YEAR ? ` for ${YEAR}` : ""}`);
console.log(`[approve]   ${clean.length} clean -> will be kept`);
console.log(`[approve]   ${held.length} quarantined -> left pending`);
for (const r of held) console.log(`             held: ${r.question_id}`);
if (!clean.length) { console.log("[approve] nothing to do"); process.exit(0); }
if (DRY) { console.log("[approve] dry run — no changes"); process.exit(0); }

const ids = clean.map((r) => r.question_id);
const updated = await sql`
  UPDATE generated_questions SET
    status = 'approved', review_state = 'kept', review_status = 'kept',
    reviewed_at = NOW(), reviewed_by = ${admin.id}, auto_kept = false
  WHERE question_id = ANY(${ids}) AND review_state = 'pending'
  RETURNING question_id`;

// Keep the batch bookkeeping honest for the rows that came through the engine path and do have one.
const batches = [...new Set(clean.map((r) => r.batch_id).filter(Boolean))];
for (const b of batches) {
  const n = clean.filter((r) => r.batch_id === b).length;
  await sql`UPDATE bank_batches SET kept_count = kept_count + ${n} WHERE id = ${b}`;
  await sql`UPDATE bank_batches SET resolved_by = ${admin.id}, resolved_at = NOW() WHERE id = ${b}`;
}

console.log(`[approve] kept ${updated.length}, attributed to ${admin.email}`);
console.log(`[approve] updated ${batches.length} batch record(s)`);

const [{ n: servable }] = await sql`
  SELECT COUNT(*)::int AS n FROM generated_questions
  WHERE question_id LIKE 'hist\\_%' AND status = 'approved' AND review_state = 'kept'
    AND invalid_reasons IS NULL AND is_retired IS NOT TRUE AND scope = 'pool'`;
console.log(`[approve] historical questions now servable: ${servable}`);
