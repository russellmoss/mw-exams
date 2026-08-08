// historical-stems.ts — turning the real IMW corpus (2011-2026) into bankable question stems.
//
// WHAT THIS IS FOR. The bank's questions are generated: the model writes the stem AND picks the
// wines. This module supports the other arrangement — take a REAL past-paper stem verbatim, and
// generate only the wines and the model answer against it. The candidate then practises the exact
// framings the IMW has actually set, over wines that are currently buyable rather than a 2011 list.
//
// WHAT IS AUTHORITATIVE AND WHAT IS NOT. The stem text is authoritative (CLAUDE.md: never
// paraphrased) and this module makes exactly ONE edit to it — renumbering the wine slots — because a
// banked flight is numbered 1..n while a past-paper question names its slots within a twelve-wine
// paper ("Wines 10-12"). 117 of the 162 corpus questions need it. Every other character is passed
// through untouched, and renumberStemSlots verifies its own output before returning it.
//
// The WINES from the original paper are deliberately NOT carried over. That is the point of the
// exercise: a 2011 wine list is a museum piece, and the study value is in the question shape.

/** One question as it appears in data/structured/corpus_questions.json. */
export interface CorpusQuestion {
  qid: string;
  year: number;
  paper: number;
  n: number;
  flight_size: number;
  wine_slots: number[];
  total_marks: number;
  family: string;
  subcategory: string;
  text: string;
}

/** A corpus question rewritten for the bank, plus the provenance that must travel with it. */
export interface HistoricalStem {
  qid: string;
  year: number;
  paper: number;
  questionNumber: number;
  family: string;
  subcategory: string;
  flightSize: number;
  /** The stem with its wine slots renumbered to 1..flightSize. Otherwise byte-identical. */
  stemText: string;
  /** The stem exactly as printed, kept so the edit is always auditable. */
  originalText: string;
  originalSlots: number[];
  totalMarks: number;
}

/** Why a corpus question is not importable. */
export type IneligibleReason = "whole-paper-flight" | "no-marks-printed" | "off-grid-family";

export interface Ineligible {
  qid: string;
  reason: IneligibleReason;
  detail: string;
}

// The corpus paper x family grid (EK-0077) — the same table fill-bank.mjs rotates through. A family
// that is off-grid for its paper has no bank bucket to land in.
const ON_GRID: Record<number, string[]> = {
  1: ["F1", "F2", "F3", "F4", "F5", "F7"],
  2: ["F1", "F2", "F3", "F4", "F7"],
  3: ["F1", "F2", "F4", "F5", "F6", "F7"],
};

// A flight this large is a whole PAPER organised into pairs, not a question the bank can serve: 2011
// P3 Q1 covers all twelve wines and 2026 P3 Q2 covers eight. They stay in the corpus and out of the
// bank. (Product decision, 2026-08-07.)
export const MAX_IMPORTABLE_FLIGHT = 6;

// Matches "Wine 4", "Wines 1-3", "Wines 5 and 6", "Wines 1, 2 and 3", "Wines 7 to 12" — the head word
// plus the run of slot numbers and the separators that may appear BETWEEN them. Anchoring on the
// "Wine(s)" head is what keeps mark tokens safe: "(3 x 10 marks)" has no head word, so it is never
// touched, and neither is "three different countries".
const SLOT_REFERENCE_RE = /\b(wines?)(\s+)(\d+(?:\s*(?:,|&|and|to|through|-|–|—)\s*\d+)*)/gi;

/**
 * Renumber a past-paper stem's wine slots to the 1..n a banked flight uses.
 *
 * "Wines 10-12 are all from different countries" becomes "Wines 1-3 are all from different
 * countries". Only digits that sit inside a "Wine(s) …" reference are rewritten, and only when they
 * name one of this question's own slots — so mark tokens, counts ("three different countries") and
 * appellation names are untouched.
 *
 * Throws rather than guessing. A slot reference naming a number outside `originalSlots` means the
 * corpus row and the stem disagree, and silently importing a stem whose numbering does not match its
 * flight would hand the candidate an unanswerable question.
 */
