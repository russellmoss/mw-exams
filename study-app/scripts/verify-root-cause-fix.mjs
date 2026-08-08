// verify-root-cause-fix.mjs — is an open bin-fix proposal actually a NEW fix?
//
//   node --import ./scripts/ts-loader.mjs scripts/verify-root-cause-fix.mjs
//   node --import ./scripts/ts-loader.mjs scripts/verify-root-cause-fix.mjs --id=17
//   node --import ./scripts/ts-loader.mjs scripts/verify-root-cause-fix.mjs --json
//
// READ-ONLY. Nothing here writes to the database, GitHub, or the working tree.
//
// The miner dedupes proposals by comparing THEME TEXT to other THEME TEXT (isDuplicateTheme in
// bin-fix-miner.ts). That catches a reworded label and nothing else. It never asks the two questions
// that decide whether a proposal is worth building:
//
//   1. Does this rule already exist in the code?
//   2. If a shipped fix already claimed this evidence, why is the evidence still here?
//
// On 2026-08-08 that gap had three of five open proposals re-implementing shipped validators — #17
// (PR 75) duplicating the note-completeness codes, #12 (PR 76) duplicating validateMarkBudget, #10
// duplicating validatePaperStyleMix. Two were already open PRs awaiting review.
//
//   A. EVIDENCE OVERLAP  — does this proposal's evidence intersect another proposal's? Overlap with a
//      SHIPPED one is the load-bearing signal: it has exactly two readings that demand opposite
//      responses — the proposal is a duplicate (close it), or the shipped fix did not work (escalate;
//      the root cause was mis-located). Checks B and C tell them apart.
//   B. SYMBOL COLLISION  — the function names and reason codes the brief asks for, looked up in
//      src/lib. Matched three ways: literal (case-insensitive), so NOTE_MISSING_ALCOHOL finds the
//      existing note_missing_alcohol; token-set, so `checkMarkBudget` finds `validateMarkBudget`;
//      and singular-stemmed, so `mark_total_mismatch` finds `MARKS_TOTAL_MISMATCH`. All three of the
//      real duplicates above differ from the shipped code by nothing more than one of those.
//   C. VALIDATOR REPLAY  — run the CURRENT validator over the questions the evidence points at.
//
// TWO THINGS WILL MAKE THIS TOOL LIE, and both are guarded rather than documented-and-forgotten:
//
//   • A STALE CHECKOUT. Every check asks "does the code already do this", so a checkout behind master
//     answers "no" to everything. Measured, not hypothesised: the first run of this script was made
//     from a tree sitting on an old branch and reported zero symbol collisions across all five
//     proposals and three spurious ESCALATEs. The guard below refuses to run when HEAD is behind
//     origin/master unless --allow-stale is passed.
//   • RULES OFF THE validateQuestion PATH. The replay only exercises what validateQuestion() calls.
//     The note-completeness rules are reachable from the tasting-note path, not from there, so a
//     question whose notes lack an alcohol band still "passes clean" here. Reporting that as "the
//     shipped fix missed" would be exactly backwards, so check C marks its verdict INCONCLUSIVE for
//     any collision it can prove validateQuestion cannot reach.

import { readFileSync, readdirSync, statSync } from "fs";
import { execSync } from "child_process";
import { join, relative } from "path";
import { neon } from "@neondatabase/serverless";
import { validateQuestion } from "../src/lib/question-validator.ts";
// Load-bearing in a standalone process: registers the appellation → primary-variety fallback, without
// which every appellation-only label resolves to "unknown" and the replay under-reports. Same reason
// audit-questions.mjs imports it.
import "../src/lib/appellation-resolver.ts";

const asJson = process.argv.includes("--json");
const allowStale = process.argv.includes("--allow-stale");
const onlyId = Number((process.argv.find((a) => a.startsWith("--id=")) || "").slice("--id=".length)) || null;
const OPEN = ["proposed", "dispatched", "pr_opened"];
const log = (...a) => { if (!asJson) console.log(...a); };

// --- guard 1: the checkout must be current, or every answer is "no" -------------------------------
let behind = null;
try {
  execSync("git fetch -q origin master", { stdio: "ignore" });
  behind = Number(execSync("git rev-list --count HEAD..origin/master", { encoding: "utf8" }).trim());
} catch { /* detached / no remote — fall through with behind === null */ }
if (behind === null) log("! could not compare HEAD to origin/master — verify manually that this tree is current\n");
else if (behind > 0) {
  const msg = `HEAD is ${behind} commit${behind === 1 ? "" : "s"} behind origin/master. Every check here asks "does the code already do this"; a stale tree answers no to all of them. Fast-forward first, or pass --allow-stale.`;
  if (!allowStale) { console.error(`REFUSING TO RUN: ${msg}`); process.exit(2); }
  log(`! ${msg}\n`);
}

