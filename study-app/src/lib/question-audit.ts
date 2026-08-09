// question-audit.ts — key-stage audit + auto-quarantine for ONE freshly generated question.
//
// scripts/audit-questions.mjs runs the same verdict over the whole corpus, but only when someone (or
// the conditional CI step) runs it — so a question whose defect is only visible at the KEY stage
// (resolved varieties, e.g. Cannonau = Garnacha = Grenache) could sit servable for weeks. This module
// closes that gap at the source: the engine calls it the moment the stem answer key lands, inside the
// same background chain awaitBackgroundWork already waits on, so every generated question is audited
// and (when hard-violating) quarantined by construction.
//
// Deliberately SET-only: a clean verdict never clears an existing invalid_reasons, because that flag
// is shared with the feedback path (apply-change.ts "Kind: question"), whose quarantines encode
// defects the rules can't see. Clearing on rule changes stays with the corpus audit script, where a
// human is watching the diff.

import { neon } from "@neondatabase/serverless";
import { validateQuestion, type AuditWine, type Violation } from "./question-validator";
import { GROUND_TRUTH_INDEPENDENT_RULES } from "./question-rules.mjs";
// Registers the appellation → primary-variety fallback that R-COLOUR needs. Without it
// detectPrimaryVariety returns "unknown" for every appellation-only label — Hermitage,
// Châteauneuf-du-Pape, Viña Tondonia — and the audit silently exempts the exact wines it exists to
// catch. This module only worked before because question-engine.ts happened to import the resolver
// earlier in the same process; the corpus sweep has no such luck.
import "./appellation-resolver";

/**
 * Which hard violations an audit may actually QUARANTINE on, given whether the row has an answer key.
 *
 * Split out of the audit body so it can be tested without a database, because it is the one decision
 * that makes auditing unkeyed rows safe rather than destructive.
 *
 * On a keyed row: everything hard stands. On an unkeyed row: only the ground-truth-independent rules.
 * The rest are not merely unreliable on bare labels, they are actively wrong — `country-diversity`
 * fires on 187 keyed questions when their ground truth is stripped and on zero of the same questions
 * keyed, because "N different countries" cannot be checked against wines whose country nobody has
 * resolved. GROUND_TRUTH_INDEPENDENT_RULES is derived from exactly that two-way comparison; see
 * tests/ground-truth-independent-rules.test.ts, which re-derives it from the corpus.
 */
export function enforceableViolations(hard: Violation[], hasKey: boolean): Violation[] {
  return hasKey ? hard : hard.filter((v) => GROUND_TRUTH_INDEPENDENT_RULES.includes(v.rule));
}

