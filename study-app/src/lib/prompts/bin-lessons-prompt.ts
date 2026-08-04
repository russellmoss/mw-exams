// bin-lessons-prompt.ts — distil the reviewer's recent bins into "Lessons for new questions".
//
// The Bin page shows a plain-English bullet summary of WHY recent bank questions were binned, and that
// same summary is injected into the next generation prompt (spec §5) so the model stops re-making the
// faults a human already rejected. This prompt turns the raw ledger (reason tags + free-text notes,
// last ~50 bins) into a short, deduplicated, actionable bullet list — grounded in the MW practical's
// own failure modes (mw_exam_empirical_knowledge §5 question-generation rules) rather than generic
// writing advice.

import { BIN_REASON_LABELS } from "@/lib/bin-reasons";

export interface BinLessonInput {
  tags: string[];
  note: string | null;
  paper: number;
}

// Build the {system, user} pair for the distillation call. Returns null when there is nothing worth
// distilling (no tagged/noted bins) so the caller can skip the Claude call entirely.
export function buildBinLessonsPrompt(
  rows: BinLessonInput[]
): { system: string; user: string } | null {
  const usable = rows.filter((r) => (r.tags && r.tags.length > 0) || (r.note && r.note.trim()));
  if (usable.length === 0) return null;

  const lines = usable.map((r) => {
    const labels = (r.tags || []).map((t) => BIN_REASON_LABELS[t] || t);
    const parts = [`Paper ${r.paper}`];
    if (labels.length > 0) parts.push(labels.join(", "));
    if (r.note && r.note.trim()) parts.push(`note: "${r.note.trim()}"`);
    return `- ${parts.join(" · ")}`;
  });

  const system = `You are the editor of a Master of Wine practical-exam question bank. A reviewer bins generated tasting questions that aren't good enough, tagging each with a fault and sometimes a note.

Your job: read the recent bins and write a SHORT, plain-English list of lessons the question WRITER should apply so these faults stop recurring. This is guidance for writing better MW practical flights (blind-tasting stems + wine sets + mark schemes), grounded in how the exam actually works.

Rules:
- Output 3–6 bullets, each one sentence, imperative ("Avoid…", "Make sure…", "Don't…").
- Generalise across the bins — merge duplicates, surface the recurring patterns, ignore one-offs.
- Be concrete and MW-specific (marks alignment to the stem, wines matching the stem's constraint, a genuine quality/style spread, plausible-but-not-obscure wines, no repetition of recent templates).
- No preamble, no heading, no closing remarks. Bullets only, each starting with "- ".
- Never invent faults that aren't evidenced by the bins.`;

  const user = `Recent bins (newest first), each as paper · fault tags · optional reviewer note:

${lines.join("\n")}

Write the lessons now, bullets only.`;

  return { system, user };
}