const DB =
  process.env.DATABASE_URL ||
  readFileSync(".env.local", "utf8").match(/DATABASE_URL\s*=\s*"?([^"\n\r]+)"?/)[1].trim();
const sql = neon(DB);

// --- source index for check B ---------------------------------------------------------------------
const LIB = "src/lib";
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|mjs)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}
const sources = walk(LIB).map((p) => {
  const text = readFileSync(p, "utf8");
  return { path: relative(".", p).replace(/\\/g, "/"), text, lower: text.toLowerCase() };
});
if (!sources.length) { console.error(`REFUSING TO RUN: indexed 0 files under ${LIB} — run from study-app/.`); process.exit(2); }

// Identifiers that ALREADY exist: exported function names, plus reason-code-shaped string literals
// (the rule ids validators emit). Both are what a brief collides with.
const existingFns = new Set();
const existingCodes = new Set();
for (const s of sources) {
  for (const m of s.text.matchAll(/\bexport\s+(?:async\s+)?function\s+(\w+)/g)) existingFns.add(m[1]);
  for (const m of s.text.matchAll(/["'`]([A-Za-z][A-Za-z0-9]*(?:[_-][A-Za-z0-9]+)+)["'`]/g)) existingCodes.add(m[1]);
}

// Tokenise an identifier: camelCase, snake_case and kebab-case all split to lowercase words. Singular
// stemming is applied ONLY here and only for the code comparison — it is what separates the brief's
// `mark_total_mismatch` from the shipped `MARKS_TOTAL_MISMATCH`. (Note this is the opposite call from
// themeSimilarity in bin-fix-miner.ts, which measured stemming as harmful; that was over free-form
// prose themes where "wine"/"wines" collapses unrelated clusters. Identifier tokens are a far
// narrower vocabulary and the plural is pure noise.)
function tokens(id, stem = false) {
  const parts = id.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[_\-\s]+/).map((w) => w.toLowerCase()).filter(Boolean);
  return new Set(stem ? parts.map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)) : parts);
}
const VERB_PREFIX = /^(?:validate|check|assert|enforce|verify)/;
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / Math.min(a.size, b.size);
}

// What the brief asks to build.
function proposedSymbols(text) {
  const fns = [...new Set(text.match(/\b(?:validate|check|assert|enforce)[A-Z]\w+/g) || [])];
  const codes = [...new Set(
    (text.match(/\b[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+)+\b/g) || []).filter(
      (c) => c.length >= 8 && !/^(?:study_app|src_)/i.test(c)
    )
  )];
  return { fns, codes };
}

// A collision is a literal hit, or a near-identical identifier already in the tree.
function collide(sym, kind) {
  const literal = sources.filter((s) => s.lower.includes(sym.toLowerCase())).map((s) => s.path);
  if (literal.length) return { symbol: sym, match: sym, how: "literal", files: literal };

  const pool = kind === "fn" ? existingFns : existingCodes;
  // Function names carry a verb prefix that is pure convention (check* vs validate*) — strip it so
  // `checkMarkBudget` and `validateMarkBudget` compare on the noun that actually names the rule.
  const mine = kind === "fn" ? tokens(sym.replace(VERB_PREFIX, "")) : tokens(sym, true);
  let best = null;
  for (const cand of pool) {
    const theirs = kind === "fn" ? tokens(cand.replace(VERB_PREFIX, "")) : tokens(cand, true);
    const score = overlap(mine, theirs);
    if (score >= 0.75 && (!best || score > best.score)) best = { cand, score };
  }
  if (!best) return null;
  return {
    symbol: sym, match: best.cand, how: `${Math.round(best.score * 100)}% token overlap`,
    files: sources.filter((s) => s.text.includes(best.cand)).map((s) => s.path),
  };
}

// --- guard 2: the replay cannot see every rule ------------------------------------------------------
// An earlier draft tried to prove reachability by parsing validateQuestion's call graph. It is not
// worth the fragility — TypeScript return-type braces alone ("): { ok: boolean } {") defeat naive brace
// matching and made it report validateMarkBudget, which validateQuestion demonstrably calls, as
// unreachable. The false precision was worse than none.
//
// A collision already carries the information needed. If the brief's rule EXISTS in the tree and the
// replay still passes a row, the two possibilities are that the rule runs somewhere validateQuestion
// does not reach (the note rules run on the tasting-note path) or that the row genuinely differs.
// Neither establishes "the shipped fix failed", so a collision downgrades the replay to inconclusive
// rather than licensing an ESCALATE. ESCALATE therefore requires evidence overlap AND no collision.

