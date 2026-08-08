// question-verdict.ts — run the hard/soft validator over a STORED question so a human reviewer sees
// the same verdict the corpus audit would give, before they decide.
//
// Extracted verbatim from api/admin/bank/review-queue so the Question Review surface and the Fill-
// the-Bank review pane cannot drift apart. Two review UIs showing two different verdicts for one
// question is worse than either showing none.
//
// The origin story is worth keeping: a reviewer kept a question whose stem promised three different
// grape varieties over a Pinot Noir, a Cannonau di Sardegna and a Campo de Borja Garnacha — Cannonau
// and Garnacha are both Grenache, so it was unanswerable, and nothing in the rendered stem or wine
// list said so. The pane showed everything a candidate sees and nothing a validator knows.

import { getAnswerKeyGroundTruth, type GeneratedQuestion } from "@/lib/db";
import { validateQuestion, type AuditWine, type Violation } from "@/lib/question-validator";

export interface QuestionVerdict {
  ok: boolean;
  hard: Violation[];
  soft: Violation[];
}

export function violationsFor(q: GeneratedQuestion, groundTruth: unknown[]): Violation[] {
  // Zip the raw label onto each resolved key wine by slot (same shape as the corpus audit): the
  // wine-reference-shape rule and the answer rules' label-derived origin needles both need the
  // original string the key derivation threw away.
  const raw = (typeof q.wines === "string" ? JSON.parse(q.wines) : q.wines) as
    | { slot: number; fullText?: string }[]
    | null;
  const bySlot = new Map((Array.isArray(raw) ? raw : []).map((w) => [w.slot, w.fullText]));
  const wines = (groundTruth as AuditWine[]).map((w) =>
    bySlot.has(w.slot) ? { ...w, fullText: bySlot.get(w.slot) } : w
  );
  return validateQuestion({
    questionId: q.question_id,
    paper: q.paper,
    family: q.family,
    questionText: q.question_text,
    totalMarks: q.total_marks,
    wines,
    // Answer-content verdicts too (answer-content-rules.mjs): the reviewer deciding keep/bin should
    // see a truncated or wine-skipping model answer, not just stem<->wine contradictions.
    modelAnswer: q.model_answer ?? null,
    // Historical imports carry a verbatim past-paper stem. Showing the reviewer stem-shape
    // violations on one would be actively misleading — they reject up to 64% of the real corpus, and
    // the reviewer's only available fix ("edit the stem") is the one thing the import must not do.
    stemIsAuthoritative:
      (typeof q.metadata === "string" ? JSON.parse(q.metadata) : q.metadata)?.source ===
      "historical_stem",
  }).violations;
}

export function verdictFromGroundTruth(
  q: GeneratedQuestion,
  groundTruth: unknown[] | undefined | null
): QuestionVerdict | null {
  if (!groundTruth || groundTruth.length === 0) return null;
  const violations = violationsFor(q, groundTruth);
  const hard = violations.filter((v) => v.severity === "hard");
  return { ok: hard.length === 0, hard, soft: violations.filter((v) => v.severity === "soft") };
}

/**
 * Returns null when the answer key hasn't been derived yet — the validator needs resolved varieties,
 * so with no key there is no verdict to show (better a stated "not available" than a false all-clear).
 */
export async function verdictFor(q: GeneratedQuestion): Promise<QuestionVerdict | null> {
  return verdictFromGroundTruth(q, await getAnswerKeyGroundTruth(q.question_id));
}
