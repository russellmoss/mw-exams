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

export async function auditAndQuarantineQuestion(
  questionId: string
): Promise<{ audited: false; reason: string } | { audited: true; hard: Violation[] }> {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`
    SELECT g.question_id, g.paper, g.family, g.question_text, g.total_marks, g.wines, k.ground_truth
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
  const wines = (gt || []).map((w) => (bySlot.has(w.slot) ? { ...w, fullText: bySlot.get(w.slot) } : w));

  const res = validateQuestion({
    questionId: r.question_id as string,
    paper: r.paper as number,
    family: r.family as string,
    questionText: r.question_text as string,
    totalMarks: r.total_marks as number,
    wines,
  });
  const hard = res.violations.filter((v) => v.severity === "hard");
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
