// repair-quarantined-questions.mjs — mechanically repair the two dominant quarantine classes in place.
//
// Of the ~529 quarantined bank rows (2026-08), two rule classes account for the bulk and are text
// defects, not content defects — the wines, answer key and model answer are sound:
//
//   id-mark-allocation               the printed marks pour too much into "identify the ..." parts
//                                    (over the 10-mark per-part cap and/or the 35%/50% aggregate cap).
//                                    Fix: cap the id parts and move the freed marks to the
//                                    style/method/quality parts, preserving the question total.
//   stem-fact-singular-variety-blend the stem asserts a singular "grape variety" over a keyed blend.
//                                    Fix: hedge as "grape variety or varieties" (the exact wording the
//                                    validator's own detail message asks for, and authentic IMW
//                                    phrasing) — crossCheckStemFacts suppresses the rule once hedged.
//
// Regeneration is the wrong tool for these: the generator repeats the same mark arithmetic on retry
// (see repair-question-marks.mjs, same lesson) and a full regen throws away a validated key + model
// answer over a wording defect. Everything else (flight-composition, contrast-integrity, stem-fact
// mismatches, wine-reference-shape, remediation-reject drafts) is a content problem this script
// deliberately refuses to touch — those stay quarantined for regeneration.
//
// THE GATE: a row is only un-quarantined when validateQuestion() — the real validator, same call the
// nightly audit makes, model answer included — returns ZERO hard violations on the repaired text.
// A row that still fails anything is left exactly as it was. On success both quarantine flags are
// cleared: generated_questions.invalid_reasons = NULL and stem_answer_keys.validated = true (the
// nightly audit clears the former on a clean verdict but never restores the latter, and the serve
// gate in db.ts checks both).
//
//   node --import ./scripts/ts-loader.mjs scripts/repair-quarantined-questions.mjs            (dry run)
//   node --import ./scripts/ts-loader.mjs scripts/repair-quarantined-questions.mjs --apply    (commit)
//   ... --limit=N        cap the number of rows processed
//
// Run from study-app/. Reads DATABASE_URL from env or .env.local. No LLM calls.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { neon } from "@neondatabase/serverless";
import { validateQuestion } from "../src/lib/question-validator.ts";

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

const REPAIRABLE_RULES = ["id-mark-allocation", "stem-fact-singular-variety-blend"];

// Same shapes the validator parses: "(N marks)" and "(A x B marks)". The multiplier is structural
// (the wine count) — only the per-instance value is ever changed.
const TOKEN_RE = /\((?:(\d+)\s*[x×]\s*)?(\d+)\s*(marks?)\)/gi;
// Same id-part detector as idMarkAllocationViolations.
const ID_PART_RE = /identify the (grape variety|region|country|origin)/i;
const ID_SINGLE_PART_CAP = 10;
// The aggregate ceiling is 50% with no curveballs, 35% with one or more. We don't re-derive the
// curveball count here (isBanker is internal to the validator); repairing to the STRICTER 35% cap is
// always sufficient, and the final validateQuestion() gate is the authority anyway.
const ID_AGGREGATE_CAP_FRACTION = 0.35;
// Mirror repair-question-marks.mjs: no flight-shared (k=1) part may swallow the question.
const MAX_FLAT_SHARE = 0.4;

export function parseParts(text) {
  const parts = [];
  let lastIndex = 0;
  for (const m of (text || "").matchAll(TOKEN_RE)) {
    const k = m[1] ? parseInt(m[1], 10) : 1;
    const v = parseInt(m[2], 10);
    const partText = text.slice(lastIndex, m.index);
    // The sub-question letter ("a)", "b)" …) closest to the mark annotation labels this part.
    const letters = [...partText.matchAll(/(?:^|\s)([a-z])\)/gi)];
    parts.push({
      index: m.index, raw: m[0], k, v, word: m[3],
      form: m[1] ? "per-wine" : "flat",
      text: partText,
      letter: letters.length ? letters[letters.length - 1][1].toLowerCase() : null,
      isId: ID_PART_RE.test(partText),
    });
    lastIndex = m.index + m[0].length;
  }
  return parts;
}