// --- evidence resolution ----------------------------------------------------------------------------
// Bin rows carry the question_id directly; feedback rows are fb_<user_attempts.id> (getFeedbackRowsForMining).
async function resolveEvidence(itemIds) {
  const fbIds = itemIds.filter((i) => i.startsWith("fb_")).map((i) => Number(i.slice(3))).filter(Number.isFinite);
  const qIds = itemIds.filter((i) => !i.startsWith("fb_"));
  const viaFeedback = fbIds.length
    ? await sql`
        /* theory-mode-guard: all-modes -- primary-key lookup of ids the miner already selected;
           getFeedbackRowsForMining excludes theory upstream, and re-filtering here would silently
           report a stray row as "unresolvable" instead of showing it */
        SELECT 'fb_' || a.id AS item_id, a.question_id, a.user_feedback AS note
        FROM user_attempts a WHERE a.id = ANY(${fbIds})`
    : [];
  const viaBin = qIds.length
    ? await sql`SELECT b.item_id, b.item_id AS question_id, b.reason_note AS note
                FROM bank_bin_reasons b WHERE b.item_id = ANY(${qIds})`
    : [];
  const refs = [...viaFeedback, ...viaBin];
  const wanted = [...new Set(refs.map((r) => r.question_id).filter(Boolean))];
  const questions = wanted.length
    ? await sql`SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, g.wines,
                       g.model_answer, g.metadata->>'source' AS source, k.ground_truth
                FROM generated_questions g LEFT JOIN stem_answer_keys k ON k.question_id = g.question_id
                WHERE g.question_id = ANY(${wanted})`
    : [];
  const byId = new Map(questions.map((q) => [q.question_id, q]));
  // Every evidence id gets a row, resolvable or not — an unresolvable one is a real limit on the
  // replay and must be visible rather than silently shrinking the denominator.
  return itemIds.map((id) => {
    const ref = refs.find((r) => r.item_id === id);
    return { itemId: id, note: ref?.note ?? null, question: ref?.question_id ? byId.get(ref.question_id) ?? null : null };
  });
}

// Mirrors how audit-questions.mjs assembles a QuestionForAudit, so a verdict here matches what the
// nightly sweep would say about the same row.
function replay(q) {
  const gt = typeof q.ground_truth === "string" ? JSON.parse(q.ground_truth) : q.ground_truth;
  const raw = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
  const rawWines = Array.isArray(raw) ? raw : [];
  const bySlot = new Map(rawWines.map((w) => [w.slot, w.fullText]));
  const wines = gt
    ? gt.map((w) => (bySlot.has(w.slot) ? { ...w, fullText: bySlot.get(w.slot) } : w))
    : rawWines.map((w) => ({ slot: w.slot, fullText: w.fullText }));
  const res = validateQuestion({
    questionId: q.question_id, paper: q.paper, family: q.family,
    questionText: q.question_text, totalMarks: q.total_marks, wines,
    modelAnswer: q.model_answer ?? null,
    stemIsAuthoritative: q.source === "historical_stem",
  });
  return {
    keyed: !!gt,
    hard: res.violations.filter((v) => v.severity === "hard").map((v) => v.rule),
  };
}

// ----------------------------------------------------------------------------------------------------
const all = await sql`SELECT id, theme, kind, paper, evidence_item_ids, proposal, status, pr_url
                      FROM bin_fix_proposals ORDER BY id`;
const open = all.filter((p) => OPEN.includes(p.status) && (!onlyId || Number(p.id) === onlyId));
if (!open.length) {
  log(onlyId ? `No open proposal with id ${onlyId}.` : "No open proposals — nothing to verify.");
  if (asJson) console.log(JSON.stringify({ proposals: [] }, null, 2));
  process.exit(0);
}
log(`${open.length} open proposal${open.length === 1 ? "" : "s"} of ${all.length} total  ·  ${sources.length} files indexed under ${LIB}\n`);

