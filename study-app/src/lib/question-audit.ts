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
// Registers the appellation → primary-variety fallback that R-COLOUR needs. Without it
// detectPrimaryVariety returns "unknown" for every appellation-only label — Hermitage,
// Châteauneuf-du-Pape, Viña Tondonia — and the audit silently exempts the exact wines it exists to
// catch. This module only worked before because question-engine.ts happened to import the resolver
// earlier in the same process; the corpus sweep has no such luck.
import "./appellation-resolver";

export async function auditAndQuarantineQuestion(
  questionId: string
): Promise<{ audited: false; reason: string } | { audited: true; hard: Violation[] }> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, g.wines, g.model_answer,
           g.scope, g.wine_profiles, k.ground_truth
    FROM generated_questions g
    JOIN stem_answer_keys k ON k.question_id = g.question_id
    WHERE g.question_id = ${questionId}`;
  const r = rows[0];
  if (!r) return { audited: false, reason: "question or answer key not found" };

  // Zip the raw label back onto each resolved key wine, by slot — ground_truth has discarded the
  // original string, and the wine-reference-shape rule is the only one that can see a slot holding
  // the generator's deliberation instead of a wine. Same shape as the corpus audit script.
  const gt = (typeof r.ground_truth === "string" ? JSON.parse(r.ground_truth) : r.ground_truth) as AuditWine[];
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

  const wines = (gt || []).map((w) => ({
    ...w,
    ...(bySlot.has(w.slot) ? { fullText: bySlot.get(w.slot) } : {}),
    ...(colourBySlot.has(w.slot) ? { colour: colourBySlot.get(w.slot) } : {}),
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
  const hard = res.violations.filter(
    (v) =>
      v.severity === "hard" &&
      !(r.scope === "live-tasting" && BANK_COMPOSITION_RULES.has(v.rule))
  );
  if (hard.length > 0) {
    // Same two flags, same shape, as apply-change.ts and the corpus audit: the main study flow gates
    // on generated_questions.invalid_reasons, the drills on stem_answer_keys.validated.
    await sql`ALTER TABLE generated_questions ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
    await sql`ALTER TABLE stem_answer_keys ADD COLUMN IF NOT EXISTS invalid_reasons JSONB`;
    await sql`UPDATE generated_questions SET invalid_reasons = ${JSON.stringify(hard)}::jsonb WHERE question_id = ${questionId}`;
    await sql`UPDATE stem_answer_keys SET validated = false, invalid_reasons = ${JSON.stringify(hard)}::jsonb WHERE question_id = ${questionId}`;
  }
  return { audited: true, hard };
}