const totalOf = (parts, vKey = "v") => parts.reduce((s, p) => s + p.k * p[vKey], 0);

/**
 * Rebalance mark values so every id part sits at ≤10 per instance and the id total sits under 35%
 * of the question total, moving every freed mark onto the non-id (style/method/quality) parts —
 * grand total unchanged. Increments favour the non-id part that has grown least relative to its
 * original weight, so the family's mark emphasis is preserved. Returns the new per-instance values
 * (array aligned with `parts`) or null when no safe integer solution exists.
 */
export function rebalanceIdMarks(parts, total) {
  const idParts = parts.filter((p) => p.isId);
  const others = parts.filter((p) => !p.isId);
  if (idParts.length === 0 || others.length === 0) return null;

  const nv = parts.map((p) => p.v);
  const at = (p) => parts.indexOf(p);
  const idTotal = () => idParts.reduce((s, p) => s + p.k * nv[at(p)], 0);
  const shaveOnce = () => {
    const target = idParts.filter((p) => nv[at(p)] > 1).sort((a, b) => nv[at(b)] - nv[at(a)])[0];
    if (!target) return false;
    nv[at(target)] -= 1;
    return true;
  };

  // Walk `freed` marks onto the non-id parts, favouring the part that has grown least relative to
  // its original weight. Works on a copy; null when no exact integer landing exists (multiplier
  // granularity — e.g. an odd remainder with only "2 x" parts to receive it).
  const tryDistribute = () => {
    const out = nv.slice();
    let freed = total - parts.reduce((s, p, i) => s + p.k * out[i], 0);
    let guard = 10000;
    while (freed > 0 && guard-- > 0) {
      const candidates = others
        .filter((p) => p.k <= freed)
        .filter((p) => p.k > 1 || (out[at(p)] + 1) <= total * MAX_FLAT_SHARE)
        .sort((a, b) => out[at(a)] / a.v - out[at(b)] / b.v || b.k - a.k);
      if (candidates.length === 0) return null;
      out[at(candidates[0])] += 1;
      freed -= candidates[0].k;
    }
    return freed === 0 ? out : null;
  };

  // (a) per-part cap
  for (const p of idParts) nv[at(p)] = Math.min(p.v, ID_SINGLE_PART_CAP);

  // (b) shave to the aggregate cap, then (c) distribute; when the distribution can't land exactly,
  // shave one more id step (a k=1 id part shifts parity) and try again.
  const cap = Math.floor(total * ID_AGGREGATE_CAP_FRACTION);
  let guard = 1000;
  while (guard-- > 0) {
    if (idTotal() > cap) {
      if (!shaveOnce()) return null;
      continue;
    }
    const out = tryDistribute();
    if (out) {
      if (parts.some((p, i) => p.k === 1 && out[i] > total * MAX_FLAT_SHARE)) return null;
      return out;
    }
    if (!shaveOnce()) return null;
  }
  return null;
}

export function rewriteMarks(text, parts, newValues) {
  let out = text;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    const replacement = p.form === "per-wine"
      ? `(${p.k} x ${newValues[i]} ${p.word})`
      : `(${newValues[i]} ${p.word})`;
    out = out.slice(0, p.index) + replacement + out.slice(p.index + p.raw.length);
  }
  return out;
}

// Apply the question_text rebalance to a stem variant. Stems carry the same sub-question lines, so
// their mark tokens must match question_text's (k, v) sequence exactly; anything else is left alone
// (the caller records the mismatch).
function rewriteAlignedField(fieldText, parts, newValues) {
  if (!fieldText) return { text: fieldText, aligned: true };
  const fieldParts = parseParts(fieldText);
  if (fieldParts.length === 0) return { text: fieldText, aligned: true }; // no marks printed here
  const aligned =
    fieldParts.length === parts.length &&
    fieldParts.every((fp, i) => fp.k === parts[i].k && fp.v === parts[i].v);
  if (!aligned) return { text: fieldText, aligned: false };
  return { text: rewriteMarks(fieldText, fieldParts, newValues), aligned: true };
}