const report = [];
for (const p of open) {
  const evidence = p.evidence_item_ids || [];

  // A. evidence overlap
  const overlaps = all
    .filter((o) => Number(o.id) !== Number(p.id))
    .map((o) => ({
      id: Number(o.id), theme: o.theme, status: o.status, prUrl: o.pr_url,
      shared: (o.evidence_item_ids || []).filter((i) => evidence.includes(i)),
    }))
    .filter((o) => o.shared.length > 0)
    .sort((a, b) => b.shared.length - a.shared.length);
  const shippedOverlap = overlaps.filter((o) => ["shipped", "merged"].includes(o.status));

  // B. symbol collision
  const { fns, codes } = proposedSymbols(p.proposal || "");
  const collisions = [
    ...fns.map((s) => collide(s, "fn")),
    ...codes.map((s) => collide(s, "code")),
  ].filter(Boolean);

  // C. validator replay
  const resolved = await resolveEvidence(evidence);
  const replays = resolved.map((r) => ({
    itemId: r.itemId, questionId: r.question?.question_id ?? null,
    ...(r.question ? replay(r.question) : { keyed: null, hard: null }),
  }));
  const checkable = replays.filter((r) => r.hard !== null);
  const rejected = checkable.filter((r) => r.hard.length > 0);
  // See guard 2: a collision means a clean replay is inconclusive, not exculpatory.
  const replayBlind = collisions.length > 0 && rejected.length < checkable.length;

  report.push({
    id: Number(p.id), theme: p.theme, kind: p.kind, status: p.status, prUrl: p.pr_url,
    evidenceCount: evidence.length, sharedWithShipped: shippedOverlap,
    sharedWithOpen: overlaps.filter((o) => !["shipped", "merged"].includes(o.status)),
    symbolCollisions: collisions, replayBlind,
    replay: { resolved: checkable.length, unresolvable: replays.length - checkable.length, alreadyRejected: rejected.length, rows: replays },
  });

  log(`── #${p.id} [${p.status}] ${p.theme}`);
  log(`   kind: ${p.kind}${p.pr_url ? `  ${p.pr_url}` : ""}   evidence: ${evidence.length} rows`);

  if (shippedOverlap.length) {
    for (const o of shippedOverlap) {
      const pct = Math.round((o.shared.length / Math.max(1, evidence.length)) * 100);
      log(`   [A] SHARES EVIDENCE WITH SHIPPED #${o.id} — ${o.shared.length}/${evidence.length} rows (${pct}%): ${o.shared.join(", ")}`);
      log(`       shipped as: ${o.theme}${o.prUrl ? ` (${o.prUrl})` : ""}`);
    }
  } else log(`   [A] no evidence shared with a shipped proposal`);
  for (const o of report[report.length - 1].sharedWithOpen)
    log(`   [A] also overlaps OPEN #${o.id} (${o.status}) on ${o.shared.join(", ")} — consolidate before merging either`);

  if (collisions.length) {
    for (const c of collisions.slice(0, 10))
      log(`   [B] "${c.symbol}" ALREADY EXISTS as ${c.match} (${c.how}) in ${c.files.slice(0, 2).join(", ")}${c.files.length > 2 ? ` +${c.files.length - 2}` : ""}`);
    if (collisions.length > 10) log(`   [B] … and ${collisions.length - 10} more collisions`);
  } else log(`   [B] nothing the brief names already exists in ${LIB}`);

  log(`   [C] current validator rejects ${rejected.length}/${checkable.length} replayable evidence question${checkable.length === 1 ? "" : "s"}` +
      (report[report.length - 1].replay.unresolvable ? ` (${report[report.length - 1].replay.unresolvable} unresolvable)` : ""));
  for (const r of checkable)
    log(`       ${r.itemId}${r.questionId ? ` → ${r.questionId}` : ""}: ${r.hard.length ? `HARD ${r.hard.join(", ")}` : "passes clean"}${r.keyed ? "" : "  [unkeyed]"}`);
  if (replayBlind)
    log(`       ⚠ a colliding rule already exists, so a clean row here is INCONCLUSIVE — the rule may run off the validateQuestion path (the note rules do), not proof the shipped fix failed`);

  // The reading, not the ruling — stated as what the evidence supports so a human can disagree.
  const dup = shippedOverlap.length > 0;
  const covered = checkable.length > 0 && rejected.length === checkable.length;
  if (collisions.length)
    log(`   ⇒ DUPLICATE: the brief re-adds rules that already exist${dup ? ", from evidence a shipped proposal already claimed" : ""}. Close the PR and reject the proposal, unless there is a delta the existing rules genuinely miss — name it explicitly.`);
  else if (dup && covered)
    log(`   ⇒ DUPLICATE: shipped code already rejects every replayable evidence row. Close the PR, reject the proposal.`);
  else if (dup && !covered)
    log(`   ⇒ ESCALATE: a shipped fix claimed this evidence, nothing in the brief collides with existing code, and the validator still passes ${checkable.length - rejected.length} evidence row(s). The earlier fix mis-located the cause — rewrite the brief around what escapes; do not re-add the rule.`);
  else log(`   ⇒ NO MECHANICAL DUPLICATE FOUND — judge the brief on its merits (layer, blast radius, generation-vs-validator).`);
  log("");
}

// The standing structural check: a system that answers every fault with a reject-rule raises redraft
// rate instead of output quality. Reported over ALL proposals, not just the open ones.
const validators = all.filter((p) => p.kind === "validator").length;
log(`Fix-kind mix across all ${all.length} proposals: ${validators} validator / ${all.length - validators} generation` +
    (validators / all.length > 0.7 ? "  ← heavily reject-biased; ask whether generation could have been constrained instead" : ""));

if (asJson) console.log(JSON.stringify({ proposals: report, kindMix: { validator: validators, total: all.length } }, null, 2));
