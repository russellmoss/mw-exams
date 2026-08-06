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

// ── Printed-constraint preservation ───────────────────────────────────────────────────────────
// Flight-relationship facts in the preamble ("same single grape variety", "different countries",
// counts of varieties/countries…) are constraints the real IMW prints on the paper — the corpus has
// ~20 stems literally printing "made from the same single grape variety". A variant that drops one
// changes what the question IS: gen_p2_F5_1786023511251's exam_real variant lost "same single grape
// variety" (the LLM read it as coaching), the candidate reasoned "no information about varietals",
// and the debrief then showed the canonical stem (ledger: attempt #344). The prompt now forbids
// this, but prompts don't hold on their own — same lesson as the theory quote gate — so every
// constraint phrase found in the canonical stem must literally survive into the variant.

const CONSTRAINT_RES: RegExp[] = [
  /same (?:single )?(?:grape )?variet(?:y|ies)/g,
  /different (?:single )?(?:grape )?variet(?:y|ies)/g,
  /same (?:country|countries|region|regions|origin|appellation|vintage|producer)/g,
  /different (?:country|countries|region|regions|origins?|appellations?|vintages?|producers?)/g,
  /(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+) (?:different )?countries/g,
  /(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+) (?:different )?(?:single )?(?:grape )?varieties/g,
];

// Lower-case, accent-strip, flatten punctuation — so "same, single grape variety" (a real
// comma-bug in the corpus) still matches, and phrase containment survives re-punctuation.
function normFacts(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractStemConstraints(text: string): string[] {
  const n = normFacts(text);
  const out = new Set<string>();
  for (const re of CONSTRAINT_RES) {
    for (const m of n.matchAll(re)) out.add(m[0]);
  }
  return [...out];
}

export function variantPreservesConstraints(canonical: string, variant: string): boolean {
  const v = normFacts(variant);
  return extractStemConstraints(canonical).every((phrase) => v.includes(phrase));
}

// The single validity gate for a derived variant: identical sub-question/mark structure AND every
// printed flight-relationship constraint intact. Fail either and the level falls back to canonical.
export function variantPreservesStructure(canonical: string, variant: string): boolean {
  return (
    signaturesMatch(extractStemSignature(canonical), extractStemSignature(variant)) &&
    variantPreservesConstraints(canonical, variant)
  );
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
- NEVER drop, weaken or reword a factual relationship the preamble states about the wines — same/different grape variety, country, region, vintage or producer, or a stated count of varieties or countries ("from three different countries"). These are constraints the real exam PRINTS on the paper, not coaching, and every level must reproduce each one word-for-word.
- Output candidate-facing exam prose only. Do NOT mention these instructions, "levels", "variants", or any meta commentary.

THE TWO LEVELS:

EXAM-REAL — reduce the preamble to ONLY what the IMW would actually print on the paper: the wine numbers, the sub-questions, the mark allocation, and every constraint the real exam genuinely states. FLIGHT-RELATIONSHIP FACTS ARE PRINTED CONSTRAINTS, NOT COACHING: the real IMW prints clauses like "made from the same single grape variety", "from different countries", "come from the same region", "from three different countries" on the actual paper — reproduce every such fact word-for-word. STRIP only sentences that coach interpretation: naming the organising principle, the hierarchy, the mechanism, or how to think (e.g. "These wines illustrate how one variety responds to contrasting climates."). If unsure whether a preamble sentence is a printed constraint or teaching, KEEP it.

GUIDED — the richer, organising-principle-explicit version. It MAY state the flight's organising logic in plain terms (e.g. "these form a quality hierarchy ascending from regional through village to top cru"). If the source stem is already lean, ADD exactly ONE clarifying sentence naming the flight's organising logic. Guided explains the STRUCTURE, never the answers: do NOT reveal specific grape varieties, the country of any individual wine, producers or vintages that the exam-real level withholds.

Output STRICT JSON, no markdown fence, exactly:
{"exam_real": "<full stem text>", "guided": "<full stem text>"}
Each value is the COMPLETE stem (preamble + every sub-question with its marks + the Total line), ready to print.`;

  const user = `CANONICAL STEM (source of truth for sub-questions and marks — reproduce these verbatim in every level):

${canonicalStem}

Return the JSON with the three rewritten stems.`;

  return { system, user };
}