// Model-answer headings restate a part's per-instance value ("### b) Winemaking (8 marks)"). Rewrite
// by letter + old value so unrelated numbers are never touched. Best-effort and display-only.
function rewriteModelAnswerMarks(modelAnswer, parts, newValues) {
  if (!modelAnswer) return modelAnswer;
  let out = modelAnswer;
  parts.forEach((p, i) => {
    if (!p.letter || newValues[i] === p.v) return;
    const re = new RegExp(`(${p.letter}\\)[^\\n]{0,120}?\\()${p.v}(\\s*marks?\\))`, "gi");
    out = out.replace(re, `$1${newValues[i]}$2`);
  });
  return out;
}

// Hedge a singular variety claim the way the validator's own detail message asks: "grape variety or
// varieties". normStem() runs over the WHOLE question text, so hedging the "Identify the ..." part is
// sufficient; the stem-sentence fallback covers phrasings with no such part.
export function hedgeVarietyClaim(text) {
  if (!text || /variety or varieties/i.test(text)) return text;
  const inIdPart = text.replace(/(identify the grape variety)(?!\s+or\s+varieties)/i, "$1 or varieties");
  if (inIdPart !== text) return inIdPart;
  return text.replace(/\b(grape variety)\b(?!\s+or\s+varieties)/i, "$1 or varieties");
}

