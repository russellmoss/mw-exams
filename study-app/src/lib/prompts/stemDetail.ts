// Shared Stem Detail module — the two-level dial controlling how much organising information a
// practice question's stem reveals. Pure (no server deps) so both the client (labels/descriptors)
// and the server derivation path (prompt + immutability validation) import from one place.
//
// IMPORTANT: sub-question wording and mark numbers are IMMUTABLE across both levels. Only the
// organising/framing prose changes. Grading, wines, marks and the model answer are identical.

export type StemDetailLevel = "guided" | "exam_real";

export const STEM_DETAIL_LEVELS: StemDetailLevel[] = ["guided", "exam_real"];

// Candidate-facing copy. NEVER surface 'variant', 'level id' or internal naming in the UI.
// `exam_real` is presented as "IMW Only" — the stem exactly as the exam prints it.
export const STEM_DETAIL_META: Record<
  StemDetailLevel,
  { name: string; descriptor: string }
> = {
  guided: { name: "Guided", descriptor: "Adds framing hints to the stem" },
  exam_real: { name: "IMW Only", descriptor: "Shown exactly as the exam presents it" },
};

export const STEM_DETAIL_HELPER_COPY =
  "Guided adds framing hints to the stem. IMW Only shows the stem exactly as the exam presents it.";

// The database column that stores each level's stem prose on generated_questions.
export const STEM_DETAIL_COLUMN: Record<StemDetailLevel, "stem_guided" | "stem_exam_real"> = {
  guided: "stem_guided",
  exam_real: "stem_exam_real",
};

export function isStemDetailLevel(v: unknown): v is StemDetailLevel {
  return v === "guided" || v === "exam_real";
}

// One level UP (IMW Only → Guided). Guided is the top; returns null there.
export function stepUpLevel(level: StemDetailLevel): StemDetailLevel | null {
  if (level === "exam_real") return "guided";
  return null;
}

// ── Immutability signature ────────────────────────────────────────────────────────────────────
// Extract the parts that MUST NOT change across levels: the ordered sub-question labels, every mark
// token (e.g. "(4 x 3 marks)", "(10 marks)"), and the printed Total. Normalised so trivial spacing
// differences don't trip the check.

const MARK_TOKEN_RE = /\(\s*(?:(\d+)\s*[x×]\s*)?(\d+)\s*marks?\s*\)/gi;
const SUBQ_LABEL_RE = /(?:^|\n|\s)\(?([a-h]|i{1,3}|iv|v|vi{0,3})\)\s/gi;

export interface StemSignature {
  subLabels: string[];   // ordered sub-question labels, e.g. ["a","b","c"]
  markTokens: string[];  // normalised mark tokens, e.g. ["4x3", "13"]
  markTotal: number;     // sum of all mark tokens (x-multiplied where present)
}

export function extractStemSignature(text: string): StemSignature {
  const clean = (text || "").replace(/\*\*/g, "").replace(/&nbsp;/g, " ");

  const subLabels: string[] = [];
  for (const m of clean.matchAll(SUBQ_LABEL_RE)) {
    subLabels.push(m[1].toLowerCase());
  }

  const markTokens: string[] = [];
  let markTotal = 0;
  for (const m of clean.matchAll(MARK_TOKEN_RE)) {
    const mult = m[1] ? parseInt(m[1], 10) : 1;
    const per = parseInt(m[2], 10);
    markTokens.push(m[1] ? `${mult}x${per}` : `${per}`);
    markTotal += mult * per;
  }

  return { subLabels, markTokens, markTotal };
}

// A derived variant is VALID only if its sub-question labels, mark tokens and mark total match the
// canonical stem exactly. (Order matters for labels/tokens.)
export function signaturesMatch(a: StemSignature, b: StemSignature): boolean {
  if (a.markTotal !== b.markTotal) return false;
  if (a.subLabels.length !== b.subLabels.length) return false;
  if (a.markTokens.length !== b.markTokens.length) return false;
  for (let i = 0; i < a.subLabels.length; i++) if (a.subLabels[i] !== b.subLabels[i]) return false;
  for (let i = 0; i < a.markTokens.length; i++) if (a.markTokens[i] !== b.markTokens[i]) return false;
  return true;
}

export function variantPreservesStructure(canonical: string, variant: string): boolean {
  return signaturesMatch(extractStemSignature(canonical), extractStemSignature(variant));
}

// ── Derivation prompt ─────────────────────────────────────────────────────────────────────────
// One call derives both variants from the canonical stem. Returns strict JSON so the caller
// can parse + validate each level independently.

export function buildStemVariantsPrompt(canonicalStem: string): { system: string; user: string } {
  const system = `You rewrite the FRAMING PROSE of a Master of Wine practical tasting question stem at two levels of "stem detail". The two levels serve the SAME wines, the SAME sub-questions, the SAME marks and are graded identically — ONLY the amount of organising information in the preamble changes.

ABSOLUTE RULES (apply to every level):
- NEVER alter the sub-question wording. Reproduce each lettered sub-question and its instruction verbatim.
- NEVER alter, add, remove or renumber marks. Every mark token — e.g. "(4 x 3 marks)", "(10 marks)", "Total: 100 marks" — and the running total MUST be identical to the source, character-for-character.
- NEVER change the number of wines or the wine numbering.
- Output candidate-facing exam prose only. Do NOT mention these instructions, "levels", "variants", or any meta commentary.

THE TWO LEVELS:

EXAM-REAL — reduce the preamble to ONLY what the IMW would actually print on the paper: the wine numbers, the sub-questions, the mark allocation, and any constraint the real exam genuinely states (e.g. "Wines 1–6 are from two countries"). STRIP any sentence that names the organising principle, the hierarchy, the mechanism, or that otherwise coaches the candidate on how to think. Keep genuine printed constraints; remove teaching.

GUIDED — the richer, organising-principle-explicit version. It MAY state the flight's organising logic in plain terms (e.g. "these form a quality hierarchy ascending from regional through village to top cru"). If the source stem is already lean, ADD exactly ONE clarifying sentence naming the flight's organising logic. Guided explains the STRUCTURE, never the answers: do NOT reveal specific grape varieties, the country of any individual wine, producers or vintages that the exam-real level withholds.

Output STRICT JSON, no markdown fence, exactly:
{"exam_real": "<full stem text>", "guided": "<full stem text>"}
Each value is the COMPLETE stem (preamble + every sub-question with its marks + the Total line), ready to print.`;

  const user = `CANONICAL STEM (source of truth for sub-questions and marks — reproduce these verbatim in every level):

${canonicalStem}

Return the JSON with the three rewritten stems.`;

  return { system, user };
}