export async function auditAndQuarantineQuestion(
  questionId: string
): Promise<{ audited: false; reason: string } | { audited: true; keyed: boolean; hard: Violation[] }> {
  const sql = neon(process.env.DATABASE_URL!);
  // LEFT JOIN, not JOIN. A question whose key never built simply was not in the result set, so this
  // returned "question or answer key not found" and the row was banked with no verdict at all until
  // the 06:40 UTC sweep — up to 24 hours servable behind nothing but the serve gate. The daily sweep
  // (scripts/audit-questions.mjs) fixed exactly this on its own side on 2026-08-08 and has been
  // evaluating unkeyed rows since; this closes the same hole on the at-generation path, using the
  // same rule set, so the two agree instead of diverging.
  const rows = await sql`
    SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, g.wines, g.model_answer,
           g.scope, g.wine_profiles, g.metadata->>'source' AS source, k.ground_truth
    FROM generated_questions g
    LEFT JOIN stem_answer_keys k ON k.question_id = g.question_id
    WHERE g.question_id = ${questionId}`;
  const r = rows[0];
  if (!r) return { audited: false, reason: "question not found" };

  // Zip the raw label back onto each resolved key wine, by slot — ground_truth has discarded the
  // original string, and the wine-reference-shape rule is the only one that can see a slot holding
  // the generator's deliberation instead of a wine. Same shape as the corpus audit script.
  const gt = (
    typeof r.ground_truth === "string" ? JSON.parse(r.ground_truth) : r.ground_truth
  ) as AuditWine[] | null;
  const hasKey = Array.isArray(gt) && gt.length > 0;
  const raw = typeof r.wines === "string" ? JSON.parse(r.wines) : r.wines;
  const bySlot = new Map<number, string>(
    (Array.isArray(raw) ? raw : []).map((w: { slot: number; fullText?: string }) => [w.slot, w.fullText ?? ""])
  );
  // Zip the RESOLVED COLOUR on too, from wine_profiles. ground_truth carries varieties, which usually
  // settle colour — but not for a red grape bottled as a white ("Touriga Nacional Branco"), and not
  // when the key's varieties are empty. The enrichment step judged the wine in the glass, so prefer it.
  const profilesRaw = (typeof r.wine_profiles === "string" ? JSON.parse(r.wine_profiles) : r.wine_profiles) as
    | Record<string, { colour?: unknown } | undefined>
    | null;
  const colourBySlot = new Map<number, "white" | "red" | "rose" | "orange">();
  for (const [slot, p] of Object.entries(profilesRaw ?? {})) {
    const c = p?.colour;
    if (c === "white" || c === "red" || c === "rose" || c === "orange") colourBySlot.set(Number(slot), c);
  }

  // A row with no key has no resolved variety/region/country at all, so the wines it can offer the
  // rule layer are bare labels — exactly what the sweep does for the same case. Everything the rules
  // infer from a key is simply absent, and the filter below is what stops that absence being read as
  // evidence of a defect.
  const wines: AuditWine[] = hasKey
    ? gt.map((w) => ({
        ...w,
        ...(bySlot.has(w.slot) ? { fullText: bySlot.get(w.slot) } : {}),
        ...(colourBySlot.has(w.slot) ? { colour: colourBySlot.get(w.slot) } : {}),
      }))
    : (Array.isArray(raw) ? raw : []).map((w: { slot: number; fullText?: string }) => ({
        slot: w.slot,
        varieties: [],
        region: "",
        fullText: w.fullText,
      }));

  const res = validateQuestion({
    questionId: r.question_id as string,
    paper: r.paper as number,
    family: r.family as string,
    questionText: r.question_text as string,
    totalMarks: r.total_marks as number,
    wines,
    // Answer-content rules run when the model answer has landed. The engine sequences this call
    // after BOTH background writes (stem key + model answer), so on the generation path the answer
    // is normally present; if it failed to generate, the daily sweep re-audits once it exists.
    modelAnswer: (r.model_answer as string | null) ?? null,
    // Historical import (metadata.source): the stem is a verbatim past-paper question, so the
    // stem-SHAPE rules stand down — they reject up to 64% of the real corpus and, on a stem that may
    // not be edited, offer no fix. Every wine-side rule still runs. See `stemIsAuthoritative` on
    // QuestionForAudit for the measured rates.
    stemIsAuthoritative: r.source === "historical_stem",
  });
  // Live Tasting questions (scope='live-tasting') are pinned to an availability-confirmed
  // flight: bank-COMPOSITION rules (banker minimum / curveball mix / producer over-use) judge
  // what should enter the shared pool, not what a user can buy — E2E run 9 quarantined a valid
  // 2-wine home flight for "no banker". Key-consistency and answer-content rules still apply.
  const BANK_COMPOSITION_RULES = new Set([
    "flight-composition", "producer-exclusion", "banker",
    // Mark-split caps are pool-quality standards; the pinned generator deliberately skips the
    // matching markMix nudge, so auditing them here just quarantines valid home flights (run 12).
    "id-mark-allocation",
  ]);
  let hard = res.violations.filter(
    (v) =>
      v.severity === "hard" &&
      !(r.scope === "live-tasting" && BANK_COMPOSITION_RULES.has(v.rule))
  );

  // An unkeyed row enforces only the ground-truth-independent rules — see enforceableViolations. The
  // same filter the daily sweep applies, against the same exported list, so the at-generation verdict
  // and the nightly one cannot drift apart; this codebase has been bitten before by two gates each
  // carrying its own copy of a heuristic (see the note on validateBankerMinimum in question-engine.ts).
  hard = enforceableViolations(hard, hasKey);
  if (hard.length > 0) {
    // Same two flags, same shape, as apply-change.ts and the corpus audit: the main study flow gates
    // on generated_questions.invalid_reasons, the drills on stem_answer_keys.validated.
    await sql`ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
    await sql`ALTER TABLE stem_answer_keys ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
    await sql`UPDATE generated_questions SET invalid_reasons = ${JSON.stringify(hard)}::jsonb WHERE question_id = ${questionId}`;
    // On an unkeyed row this matches nothing, which is correct — there is no drill key to invalidate.
    await sql`UPDATE stem_answer_keys SET validated = false, invalid_reasons = ${JSON.stringify(hard)}::jsonb WHERE question_id = ${questionId}`;
  }
  return { audited: true, keyed: hasKey, hard };
}