async function main() {
  // Only rows whose EVERY quarantine reason is one of the two repairable rules. A row that also
  // carries a content-defect rule (flight-composition, contrast-integrity, stem-fact mismatch,
  // feedback-question, ...) cannot be fixed by rewording and stays quarantined for regeneration.
  // INNER JOIN on stem_answer_keys: without a resolved key the blend/curveball facts can't be
  // re-verified, so such rows are out of scope by construction.
  const rows = await sql`
    SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, g.wines,
           g.model_answer, g.stem_guided, g.stem_exam_real, g.stem_blind, g.invalid_reasons,
           k.ground_truth
    FROM generated_questions g
    JOIN stem_answer_keys k ON k.question_id = g.question_id
    WHERE g.invalid_reasons IS NOT NULL
      AND (g.metadata->>'archived') IS DISTINCT FROM 'true'
      -- Historical imports are excluded outright. This script repairs a question by REGENERATING it,
      -- and a historical row's stem is a verbatim past-paper question that must never be rewritten
      -- (see historical-stems.ts). A stem-shape quarantine on one of these is a false positive to be
      -- fixed by scoping the rule, not by editing the exam. Re-import instead:
      --   scripts/import-historical-stems.mjs --only=<qid> --redo
      AND (g.metadata->>'source') IS DISTINCT FROM 'historical_stem'
      AND g.scope = 'pool'
      AND g.is_retired IS NOT TRUE
      AND g.review_state = 'kept'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(g.invalid_reasons) r
        WHERE r->>'rule' NOT IN ('id-mark-allocation', 'stem-fact-singular-variety-blend')
      )
    ORDER BY g.paper, g.family, g.question_id`;

  const targets = Number.isFinite(LIMIT) ? rows.slice(0, LIMIT) : rows;
  console.log(`Repairable-quarantined questions: ${rows.length}. Processing ${targets.length}. apply=${APPLY}\n`);

  let repaired = 0, skipped = 0;
  const skippedByReason = {};
  const skip = (id, why, detail = "") => {
    console.log(`  ⊘ ${id}: ${why}${detail ? ` — ${detail}` : ""}`);
    skippedByReason[why] = (skippedByReason[why] || 0) + 1;
    skipped++;
  };

  for (const q of targets) {
    const reasons = (typeof q.invalid_reasons === "string" ? JSON.parse(q.invalid_reasons) : q.invalid_reasons) || [];
    const rules = [...new Set(reasons.map((r) => r.rule))];

    // Resolved key wines with the raw label zipped back on (same as audit-questions.mjs).
    const gt = typeof q.ground_truth === "string" ? JSON.parse(q.ground_truth) : q.ground_truth;
    const raw = typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines;
    const bySlot = new Map((Array.isArray(raw) ? raw : []).map((w) => [w.slot, w.fullText]));
    const wines = (gt || []).map((w) => (bySlot.has(w.slot) ? { ...w, fullText: bySlot.get(w.slot) } : w));
    if (!wines.length) { skip(q.question_id, "no resolved key wines"); continue; }

    let text = q.question_text;
    let stems = { stem_guided: q.stem_guided, stem_exam_real: q.stem_exam_real, stem_blind: q.stem_blind };
    let modelAnswer = q.model_answer;
    const repairNote = { rules };

    if (rules.includes("stem-fact-singular-variety-blend")) {
      text = hedgeVarietyClaim(text);
      for (const key of Object.keys(stems)) stems[key] = hedgeVarietyClaim(stems[key]);
      if (text === q.question_text) { skip(q.question_id, "hedge found nothing to reword"); continue; }
      repairNote.hedged = true;
    }

    if (rules.includes("id-mark-allocation")) {
      const parts = parseParts(text);
      const total = q.total_marks && q.total_marks > 0 ? q.total_marks : totalOf(parts);
      const nv = rebalanceIdMarks(parts, total);
      if (!nv) { skip(q.question_id, "no safe integer rebalance", `parts: ${parts.map((p) => p.raw).join(" ")}`); continue; }
      const before = parts.map((p) => p.raw).join("  ");
      text = rewriteMarks(text, parts, nv);
      let stemMismatch = false;
      for (const key of Object.keys(stems)) {
        const res = rewriteAlignedField(stems[key], parts, nv);
        stems[key] = res.text;
        if (!res.aligned) stemMismatch = true;
      }
      if (stemMismatch) console.log(`  ⚠ ${q.question_id}: a stem variant's mark tokens did not align; that variant keeps its old (self-consistent) marks`);
      modelAnswer = rewriteModelAnswerMarks(modelAnswer, parts, nv);
      repairNote.marks_before = before;
      repairNote.marks_after = parseParts(text).map((p) => p.raw).join("  ");
    }

    // THE GATE — the real validator, model answer included, must come back with zero hard violations.
    const verdict = validateQuestion({
      questionId: q.question_id, paper: q.paper, family: q.family,
      questionText: text, totalMarks: q.total_marks, wines,
      modelAnswer: modelAnswer ?? null,
    });
    const hard = verdict.violations.filter((v) => v.severity === "hard");
    if (hard.length) {
      skip(q.question_id, "still fails validation after repair", hard.map((v) => `${v.rule}: ${v.detail}`).join(" | "));
      continue;
    }

    console.log(`  ✓ ${q.question_id} (P${q.paper} ${q.family}) [${rules.join(", ")}]`);
    if (repairNote.marks_before) console.log(`      ${repairNote.marks_before}\n   →  ${repairNote.marks_after}`);

    if (APPLY) {
      await sql`
        UPDATE generated_questions
        SET question_text = ${text},
            stem_guided = ${stems.stem_guided},
            stem_exam_real = ${stems.stem_exam_real},
            stem_blind = ${stems.stem_blind},
            model_answer = ${modelAnswer},
            invalid_reasons = NULL,
            metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({
              quarantine_repair: { ...repairNote, at: new Date().toISOString() },
            })}::jsonb
        WHERE question_id = ${q.question_id}`;
      await sql`
        UPDATE stem_answer_keys
        SET validated = true, invalid_reasons = NULL
        WHERE question_id = ${q.question_id}`;
    }
    repaired++;
  }

  console.log(`\n──────── SUMMARY ────────`);
  console.log(`  repaired: ${repaired}   skipped: ${skipped}`);
  if (skipped) console.log(`  skip reasons: ${JSON.stringify(skippedByReason)}`);
  console.log(APPLY
    ? "  Committed (invalid_reasons cleared + keys re-validated — these re-enter the live pool)."
    : "  Dry run — pass --apply to commit.");
}

if (!process.argv.includes("--import-only")) {
  await main();
  console.log("done.");
}