export function renumberStemSlots(text: string, originalSlots: number[]): string {
  const mapping = new Map<number, number>();
  originalSlots.forEach((slot, i) => mapping.set(slot, i + 1));

  // Already 1..n in order — nothing to do, and saying so explicitly keeps the no-op auditable.
  const isIdentity = originalSlots.every((slot, i) => slot === i + 1);

  const out = text.replace(SLOT_REFERENCE_RE, (whole, head: string, gap: string, list: string) => {
    const rewritten = list.replace(/\d+/g, (d) => {
      const mapped = mapping.get(Number(d));
      if (mapped === undefined) {
        throw new Error(
          `stem references wine ${d}, which is not one of this question's slots [${originalSlots.join(", ")}]: "${whole}"`
        );
      }
      return String(mapped);
    });
    return `${head}${gap}${rewritten}`;
  });

  if (isIdentity && out !== text) {
    throw new Error("renumbering changed a stem whose slots were already 1..n");
  }

  // Verify rather than trust: every slot the rewritten stem names must be in range, and the text must
  // be unchanged apart from those digits.
  for (const m of out.matchAll(SLOT_REFERENCE_RE)) {
    for (const d of m[3].matchAll(/\d+/g)) {
      const v = Number(d[0]);
      if (v < 1 || v > originalSlots.length) {
        throw new Error(`renumbered stem still references wine ${v}, outside 1-${originalSlots.length}`);
      }
    }
  }
  if (out.replace(/\d+/g, "#") !== text.replace(/\d+/g, "#")) {
    throw new Error("renumbering altered more than the slot digits");
  }
  return out;
}

/**
 * Split the corpus into what can be banked and what cannot, with a reason for every exclusion.
 * Nothing is dropped silently — the import script prints the ineligible list.
 */
export function selectImportableStems(corpus: CorpusQuestion[]): {
  stems: HistoricalStem[];
  ineligible: Ineligible[];
} {
  const stems: HistoricalStem[] = [];
  const ineligible: Ineligible[] = [];

  for (const q of corpus) {
    if (q.flight_size > MAX_IMPORTABLE_FLIGHT) {
      ineligible.push({
        qid: q.qid,
        reason: "whole-paper-flight",
        detail: `${q.flight_size} wines — a paper organised in pairs, not a servable flight`,
      });
      continue;
    }
    if (!(ON_GRID[q.paper] || []).includes(q.family)) {
      ineligible.push({
        qid: q.qid,
        reason: "off-grid-family",
        detail: `${q.family} has no bank bucket on Paper ${q.paper}`,
      });
      continue;
    }
    stems.push({
      qid: q.qid,
      year: q.year,
      paper: q.paper,
      questionNumber: q.n,
      family: q.family,
      subcategory: q.subcategory,
      flightSize: q.flight_size,
      stemText: renumberStemSlots(q.text, q.wine_slots),
      originalText: q.text,
      originalSlots: q.wine_slots,
      totalMarks: q.flight_size * 25,
    });
  }
  return { stems, ineligible };
}

/**
 * The bank id for an imported question. Namespaced away from `gen_*` so a historical stem is
 * distinguishable at a glance in the admin queue, in telemetry and in any manual SQL — and so a
 * re-run of the import is idempotent (ON CONFLICT (question_id) DO UPDATE) rather than duplicating.
 */
export function historicalQuestionId(stem: HistoricalStem): string {
  return `hist_${stem.qid}`;
}

/**
 * Provenance for `metadata`. Deliberately NOT surfaced in the study UI (product decision,
 * 2026-08-07): the stem is the IMW's, the wines and the model answer are ours, and labelling the
 * question "real" would lend our wine choices an authority they have not earned. It exists so the
 * import is auditable and so every imported row can be found and retracted in one query.
 */
export function historicalMetadata(stem: HistoricalStem): Record<string, unknown> {
  return {
    source: "historical_stem",
    historical: {
      qid: stem.qid,
      year: stem.year,
      paper: stem.paper,
      question: stem.questionNumber,
      originalSlots: stem.originalSlots,
      stemRenumbered: stem.stemText !== stem.originalText,
    },
  };
}
